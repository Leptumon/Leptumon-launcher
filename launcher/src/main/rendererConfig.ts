/**
 * Allowlisted settings the React renderer may read/write over IPC.
 *
 * Auth tokens are never sent to the renderer; reads return an empty refreshToken.
 */
import { logger } from '../core/utils/logger';
import { isLocale, setLocale } from '../i18n';
import { AuthConfig } from '../types/config/LauncherConfig';

import { getConfig, normalizeRamMb, setConfig } from './settings';
import { refreshApplicationMenu } from './window';

type RendererConfigKey = 'ram' | 'minimizeOnLaunch' | 'autoJoinServer' | 'jvmArgs' | 'language' | 'auth';

const RENDERER_READABLE_KEYS = new Set<RendererConfigKey>([
  'ram',
  'minimizeOnLaunch',
  'autoJoinServer',
  'jvmArgs',
  'language',
  'auth',
]);

export const getRendererConfig = (key: unknown): unknown => {
  if (typeof key !== 'string' || !RENDERER_READABLE_KEYS.has(key as RendererConfigKey)) {
    logger.warn(`[ipc] Rejected config read for invalid key: ${String(key)}`);
    return undefined;
  }

  const value = getConfig(key as RendererConfigKey);
  if (key === 'auth' && value && typeof value === 'object') {
    const auth = value as AuthConfig;
    return {
      loginType: auth.loginType,
      username: auth.username,
      uuid: auth.uuid,
      refreshToken: '',
    };
  }

  return value;
};

export const setRendererConfig = (key: unknown, value: unknown): void => {
  switch (key) {
    case 'ram':
      setConfig('ram', normalizeRamMb(value));
      return;
    case 'minimizeOnLaunch':
    case 'autoJoinServer':
      if (typeof value !== 'boolean') {
        throw new Error(`${key} must be a boolean`);
      }
      setConfig(key, value);
      return;
    case 'jvmArgs':
      if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
        throw new Error('JVM args must be a short string without control characters');
      }
      setConfig('jvmArgs', value);
      return;
    case 'language':
      if (!isLocale(value)) {
        throw new Error(`Unsupported language: ${String(value)}`);
      }
      setConfig('language', value);
      // Main-process strings (launch errors, dialogs, menu) follow the new language too.
      setLocale(value);
      refreshApplicationMenu();
      return;
    default:
      throw new Error(`Invalid renderer config key: ${String(key)}`);
  }
};

export const redactConfigForLog = (key: string, value: unknown): string => {
  if (key === 'auth') return '[redacted]';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};
