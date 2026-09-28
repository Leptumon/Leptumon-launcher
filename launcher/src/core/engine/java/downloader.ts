/** Downloads and extracts a JDK archive from Adoptium or Zulu. */
import path from 'path';
import { chmod, mkdir, rm, unlink } from 'fs/promises';
import { resolveAdoptiumUrl } from './adoptium';
import { fetchZuluDownloadUrl, shouldPreferZulu } from './zulu';
import { extractArchive } from './extract';
import { defaultJavaExecutablePath, resolveJavaExecutable } from './resolve';
import type { JavaDownloadOptions, JavaRuntimeInfo } from './types';
import { downloadLargeFile } from '../downloader/queue';
import { getPlatformInfo } from '../types/platform';
import { logger } from '../../utils/logger';

export * from './types';
export * from './adoptium';
export * from './zulu';

/**
 * Downloads and extracts a Java Runtime Environment.
 * 
 * Uses Azul Zulu for ARM64 Java 8 on macOS (since Adoptium doesn't provide it),
 * and Eclipse Adoptium (Temurin) for other configurations.
 * 
 * @param options - Download options.
 * @returns Information about the installed Java runtime.
 */
export async function downloadJavaRuntime(
    options: JavaDownloadOptions
): Promise<JavaRuntimeInfo> {
    const platform = getPlatformInfo();
    const os = options.os ?? platform.osName;
    const arch = options.arch ?? platform.arch;

    // Construct install path: {dest}/jdk/{major}-{arch}
    const baseDir = options.destination ?? path.join(process.cwd(), 'jdk');
    const installDir = path.join(baseDir, `${options.majorVersion}-${arch}`);

    // Determine expected executable path
    let execPath = defaultJavaExecutablePath(installDir, os);

    // Check if already installed
    if (!options.force) {
        const existingExec = await resolveJavaExecutable(installDir, os);
        if (existingExec) {
            return {
                majorVersion: options.majorVersion,
                os,
                arch,
                executablePath: existingExec,
                installPath: installDir
            };
        }
    }

    // Determine which provider to use
    let url: string;
    let providerName: string;

    if (shouldPreferZulu(options.majorVersion, os, arch)) {
        logger.info(`Downloading Java ${options.majorVersion} (${arch}) from Azul Zulu...`);
        providerName = 'Azul Zulu';
        url = await fetchZuluDownloadUrl(options.majorVersion, os, arch);
    } else {
        logger.info(`Downloading Java ${options.majorVersion} (${arch}) from Adoptium...`);
        providerName = 'Adoptium';
        url = resolveAdoptiumUrl(options.majorVersion, os, arch);
    }

    const archiveName = `jdk-${options.majorVersion}-${arch}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
    const archivePath = path.join(baseDir, archiveName);

    await mkdir(baseDir, { recursive: true });

    // Goes to the launcher log file so Java download issues are debuggable in the field.
    logger.info(`Downloading Java ${options.majorVersion} (${arch}) from ${providerName}: ${url}`);

    try {
        await downloadLargeFile(url, archivePath, (progress) => {
            const speedMb = (progress.speed / 1024 / 1024).toFixed(2);
            const downloadedMb = (progress.current / 1024 / 1024).toFixed(1);
            const totalMb = progress.total > 0 ? (progress.total / 1024 / 1024).toFixed(1) : '?';
            // Live single-line progress for the dev terminal (not written to the log file).
            process.stdout.write(`\r   Downloading: ${downloadedMb}/${totalMb} MB (${speedMb} MB/s) ${progress.percentage.toFixed(1)}%   `);
            options.onProgress?.(progress.percentage);
        });
    } catch (error) {
        throw new Error(`Failed to download Java ${options.majorVersion} from ${providerName}: ${error}`);
    }

    // Extract
    logger.info(`📦 Extracting to ${installDir}...`);

    try {
        await rm(installDir, { recursive: true, force: true });
    } catch { /* ignore */ }

    await extractArchive(archivePath, installDir);
    await unlink(archivePath);

    // Resolve final executable path after extraction
    const resolvedExecPath = await resolveJavaExecutable(installDir, os);
    if (resolvedExecPath) {
        execPath = resolvedExecPath;
    }

    // Set permissions
    if (os !== 'windows') {
        try {
            await chmod(execPath, 0o755);
        } catch (e) {
            logger.warn('⚠️  Failed to set executable permissions for java: ' + (e as Error).message);
        }
    }

    return {
        majorVersion: options.majorVersion,
        os,
        arch,
        executablePath: execPath,
        installPath: installDir
    };
}
