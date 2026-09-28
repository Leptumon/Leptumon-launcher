/** Small yauzl helpers for reading CurseForge modpack archives. */
import fs from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import yauzl from 'yauzl';

const openZip = (file: string): Promise<yauzl.ZipFile> =>
    new Promise((resolve, reject) => {
        yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) => {
            if (error || !zip) reject(error ?? new Error(`Failed to open ${file}`));
            else resolve(zip);
        });
    });

const openEntryStream = (zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> =>
    new Promise((resolve, reject) => {
        zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) reject(error ?? new Error(`Failed to read ${entry.fileName}`));
            else resolve(stream);
        });
    });

/**
 * Visits entries one at a time; the next entry is read only after `visit`
 * resolves. Returning true from `visit` stops early.
 */
const forEachEntry = async (
    file: string,
    visit: (entry: yauzl.Entry, zip: yauzl.ZipFile) => Promise<boolean>
): Promise<void> => {
    const zip = await openZip(file);

    await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = (error?: Error) => {
            if (finished) return;
            finished = true;
            if (error) reject(error);
            else resolve();
        };

        zip.on('entry', (entry: yauzl.Entry) => {
            visit(entry, zip).then((stop) => {
                if (stop) {
                    zip.close();
                    finish();
                } else {
                    zip.readEntry();
                }
            }, (error: Error) => {
                zip.close();
                finish(error);
            });
        });
        zip.on('end', () => finish());
        zip.on('error', (error: Error) => finish(error));
        zip.readEntry();
    });
};

const normalizeEntryName = (name: string): string => name.replace(/\\/g, '/');

/** Reads a single file from the archive, or null if it is not present. */
export const readZipEntry = async (file: string, name: string): Promise<Buffer | null> => {
    let result: Buffer | null = null;

    await forEachEntry(file, async (entry, zip) => {
        if (normalizeEntryName(entry.fileName) !== name) return false;

        const chunks: Buffer[] = [];
        for await (const part of await openEntryStream(zip, entry)) {
            chunks.push(part as Buffer);
        }
        result = Buffer.concat(chunks);
        return true;
    });

    return result;
};

/**
 * Extracts every file under `prefix/` into `destDir` (prefix stripped),
 * overwriting existing files. Returns the written paths relative to destDir,
 * with forward slashes.
 */
export const extractZipDirectory = async (file: string, prefix: string, destDir: string): Promise<string[]> => {
    const root = path.resolve(destDir);
    const folder = `${normalizeEntryName(prefix).replace(/\/+$/, '')}/`;
    const written: string[] = [];

    await forEachEntry(file, async (entry, zip) => {
        const name = normalizeEntryName(entry.fileName);
        if (!name.startsWith(folder) || name.endsWith('/')) return false;

        const relative = name.slice(folder.length);
        const target = path.resolve(root, relative);
        if (!target.startsWith(root + path.sep)) {
            throw new Error(`Archive entry escapes destination: ${name}`);
        }

        await mkdir(path.dirname(target), { recursive: true });
        await pipeline(await openEntryStream(zip, entry), fs.createWriteStream(target));
        written.push(relative);
        return false;
    });

    return written;
};
