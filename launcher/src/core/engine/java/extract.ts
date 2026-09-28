/** Extracts JDK zip/tar.gz archives and locates the java binary inside. */
import { extract as tarExtract } from 'tar';
import yauzl from 'yauzl';
import fs from 'fs';
import path from 'path';
import { mkdir, readdir, rename, rm } from 'fs/promises';

export async function extractArchive(
    archivePath: string,
    destDir: string
): Promise<void> {
    await mkdir(destDir, { recursive: true });

    if (archivePath.endsWith('.zip')) {
        await extractZip(archivePath, destDir);
    } else {
        // Assume tar.gz for non-zip
        await tarExtract({
            file: archivePath,
            cwd: destDir,
            strip: 1, // Remove the root jdk directory
        });
    }

    await flattenSingleRootDirectory(destDir);
}

async function flattenSingleRootDirectory(destDir: string): Promise<void> {
    const entries = await readdir(destDir, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());
    const nonDirectories = entries.filter((entry) => !entry.isDirectory());

    if (directories.length !== 1 || nonDirectories.length > 0) return;

    const rootDir = path.join(destDir, directories[0]!.name);
    if (directories[0]!.name === 'Contents') return;

    const rootEntries = await readdir(rootDir);
    if (!rootEntries.includes('Contents') && !rootEntries.includes('bin')) return;

    for (const entry of rootEntries) {
        await rename(path.join(rootDir, entry), path.join(destDir, entry));
    }

    await rm(rootDir, { recursive: true, force: true });
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
    const resolveEntryPath = (relativePath: string): string => {
        const destRoot = path.resolve(destDir);
        const entryPath = path.resolve(destRoot, relativePath);
        if (entryPath !== destRoot && !entryPath.startsWith(destRoot + path.sep)) {
            throw new Error(`Archive entry escapes destination: ${relativePath}`);
        }
        return entryPath;
    };

    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            if (!zipfile) return reject(new Error('Failed to open zip'));

            zipfile.readEntry();

            zipfile.on('entry', (entry) => {
                // Strip first directory component
                const normalizedName = entry.fileName.replace(/\\/g, '/');
                const parts = normalizedName.split('/');
                if (parts.length <= 1) {
                    // Skip root files or empty paths
                    zipfile.readEntry();
                    return;
                }
                const relativePath = parts.slice(1).join('/');
                let entryPath: string;
                try {
                    entryPath = resolveEntryPath(relativePath);
                } catch (error) {
                    return reject(error);
                }

                if (/\/$/.test(normalizedName)) {
                    // Directory
                    fs.mkdir(entryPath, { recursive: true }, (err) => {
                        if (err) return reject(err);
                        zipfile.readEntry();
                    });
                } else {
                    // File
                    fs.mkdir(path.dirname(entryPath), { recursive: true }, (err) => {
                        if (err) return reject(err);

                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) return reject(err);
                            if (!readStream) return reject(new Error('Failed to create read stream'));

                            const writeStream = fs.createWriteStream(entryPath);
                            readStream.pipe(writeStream);

                            writeStream.on('close', () => {
                                zipfile.readEntry();
                            });

                            writeStream.on('error', (err) => reject(err));
                        });
                    });
                }
            });

            zipfile.on('end', () => resolve());
            zipfile.on('error', (err) => reject(err));
        });
    });
}
