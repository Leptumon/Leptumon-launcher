/**
 * Article images uploaded from the admin panel, stored as DATA_DIR/uploads/<hash>.<ext>.
 *
 * Files are named after their content, so uploading the same picture twice
 * reuses one file. Only PNG, JPEG, WebP and GIF are accepted, checked from the
 * file's first bytes rather than the name or the declared type. SVG is refused
 * because it can carry scripts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Stored `image` values that point at an upload look like this. */
export const UPLOAD_PREFIX = 'uploads/';
export const UPLOAD_NAME = /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/;

export const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const detectExtension = (bytes) => {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (/^GIF8[79]a$/.test(bytes.toString('latin1', 0, 6))) return 'gif';
  return null;
};

export class UploadStore {
  #dir;

  constructor(dataDir) {
    this.#dir = path.join(dataDir, 'uploads');
  }

  get dir() {
    return this.#dir;
  }

  async init() {
    await fs.mkdir(this.#dir, { recursive: true });
  }

  /** Saves the image and returns its stored path (`uploads/<name>`), or null if it is not a supported image. */
  async save(bytes) {
    const extension = detectExtension(bytes);
    if (!extension) return null;

    const name = `${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${extension}`;
    const file = path.join(this.#dir, name);
    try {
      await fs.writeFile(file, bytes, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    return UPLOAD_PREFIX + name;
  }

  /** Deletes an uploaded image. Values that are not uploads (external URLs) are ignored. */
  async remove(image) {
    if (typeof image !== 'string' || !image.startsWith(UPLOAD_PREFIX)) return;
    const name = image.slice(UPLOAD_PREFIX.length);
    if (!UPLOAD_NAME.test(name)) return;
    await fs.rm(path.join(this.#dir, name), { force: true });
  }
}
