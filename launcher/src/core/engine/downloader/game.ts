/**
 * Game Downloader
 * 
 * High-level API for downloading all game files for a Minecraft version.
 * Handles assets, libraries, and client JAR downloading.
 */

import { mkdir, writeFile, readFile, access, copyFile } from 'fs/promises';
import path from 'path';

import { logger } from '../../utils/logger';
import { LauncherDownloadError } from '../types/errors';

import type {
    VersionJson,
    AssetIndex,
} from '../types/version-json';

import { resolveLibraries } from './parser';
import { DownloadQueue } from './queue';
import type { DownloadOptions, DownloadTask } from './types';

// ============================================================================
// Types
// ============================================================================

export interface GameDownloadProgress {
    stage: 'assets' | 'libraries' | 'client';
    totalFiles: number;
    completedFiles: number;
    currentFile?: string;
    speed?: number;
    action?: 'verifying' | 'downloading'; // New field for UI context
    currentFilePercent?: number;
}

/**
 * Options for downloading game files.
 */
export interface DownloadGameOptions {
    /** Version JSON (should be inheritance-resolved). */
    versionJson: VersionJson;
    /** Base game directory (e.g., ~/.minecraft). */
    gameDir: string;
    /** Maximum parallel downloads. */
    maxParallel?: number;
    /** Called on progress updates. */
    onProgress?: (progress: GameDownloadProgress) => void;
    /** Called when a file completes. */
    onFileComplete?: (file: string) => void;
    /** Whether to verify existing files. */
    verify?: boolean;
}

/**
 * Result of download operation.
 */
export interface DownloadResult {
    /** Total files downloaded. */
    downloaded: number;
    /** Files that failed. */
    failed: number;
    /** Files that were already present. */
    skipped: number;
}

function assertDownloadComplete(stage: string, result: DownloadResult): void {
    if (result.failed > 0) {
        throw new LauncherDownloadError(`${stage} download failed for ${result.failed} file(s)`);
    }
}

// ============================================================================
// Asset Downloader
// ============================================================================

/** Base URL for Minecraft assets. */
const ASSETS_BASE_URL = 'https://resources.download.minecraft.net/';

/**
 * Downloads the asset index and all assets for a version.
 */
