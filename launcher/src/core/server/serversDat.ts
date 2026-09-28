/**
 * Keeps the Leptumon server in the instance's multiplayer list (servers.dat).
 * Servers the player added themselves are kept; ours is moved to the top.
 */
import fs from 'fs/promises';
import path from 'path';

import * as nbt from 'prismarine-nbt';

import { logger } from '../utils/logger';

/** A servers.dat entry: NBT tags keyed by name (name, ip, icon, acceptTextures, …). */
type ServerEntry = Record<string, { type: string; value: unknown }>;

const readEntries = async (file: string): Promise<ServerEntry[]> => {
  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return [];
  }

  try {
    const { parsed } = await nbt.parse(data);
    const root = parsed.value as Record<string, { value?: { value?: unknown } } | undefined>;
    const list = root.servers?.value?.value;
    return Array.isArray(list) ? (list as ServerEntry[]) : [];
  } catch (error) {
    logger.warn(`[servers.dat] Unreadable, backing it up and starting fresh: ${(error as Error).message}`);
    await fs.rename(file, `${file}.bak`).catch(() => undefined);
    return [];
  }
};

const entryAddress = (entry: ServerEntry): string =>
  typeof entry.ip?.value === 'string' ? entry.ip.value.trim().toLowerCase() : '';

export const ensureServerListed = async (gameDir: string, name: string, address: string): Promise<void> => {
  const file = path.join(gameDir, 'servers.dat');
  const target = address.trim().toLowerCase();
  const entries = await readEntries(file);

  const first = entries[0];
  if (first && entryAddress(first) === target && first.name?.value === name) {
    return;
  }

  // Keep the player's icon/resource-pack choice if they already had this server saved.
  const existing = entries.find((entry) => entryAddress(entry) === target);
  const ours: ServerEntry = {
    ...(existing ?? {}),
    name: { type: 'string', value: name },
    ip: { type: 'string', value: address.trim() },
  };
  const servers = [ours, ...entries.filter((entry) => entryAddress(entry) !== target)];

  const root = {
    type: 'compound',
    name: '',
    value: {
      servers: { type: 'list', value: { type: 'compound', value: servers } },
    },
  };

  await fs.mkdir(gameDir, { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, nbt.writeUncompressed(root as unknown as nbt.NBT));
  await fs.rename(tmp, file);
  logger.info(`[servers.dat] Pinned "${name}" (${address}) at the top of the server list`);
};
