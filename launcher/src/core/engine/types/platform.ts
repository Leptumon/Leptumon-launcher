/**
 * Platform Utilities
 * 
 * Cross-platform utilities for Minecraft launcher operations.
 * Handles OS detection, architecture, and platform-specific paths.
 */

import { platform, arch as osArch, release } from 'os';

import type { PlatformInfo, RuleContext, FeatureFlags } from './version-json';

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Gets the current OS name in Minecraft's format.
 */
export function getMinecraftOsName(): 'windows' | 'osx' | 'linux' {
    const p = platform();
    switch (p) {
        case 'win32':
            return 'windows';
        case 'darwin':
            return 'osx';
        default:
            return 'linux';
    }
}

/**
 * Gets the current architecture in Minecraft's format.
 */
export function getMinecraftArch(): 'x86' | 'x64' | 'arm64' {
    const a = osArch() as string;
    switch (a) {
        case 'x64':
        case 'amd64':
            return 'x64';
        case 'arm64':
            return 'arm64';
        case 'ia32':
        case 'x86':
            return 'x86';
        default:
            // Default to x64 for unknown architectures
            return 'x64';
    }
}

/**
 * Gets the native classifier suffix for the current platform.
 * 
 * Examples:
 * - Windows x64: 'natives-windows'
 * - macOS ARM64: 'natives-macos-arm64'
 * - Linux x64: 'natives-linux'
 */
export function getNativeClassifier(): string {
    const osName = getMinecraftOsName();
    const arch = getMinecraftArch();

    // Modern Minecraft uses more specific classifiers for ARM
    if (osName === 'osx') {
        if (arch === 'arm64') {
            return 'natives-macos-arm64';
        }
        return 'natives-macos';
    }

    if (osName === 'windows') {
        if (arch === 'arm64') {
            return 'natives-windows-arm64';
        }
        if (arch === 'x86') {
            return 'natives-windows-x86';
        }
        return 'natives-windows';
    }

    // Linux
    if (arch === 'arm64') {
        return 'natives-linux-arm64';
    }
    return 'natives-linux';
}

/**
 * Returns the set of native classifiers that are valid for the architecture we
 * are actually launching on.
 *
 * Modern Minecraft version JSONs (1.19+) declare every architecture variant of a
 * native for an OS as a separate library, e.g. `natives-windows` (x64),
 * `natives-windows-arm64`, and `natives-windows-x86`, all carrying the SAME
 * `{os:{name:windows}}` rule with no architecture constraint. Rule evaluation
 * alone therefore keeps all of them; the launcher is expected to disambiguate by
 * architecture. This set is what makes that possible.
 *
 * The bare `natives-<os>` classifier (no arch suffix) denotes x86_64.
 */
export function getNativeClassifiersForArch(): Set<string> {
    const osName = getMinecraftOsName();
    const arch = getMinecraftArch();

    if (osName === 'windows') {
        if (arch === 'arm64') return new Set(['natives-windows-arm64']);
        if (arch === 'x86') return new Set(['natives-windows-x86', 'natives-windows-32']);
        return new Set(['natives-windows', 'natives-windows-64']); // x64
    }

    if (osName === 'osx') {
        if (arch === 'arm64') return new Set(['natives-macos-arm64']);
        return new Set(['natives-macos', 'natives-osx', 'natives-macosx']); // x64
    }

    // linux
    if (arch === 'arm64') return new Set(['natives-linux-arm64']);
    return new Set(['natives-linux', 'natives-linux-x86_64']); // x64
}

/**
 * Gets complete platform information for the current system.
 */
export function getPlatformInfo(): PlatformInfo {
    const osName = getMinecraftOsName();

    return {
        osName,
        arch: getMinecraftArch(),
        nativeClassifier: getNativeClassifier(),
        classpathSeparator: osName === 'windows' ? ';' : ':',
        executableExtension: osName === 'windows' ? '.exe' : '',
    };
}

/**
 * Creates a rule evaluation context for the current platform.
 * 
 * @param features - Optional feature flags to enable.
 */
export function createRuleContext(features: Partial<FeatureFlags> = {}): RuleContext {
    return {
        os: getMinecraftOsName(),
        arch: getMinecraftArch(),
        osVersion: release(),
        features: {
            is_demo_user: false,
            has_custom_resolution: false,
            has_quick_plays_support: false,
            is_quick_play_singleplayer: false,
            is_quick_play_multiplayer: false,
            is_quick_play_realms: false,
            ...features,
        },
    };
}

// ============================================================================
// Legacy Classifier Mapping
// ============================================================================

/**
 * Maps legacy native classifier names to modern ones.
 * Older Minecraft versions use different classifier names.
 */
const LEGACY_CLASSIFIER_MAP: Record<string, Record<string, string>> = {
    windows: {
        'natives-windows': 'natives-windows',
        'natives-windows-64': 'natives-windows',
        'natives-windows-32': 'natives-windows-x86',
    },
    osx: {
        'natives-osx': 'natives-macos',
        'natives-macos': 'natives-macos',
        'natives-macosx': 'natives-macos',
    },
    linux: {
        'natives-linux': 'natives-linux',
    },
};

/**
 * Resolves a legacy native classifier to the actual classifier to use.
 * 
 * @param osKey - The OS key from the natives map (e.g., 'osx', 'windows')
 * @param classifier - The classifier template (e.g., 'natives-${arch}')
 */
export function resolveLegacyClassifier(osKey: string, classifier: string): string {
    const arch = getMinecraftArch();

    // Replace ${arch} placeholder
    let resolved = classifier.replace(/\$\{arch\}/g, arch === 'x64' ? '64' : '32');

    // Check if there's a mapping
    const osName = getMinecraftOsName();
    const mapping = LEGACY_CLASSIFIER_MAP[osName];
    if (mapping && resolved in mapping) {
        return mapping[resolved] ?? resolved;
    }

    return resolved;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Converts a Maven coordinate to a relative file path.
 * 
 * @param coordinate - Maven coordinate (group:artifact:version[:classifier][@extension])
 * @returns Relative path to the library file.
 * 
 * @example
 * ```typescript
 * mavenToPath('com.google.guava:guava:31.1-jre')
 * // Returns: 'com/google/guava/guava/31.1-jre/guava-31.1-jre.jar'
 * 
 * mavenToPath('org.lwjgl:lwjgl:3.3.1:natives-macos-arm64')
 * // Returns: 'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-macos-arm64.jar'
 * ```
 */
export function mavenToPath(coordinate: string): string {
    // Handle @extension suffix
    let extension = 'jar';
    let coord = coordinate;
    const atIndex = coord.lastIndexOf('@');
    if (atIndex !== -1) {
        extension = coord.substring(atIndex + 1);
        coord = coord.substring(0, atIndex);
    }

    const parts = coord.split(':');
    if (parts.length < 3) {
        throw new Error(`Invalid Maven coordinate: ${coordinate}`);
    }

    const [group, artifact, version, classifier] = parts;
    if (!group || !artifact || !version) {
        throw new Error(`Invalid Maven coordinate: ${coordinate}`);
    }
    const groupPath = group.replace(/\./g, '/');

    let filename = `${artifact}-${version}`;
    if (classifier) {
        filename += `-${classifier}`;
    }
    filename += `.${extension}`;

    return `${groupPath}/${artifact}/${version}/${filename}`;
}

/**
 * Extracts the artifact name from a Maven coordinate.
 * 
 * @param coordinate - Maven coordinate.
 * @returns The artifact name.
 */
export function getArtifactName(coordinate: string): string {
    const parts = coordinate.split(':');
    return parts[1] || coordinate;
}
