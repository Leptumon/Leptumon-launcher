/**
 * Version JSON Parser
 * 
 * Fetches, parses, and resolves Minecraft version JSON files.
 * Handles version inheritance (inheritsFrom) for mod loaders.
 * Supports all Minecraft versions from legacy to modern.
 */

import { LauncherDownloadError } from '../types/errors';

import type {
    VersionJson,
    Library,
    Arguments,
    ResolvedVersion,
    ResolvedLibrary,
    RuleContext,
    DownloadInfo,
    Argument,
    ArgumentRule
} from '../types/version-json';

import {
    createRuleContext,
    getPlatformInfo,
    mavenToPath,
    getMinecraftOsName,
    getMinecraftArch,
    getNativeClassifiersForArch
} from '../types/platform';

import {
    filterLibraries,
    processArguments,
    parseLegacyArguments,
    getNativeClassifierForLibrary,
    isNativeLibrary,
    evaluateRules,
    DEFAULT_JVM_ARGUMENTS,
} from './rules';

import { logger } from '../../utils/logger';

// ============================================================================
// Constants
// ============================================================================

/** Base URL for Minecraft version manifests. */
const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

/** Base URL for Minecraft libraries (fallback). */
const LIBRARIES_BASE_URL = 'https://libraries.minecraft.net/';

/** In-memory cache for version JSONs. */
const versionCache = new Map<string, VersionJson>();

function getMavenClassifier(coordinate: string): string | undefined {
    const atIndex = coordinate.lastIndexOf('@');
    const coord = atIndex === -1 ? coordinate : coordinate.substring(0, atIndex);
    return coord.split(':')[3];
}

function hasNativeClassifier(coordinate: string): boolean {
    return getMavenClassifier(coordinate)?.startsWith('natives-') ?? false;
}

/**
 * Drops native libraries that target a different CPU architecture than the one
 * we are launching on.
 *
 * Modern version JSONs list every native variant for an OS, e.g.
 * `org.lwjgl:lwjgl:3.3.3:natives-windows` (x64),
 * `…:natives-windows-arm64`, and `…:natives-windows-x86`, all with the SAME
 * `{os:{name:windows}}` rule and no architecture constraint, so OS-rule
 * filtering keeps all of them. Native extraction then flattens each jar entry to
 * its basename (`windows/<arch>/org/lwjgl/lwjgl.dll` → `lwjgl.dll`), so the
 * variants collide and the last one extracted overwrites the others. On x64 that
 * leaves a 32-bit/ARM64 `lwjgl.dll`, which a 64-bit JVM cannot load, surfacing
 * as `UnsatisfiedLinkError: Failed to locate library: lwjgl.dll`.
 *
 * For each `group:artifact` that has a native matching our architecture, we keep
 * only that variant and drop its wrong-architecture siblings. Groups with no
 * matching variant are left untouched (the ARM64 macOS override path handles
 * those separately).
 */
function selectArchNatives(libraries: Library[]): Library[] {
    const preferred = getNativeClassifiersForArch();
    const groupArtifact = (name: string): string => {
        const parts = name.split(':');
        return `${parts[0]}:${parts[1]}`;
    };

    // Which group:artifacts have a native variant for our architecture?
    const groupHasPreferred = new Set<string>();
    for (const lib of libraries) {
        if (!hasNativeClassifier(lib.name)) continue;
        const classifier = getMavenClassifier(lib.name);
        if (classifier && preferred.has(classifier)) {
            groupHasPreferred.add(groupArtifact(lib.name));
        }
    }

    const keptPreferred = new Set<string>();
    const result: Library[] = [];
    for (const lib of libraries) {
        if (!hasNativeClassifier(lib.name)) {
            result.push(lib);
            continue;
        }

        const ga = groupArtifact(lib.name);
        if (!groupHasPreferred.has(ga)) {
            // No native for our architecture exists for this module; keep as-is.
            result.push(lib);
            continue;
        }

        const classifier = getMavenClassifier(lib.name);
        if (classifier && preferred.has(classifier) && !keptPreferred.has(ga)) {
            keptPreferred.add(ga);
            result.push(lib);
        }
        // Otherwise this is a wrong-architecture sibling, so drop it.
    }

    return result;
}

function loggingConfigFileName(versionJson: VersionJson): string {
    const file = versionJson.logging?.client?.file;
    if (!file) return 'log4j2.xml';
    return file.id ?? file.url.split('/').pop() ?? 'log4j2.xml';
}

