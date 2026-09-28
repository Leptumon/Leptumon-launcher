/**
 * Game setup for the CurseForge modpack (All the Mons).
 *
 * Installs the configured modpack file into the instance: the pack archive,
 * every mod / resource pack / shader pack in its manifest, and its overrides
 * (configs, quests, scripts). The result is recorded in
 * {instance}/.leptumon/modpack.json, so later launches of the same fileId go
 * straight to the game without contacting CurseForge.
 *
 * Changing curseforge.fileId (shipped in a launcher update) installs the new
 * version in place: files the previous version installed are replaced or
 * removed, while player-added mods, worlds and screenshots are left alone.
 */
import fs from 'fs/promises';
import path from 'path';

import type { DownloadTask } from '../engine/downloader/types';
import { t } from '../../i18n';
import type { ClientConfig } from '../../types/config/ClientConfig';
import { UserFacingError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
    isManagedPath,
    readJson,
    runDownloads,
    throwIfAborted,
    writeJsonAtomic,
    type LoaderType,
    type ModpackProgress,
    type ModpackTarget,
} from './common';
import { CURSEFORGE_CLASS, CurseForgeApiError, CurseForgeClient } from './curseforge';
import { extractZipDirectory, readZipEntry } from './zip';

interface InstallState extends ModpackTarget {
    projectId: number;
    fileId: number;
    /** Instance-relative paths this launcher installed (mods/, resourcepacks/, shaderpacks/). */
    managedFiles: string[];
    installedAt: string;
}

interface Manifest {
    manifestType?: string;
    name?: string;
    version?: string;
    overrides?: string;
    minecraft?: {
        version?: string;
        modLoaders?: { id?: string; primary?: boolean }[];
    };
    files?: { projectID: number; fileID: number; required?: boolean }[];
}

export interface EnsureModpackOptions {
    instanceDir: string;
    cacheDir: string;
    config: ClientConfig['curseforge'];
    userAgent: string;
    signal: AbortSignal;
    onProgress: ModpackProgress;
}

const STATE_PATH = path.join('.leptumon', 'modpack.json');

/** Instance folder each CurseForge project class installs into. */
const CLASS_FOLDERS: Record<number, string> = {
    [CURSEFORGE_CLASS.mods]: 'mods',
    [CURSEFORGE_CLASS.resourcePacks]: 'resourcepacks',
    [CURSEFORGE_CLASS.shaders]: 'shaderpacks',
};

// Resolved at throw time so they follow the player's current language.
const notConfiguredMessage = (): string => t('errors.modpack_not_configured');
const downloadFailedMessage = (): string => t('errors.modpack_download_failed');

const readState = async (instanceDir: string): Promise<InstallState | null> => {
    const state = await readJson<InstallState>(path.join(instanceDir, STATE_PATH));
    return state && typeof state.fileId === 'number' && Array.isArray(state.managedFiles) ? state : null;
};

const writeState = (instanceDir: string, state: InstallState): Promise<void> =>
    writeJsonAtomic(path.join(instanceDir, STATE_PATH), state);

const toTarget = ({ name, version, mcVersion, loader }: ModpackTarget): ModpackTarget => ({ name, version, mcVersion, loader });

const parseLoader = (manifest: Manifest): ModpackTarget['loader'] => {
    const loaders = manifest.minecraft?.modLoaders ?? [];
    const primary = loaders.find((loader) => loader.primary) ?? loaders[0];
    const match = /^(neoforge|fabric)-(.+)$/i.exec(primary?.id ?? '');
    if (!match) {
        throw new UserFacingError(
            t('errors.modpack_unsupported_loader'),
            `Unsupported modLoaders in manifest: ${JSON.stringify(loaders)}`
        );
    }
    return { type: match[1].toLowerCase() as LoaderType, version: match[2] };
};

