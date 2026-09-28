/**
 * Minecraft launch engine: downloads, verifies, and spawns the game process.
 *
 * Called from main/launchPipeline.ts after modpack, Java, and loader setup. Handles:
 *  - Version JSON inheritance chain
 *  - Shared libraries/assets/client download into dataDir
 *  - Native extraction into the instance natives folder
 *  - Building and spawning the final java command
 *
 * Modpack files are installed beforehand by core/modpack (CurseForge).
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

import { TypedEventEmitter } from '../types/emitter';
import { type LaunchEvent } from '../types/events';
import { LauncherLaunchError } from '../types/errors';

import type { VersionJson, ResolvedVersion } from '../types/version-json';
import {
    fetchVersionJson,
    resolveVersionInheritance,
    resolveVersion,
} from '../downloader/parser';
import { downloadGameFiles } from '../downloader/game';

import { extractNatives } from '../natives/extractor';
import { buildLaunchCommand, formatCommand, type BuildCommandOptions, type LaunchCommand } from './builder';

// Import from local launcher core to keep compatibility with existing data paths
import { getLauncherDataPath } from '../../launch/pathManager';
import { logger } from '../../utils/logger';

function formatCommandForLog(command: LaunchCommand): string {
    const args = [...command.args];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--accessToken' && args[i + 1]) {
            args[i + 1] = '[redacted]';
        }
    }
    return formatCommand({ ...command, args });
}

const GAME_ENV_DENYLIST = new Set([
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_NO_ATTACH_CONSOLE',
    'ELECTRON_ENABLE_LOGGING',
    'NODE_OPTIONS',
    'NODE_PATH',
    'npm_config_prefix',
    'npm_lifecycle_event',
    'npm_lifecycle_script',
    'INIT_CWD',
    'JAVA_TOOL_OPTIONS',
    '_JAVA_OPTIONS',
    'JDK_JAVA_OPTIONS',
    'DYLD_LIBRARY_PATH',
    'DYLD_FALLBACK_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'LIBGL_ALWAYS_SOFTWARE',
    'LIBGL_DEBUG',
    'MESA_GL_VERSION_OVERRIDE',
    'MESA_GLSL_VERSION_OVERRIDE',
    'MESA_LOADER_DRIVER_OVERRIDE',
    'GLFW_PLATFORM',
    '__CFBundleIdentifier',
]);

const GAME_ENV_DENYLIST_PREFIXES = [
    'ELECTRON_',
    'npm_',
    'VSCODE_',
    'WEBPACK_',
    'REACT_',
];

function shouldStripGameEnv(key: string): boolean {
    if (GAME_ENV_DENYLIST.has(key)) {
        return true;
    }
    return GAME_ENV_DENYLIST_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function buildGameProcessEnv(extraEnv: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const strippedKeys: string[] = [];

    for (const key of Object.keys(env)) {
        if (shouldStripGameEnv(key)) {
            delete env[key];
            strippedKeys.push(key);
        }
    }

    if (strippedKeys.length > 0) {
        logger.info(`[engine] Sanitized game environment keys: ${strippedKeys.sort().join(', ')}`);
    }

    return { ...env, ...extraEnv };
}

// ============================================================================
// Types
// ============================================================================

/**
 * Events emitted during launch.
 */
interface GameLauncherEvents {
    [key: string]: unknown;
    /** Launch lifecycle event. */
    event: LaunchEvent;
    /** Stdout data from the game. */
    stdout: string;
    /** Stderr data from the game. */
    stderr: string;
    /** Download progress. */
    downloadProgress: {
        stage: 'assets' | 'libraries' | 'client';
        percent: number;
        totalFiles: number;
        completedFiles: number;
        currentFile?: string;
        action?: 'verifying' | 'downloading';
    };
}

/**
 * Account information for launching.
 */
export interface LaunchAccount {
    /** Minecraft username. */
    username: string;
    /** Player UUID (without dashes). */
    uuid: string;
    /** Access token (or any string for offline). */
    accessToken: string;
    /** Xbox User ID (for MSA accounts). */
    xuid?: string;
    /** Account type. */
    type: 'microsoft' | 'offline';
}

/**
 * Options for launching Minecraft.
 */
export interface LaunchOptions {
    /** Minecraft version ID (e.g., '1.21.4'). */
    version: string;
    /** Account to use. */
    account: LaunchAccount;
    /** Path to Java executable. */
    javaPath: string;
    /** 
     * Shared data directory for libraries, versions, and assets.
     * These are shared across all instances.
     * Defaults to system data directory if not provided.
     */
    dataDir?: string;
    /** 
     * Instance game directory for saves, mods, resourcepacks, etc.
     * This is specific to each instance.
     */
    gameDir?: string;
    /** Memory settings in MB. */
    memory?: {
        min: number;
        max: number;
    };
    /** Window resolution. */
    resolution?: {
        width: number;
        height: number;
        fullscreen?: boolean;
    };
    /** Custom JVM arguments. */
    customJvmArgs?: string[];
    /** Custom game arguments. */
    customGameArgs?: string[];
    /** Server to join on startup (see BuildCommandOptions.server). */
    server?: BuildCommandOptions['server'];
    /** Skip file verification/download. */
    skipVerify?: boolean;
    /** Launcher name for user-agent. */
    launcherName?: string;
    /** Launcher version for user-agent. */
    launcherVersion?: string;
}