// ============================================================================
// Version Manifest
// ============================================================================

/**
 * Version entry from the version manifest.
 */
export interface VersionEntry {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
    time: string;
    releaseTime: string;
    sha1: string;
    complianceLevel: number;
}

/**
 * Version manifest from Mojang.
 */
export interface VersionManifest {
    latest: {
        release: string;
        snapshot: string;
    };
    versions: VersionEntry[];
}

/** Cached version manifest. */
let manifestCache: VersionManifest | null = null;
let manifestCacheTime = 0;
const MANIFEST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches the version manifest from Mojang.
 * Results are cached for 5 minutes.
 */
export async function fetchVersionManifest(): Promise<VersionManifest> {
    const now = Date.now();

    if (manifestCache && now - manifestCacheTime < MANIFEST_CACHE_TTL) {
        return manifestCache;
    }

    const response = await fetch(VERSION_MANIFEST_URL);
    if (!response.ok) {
        throw new LauncherDownloadError(`Failed to fetch version manifest: ${response.status}`);
    }

    manifestCache = await response.json() as VersionManifest;
    manifestCacheTime = now;
    return manifestCache;
}

/**
 * Gets a version entry from the manifest.
 * 
 * @param versionId - The version ID to find.
 * @returns The version entry, or undefined if not found.
 */
export async function getVersionEntry(versionId: string): Promise<VersionEntry | undefined> {
    const manifest = await fetchVersionManifest();
    return manifest.versions.find((v) => v.id === versionId);
}

/**
 * Gets the latest release version ID.
 */
export async function getLatestReleaseId(): Promise<string> {
    const manifest = await fetchVersionManifest();
    return manifest.latest.release;
}

/**
 * Gets the latest snapshot version ID.
 */
export async function getLatestSnapshotId(): Promise<string> {
    const manifest = await fetchVersionManifest();
    return manifest.latest.snapshot;
}

// ============================================================================
// Version JSON Fetching
// ============================================================================

/**
 * Fetches a version JSON from a URL.
 * 
 * @param url - The URL to fetch from.
 * @returns The parsed version JSON.
 */
export async function fetchVersionJsonFromUrl(url: string): Promise<VersionJson> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new LauncherDownloadError(`Failed to fetch version JSON: ${response.status}`);
    }
    return response.json() as Promise<VersionJson>;
}

/**
 * Fetches a version JSON by version ID.
 * Uses the version manifest to find the URL, or a custom URL provider.
 * 
 * @param versionId - The version ID to fetch.
 * @param urlProvider - Optional function to provide custom URLs (for mod loaders).
 * @returns The parsed version JSON.
 */
export async function fetchVersionJson(
    versionId: string,
    urlProvider?: (id: string) => Promise<string | undefined>
): Promise<VersionJson> {
    // Check cache first
    const cached = versionCache.get(versionId);
    if (cached) {
        return cached;
    }

    let url: string | undefined;

    // Try custom URL provider first (for mod loaders)
    if (urlProvider) {
        url = await urlProvider(versionId);
    }

    // Fall back to version manifest
    if (!url) {
        const entry = await getVersionEntry(versionId);
        if (!entry) {
            throw new LauncherDownloadError(`Version not found: ${versionId}`);
        }
        url = entry.url;
    }

    const versionJson = await fetchVersionJsonFromUrl(url);

    // Cache it
    versionCache.set(versionId, versionJson);

    return versionJson;
}

// ============================================================================
// Version Inheritance Resolution
// ============================================================================

/**
 * Merges two library arrays, with child taking precedence for duplicates.
 * Libraries with the same group:artifact:classifier are considered duplicates.
 * This preserves both main JARs and native JARs.
 */
function mergeLibraries(parent: Library[], child: Library[]): Library[] {
    const libraryMap = new Map<string, Library>();

    // Create a key that preserves classifier but allows version overrides
    const getKey = (name: string) => {
        const parts = name.split(':');
        if (parts.length >= 4) {
            // Has classifier (group:artifact:version:classifier) - include it in key
            return `${parts[0]}:${parts[1]}:${parts[3]}`;
        }
        // No classifier (group:artifact:version) - use group:artifact
        return `${parts[0]}:${parts[1]}`;
    };

    // Add parent libraries
    for (const lib of parent) {
        libraryMap.set(getKey(lib.name), lib);
    }

    // Add/override with child libraries
    for (const lib of child) {
        libraryMap.set(getKey(lib.name), lib);
    }

    return Array.from(libraryMap.values());
}

