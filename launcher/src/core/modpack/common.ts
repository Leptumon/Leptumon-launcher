/** Pieces shared by the modpack installers (hosted manifest and CurseForge). */
import fs from 'fs/promises';
import path from 'path';

import { DownloadQueue } from '../engine/downloader/queue';
import type { DownloadTask } from '../engine/downloader/types';
import { logger } from '../utils/logger';

export type LoaderType = 'neoforge' | 'fabric';

/** What the rest of the launch pipeline needs to know about the installed pack. */
export interface ModpackTarget {
    name: string;
    version: string;
    mcVersion: string;
    loader: { type: LoaderType; version: string };
}

export type ModpackProgress = (
    fraction: number,
    status: { key: string; params?: Record<string, string> }
) => void;

/**
 * Folders whose contents belong entirely to the pack: files dropped from the
 * pack are deleted there. Player-added files in them are never listed, so they stay.
 */
const MANAGED_FOLDERS = new Set(['mods', 'resourcepacks', 'shaderpacks']);

export const isManagedPath = (relative: string): boolean => MANAGED_FOLDERS.has(relative.split('/')[0] ?? '');

const DOWNLOAD_PARALLELISM = 8;
/** Per-file budget; the queue's timeout covers the whole transfer, and some jars are large. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export const throwIfAborted = (signal: AbortSignal): void => {
    if (signal.aborted) {
        const error = new Error('AbortError');
        error.name = 'AbortError';
        throw error;
    }
};

export const readJson = async <T>(file: string): Promise<T | null> => {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch {
        return null;
    }
};

/** Write-then-rename so a crash mid-write never leaves a half-written state file. */
export const writeJsonAtomic = async (file: string, value: unknown): Promise<void> => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2));
    await fs.rename(`${file}.tmp`, file);
};

/** Runs downloads through the shared queue; returns the names of files that failed. */
export const runDownloads = async (
    tasks: DownloadTask[],
    signal: AbortSignal,
    onFileDone?: (task: DownloadTask) => void,
    onBytes?: (fraction: number) => void
): Promise<string[]> => {
    if (tasks.length === 0) return [];

    const queue = new DownloadQueue({ maxParallel: DOWNLOAD_PARALLELISM, timeout: DOWNLOAD_TIMEOUT_MS, signal });
    const failed: string[] = [];

    queue.on('complete', ({ task }) => onFileDone?.(task));
    queue.on('error', ({ task, error }) => {
        failed.push(path.basename(task.destination));
        logger.warn(`[modpack] Download failed ${task.url}: ${error.message}`);
    });
    if (onBytes) {
        queue.on('progress', (progress) => onBytes(Math.min(1, progress.percentage / 100)));
    }

    queue.add(tasks);
    await queue.start();
    return failed;
};
