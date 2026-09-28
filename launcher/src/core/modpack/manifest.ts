/**
 * Game setup from a hosted pack manifest (no CurseForge API key needed).
 *
 * `modpack.manifestUrl` points at a manifest.json produced by
 * scripts/generate-pack-manifest.mjs. It lists the Minecraft + loader versions
 * and every pack file with its download URL (Modrinth CDN or our own hosting),
 * SHA-1 and size. The manifest is fetched on every Play, so publishing a new
 * one moves players to the new pack version without a launcher update.
 *
 * Sync rules, per file:
 *  - missing                                  → download
 *  - unchanged in the pack since last install → keep (player config edits survive);
 *                                               mods/resourcepacks/shaderpacks are re-downloaded if their size is wrong
 *  - new or changed in the pack               → download unless the local copy already matches
 *  - `keep: true` (e.g. options.txt)          → only installed when missing
 * Files dropped from the pack are removed from mods/resourcepacks/shaderpacks,
 * and elsewhere only if the player never modified them. Worlds, screenshots and
 * player-added mods are never touched.
 */
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import type { DownloadTask } from '../engine/downloader/types';
import { t } from '../../i18n';
import { UserFacingError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
    isManagedPath,
    readJson,
    runDownloads,
    throwIfAborted,
    writeJsonAtomic,
    type ModpackProgress,
    type ModpackTarget,
} from './common';

export const MANIFEST_FORMAT_VERSION = 1;

export interface PackManifestFile {
    /** Instance-relative path with forward slashes, e.g. "mods/cobblemon.jar". */
    path: string;
    url: string;
    sha1: string;
    size: number;
    /** Install only when missing; never overwrite the player's copy (options.txt). */
    keep?: boolean;
}

export interface PackManifest {
    formatVersion: number;
    name: string;
    version: string;
    minecraft: string;
    loader: ModpackTarget['loader'];
    files: PackManifestFile[];
}

interface ManifestState extends ModpackTarget {
    /** SHA-1 of the manifest body last installed; unchanged means a fast launch. */
    manifestSha1: string;
    /** Path → SHA-1 of every file the manifest installed. */
    files: Record<string, string>;
    installedAt: string;
}

export interface EnsureManifestModpackOptions {
    instanceDir: string;
    manifestUrl: string;
    userAgent: string;
    signal: AbortSignal;
    onProgress: ModpackProgress;
}

const STATE_PATH = path.join('.leptumon', 'manifest-state.json');
const MANIFEST_TIMEOUT_MS = 20_000;
const HASH_PARALLELISM = 16;
const SHA1_PATTERN = /^[0-9a-f]{40}$/;

const unreachableMessage = (): string => t('errors.modpack_manifest_unreachable');
const downloadFailedMessage = (): string => t('errors.modpack_download_failed');

/** HTTPS only; plain HTTP is accepted for localhost so the manifest can be tested locally. */
export const isAllowedUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    } catch {
        return false;
    }
};