/**
 * Merges arguments, combining parent and child.
 */
function mergeArguments(parent: Arguments | undefined, child: Arguments | undefined): Arguments {
    return {
        game: [...(parent?.game ?? []), ...(child?.game ?? [])],
        jvm: [...(parent?.jvm ?? []), ...(child?.jvm ?? [])],
    };
}

/**
 * Resolves version inheritance by fetching and merging parent versions.
 * 
 * @param versionJson - The version JSON to resolve.
 * @param urlProvider - Optional URL provider for custom versions.
 * @returns The fully resolved version JSON.
 */
export async function resolveVersionInheritance(
    versionJson: VersionJson,
    urlProvider?: (id: string) => Promise<string | undefined>
): Promise<VersionJson> {
    logger.info(`[Parser] Resolving inheritance for ${versionJson.id}`);
    if (!versionJson.inheritsFrom) {
        logger.info(`[Parser] No inheritance for ${versionJson.id}`);
        return versionJson;
    }

    logger.info(`[Parser] Inherits from ${versionJson.inheritsFrom}`);
    // Fetch parent version
    const parentJson = await fetchVersionJson(versionJson.inheritsFrom, urlProvider);
    logger.info(`[Parser] Fetched parent ${versionJson.inheritsFrom}`);

    // Recursively resolve parent's inheritance
    const resolvedParent = await resolveVersionInheritance(parentJson, urlProvider);
    logger.info(`[Parser] Resolved parent ${versionJson.inheritsFrom}`);

    // Merge parent and child
    const merged: VersionJson = {
        // Child properties take precedence
        id: versionJson.id,
        type: versionJson.type ?? resolvedParent.type,
        mainClass: versionJson.mainClass ?? resolvedParent.mainClass,

        // Merge libraries
        libraries: mergeLibraries(resolvedParent.libraries, versionJson.libraries),

        // Merge arguments
        arguments: mergeArguments(resolvedParent.arguments, versionJson.arguments),

        // Inherit if not specified
        minecraftArguments: versionJson.minecraftArguments ?? resolvedParent.minecraftArguments,
        assets: versionJson.assets ?? resolvedParent.assets,
        assetIndex: versionJson.assetIndex ?? resolvedParent.assetIndex,
        downloads: versionJson.downloads ?? resolvedParent.downloads,
        javaVersion: versionJson.javaVersion ?? resolvedParent.javaVersion,
        logging: versionJson.logging ?? resolvedParent.logging,
        releaseTime: versionJson.releaseTime ?? resolvedParent.releaseTime,
        time: versionJson.time ?? resolvedParent.time,
        minimumLauncherVersion: versionJson.minimumLauncherVersion ?? resolvedParent.minimumLauncherVersion,
        complianceLevel: versionJson.complianceLevel ?? resolvedParent.complianceLevel,
    };

    return merged;
}

// ============================================================================
// Library Resolution
// ============================================================================

/**
 * Resolves a library to its download information and path.
 * 
 * @param library - The library to resolve.
 * @param librariesDir - Base directory for libraries.
 * @param context - Rule evaluation context.
 * @returns Resolved library information.
 */
