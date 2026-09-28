/**
 * Extracts native libraries from downloaded JARs into the instance natives folder.
 */
import { mkdir, rm, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';

import { logger } from '../../utils/logger';

import type { ResolvedLibrary } from '../types/version-json';

export interface ExtractNativesOptions {
    libraries: ResolvedLibrary[];
    nativesDir: string;
    clean?: boolean;
}

export async function extractNatives(options: ExtractNativesOptions): Promise<string[]> {
    const { libraries, nativesDir, clean = true } = options;

    if (clean) {
        try {
            await rm(nativesDir, { recursive: true, force: true });
        } catch { }
    }

    await mkdir(nativesDir, { recursive: true });
    const extracted: string[] = [];
    const nativeLibs = libraries.filter((lib) => lib.isNative);

    for (const lib of nativeLibs) {
        try {
            await access(lib.path);
            await extractJar(lib.path, nativesDir, ['META-INF/', 'META-INF/**']);
            extracted.push(lib.path);
        } catch (error) {
            logger.warn(`Failed to extract native library ${lib.name}: ${(error as Error).message}`);
        }
    }

    return extracted;
}

async function extractJar(jarPath: string, destDir: string, excludes: string[]): Promise<void> {
    const yauzl = await import('yauzl');
    return new Promise((resolve, reject) => {
        yauzl.open(jarPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            if (!zipfile) return reject(new Error('Failed to open zip'));

            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                const fileName = entry.fileName;
                if (shouldExclude(fileName, excludes) || fileName.endsWith('/')) {
                    zipfile.readEntry();
                    return;
                }

                const destPath = path.join(destDir, path.basename(fileName));

                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err) return reject(err);
                    const writeStream = createWriteStream(destPath);
                    readStream?.pipe(writeStream);
                    writeStream.on('close', () => zipfile.readEntry());
                    writeStream.on('error', reject);
                });
            });
            zipfile.on('end', () => resolve());
            zipfile.on('error', reject);
        });
    });
}

function shouldExclude(filePath: string, excludes: string[]): boolean {
    for (const pattern of excludes) {
        if (filePath.startsWith(pattern.replace('**', ''))) return true;
    }
    return false;
}