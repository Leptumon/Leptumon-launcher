/**
 * Persistent user settings via electron-store.
 *
 * Main process code reads/writes settings here. The renderer may only touch
 * an allowlisted subset through IPC (see rendererConfig.ts).
 */
import os from 'os';

import Store from 'electron-store';

import type { RamInfo } from '../types/api/ramInfo';
import { LauncherConfig } from '../types/config/LauncherConfig';

import {
  DEFAULT_USER_SETTINGS,
  RAM_MAX_MB,
  RAM_MIN_MB,
  RAM_OS_HEADROOM_MB,
  RAM_STEP_MB,
} from '../constants/launcher';

const store = new Store<LauncherConfig>({
  defaults: {
    auth: undefined,
    ram: DEFAULT_USER_SETTINGS.ram,
    minimizeOnLaunch: DEFAULT_USER_SETTINGS.minimizeOnLaunch,
    autoJoinServer: DEFAULT_USER_SETTINGS.autoJoinServer,
  },
});

export const getConfig = <K extends keyof LauncherConfig>(key: K): LauncherConfig[K] => {
  return store.get(key);
};

export const setConfig = <K extends keyof LauncherConfig>(key: K, value: LauncherConfig[K]): void => {
  store.set(key, value);
};

export const deleteConfig = (key: keyof LauncherConfig): void => {
  store.delete(key);
};

/**
 * Clamps a requested RAM value (MB) to a safe, RAM_STEP_MB-aligned range.
 *
 * The preferred floor is RAM_MIN_MB (the modpack needs it), but we never ask the
 * JVM for more than the machine physically has: maxBySystem reflects installed
 * memory minus OS headroom, and it wins on low-RAM machines.
 */
const ramCeilingMb = (): number => {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const maxBySystem = Math.max(
    RAM_STEP_MB,
    Math.floor((totalMemoryMB - RAM_OS_HEADROOM_MB) / RAM_STEP_MB) * RAM_STEP_MB,
  );
  return Math.min(maxBySystem, RAM_MAX_MB);
};

export const normalizeRamMb = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error('RAM allocation must be a finite number');
  }

  const capped = Math.min(Math.max(numeric, RAM_MIN_MB), ramCeilingMb());
  return Math.round(capped / RAM_STEP_MB) * RAM_STEP_MB;
};

/** Suggests a RAM allocation for the current machine (used by Settings auto-detect). */
export const autoDetectRamMb = (): number => {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const alignDown = (mb: number) => Math.floor(mb / RAM_STEP_MB) * RAM_STEP_MB;

  if (totalMemoryMB < 512) return -1;
  if (totalMemoryMB < 1024) return 512;

  if (totalMemoryMB < 8192) {
    return alignDown(Math.min(totalMemoryMB / 2, totalMemoryMB - RAM_OS_HEADROOM_MB));
  }

  // Suggest a generous-but-safe heap that scales with installed memory.
  const maxAllocation =
    totalMemoryMB >= 32768 ? 12288 :
    totalMemoryMB >= 16384 ? 10240 :
    totalMemoryMB >= 12288 ? 9216 :
    8192;

  return alignDown(Math.min(maxAllocation, totalMemoryMB - RAM_OS_HEADROOM_MB));
};

/** Slider range and suggestion for Settings. The suggestion is aligned to the slider's 512 MB steps. */
export const getRamInfo = (): RamInfo => {
  const max = ramCeilingMb();
  const min = Math.min(RAM_MIN_MB, max);
  const suggested = Math.floor(autoDetectRamMb() / 512) * 512;
  return { min, max, recommended: Math.min(max, Math.max(min, suggested)) };
};

export const resetUserSettings = (): typeof DEFAULT_USER_SETTINGS => {
  setConfig('ram', DEFAULT_USER_SETTINGS.ram);
  setConfig('minimizeOnLaunch', DEFAULT_USER_SETTINGS.minimizeOnLaunch);
  setConfig('autoJoinServer', DEFAULT_USER_SETTINGS.autoJoinServer);
  setConfig('jvmArgs', DEFAULT_USER_SETTINGS.jvmArgs);
  return { ...DEFAULT_USER_SETTINGS };
};