export function resolveLibrary(
    library: Library,
    librariesDir: string,
    context?: RuleContext
): ResolvedLibrary | null {
    const ctx = context ?? createRuleContext();
    const platform = getPlatformInfo();
    const osName = getMinecraftOsName();

    let download: DownloadInfo | undefined;
    let relativePath: string;
    let native = false;

    // Check if this is a native library
    const nativeClassifier = getNativeClassifierForLibrary(library);
    const namedNative = hasNativeClassifier(library.name);

    if (nativeClassifier) {
        // Native library - use classifier
        native = true;

        // Try to get download info from classifiers
        if (library.downloads?.classifiers) {
            download = library.downloads.classifiers[nativeClassifier];

            // Also try legacy classifier names
            if (!download && osName === 'osx') {
                download = library.downloads.classifiers['natives-osx']
                    || library.downloads.classifiers['natives-macos'];
            }
        }

        // Compute path with classifier
        const parts = library.name.split(':');
        const [group, artifact, version] = parts;
        if (!group || !artifact || !version) {
            return null; // Invalid library name
        }
        const groupPath = group.replace(/\./g, '/');
        relativePath = `${groupPath}/${artifact}/${version}/${artifact}-${version}-${nativeClassifier}.jar`;

    } else if (namedNative) {
        native = true;

        if (library.downloads?.artifact) {
            download = library.downloads.artifact;
            relativePath = download.path ?? mavenToPath(library.name);
        } else {
            relativePath = mavenToPath(library.name);
            const url = library.url
                ? `${library.url}${relativePath}`
                : `${LIBRARIES_BASE_URL}${relativePath}`;

            download = {
                url,
                sha1: library.sha1 ?? '',
                size: library.size ?? 0,
            };
        }

    } else if (library.downloads?.artifact) {
        // Regular library with modern download info
        download = library.downloads.artifact;
        relativePath = download.path ?? mavenToPath(library.name);

    } else {
        // Legacy library without download info - construct URL
        relativePath = mavenToPath(library.name);

        const url = library.url
            ? `${library.url}${relativePath}`
            : `${LIBRARIES_BASE_URL}${relativePath}`;

        download = {
            url,
            sha1: library.sha1 ?? '',
            size: library.size ?? 0,
        };
    }

    // Skip if we couldn't find download info for a native
    if (native && !download) {
        return null;
    }

    return {
        name: library.name,
        path: `${librariesDir}/${relativePath}`,
        isNative: native,
        download,
    };
}

/**
 * Resolves all libraries for a version.
 * 
 * @param versionJson - The version JSON.
 * @param librariesDir - Base directory for libraries.
 * @param context - Rule evaluation context.
 * @returns Array of resolved libraries.
 */
export function resolveLibraries(
    versionJson: VersionJson,
    librariesDir: string,
    context?: RuleContext
): ResolvedLibrary[] {
    const ctx = context ?? createRuleContext();

    // Filter by rules first, then narrow native libraries to our architecture
    // (modern version JSONs list all arch variants under the same OS rule).
    const filtered = selectArchNatives(filterLibraries(versionJson.libraries, ctx));

    // Resolve each library
    const resolved: ResolvedLibrary[] = [];

    for (const lib of filtered) {
        const namedNative = hasNativeClassifier(lib.name);

        // First, add the regular/main artifact if it exists
        // This happens when there's a downloads.artifact, or it's a legacy library without natives
        if (lib.downloads?.artifact && !namedNative) {
            // Modern library with explicit artifact - use it directly
            const regularLib = resolveLibrary(
                { ...lib, natives: undefined }, // Remove natives to ensure we get the main JAR
                librariesDir,
                ctx
            );
            if (regularLib && !regularLib.isNative) {
                resolved.push(regularLib);
            }
        } else if (!namedNative && !lib.natives && !lib.downloads?.classifiers) {
            // Legacy library without any native info - resolve normally
            const legacyLib = resolveLibrary(lib, librariesDir, ctx);
            if (legacyLib && !legacyLib.isNative) {
                resolved.push(legacyLib);
            }
        }

        // Then, add native libraries for extraction (these won't be in classpath due to isNative flag)
        if (isNativeLibrary(lib)) {
            const nativeLib = resolveLibrary(lib, librariesDir, ctx);
            if (nativeLib) {
                resolved.push(nativeLib);
            }
        }
    }

    return resolved;
}

// ============================================================================
// Full Version Resolution
// ============================================================================

/**
 * Variable substitution context for arguments.
 */
export interface VariableContext {
    auth_player_name: string;
    version_name: string;
    game_directory: string;
    assets_root: string;
    assets_index_name: string;
    auth_uuid: string;
    auth_access_token: string;
    clientid: string;
    auth_xuid: string;
    user_type: string;
    version_type: string;
    natives_directory: string;
    launcher_name: string;
    launcher_version: string;
    classpath: string;
    classpath_separator: string;
    library_directory: string;
    resolution_width?: string;
    resolution_height?: string;
    quickPlayPath?: string;
    quickPlaySingleplayer?: string;
    quickPlayMultiplayer?: string;
    quickPlayRealms?: string;
}

/**
 * Substitutes variables in an argument string.
 */
export function substituteVariables(arg: string, vars: VariableContext): string {
    return arg.replace(/\$\{([^}]+)\}/g, (_, key) => {
        const value = vars[key as keyof VariableContext];
        return value !== undefined ? String(value) : '';
    });
}