/**
 * Result of a launch operation.
 */
export interface LaunchResult {
    /** Whether the game launched successfully. */
    success: boolean;
    /** Error message if launch failed. */
    error?: string;
    /** The built launch command. */
    command?: LaunchCommand;
    /** Process ID of the launched game. */
    pid?: number;
}

// ============================================================================
// Game Launcher
// ============================================================================

/**
 * The main game launcher class.
 * Handles downloading, preparation, and launching of Minecraft.
 */
export class GameLauncher extends TypedEventEmitter<GameLauncherEvents> {
    private process: ChildProcess | null = null;
    private _running = false;
    private abortController: AbortController | null = null;

    /**
     * Whether the game is currently running.
     */
    get running(): boolean {
        return this._running;
    }

    /**
     * The current game process, if running.
     */
    get gameProcess(): ChildProcess | null {
        return this.process;
    }


    /**
     * Abort the launch process.
     */
    abortLaunch(): void {
        logger.info('[engine] Aborting launch process...');
        this.abortController?.abort();
        this._running = false;
    }

    /**
     * Launches Minecraft with the given options.
     * 
     * @param options - Launch options.
     * @returns Launch result.
     */
    async launch(options: LaunchOptions): Promise<LaunchResult> {
        if (this._running) {
            throw new LauncherLaunchError('Game is already running');
        }

        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            await this.emit('event', { type: 'starting' });

            // Check cancellation early
            if (signal.aborted) throw new Error('Launch cancelled');

            // Shared across all instances: libraries, versions, and assets.
            const dataDir = options.dataDir ?? getLauncherDataPath().base;

            // Instance-specific: saves, mods, resourcepacks, etc.
            const gameDir = options.gameDir ?? dataDir;

            // Shared Minecraft data directories
            const versionsDir = path.join(dataDir, 'versions');
            const librariesDir = path.join(dataDir, 'libraries');
            const assetsDir = path.join(dataDir, 'assets');

            if (signal.aborted) throw new Error('Launch cancelled');

            // Natives go in the game directory (instance-specific)
            const nativesDir = this.createNativesPath(gameDir, options.version);

            // Fetch and resolve version JSON
            const versionJson = await this.prepareVersion(options.version, versionsDir);

            if (signal.aborted) throw new Error('Launch cancelled');

            // Download/verify game files to shared directory
            if (!options.skipVerify) {
                await this.downloadFiles(versionJson, dataDir, signal);
            }

            if (signal.aborted) throw new Error('Launch cancelled');

            // Resolve version for launch
            const resolvedVersion = resolveVersion(versionJson, {
                librariesDir,
                versionsDir,
                assetsDir,
                nativesDir,
                gameDir,
                account: {
                    username: options.account.username,
                    uuid: options.account.uuid,
                    accessToken: options.account.accessToken,
                    xuid: options.account.xuid,
                    userType: options.account.type === 'offline' ? 'offline' : 'msa',
                },
                launcherName: options.launcherName ?? 'Leptumon-Launcher',
                launcherVersion: options.launcherVersion ?? '1.0.0',
                customResolution: options.resolution,
            });

            const nativeLibCount = resolvedVersion.libraries.filter((lib) => lib.isNative).length;

            // Extract natives to the game directory
            const extractedNatives = await extractNatives({
                libraries: resolvedVersion.libraries,
                nativesDir,
                clean: true,
            });
            const nativeFiles = await fs.readdir(nativesDir).catch(() => []);
            logger.info(
                `[engine] Native extraction: resolved=${nativeLibCount}, processed=${extractedNatives.length}, ` +
                `files=${nativeFiles.length} (${nativeFiles.slice(0, 12).join(', ')})`
            );
            if (nativeLibCount > 0 && nativeFiles.length === 0) {
                throw new LauncherLaunchError(`Resolved ${nativeLibCount} native libraries, but no native files were extracted to ${nativesDir}`);
            }

            if (signal.aborted) throw new Error('Launch cancelled');

            const command = buildLaunchCommand({
                version: resolvedVersion,
                javaPath: options.javaPath,
                gameDir,
                memory: options.memory,
                customJvmArgs: options.customJvmArgs,
                customGameArgs: options.customGameArgs,
                resolution: options.resolution,
                server: options.server,
            });

            logger.info(`[engine] Launch command: ${formatCommandForLog(command)}`);

            // Spawn the game process
            this.process = spawn(command.executable, command.args, {
                cwd: command.cwd,
                env: buildGameProcessEnv(command.env),
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            this._running = true;
            this.abortController = null; // Clear controller once running phase starts

            // Forward the game process's stdout/stderr and lifecycle to listeners.
            this.process.stdout?.on('data', (data: Buffer) => {
                const text = data.toString();
                void this.emit('stdout', text);
            });

            // Handle stderr
            this.process.stderr?.on('data', (data: Buffer) => {
                const text = data.toString();
                void this.emit('stderr', text);
            });

            // Handle process exit
            this.process.on('exit', (code, signal) => {
                this._running = false;
                void this.emit('event', {
                    type: 'exited',
                    exitCode: code ?? 0,
                });

                // Clean up old natives
                void this.cleanOldNatives(gameDir, options.version);
            });

            // Handle process error
            this.process.on('error', (error) => {
                this._running = false;
                void this.emit('event', {
                    type: 'exited',
                    error: error.message,
                });
            });

            await this.emit('event', { type: 'running' });

            return {
                success: true,
                command,
                pid: this.process?.pid,
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // If it was just cancelled, don't emit 'exited' as strict failure?
            // User cancelled usually means 'exited' isn't needed if it never started.
            // But UI listens for 'exited' to reset state?
            // We should ensure UI state reset.

            await this.emit('event', { type: 'exited', error: message });

            return {
                success: false,
                error: message,
            };
        } finally {
            this.abortController = null;
        }
    }

    /**
    * Kills the running game process.
    * 
    * @returns True if the process was killed.
    */
    kill(): boolean {
        if (!this.process) {
            return false;
        }

        const killed = this.process.kill();

        if (killed) {
            this._running = false;
        }

        return killed;
    }

    /**
     * Fetches and resolves the version JSON.
     * Checks local versions folder first (for modloader profiles),
     * then falls back to Mojang's version manifest.
     */
    private async prepareVersion(versionId: string, versionsDir: string): Promise<VersionJson> {
        let versionJson: VersionJson;

        // Try to load from local versions folder first (for modloader profiles)
        const localVersionPath = path.join(versionsDir, versionId, `${versionId}.json`);
        try {
            const content = await fs.readFile(localVersionPath, 'utf-8');
            versionJson = JSON.parse(content) as VersionJson;
            logger.info(`[engine] Loaded version JSON from local: ${versionId}`);
        } catch {
            logger.info(`[engine] JSON not local, fetching manifest for: ${versionId}`);
            // Fall back to Mojang's version manifest
            versionJson = await fetchVersionJson(versionId);
        }

        // Resolve inheritance (for mod loaders)
        logger.info(`[engine] Starting inheritance resolution for ${versionId}`);
        const resolved = await resolveVersionInheritance(versionJson);
        logger.info(`[engine] Finished inheritance resolution for ${versionId}`);

        return resolved;
    }

    /**
     * Downloads/verifies game files.
     */
    private async downloadFiles(versionJson: VersionJson, gameDir: string, signal?: AbortSignal): Promise<void> {
        logger.info(`[engine] Starting validation/download for ${versionJson.id}`);
        await downloadGameFiles({
            versionJson,
            gameDir,
            signal, // Pass signal
            onProgress: (progress) => {
                // Adapt progress format if needed, types match mostly
                let percent = progress.totalFiles > 0
                    ? (progress.completedFiles / progress.totalFiles) * 100
                    : 0;

                if (progress.currentFilePercent && progress.totalFiles > 0) {
                    percent += (progress.currentFilePercent / progress.totalFiles);
                }

                // Log to file logger only (debug), do not spam terminal
                if (Math.round(percent) % 10 === 0 && progress.completedFiles > 0) {
                    logger.debug(`[engine] Downloading ${progress.stage}: ${percent.toFixed(1)}% (${progress.completedFiles}/${progress.totalFiles})`);
                }

                void this.emit('downloadProgress', {
                    stage: progress.stage,
                    percent,
                    totalFiles: progress.totalFiles,
                    completedFiles: progress.completedFiles,
                    currentFile: progress.currentFile,
                    action: progress.action, // Forward action
                });
            },
        });
        logger.info(`[engine] Validation/download complete for ${versionJson.id}`);
    }

    private createNativesPath(gameDir: string, versionId: string): string {
        return path.join(gameDir, 'natives', versionId);
    }

    /**
     * Hook for pruning native folders from previously launched versions.
     * Intentionally a no-op for now. Natives are small and kept to avoid
     * deleting files a concurrent launch might still be using.
     */
    private async cleanOldNatives(gameDir: string, activeVersionId: string): Promise<void> {
        // No-op (see method docs).
    }
}
