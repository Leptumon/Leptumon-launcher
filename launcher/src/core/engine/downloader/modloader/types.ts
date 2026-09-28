/** Mod loader installer interfaces (NeoForge, Fabric) used by launchPipeline. */
import type { VersionJson } from '../../types/version-json';

export interface ModLoaderInstaller {
    /**
     * Installs the mod loader into the versions directory.
     * @returns The parsed version JSON and the installed directory path.
     */
    install(options: InstallOptions): Promise<InstallResult>;

    /**
     * Fetches available versions for a given Minecraft version.
     */
    fetchVersions(mcVersion: string): Promise<string[]>;
}

export interface InstallOptions {
    /**
     * The Minecraft version (e.g., '1.20.4').
     */
    mcVersion: string;

    /**
     * The loader version to install (e.g., '0.15.0').
     * If not provided, the latest stable version should be used.
     */
    loaderVersion?: string;

    /**
     * Path to the game data directory (e.g. .minecraft).
     * Versions will be installed to {gameDir}/versions/{id}/
     */
    gameDir: string;

    /** Path to the Java executable. Required by NeoForge's installer jar; unused by Fabric. */
    javaPath?: string;

    /**
     * Optional AbortSignal to cancel the installation process.
     */
    signal?: AbortSignal;

    /**
     * Callback for progress updates (0-100).
     */
    onProgress?: (progress: number, task?: string) => void;
}

export interface InstallResult {
    /**
     * The ID of the installed version (e.g., '1.20.4-fabric-0.15.0').
     */
    versionId: string;

    /**
     * The parsed version JSON content.
     */
    versionJson: VersionJson;
}

export interface FabricLoaderVersion {
    loader: { version: string };
    intermediary: { version: string };
    launcherMeta: { version: number };
}


