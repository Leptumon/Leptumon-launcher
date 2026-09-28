/**
 * Minecraft Version JSON Types
 * 
 * Complete type definitions for Minecraft's version JSON format.
 * Supports all versions from legacy (pre-1.6) through modern (1.21+).
 * 
 * @see https://minecraft.wiki/w/Client.json
 */

// ============================================================================
// Download Information
// ============================================================================

/**
 * Download information for a file.
 */
export interface DownloadInfo {
    /** Optional file id/name from version metadata. */
    id?: string;
    /** SHA1 hash of the file for verification. */
    sha1: string;
    /** Size of the file in bytes. */
    size: number;
    /** URL to download the file from. */
    url: string;
    /** Optional path hint (used in some contexts). */
    path?: string;
}

// ============================================================================
// Rules (OS/Feature Filtering)
// ============================================================================

/**
 * Operating system condition for rules.
 */
export interface OsRule {
    /** OS name: 'windows', 'osx', 'linux'. */
    name?: string;
    /** CPU architecture: 'x86', 'x64', 'arm64'. */
    arch?: string;
    /** OS version regex pattern. */
    version?: string;
}

/**
 * Feature flags for conditional rules.
 * Used for demo mode, custom resolutions, etc.
 */
export interface FeatureFlags {
    /** Demo mode enabled. */
    is_demo_user?: boolean;
    /** Custom resolution enabled. */
    has_custom_resolution?: boolean;
    /** Quick play mode (1.20+). */
    has_quick_plays_support?: boolean;
    /** Quick play singleplayer. */
    is_quick_play_singleplayer?: boolean;
    /** Quick play multiplayer. */
    is_quick_play_multiplayer?: boolean;
    /** Quick play realms. */
    is_quick_play_realms?: boolean;
}

/**
 * Rule for conditional inclusion of libraries or arguments.
 */
export interface Rule {
    /** Action to take when conditions match. */
    action: 'allow' | 'disallow';
    /** OS conditions. */
    os?: OsRule;
    /** Feature conditions. */
    features?: FeatureFlags;
}

// ============================================================================
// Arguments (Modern Format - 1.13+)
// ============================================================================

/**
 * Conditional argument with rules.
 */
export interface ArgumentRule {
    /** The rules that must match for this argument to apply. */
    rules: Rule[];
    /** The argument value(s) - can be string or array of strings. */
    value: string | string[];
}

/**
 * An argument can be a simple string or a conditional rule.
 */
export type Argument = string | ArgumentRule;

/**
 * Arguments section of version JSON (1.13+ format).
 */
export interface Arguments {
    /** Game arguments (after main class). */
    game: Argument[];
    /** JVM arguments (before main class). */
    jvm: Argument[];
}

// ============================================================================
// Libraries
// ============================================================================

/**
 * Native library classifier mappings per OS.
 * Maps OS name to classifier suffix (e.g., 'osx' -> 'natives-osx').
 */
export interface NativeClassifiers {
    /** Linux native classifier. */
    linux?: string;
    /** macOS native classifier (legacy name). */
    osx?: string;
    /** macOS native classifier (modern name). */
    macos?: string;
    /** Windows native classifier. */
    windows?: string;
}

/**
 * Extraction options for native libraries.
 */
export interface ExtractOptions {
    /** Paths to exclude from extraction. */
    exclude?: string[];
}

/**
 * Library downloads section.
 */
export interface LibraryDownloads {
    /** Main artifact (non-native). */
    artifact?: DownloadInfo;
    /** Native classifiers per platform. */
    classifiers?: Record<string, DownloadInfo>;
}

/**
 * A library dependency.
 * 
 * The `name` field uses Maven coordinate format: `group:artifact:version`
 * or `group:artifact:version:classifier`
 * 
 * Examples:
 * - `com.google.guava:guava:31.1-jre`
 * - `org.lwjgl:lwjgl:3.3.1:natives-macos-arm64`
 */
export interface Library {
    /** Maven coordinate: group:artifact:version[:classifier]. */
    name: string;
    /** Download information (modern format). */
    downloads?: LibraryDownloads;
    /** Native classifiers per OS (legacy format). */
    natives?: NativeClassifiers;
    /** Extraction options for natives. */
    extract?: ExtractOptions;
    /** Conditional inclusion rules. */
    rules?: Rule[];
    /** 
     * Legacy: Base URL for downloading (pre-1.6 versions).
     * Modern versions use `downloads.artifact.url` instead.
     */
    url?: string;
    /** Legacy: SHA1 hash of library (some old formats). */
    sha1?: string;
    /** Legacy: File size (some old formats). */
    size?: number;
}

// ============================================================================
// Asset Index
// ============================================================================

/**
 * Asset index reference in version JSON.
 */
export interface AssetIndexInfo {
    /** Asset index ID (e.g., '1.21', 'legacy', 'pre-1.6'). */
    id: string;
    /** SHA1 hash of the asset index JSON. */
    sha1: string;
    /** Size of the asset index JSON. */
    size: number;
    /** Total size of all assets. */
    totalSize: number;
    /** URL to download the asset index JSON. */
    url: string;
}

/**
 * Individual asset in the asset index.
 */
