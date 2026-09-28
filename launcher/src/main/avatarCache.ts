/**
 * Signed-in player's head, cached on disk under {base}/avatars/.
 *
 * Avatar services take about a second per request, so screens used to show a
 * default head first. Now a cached head is returned immediately and refreshed
 * in the background once per session; if the skin changed, the renderer gets
 * 'avatar-updated'. Only the very first sign-in waits for a download.
 */
import fs from 'fs/promises';
import path from 'path';

import { getAvatarCacheDir } from '../core/launch/pathManager';
import { logger } from '../core/utils/logger';
import { AuthConfig } from '../types/config/LauncherConfig';

import { getConfig } from './settings';
import { getMainWindow } from './window';

/** Shown at up to 56 device pixels; one size serves every screen. */
const AVATAR_SIZE = 128;
const FETCH_TIMEOUT_MS = 10_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type AvatarSource = { key: string; url: string };

const sourceFor = (auth: AuthConfig | undefined): AvatarSource | null => {
  const username = auth?.username?.trim();
  const uuid = auth?.uuid?.replace(/-/g, '').trim().toLowerCase();

  if (auth?.loginType !== 'offline' && uuid && /^[0-9a-f]{32}$/.test(uuid)) {
    return {
      key: `uuid-${uuid}`,
      url: `https://mcavatars.voxelith.dev/avatars/${uuid}?size=${AVATAR_SIZE}&overlay`,
    };
  }
  if (username) {
    return {
      key: `name-${username.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
      url: `https://mc-heads.net/avatar/${encodeURIComponent(username)}/${AVATAR_SIZE}`,
    };
  }
  return null;
};

const toDataUrl = (png: Buffer): string => `data:image/png;base64,${png.toString('base64')}`;

const refreshedThisSession = new Set<string>();
const inFlight = new Map<string, Promise<Buffer | null>>();

/** Downloads the head and replaces the cached file. Resolves null on any failure. */
const downloadAndStore = (source: AvatarSource, file: string): Promise<Buffer | null> => {
  const pending = inFlight.get(source.key);
  if (pending) return pending;

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(source.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const png = Buffer.from(await response.arrayBuffer());
      if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error('response is not a PNG');

      await fs.mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      await fs.writeFile(temp, png);
      await fs.rename(temp, file);
      return png;
    } catch (error) {
      logger.warn(`[avatar] Could not download ${source.key}: ${(error as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
      inFlight.delete(source.key);
    }
  })();

  inFlight.set(source.key, request);
  return request;
};

/** The current account's head as a data URL, or null when there is no account or no head yet. */
export const getAvatar = async (): Promise<string | null> => {
  const source = sourceFor(getConfig('auth'));
  if (!source) return null;

  const file = path.join(getAvatarCacheDir(), `${source.key}.png`);
  const cached = await fs.readFile(file).catch((): null => null);
  if (!cached) {
    const png = await downloadAndStore(source, file);
    return png ? toDataUrl(png) : null;
  }

  if (!refreshedThisSession.has(source.key)) {
    refreshedThisSession.add(source.key);
    void downloadAndStore(source, file).then((png) => {
      const stillSignedIn = sourceFor(getConfig('auth'))?.key === source.key;
      if (png && stillSignedIn && !png.equals(cached)) {
        getMainWindow()?.webContents.send('avatar-updated', toDataUrl(png));
      }
    });
  }
  return toDataUrl(cached);
};

/** Tells the renderer to drop the head it has in memory (after logout). */
export const clearRendererAvatar = (): void => {
  getMainWindow()?.webContents.send('avatar-updated', null);
};