export async function downloadAssets(
    versionJson: VersionJson,
    assetsDir: string,
    options: {
        maxParallel?: number;
        onProgress?: (info: GameDownloadProgress) => void;
        onFileComplete?: (file: string) => void;
        signal?: AbortSignal;
    } = {}
): Promise<DownloadResult> {
    if (options.signal?.aborted) throw new Error('Download cancelled');

    if (!versionJson.assetIndex) {
        // Very old versions without asset index
        return { downloaded: 0, failed: 0, skipped: 0 };
    }

    // Ensure directories
    const indexesDir = path.join(assetsDir, 'indexes');
    const objectsDir = path.join(assetsDir, 'objects');
    await mkdir(indexesDir, { recursive: true });
    await mkdir(objectsDir, { recursive: true });

    // Download asset index JSON
    const indexPath = path.join(indexesDir, `${versionJson.assetIndex.id}.json`);

    try {
        await access(indexPath);
        logger.info(`[GameDownloader] Asset index found at ${indexPath}`);
    } catch {
        logger.info(`[GameDownloader] Asset index not found, fetching from ${versionJson.assetIndex.url}`);
        const response = await fetch(versionJson.assetIndex.url, { signal: options.signal });
        if (!response.ok) {
            throw new LauncherDownloadError(`Failed to fetch asset index: ${response.status}`);
        }
        const indexContent = await response.text();
        await writeFile(indexPath, indexContent);
        logger.info(`[GameDownloader] Asset index saved`);
    }

    // Parse asset index
    const assetIndex = JSON.parse(await readFile(indexPath, 'utf-8')) as AssetIndex;
    const tasks: DownloadTask[] = [];

    // Build download tasks for each asset
    for (const [assetPath, asset] of Object.entries(assetIndex.objects)) {
        const hashPrefix = asset.hash.substring(0, 2);
        const objectPath = path.join(objectsDir, hashPrefix, asset.hash);
        const url = `${ASSETS_BASE_URL}${hashPrefix}/${asset.hash}`;

        tasks.push({
            url,
            destination: objectPath,
            sha1: asset.hash,
            size: asset.size,
        });
    }
    logger.info(`[GameDownloader] Queued ${tasks.length} asset downloads`);

    if (options.signal?.aborted) throw new Error('Download cancelled');

    // Handle legacy/virtual assets (pre-1.7)
    if (assetIndex.virtual || assetIndex.map_to_resources) {
        const virtualDir = path.join(assetsDir, 'virtual', versionJson.assetIndex.id);
        await mkdir(virtualDir, { recursive: true });
    }

    // Download assets
    const queue = new DownloadQueue({ maxParallel: options.maxParallel ?? 10, signal: options.signal });
    let completed = 0;

    queue.on('progress', (p) => {
        options.onProgress?.({
            stage: 'assets',
            totalFiles: tasks.length,
            completedFiles: completed,
            currentFile: path.basename(p.file),
            speed: p.speed,
            action: 'downloading', // Default to downloading during actual progress
            currentFilePercent: p.percentage
        });
    });

    queue.on('complete', ({ task, cached }) => {
        completed++;

        // Log to file logger (debug level)
        const action = cached ? 'Verified' : 'Downloaded';
        logger.debug(`[GameDownloader] ${action}: ${path.basename(task.destination)} (${completed}/${tasks.length})`);

        // Emit progress with action context
        options.onProgress?.({
            stage: 'assets',
            totalFiles: tasks.length,
            completedFiles: completed,
            currentFile: path.basename(task.destination),
            action: cached ? 'verifying' : 'downloading',
            speed: 0,
            currentFilePercent: 100
        });

        options.onFileComplete?.(task.destination);
    });

    queue.add(tasks);
    const result = await queue.start();

    // Copy to virtual directory if needed
    if (assetIndex.virtual || assetIndex.map_to_resources) {
        const virtualDir = assetIndex.map_to_resources
            ? path.join(assetsDir, '..', 'resources')  // Legacy resources folder
            : path.join(assetsDir, 'virtual', versionJson.assetIndex.id);

        await mkdir(virtualDir, { recursive: true });

        for (const [assetPath, asset] of Object.entries(assetIndex.objects)) {
            const hashPrefix = asset.hash.substring(0, 2);
            const objectPath = path.join(objectsDir, hashPrefix, asset.hash);
            const virtualPath = path.join(virtualDir, assetPath);

            await mkdir(path.dirname(virtualPath), { recursive: true });
            try {
                await copyFile(objectPath, virtualPath);
            } catch {
                // Ignore copy errors
            }
        }
    }

    return {
        downloaded: result.completed,
        failed: result.failed,
        skipped: tasks.length - result.completed - result.failed,
    };
}

// ============================================================================
// Library Downloader
// ============================================================================

/**
 * Downloads all libraries for a version.
 */
export async function downloadLibraries(
    versionJson: VersionJson,
    librariesDir: string,
    options: {
        maxParallel?: number;
        onProgress?: (info: GameDownloadProgress) => void;
        onFileComplete?: (file: string) => void;
        signal?: AbortSignal;
    } = {}
): Promise<DownloadResult> {
    if (options.signal?.aborted) throw new Error('Download cancelled');

    // Resolve libraries for current platform
    const libraries = resolveLibraries(versionJson, librariesDir);

    const tasks: DownloadTask[] = [];

    for (const lib of libraries) {
        if (!lib.download) continue;

        tasks.push({
            url: lib.download.url,
            destination: lib.path,
            sha1: lib.download.sha1,
            size: lib.download.size,
        });
    }

    // Download libraries
    const queue = new DownloadQueue({ maxParallel: options.maxParallel ?? 5, signal: options.signal });
    let completed = 0;

    queue.on('progress', (p) => {
        options.onProgress?.({
            stage: 'libraries',
            totalFiles: tasks.length,
            completedFiles: completed,
            currentFile: path.basename(p.file),
            speed: p.speed,
        });
    });

    queue.on('complete', ({ task }) => {
        completed++;
        options.onFileComplete?.(task.destination);
    });

    queue.add(tasks);
    const result = await queue.start();

    return {
        downloaded: result.completed,
        failed: result.failed,
        skipped: tasks.length - result.completed - result.failed,
    };
}

// ============================================================================
// Client JAR Downloader
// ============================================================================

/**
 * Downloads the client JAR for a version.
 */
