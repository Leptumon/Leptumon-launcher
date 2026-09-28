/**
 * Managed Java runtimes for Minecraft and the NeoForge installer.
 *
 * Downloads Eclipse Temurin (Azul Zulu where Temurin has no build) into the
 * launcher data folder. System Java installs are never used, so players do
 * not need Java installed.
 */
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { access } from 'fs/promises';

import { downloadJavaRuntime, type JavaRuntimeInfo } from './downloader';
import { getPlatformInfo } from '../types/platform';
import type { VersionJson } from '../types/version-json';
import { isVersionAtLeast } from '../utils/version';

export interface JavaRequirement {
    minVersion: number;
    recommendedVersion: number;
}

/** Finds the Minecraft release inside ids like "1.21.1" or "1.21.1-forge-…". */
const MINECRAFT_VERSION_IN_ID = /(?:^|[^0-9])(1\.\d+(?:\.\d+)?)(?:[^0-9]|$)/;

const execFileAsync = promisify(execFile);

export class JavaManager {
    constructor(private readonly dataDir: string) {}

    /** Java major version Mojang requires for a Minecraft release. */
    getRequirement(mcVersion: string): JavaRequirement {
        const version = mcVersion.match(MINECRAFT_VERSION_IN_ID)?.[1];
        if (!version || isVersionAtLeast(version, '1.20.5')) return { minVersion: 21, recommendedVersion: 21 };
        if (isVersionAtLeast(version, '1.18')) return { minVersion: 17, recommendedVersion: 17 };
        if (isVersionAtLeast(version, '1.17')) return { minVersion: 16, recommendedVersion: 17 };
        return { minVersion: 8, recommendedVersion: 8 };
    }

    async ensureVersion(majorVersion: number, onProgress?: (percent: number) => void): Promise<JavaRuntimeInfo> {
        return this.ensureVersionWithRetry(majorVersion, onProgress);
    }

    /** Uses the profile's declared Java version, raised to the Minecraft minimum if needed. */
    async ensureForMinecraft(versionJson: VersionJson, onProgress?: (percent: number) => void): Promise<JavaRuntimeInfo> {
        const requirement = this.getRequirement(versionJson.inheritsFrom ?? versionJson.id);
        let majorVersion = versionJson.javaVersion?.majorVersion ?? requirement.recommendedVersion;

        if (majorVersion < requirement.minVersion) {
            majorVersion = requirement.recommendedVersion;
        }

        return this.ensureVersionWithRetry(majorVersion, onProgress);
    }

    private async ensureVersionWithRetry(
        majorVersion: number,
        onProgress?: (percent: number) => void
    ): Promise<JavaRuntimeInfo> {
        const platform = getPlatformInfo();
        const download = (force: boolean) => downloadJavaRuntime({
            majorVersion,
            arch: platform.arch,
            os: platform.osName,
            destination: path.join(this.dataDir, 'jdk'),
            force,
            onProgress,
        });

        let result = await download(false);
        if (await this.validateJava(result.executablePath)) {
            return result;
        }

        // A half-extracted or corrupted runtime: wipe and download once more.
        result = await download(true);
        if (await this.validateJava(result.executablePath)) {
            return result;
        }

        throw new Error(`Failed to download and validate Java ${majorVersion} after retries.`);
    }

    private async validateJava(javaPath: string): Promise<boolean> {
        try {
            await access(javaPath);
            const { stderr } = await execFileAsync(javaPath, ['-version']);
            return stderr.includes('version') || stderr.includes('Runtime Environment');
        } catch {
            return false;
        }
    }
}