/**
 * Resolves a version JSON to a ready-to-launch format.
 * 
 * @param versionJson - The version JSON (should be inheritance-resolved).
 * @param options - Resolution options.
 * @returns Resolved version ready for launching.
 */
export function resolveVersion(
    versionJson: VersionJson,
    options: {
        librariesDir: string;
        versionsDir: string;
        assetsDir: string;
        nativesDir: string;
        gameDir: string;
        account: {
            username: string;
            uuid: string;
            accessToken: string;
            xuid?: string;
            userType: 'msa' | 'legacy' | 'offline';
        };
        launcherName?: string;
        launcherVersion?: string;
        customResolution?: { width: number; height: number };
    }
): ResolvedVersion {
    const ctx = createRuleContext({
        has_custom_resolution: !!options.customResolution,
    });

    const platform = getPlatformInfo();

    // Resolve libraries
    const libraries = resolveLibraries(versionJson, options.librariesDir, ctx);

    // Build classpath (deduplicate to prevent 'Duplicate key' errors in securejarhandler)
    const classpathEntries = [
        ...new Set(
            libraries
                .filter((lib) => !lib.isNative)
                .map((lib) => lib.path)
        )
    ];

    // Add client JAR
    const clientJar = `${options.versionsDir}/${versionJson.id}/${versionJson.id}.jar`;
    classpathEntries.push(clientJar);

    const classpath = classpathEntries.join(platform.classpathSeparator);

    // Variable context for substitution
    const vars: VariableContext = {
        auth_player_name: options.account.username,
        version_name: versionJson.id,
        game_directory: options.gameDir,
        assets_root: options.assetsDir,
        assets_index_name: versionJson.assets ?? versionJson.assetIndex?.id ?? 'legacy',
        auth_uuid: options.account.uuid,
        auth_access_token: options.account.accessToken,
        clientid: '',
        auth_xuid: options.account.xuid ?? '',
        user_type: options.account.userType === 'offline' ? 'legacy' : 'msa',
        version_type: versionJson.type,
        natives_directory: options.nativesDir,
        launcher_name: options.launcherName ?? 'Leptumon-Launcher',
        launcher_version: options.launcherVersion ?? '1.0.0',
        classpath,
        classpath_separator: platform.classpathSeparator,
        library_directory: options.librariesDir,
        resolution_width: options.customResolution?.width.toString(),
        resolution_height: options.customResolution?.height.toString(),
    };

    // Process JVM arguments
    let jvmArgs: string[];
    if (versionJson.arguments?.jvm) {
        jvmArgs = processArguments(versionJson.arguments.jvm, ctx);
    } else {
        // Legacy versions - use defaults
        jvmArgs = processArguments(DEFAULT_JVM_ARGUMENTS, ctx);
    }

    // Process game arguments
    let gameArgs: string[];
    if (versionJson.arguments?.game) {
        gameArgs = processArguments(versionJson.arguments.game, ctx);
    } else if (versionJson.minecraftArguments) {
        gameArgs = parseLegacyArguments(versionJson.minecraftArguments);
    } else {
        gameArgs = [];
    }

    // Substitute variables
    jvmArgs = jvmArgs.map((arg) => substituteVariables(arg, vars));
    gameArgs = gameArgs.map((arg) => substituteVariables(arg, vars));

    // Logging argument
    let loggingArgument: string | undefined;
    if (versionJson.logging?.client) {
        loggingArgument = substituteVariables(
            versionJson.logging.client.argument,
            { ...vars, path: `${options.assetsDir}/log_configs/${loggingConfigFileName(versionJson)}` } as any
        );
    }

    return {
        id: versionJson.id,
        type: versionJson.type,
        mainClass: versionJson.mainClass,
        assetIndex: versionJson.assets ?? versionJson.assetIndex?.id ?? 'legacy',
        libraries,
        jvmArguments: jvmArgs,
        gameArguments: gameArgs,
        clientJar,
        javaVersion: versionJson.javaVersion?.majorVersion ?? 8,
        loggingArgument,
    };
}

/**
 * Clears the version JSON cache.
 */
export function clearVersionCache(): void {
    versionCache.clear();
    manifestCache = null;
    manifestCacheTime = 0;
}

/**
 * Adds a version JSON to the cache (for mod loaders).
 */
export function cacheVersionJson(versionId: string, versionJson: VersionJson): void {
    versionCache.set(versionId, versionJson);
}
