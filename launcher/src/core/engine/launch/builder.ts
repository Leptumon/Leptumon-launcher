/**
 * Command Builder
 * 
 * Builds the complete launch command for Minecraft.
 * Combines JVM arguments, main class, and game arguments.
 */

import type { ResolvedVersion, ResolvedLibrary } from '../types/version-json';

// ============================================================================
// Types
// ============================================================================

/**
 * Complete launch command ready for process spawning.
 */
export interface LaunchCommand {
    /** Java executable path. */
    executable: string;
    /** All command-line arguments in order. */
    args: string[];
    /** Working directory. */
    cwd: string;
    /** Environment variables. */
    env: Record<string, string>;
}

/**
 * Options for building a launch command.
 */
export interface BuildCommandOptions {
    /** Resolved version information. */
    version: ResolvedVersion;
    /** Path to Java executable. */
    javaPath: string;
    /** Game directory (working directory). */
    gameDir: string;
    /** Memory configuration. */
    memory?: {
        min: number;
        max: number;
    };
    /** Custom JVM arguments. */
    customJvmArgs?: string[];
    /** Custom game arguments. */
    customGameArgs?: string[];
    /** Window resolution. */
    resolution?: {
        width: number;
        height: number;
        fullscreen?: boolean;
    };
    /**
     * Multiplayer server to join from the title screen. Uses Quick Play
     * (1.20+); `legacyFlags` selects the older --server/--port arguments.
     */
    server?: {
        host: string;
        port?: number;
        legacyFlags?: boolean;
    };
}


// ============================================================================
// Memory Arguments
// ============================================================================

/**
 * Default memory settings.
 */
const DEFAULT_MEMORY = {
    min: 512,
    max: 2048,
};

/**
 * Builds memory-related JVM arguments.
 */
function buildMemoryArgs(memory: { min: number; max: number }): string[] {
    return [
        `-Xms${memory.min}M`,
        `-Xmx${memory.max}M`,
    ];
}

// ============================================================================
// Performance Arguments
// ============================================================================

/**
 * Recommended G1GC arguments for Minecraft.
 */
const G1GC_ARGS = [
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+UseG1GC',
    '-XX:G1NewSizePercent=20',
    '-XX:G1ReservePercent=20',
    '-XX:MaxGCPauseMillis=50',
    '-XX:G1HeapRegionSize=32M',
];

/**
 * Additional performance arguments.
 */
const PERFORMANCE_ARGS = [
    '-XX:+ParallelRefProcEnabled',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
];

// ============================================================================
// Command Builder
// ============================================================================

/**
 * Builds the complete launch command for Minecraft.
 * 
 * @param options - Build options.
 * @returns The complete launch command.
 */
export function buildLaunchCommand(options: BuildCommandOptions): LaunchCommand {
    const {
        version,
        javaPath,
        gameDir,
        memory = DEFAULT_MEMORY,
        customJvmArgs = [],
        customGameArgs = [],
        resolution,
        server,
    } = options;

    const args: string[] = [];
    const firstThreadArg = '-XstartOnFirstThread';
    const versionJvmArguments = version.jvmArguments.filter((arg) => arg !== firstThreadArg);

    // ========================================================================
    // JVM Arguments (before main class)
    // ========================================================================

    // macOS requires this to be the first JVM flag for LWJGL window creation.
    if (version.jvmArguments.includes(firstThreadArg)) {
        args.push(firstThreadArg);
    }

    // Memory settings
    args.push(...buildMemoryArgs(memory));

    // GC settings
    args.push(...G1GC_ARGS);

    // Performance settings (for higher memory allocations)
    if (memory.max >= 4096) {
        args.push(...PERFORMANCE_ARGS);
    }

    // Version-specific JVM arguments (native path, classpath, etc.)
    // These are already processed with variable substitution
    args.push(...versionJvmArguments);

    // Logging configuration
    if (version.loggingArgument) {
        args.push(version.loggingArgument);
    }

    // Custom JVM arguments
    args.push(...customJvmArgs);




    // ========================================================================
    // Main Class
    // ========================================================================

    args.push(version.mainClass);

    // ========================================================================
    // Game Arguments (after main class)
    // ========================================================================

    // Version-specific game arguments
    args.push(...version.gameArguments);

    // Resolution
    if (resolution) {
        args.push('--width', String(resolution.width));
        args.push('--height', String(resolution.height));
        if (resolution.fullscreen) {
            args.push('--fullscreen');
        }
    }



    // Server auto-join
    if (server) {
        if (server.legacyFlags) {
            args.push('--server', server.host);
            if (server.port) {
                args.push('--port', String(server.port));
            }
        } else {
            // IPv6 literals need brackets so the port stays unambiguous.
            const host = server.host.includes(':') ? `[${server.host}]` : server.host;
            args.push('--quickPlayMultiplayer', server.port ? `${host}:${server.port}` : host);
        }
    }

    // Custom game arguments
    args.push(...customGameArgs);

    // ========================================================================
    // Build Command
    // ========================================================================

    return {
        executable: javaPath,
        args,
        cwd: gameDir,
        env: {
            // Add any environment variables needed
        },
    };
}

// ============================================================================
// Classpath Builder (utility)
// ============================================================================

/**
 * Builds a classpath string from libraries.
 * 
 * @param libraries - Resolved libraries.
 * @param clientJar - Path to client JAR.
 * @param separator - Classpath separator (: on Unix, ; on Windows).
 */
export function buildClasspath(
    libraries: ResolvedLibrary[],
    clientJar: string,
    separator: string = ':'
): string {
    const paths = libraries
        .filter((lib) => !lib.isNative)
        .map((lib) => lib.path);

    paths.push(clientJar);

    return paths.join(separator);
}

/**
 * Formats the launch command for display/logging.
 */
export function formatCommand(command: LaunchCommand): string {
    const escapedArgs = command.args.map(arg =>
        arg.includes(' ') ? `"${arg}"` : arg
    );
    return `${command.executable} ${escapedArgs.join(' ')}`;
}