export async function downloadClient(
    versionJson: VersionJson,
    versionsDir: string,
    options: {
        onProgress?: (info: GameDownloadProgress) => void;
        onFileComplete?: (file: string) => void;
        signal?: AbortSignal;
    } = {}
): Promise<DownloadResult> {
    if (options.signal?.aborted) throw new Error('Download cancelled');

    if (!versionJson.downloads?.client) {
        throw new LauncherDownloadError('Version has no client download info');
    }

    const versionDir = path.join(versionsDir, versionJson.id);
    await mkdir(versionDir, { recursive: true });

    // Save version JSON
    const jsonPath = path.join(versionDir, `${versionJson.id}.json`);
    await writeFile(jsonPath, JSON.stringify(versionJson, null, 2));

    // Download client JAR
    const jarPath = path.join(versionDir, `${versionJson.id}.jar`);
    const client = versionJson.downloads.client;

    const queue = new DownloadQueue({ maxParallel: 1, signal: options.signal });

    queue.on('progress', (p) => {
        options.onProgress?.({
            stage: 'client',
            totalFiles: 1,
            completedFiles: 0,
            currentFile: `${versionJson.id}.jar`,
            speed: p.speed,
        });
    });

    queue.on('complete', ({ task }) => {
        options.onFileComplete?.(task.destination);
    });

    queue.add({
        url: client.url,
        destination: jarPath,
        sha1: client.sha1,
        size: client.size,
    });

    const result = await queue.start();

    return {
        downloaded: result.completed,
        failed: result.failed,
        skipped: result.completed === 0 && result.failed === 0 ? 1 : 0,
    };
}

// ============================================================================
// Logging Config Downloader
// ============================================================================

/**
 * Downloads the logging configuration if present.
 */
export async function downloadLoggingConfig(
    versionJson: VersionJson,
    assetsDir: string
): Promise<void> {
    if (!versionJson.logging?.client?.file) return;

    const logFile = versionJson.logging.client.file;
    const logConfigDir = path.join(assetsDir, 'log_configs');
    await mkdir(logConfigDir, { recursive: true });

    const logConfigPath = path.join(logConfigDir, logFile.id ?? path.basename(logFile.url));

    const queue = new DownloadQueue({ maxParallel: 1 });
    queue.add({
        url: logFile.url,
        destination: logConfigPath,
        sha1: logFile.sha1,
        size: logFile.size,
    });

    const result = await queue.start();
    assertDownloadComplete('Logging config', { downloaded: result.completed, failed: result.failed, skipped: 0 });
}

// ============================================================================
// Combined Downloader
// ============================================================================

export async function downloadGameFiles(options: DownloadGameOptions & { signal?: AbortSignal }): Promise<{
    assets: DownloadResult;
    libraries: DownloadResult;
    client: DownloadResult;
}> {
    const { versionJson, gameDir, maxParallel = 10, onProgress, onFileComplete, signal } = options;

    // Standard Minecraft directory structure
    const assetsDir = path.join(gameDir, 'assets');
    const librariesDir = path.join(gameDir, 'libraries');
    const versionsDir = path.join(gameDir, 'versions');

    if (signal?.aborted) throw new Error('Download cancelled');

    // Download assets
    logger.info(`[GameDownloader] Starting asset download for ${versionJson.id}`);
    onProgress?.({ stage: 'assets', totalFiles: 0, completedFiles: 0 });
    const assetsResult = await downloadAssets(versionJson, assetsDir, {
        maxParallel,
        onProgress,
        onFileComplete,
        signal,
    });
    assertDownloadComplete('Asset', assetsResult);
    logger.info(`[GameDownloader] Asset download complete for ${versionJson.id}`);

    await downloadLoggingConfig(versionJson, assetsDir);

    if (signal?.aborted) throw new Error('Download cancelled');

    // Download libraries
    logger.info(`[GameDownloader] Starting library download`);
    onProgress?.({ stage: 'libraries', totalFiles: 0, completedFiles: 0 });
    const librariesResult = await downloadLibraries(versionJson, librariesDir, {
        maxParallel: Math.min(maxParallel, 5), // Libraries are usually larger
        onProgress,
        onFileComplete,
        signal,
    });
    assertDownloadComplete('Library', librariesResult);
    logger.info(`[GameDownloader] Library download complete`);

    if (signal?.aborted) throw new Error('Download cancelled');

    // Download client JAR
    logger.info(`[GameDownloader] Starting client JAR download`);
    onProgress?.({ stage: 'client', totalFiles: 1, completedFiles: 0 });
    const clientResult = await downloadClient(versionJson, versionsDir, {
        onProgress,
        onFileComplete,
        signal,
    });
    assertDownloadComplete('Client JAR', clientResult);
    logger.info(`[GameDownloader] Client JAR download complete`);

    return {
        assets: assetsResult,
        libraries: librariesResult,
        client: clientResult,
    };
}
