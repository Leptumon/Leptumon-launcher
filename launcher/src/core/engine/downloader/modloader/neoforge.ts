/**
 * NeoForge loader installer.
 *
 * Runs NeoForge's official installer jar headlessly (`--install-client`). It
 * downloads the loader libraries and runs the processors that patch the
 * Minecraft client, then writes a `neoforge-<version>` profile into versions/.
 * An already-installed profile is reused without touching the network.
 */
import { spawn } from 'child_process';
import path from 'path';
import { access, mkdir, readFile, rm, writeFile } from 'fs/promises';

import { logger } from '../../../utils/logger';
import { downloadLargeFile } from '../queue';
import type { VersionJson } from '../../types/version-json';
import type { InstallOptions, InstallResult, ModLoaderInstaller } from './types';

const MAVEN_BASE = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';
const VERSIONS_API = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';

/** Trailing installer output kept for the error message when it fails. */
const OUTPUT_TAIL_LINES = 25;
/** Rough number of output lines a full install prints; only shapes the progress curve. */
const EXPECTED_OUTPUT_LINES = 150;

const abortError = (): Error => {
    const error = new Error('AbortError');
    error.name = 'AbortError';
    return error;
};

async function readVersionJson(gameDir: string, versionId: string): Promise<VersionJson | null> {
    const jsonPath = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
    try {
        return JSON.parse(await readFile(jsonPath, 'utf-8')) as VersionJson;
    } catch {
        return null;
    }
}

function runInstaller(
    javaPath: string,
    installerPath: string,
    gameDir: string,
    signal: AbortSignal | undefined,
    onOutputLines: (count: number) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }

        const tail: string[] = [];
        let lineCount = 0;

        const child = spawn(javaPath, ['-Djava.awt.headless=true', '-jar', installerPath, '--install-client', gameDir], {
            cwd: gameDir,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const onAbort = () => child.kill();
        signal?.addEventListener('abort', onAbort, { once: true });

        const collect = (chunk: Buffer) => {
            for (const line of chunk.toString().split(/\r?\n/)) {
                if (!line.trim()) continue;
                lineCount++;
                tail.push(line);
                if (tail.length > OUTPUT_TAIL_LINES) tail.shift();
                logger.debug(`[NeoForge installer] ${line}`);
            }
            onOutputLines(lineCount);
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);

        child.on('error', (error) => {
            signal?.removeEventListener('abort', onAbort);
            reject(error);
        });

        child.on('close', (code) => {
            signal?.removeEventListener('abort', onAbort);
            if (signal?.aborted) {
                reject(abortError());
            } else if (code === 0) {
                resolve();
            } else {
                logger.error(`[NeoForge] Installer output (last ${tail.length} lines):\n${tail.join('\n')}`);
                reject(new Error(`NeoForge installer exited with code ${code}`));
            }
        });
    });
}

export class NeoForgeInstaller implements ModLoaderInstaller {
    async fetchVersions(mcVersion: string): Promise<string[]> {
        const response = await fetch(VERSIONS_API);
        if (!response.ok) {
            throw new Error(`Failed to fetch NeoForge versions: HTTP ${response.status}`);
        }

        const data = await response.json() as { versions?: string[] };

        // NeoForge drops Minecraft's leading "1.": MC 1.21.1 → NeoForge 21.1.x.
        // The trailing dot keeps 21.1 from matching 21.10.
        const [, minor, patch = '0'] = mcVersion.split('.');
        const prefix = `${minor}.${patch}.`;

        return (data.versions ?? [])
            .filter((version) => version.startsWith(prefix))
            .sort((a, b) => {
                const aStable = !a.includes('-');
                const bStable = !b.includes('-');
                if (aStable !== bStable) return aStable ? -1 : 1;
                return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
            });
    }

    async install(options: InstallOptions): Promise<InstallResult> {
        const { mcVersion, gameDir, javaPath, signal, onProgress } = options;

        if (!javaPath) {
            throw new Error('Java path is required for NeoForge installation');
        }

        const loaderVersion = options.loaderVersion ?? (await this.fetchVersions(mcVersion))[0];
        if (!loaderVersion) {
            throw new Error(`No NeoForge versions found for Minecraft ${mcVersion}`);
        }

        const versionId = `neoforge-${loaderVersion}`;
        const installed = await readVersionJson(gameDir, versionId);
        if (installed) {
            logger.info(`[NeoForge] ${loaderVersion} already installed; skipping installer.`);
            onProgress?.(100);
            return { versionId, versionJson: installed };
        }

        const installerDir = path.join(gameDir, '.installers');
        const installerPath = path.join(installerDir, `neoforge-${loaderVersion}-installer.jar`);
        const installerUrl = `${MAVEN_BASE}/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;

        await mkdir(installerDir, { recursive: true });
        logger.info(`[NeoForge] Downloading installer: ${installerUrl}`);
        await downloadLargeFile(installerUrl, installerPath, (progress) => onProgress?.(progress.percentage * 0.1));

        // The installer refuses to run without a vanilla-launcher profiles file.
        const profilesPath = path.join(gameDir, 'launcher_profiles.json');
        try {
            await access(profilesPath);
        } catch {
            await writeFile(profilesPath, JSON.stringify({ profiles: {} }));
        }

        logger.info(`[NeoForge] Running installer for ${loaderVersion} (headless)...`);
        try {
            await runInstaller(javaPath, installerPath, gameDir, signal, (lines) => {
                // The installer reports no percentage; approach 99% as it logs work.
                onProgress?.(10 + 89 * (1 - Math.exp(-lines / EXPECTED_OUTPUT_LINES)));
            });
        } finally {
            await rm(installerPath, { force: true });
        }

        const versionJson = await readVersionJson(gameDir, versionId);
        if (!versionJson) {
            throw new Error(`NeoForge installer finished but did not create ${versionId}.json`);
        }

        logger.info(`[NeoForge] Installed ${versionId}`);
        onProgress?.(100);
        return { versionId, versionJson };
    }
}