/** Manifest paths become disk paths: relative, no traversal, never inside launcher state. */
const isSafeRelativePath = (value: string): boolean => {
    if (!value || value.includes('\\') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
    const parts = value.split('/');
    return parts.every((part) => part !== '' && part !== '.' && part !== '..') && parts[0] !== '.leptumon';
};

const invalid = (detail: string): UserFacingError => new UserFacingError(downloadFailedMessage(), `Invalid pack manifest: ${detail}`);

export const parseManifest = (raw: string): PackManifest => {
    let data: Partial<PackManifest>;
    try {
        data = JSON.parse(raw) as Partial<PackManifest>;
    } catch {
        throw invalid('not JSON');
    }

    if (data.formatVersion !== MANIFEST_FORMAT_VERSION) throw invalid(`unsupported formatVersion ${String(data.formatVersion)}`);
    if (typeof data.minecraft !== 'string' || !data.minecraft) throw invalid('missing minecraft version');
    const loader = data.loader;
    if (!loader || (loader.type !== 'neoforge' && loader.type !== 'fabric') || typeof loader.version !== 'string' || !loader.version) {
        throw invalid('missing or unsupported loader');
    }
    if (!Array.isArray(data.files)) throw invalid('files is not an array');

    const seen = new Set<string>();
    const files = data.files.map((file, index): PackManifestFile => {
        const entry = file as Partial<PackManifestFile>;
        if (typeof entry.path !== 'string' || !isSafeRelativePath(entry.path)) throw invalid(`file ${index} has an unsafe path`);
        if (seen.has(entry.path)) throw invalid(`duplicate path ${entry.path}`);
        seen.add(entry.path);
        if (typeof entry.url !== 'string' || !isAllowedUrl(entry.url)) throw invalid(`${entry.path} has a disallowed URL`);
        if (typeof entry.sha1 !== 'string' || !SHA1_PATTERN.test(entry.sha1)) throw invalid(`${entry.path} has an invalid sha1`);
        if (!Number.isInteger(entry.size) || (entry.size as number) < 0) throw invalid(`${entry.path} has an invalid size`);
        return { path: entry.path, url: entry.url, sha1: entry.sha1, size: entry.size as number, keep: entry.keep === true };
    });

    return {
        formatVersion: data.formatVersion,
        name: typeof data.name === 'string' && data.name ? data.name : 'Modpack',
        version: typeof data.version === 'string' ? data.version : '',
        minecraft: data.minecraft,
        loader: { type: loader.type, version: loader.version },
        files,
    };
};

const sha1OfFile = async (file: string): Promise<string | null> => {
    try {
        const hash = createHash('sha1');
        for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
        return hash.digest('hex');
    } catch {
        return null;
    }
};

const sizeOfFile = async (file: string): Promise<number | null> => {
    try {
        return (await fs.stat(file)).size;
    } catch {
        return null;
    }
};

/** Runs `worker` over `items` with bounded concurrency, preserving result order. */
const mapLimit = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let next = 0;
    const run = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await worker(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
};

const fetchManifest = async (opts: EnsureManifestModpackOptions): Promise<string> => {
    // Aborts on player cancel or timeout (AbortSignal.any isn't in this TypeScript's lib).
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, MANIFEST_TIMEOUT_MS);
    opts.signal.addEventListener('abort', abort, { once: true });
    try {
        const response = await fetch(opts.manifestUrl, {
            signal: controller.signal,
            headers: { Accept: 'application/json', 'User-Agent': opts.userAgent, 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
        opts.signal.removeEventListener('abort', abort);
    }
};

const readState = async (instanceDir: string): Promise<ManifestState | null> => {
    const state = await readJson<ManifestState>(path.join(instanceDir, STATE_PATH));
    return state && typeof state.manifestSha1 === 'string' && state.files && typeof state.files === 'object' ? state : null;
};

const toTarget = ({ name, version, mcVersion, loader }: ModpackTarget): ModpackTarget => ({ name, version, mcVersion, loader });

/** Decides whether one manifest file has to be (re)downloaded. */
const needsDownload = async (
    file: PackManifestFile,
    destination: string,
    previous: ManifestState | null,
    manifestChanged: boolean
): Promise<boolean> => {
    const size = await sizeOfFile(destination);
    if (size === null) return true;
    if (file.keep) return false;

    const unchangedInPack = !manifestChanged || previous?.files[file.path] === file.sha1;
    if (unchangedInPack) {
        // Cheap repair check for pack-owned folders; configs may have been edited on purpose.
        return isManagedPath(file.path) && size !== file.size;
    }

    return size !== file.size || (await sha1OfFile(destination)) !== file.sha1;
};

/**
 * Makes sure the hosted pack manifest is installed in the instance and returns
 * the Minecraft + loader versions it needs.
 */
export const ensureManifestModpack = async (opts: EnsureManifestModpackOptions): Promise<ModpackTarget> => {
    const { instanceDir, signal, onProgress } = opts;
    const root = path.resolve(instanceDir);
    onProgress(0, { key: 'launch.modpack_checking' });

    if (!isAllowedUrl(opts.manifestUrl)) {
        throw new UserFacingError(t('errors.modpack_not_configured'), `modpack.manifestUrl must be https: ${opts.manifestUrl}`);
    }

    const previous = await readState(instanceDir);

    let raw: string;
    try {
        raw = await fetchManifest(opts);
    } catch (error) {
        throwIfAborted(signal);
        // The file host being down shouldn't stop people who already have the pack.
        if (previous) {
            logger.warn(`[modpack] Manifest unreachable (${(error as Error).message}); launching installed ${previous.name} ${previous.version}`);
            onProgress(1, { key: 'launch.modpack_ready' });
            return toTarget(previous);
        }
        throw new UserFacingError(unreachableMessage(), `Manifest fetch failed: ${(error as Error).message}`);
    }

    const manifest = parseManifest(raw);
    const manifestSha1 = createHash('sha1').update(raw).digest('hex');
    const manifestChanged = previous?.manifestSha1 !== manifestSha1;
    logger.info(`[modpack] Manifest ${manifest.name} ${manifest.version} (${manifest.files.length} files, ${manifestChanged ? 'changed' : 'unchanged'})`);

    // 1. Work out which files are missing, damaged, or changed in the pack.
    onProgress(0.03, { key: 'launch.modpack_resolving' });
    const pending = await mapLimit(manifest.files, HASH_PARALLELISM, async (file) => {
        const destination = path.resolve(root, file.path);
        if (!destination.startsWith(root + path.sep)) throw invalid(`${file.path} escapes the instance`);
        return (await needsDownload(file, destination, previous, manifestChanged)) ? { file, destination } : null;
    });
    throwIfAborted(signal);

    const tasks: DownloadTask[] = pending
        .filter((entry): entry is { file: PackManifestFile; destination: string } => entry !== null)
        .map(({ file, destination }) => ({ url: file.url, destination, sha1: file.sha1, size: file.size }));

    // 2. Download them (the queue verifies SHA-1 after each transfer).
    // The bar follows bytes, not file count: a pack is thousands of tiny configs
    // plus a few hundred large jars, so counting files races to ~90% and then stalls.
    if (tasks.length > 0) {
        const totalBytes = tasks.reduce((sum, task) => sum + (task.size ?? 0), 0);
        logger.info(`[modpack] Downloading ${tasks.length} file(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
        let done = 0;
        let doneBytes = 0;
        const failed = await runDownloads(tasks, signal, (task) => {
            done++;
            doneBytes += task.size ?? 0;
            const fraction = totalBytes > 0 ? doneBytes / totalBytes : done / tasks.length;
            onProgress(0.08 + 0.87 * fraction, {
                key: 'launch.modpack_downloading_files',
                params: { done: String(done), total: String(tasks.length) },
            });
        });
        throwIfAborted(signal);
        if (failed.length > 0) {
            throw new UserFacingError(t('errors.modpack_files_failed', { count: failed.length }), `Failed: ${failed.join(', ')}`);
        }
    }

    // 3. Remove files the previous pack version installed that this one dropped.
    if (previous && manifestChanged) {
        onProgress(0.96, { key: 'launch.modpack_applying' });
        const current = new Set(manifest.files.map((file) => file.path));
        for (const [relative, installedSha1] of Object.entries(previous.files)) {
            if (current.has(relative) || !isSafeRelativePath(relative)) continue;
            const target = path.resolve(root, relative);
            if (!target.startsWith(root + path.sep)) continue;
            // Outside pack-owned folders, a file the player changed is theirs now.
            if (!isManagedPath(relative) && (await sha1OfFile(target)) !== installedSha1) continue;
            await fs.rm(target, { force: true });
            logger.info(`[modpack] Removed ${relative} (no longer in the modpack)`);
        }
    }

    const target: ModpackTarget = {
        name: manifest.name,
        version: manifest.version,
        mcVersion: manifest.minecraft,
        loader: manifest.loader,
    };
    const state: ManifestState = {
        ...target,
        manifestSha1,
        files: Object.fromEntries(manifest.files.map((file) => [file.path, file.sha1])),
        installedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(path.join(instanceDir, STATE_PATH), state);

    onProgress(1, { key: 'launch.modpack_ready' });
    logger.info(`[modpack] Ready: ${target.name} ${target.version} (MC ${target.mcVersion}, ${target.loader.type} ${target.loader.version})`);
    return target;
};
