/**
 * Build-time launcher configuration (bundled, not user-editable).
 *
 * Loaded once from launcher/src/assets/client-config.json. Edit that file and
 * rebuild to change the server, modpack version, links, news feed, or OAuth/API keys.
 */
import path from 'path';
import fsa from 'fs/promises';
import { app } from 'electron';

import { ClientConfig } from '../../types/config/ClientConfig';
import { logger } from './logger';

const DEFAULT_SERVER_NAME = 'Leptumon';

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const asId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

/** Coerces parsed JSON into a ClientConfig; missing or mistyped fields fall back to empty. */
const normalize = (raw: unknown): ClientConfig => {
  const root = asObject(raw);
  const modpack = asObject(root.modpack);
  const curseforge = asObject(root.curseforge);
  const server = asObject(root.server);
  const links = asObject(root.links);
  const news = asObject(root.news);
  const updates = asObject(root.updates);
  const telemetry = asObject(root.telemetry);

  return {
    microsoftClientId: asString(root.microsoftClientId),
    modpack: {
      manifestUrl: asString(modpack.manifestUrl),
    },
    curseforge: {
      apiKey: asString(curseforge.apiKey),
      projectId: asId(curseforge.projectId),
      fileId: asId(curseforge.fileId),
    },
    server: {
      name: asString(server.name) || DEFAULT_SERVER_NAME,
      address: asString(server.address),
    },
    links: {
      discord: asString(links.discord),
      store: asString(links.store),
    },
    news: {
      url: asString(news.url),
    },
    updates: {
      githubRepo: asString(updates.githubRepo),
    },
    telemetry: {
      trackingUrl: asString(telemetry.trackingUrl),
      trackingSecret: asString(telemetry.trackingSecret),
    },
  };
};

const readBundledConfig = async (): Promise<ClientConfig> => {
  try {
    const basePath = app.isPackaged
      ? path.join(app.getAppPath(), 'dist')
      : path.join(process.cwd(), 'src');
    const bundledPath = path.join(basePath, 'assets', 'client-config.json');
    return normalize(JSON.parse(await fsa.readFile(bundledPath, 'utf8')));
  } catch (e) {
    logger.error('Failed to load bundled client-config.json, using defaults: ' + (e as Error).message);
    return normalize({});
  }
};

let cachedConfig: Promise<ClientConfig> | null = null;

/** The bundled config never changes at runtime, so it is read once and shared. */
export function loadClientConfig(): Promise<ClientConfig> {
  cachedConfig ??= readBundledConfig();
  return cachedConfig;
}
