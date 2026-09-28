/**
 * Fabric loader installer: downloads and registers a Fabric profile for a Minecraft version.
 */
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { logger } from '../../../utils/logger';
// import { fetch } from 'undici'; // Use global fetch
import type { ModLoaderInstaller, InstallOptions, InstallResult, FabricLoaderVersion } from './types.js';
import type { VersionJson } from '../../types/version-json.js';

export class FabricInstaller implements ModLoaderInstaller {
    async fetchVersions(mcVersion: string): Promise<string[]> {
        const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch Fabric loader versions: ${response.status}`);
        }

        const versions = await response.json() as FabricLoaderVersion[];
        // Return only loader versions
        return versions.map(v => v.loader.version);
    }

    async install(options: InstallOptions): Promise<InstallResult> {
        const { mcVersion, gameDir } = options;
        let { loaderVersion } = options;

        if (!loaderVersion) {
            const versions = await this.fetchVersions(mcVersion);
            if (versions.length === 0) {
                throw new Error(`No Fabric loader versions found for MC ${mcVersion}`);
            }
            loaderVersion = versions[0]!;
        }

        const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
        logger.info(`Downloading Fabric profile: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Fabric profile: ${response.status}`);
        }

        const versionJson = await response.json() as VersionJson;
        const versionId = versionJson.id;

        // Save to versions directory
        const versionsDir = path.join(gameDir, 'versions', versionId);
        await mkdir(versionsDir, { recursive: true });

        const versionJsonPath = path.join(versionsDir, `${versionId}.json`);
        await writeFile(versionJsonPath, JSON.stringify(versionJson, null, 2));

        return {
            versionId,
            versionJson,
        };
    }
}