/** CurseForge file names become paths on disk, so strip anything path-like. */
const safeFileName = (name: string): string => {
    const base = path.basename(name.replace(/\\/g, '/'));
    if (!base || base === '.' || base === '..') {
        throw new Error(`Unsafe file name from CurseForge: ${name}`);
    }
    return base;
};

const installPack = async (
    opts: EnsureModpackOptions,
    client: CurseForgeClient,
    projectId: number,
    fileId: number,
    previous: InstallState | null
): Promise<ModpackTarget> => {
    const { instanceDir, cacheDir, signal, onProgress } = opts;
    logger.info(`[modpack] Installing CurseForge project ${projectId} file ${fileId} (previous: ${previous?.fileId ?? 'none'})`);

    // 1. Modpack archive (manifest + overrides).
    const packFile = await client.getModFile(projectId, fileId, signal);
    if (packFile.modId !== projectId) {
        throw new UserFacingError(notConfiguredMessage(), `File ${fileId} belongs to project ${packFile.modId}, not ${projectId}`);
    }
    const packUrl = packFile.downloadUrl ?? await client.getDownloadUrl(projectId, fileId, signal);
    if (!packUrl) {
        throw new UserFacingError(downloadFailedMessage(), `No download URL for modpack file ${fileId}`);
    }

    const archive = path.join(cacheDir, 'modpacks', `${projectId}-${fileId}.zip`);
    const packFailed = await runDownloads(
        [{ url: packUrl, destination: archive, size: packFile.fileLength || undefined }],
        signal,
        undefined,
        (fraction) => onProgress(0.05 * fraction, {
            key: 'launch.modpack_downloading_pack',
            params: { percent: (fraction * 100).toFixed(1) },
        })
    );
    throwIfAborted(signal);
    if (packFailed.length > 0) {
        throw new UserFacingError(downloadFailedMessage(), `Modpack archive download failed: ${packUrl}`);
    }

    const manifestRaw = await readZipEntry(archive, 'manifest.json');
    if (!manifestRaw) {
        throw new UserFacingError(downloadFailedMessage(), 'manifest.json missing from modpack archive');
    }
    const manifest = JSON.parse(manifestRaw.toString('utf8')) as Manifest;
    const mcVersion = manifest.minecraft?.version;
    if (!mcVersion) {
        throw new UserFacingError(downloadFailedMessage(), 'manifest.json has no minecraft.version');
    }
    const loader = parseLoader(manifest);

    // 2. Resolve every manifest entry to a file, a destination folder, and a URL.
    onProgress(0.07, { key: 'launch.modpack_resolving' });
    const entries = (manifest.files ?? []).filter((entry) =>
        entry.required !== false && Number.isInteger(entry.projectID) && Number.isInteger(entry.fileID)
    );
    const [files, mods] = await Promise.all([
        client.getFiles(entries.map((entry) => entry.fileID), signal),
        client.getMods([...new Set(entries.map((entry) => entry.projectID))], signal),
    ]);
    const fileById = new Map(files.map((file) => [file.id, file]));
    const modById = new Map(mods.map((mod) => [mod.id, mod]));

    const tasks: DownloadTask[] = [];
    const managed = new Set<string>();
    const blocked: string[] = [];

    for (const entry of entries) {
        const file = fileById.get(entry.fileID);
        const mod = modById.get(entry.projectID);
        if (!file) {
            throw new UserFacingError(downloadFailedMessage(), `CurseForge returned no metadata for file ${entry.fileID} (project ${entry.projectID})`);
        }

        const folder = CLASS_FOLDERS[mod?.classId ?? CURSEFORGE_CLASS.mods];
        if (!folder) {
            logger.warn(`[modpack] Skipping ${file.fileName}: unsupported project class ${mod?.classId}`);
            continue;
        }

        let url = file.downloadUrl;
        if (!url && mod?.allowModDistribution !== false) {
            url = await client.getDownloadUrl(entry.projectID, entry.fileID, signal);
        }
        if (!url) {
            const page = mod?.links?.websiteUrl ? `${mod.links.websiteUrl}/files/${entry.fileID}` : `project ${entry.projectID}`;
            blocked.push(`${mod?.name ?? file.displayName} (${page})`);
            continue;
        }

        const relative = `${folder}/${safeFileName(file.fileName)}`;
        managed.add(relative);
        tasks.push({ url, destination: path.join(instanceDir, relative), size: file.fileLength || undefined });
    }

    // Authors can opt out of third-party downloads. We never work around that,
    // so the pack cannot be installed until those files are dealt with.
    if (blocked.length > 0) {
        logger.error(`[modpack] ${blocked.length} file(s) do not allow third-party downloads:\n  ${blocked.join('\n  ')}`);
        throw new UserFacingError(
            t('errors.modpack_blocked_mods', { count: blocked.length })
        );
    }

    // 3. Download mods / resource packs / shader packs.
    let done = 0;
    const failed = await runDownloads(tasks, signal, () => {
        done++;
        onProgress(0.1 + 0.82 * (done / tasks.length), {
            key: 'launch.modpack_downloading',
            params: { done: String(done), total: String(tasks.length) },
        });
    });
    throwIfAborted(signal);
    if (failed.length > 0) {
        throw new UserFacingError(
            t('errors.modpack_files_failed', { count: failed.length }),
            `Failed: ${failed.join(', ')}`
        );
    }

    // 4. Overrides: configs, quests, scripts, and any bundled non-CurseForge mods.
    onProgress(0.94, { key: 'launch.modpack_applying' });
    const written = await extractZipDirectory(archive, manifest.overrides || 'overrides', instanceDir);
    written.filter(isManagedPath).forEach((relative) => managed.add(relative));

    // 5. Remove files the previous pack version installed that this one dropped.
    if (previous) {
        const root = path.resolve(instanceDir);
        for (const relative of previous.managedFiles) {
            if (managed.has(relative) || !isManagedPath(relative)) continue;
            const target = path.resolve(root, relative);
            if (!target.startsWith(root + path.sep)) continue;
            await fs.rm(target, { force: true });
            logger.info(`[modpack] Removed ${relative} (no longer in the modpack)`);
        }
    }

    const target: ModpackTarget = {
        name: manifest.name || packFile.displayName,
        version: manifest.version || packFile.displayName,
        mcVersion,
        loader,
    };
    await writeState(instanceDir, {
        ...target,
        projectId,
        fileId,
        managedFiles: [...managed].sort(),
        installedAt: new Date().toISOString(),
    });
    await fs.rm(archive, { force: true });

    logger.info(`[modpack] Installed ${target.name} ${target.version} (MC ${mcVersion}, ${loader.type} ${loader.version}, ${tasks.length} files)`);
    return target;
};