export interface Asset {
    /** SHA1 hash of the asset file. */
    hash: string;
    /** Size of the asset file. */
    size: number;
}

/**
 * Asset index JSON structure.
 */
export interface AssetIndex {
    /** Map of asset path to asset info. */
    objects: Record<string, Asset>;
    /** 
     * Whether this is a virtual/legacy asset index.
     * If true, assets should be copied to resources folder.
     */
    virtual?: boolean;
    /**
     * Whether to map assets to resources folder (1.7.2-1.7.9).
     */
    map_to_resources?: boolean;
}

// ============================================================================
// Java Version
// ============================================================================

/**
 * Java version requirements.
 */
export interface JavaVersion {
    /** Java component name (e.g., 'java-runtime-gamma'). */
    component: string;
    /** Major Java version required (e.g., 17, 21). */
    majorVersion: number;
}

// ============================================================================
// Logging Configuration
// ============================================================================

/**
 * Logging configuration file info.
 */
export interface LoggingFile {
    /** Download info for the logging config file. */
    file: DownloadInfo;
    /** Argument template (e.g., '-Dlog4j.configurationFile=${path}'). */
    argument: string;
    /** Logging config type. */
    type: string;
}

/**
 * Logging configuration section.
 */
export interface LoggingConfig {
    /** Client-side logging configuration. */
    client?: LoggingFile;
}

// ============================================================================
// Version JSON (Main Structure)
// ============================================================================

/**
 * Complete Minecraft version JSON structure.
 * 
 * This represents the parsed content of a version's JSON file,
 * such as `1.21.4.json` or `1.12.2.json`.
 */
export interface VersionJson {
    /** Version ID (e.g., '1.21.4', '1.12.2-forge-14.23.5.2860'). */
    id: string;
    /** Version type. */
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    /** Main class to launch. */
    mainClass: string;
    /** Parent version to inherit from (mod loaders use this). */
    inheritsFrom?: string;

    // Arguments
    /** Modern arguments format (1.13+). */
    arguments?: Arguments;
    /** Legacy arguments format (pre-1.13). */
    minecraftArguments?: string;

    // Libraries
    /** Library dependencies. */
    libraries: Library[];

    // Assets
    /** Asset index ID. */
    assets?: string;
    /** Asset index download information. */
    assetIndex?: AssetIndexInfo;

    // Downloads
    /** Client/server JAR downloads. */
    downloads?: {
        /** Client JAR download info. */
        client: DownloadInfo;
        /** Client obfuscation mappings (1.14.4+). */
        client_mappings?: DownloadInfo;
        /** Server JAR download info. */
        server?: DownloadInfo;
        /** Server obfuscation mappings (1.14.4+). */
        server_mappings?: DownloadInfo;
    };

    // Java & Logging
    /** Java version requirements (1.17+). */
    javaVersion?: JavaVersion;
    /** Logging configuration. */
    logging?: LoggingConfig;

    // Metadata
    /** Release timestamp (ISO 8601). */
    releaseTime?: string;
    /** Last modification timestamp (ISO 8601). */
    time?: string;
    /** Minimum launcher version required. */
    minimumLauncherVersion?: number;
    /** Compliance level for EULA/usage (modern versions). */
    complianceLevel?: number;
}

// ============================================================================
// Resolved/Prepared Types (For Launch)
// ============================================================================

/**
 * A library that has been resolved and is ready for use.
 */
export interface ResolvedLibrary {
    /** Maven coordinate. */
    name: string;
    /** Absolute path to the library file. */
    path: string;
    /** Whether this is a native library. */
    isNative: boolean;
    /** Download info for fetching if missing. */
    download?: DownloadInfo;
}

/**
 * Fully resolved version ready for launching.
 * All inheritance resolved, all paths computed.
 */
export interface ResolvedVersion {
    /** Version ID. */
    id: string;
    /** Version type. */
    type: string;
    /** Main class to launch. */
    mainClass: string;
    /** Asset index ID. */
    assetIndex: string;
    /** Resolved libraries (filtered by current OS). */
    libraries: ResolvedLibrary[];
    /** JVM arguments (with variables substituted). */
    jvmArguments: string[];
    /** Game arguments (with variables substituted). */
    gameArguments: string[];
    /** Path to client JAR. */
    clientJar: string;
    /** Java major version required. */
    javaVersion: number;
    /** Logging configuration argument (if any). */
    loggingArgument?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Context for evaluating rules.
 */
export interface RuleContext {
    /** Current operating system. */
    os: 'windows' | 'osx' | 'linux';
    /** CPU architecture. */
    arch: 'x86' | 'x64' | 'arm64';
    /** OS version string. */
    osVersion: string;
    /** Enabled feature flags. */
    features: FeatureFlags;
}

/**
 * Platform information for cross-platform support.
 */
export interface PlatformInfo {
    /** OS name for Minecraft rules. */
    osName: 'windows' | 'osx' | 'linux';
    /** Architecture name. */
    arch: 'x86' | 'x64' | 'arm64';
    /** Native classifier suffix (e.g., 'natives-macos-arm64'). */
    nativeClassifier: string;
    /** Classpath separator character. */
    classpathSeparator: string;
    /** Executable extension (e.g., '.exe' on Windows). */
    executableExtension: string;
}