/**
 * Makes sure the configured modpack file is installed in the instance and
 * returns the Minecraft + loader versions it needs.
 */
export const ensureModpack = async (opts: EnsureModpackOptions): Promise<ModpackTarget> => {
    const { projectId, fileId, apiKey } = opts.config;
    if (!projectId || !fileId) {
        throw new UserFacingError(notConfiguredMessage(), 'curseforge.projectId / curseforge.fileId are not set in client-config.json');
    }

    opts.onProgress(0, { key: 'launch.modpack_checking' });
    const previous = await readState(opts.instanceDir);
    if (previous && previous.projectId === projectId && previous.fileId === fileId) {
        opts.onProgress(1, { key: 'launch.modpack_ready' });
        return toTarget(previous);
    }

    if (!apiKey) {
        throw new UserFacingError(notConfiguredMessage(), 'curseforge.apiKey is not set in client-config.json');
    }

    try {
        const target = await installPack(opts, new CurseForgeClient(apiKey, opts.userAgent), projectId, fileId, previous);
        opts.onProgress(1, { key: 'launch.modpack_ready' });
        return target;
    } catch (error) {
        if (error instanceof CurseForgeApiError) {
            throw new UserFacingError(downloadFailedMessage(), error.message);
        }
        throw error;
    }
};
