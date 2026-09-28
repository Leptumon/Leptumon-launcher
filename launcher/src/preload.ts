/**
 * Preload script: the only bridge between the React renderer and the main process.
 *
 * Exposes window.electron (actions + events) and window.config (allowlisted settings).
 * Register matching handlers in main/registerIpc.ts.
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import type { NewsFeed } from './types/api/news';
import type { UpdateState } from './types/api/updater';
import { LauncherConfig } from './types/config/LauncherConfig';

// ---------------------------------------------------------------------------
// Window chrome (frameless custom titlebar)
// ---------------------------------------------------------------------------
const windowApi = {
  platform: process.platform,
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),
  onGlobalPointer: (callback: (coords: { x: number; y: number; clientX?: number; clientY?: number }) => void) => {
    const handler = (_event: IpcRendererEvent, coords: { x: number; y: number; clientX?: number; clientY?: number }) => callback(coords);
    ipcRenderer.on('global-pointer', handler);
    return () => ipcRenderer.removeListener('global-pointer', handler);
  },
  onWindowDragging: (callback: (dragging: boolean) => void) => {
    const handler = (_event: IpcRendererEvent, dragging: boolean) => callback(dragging);
    ipcRenderer.on('window-dragging', handler);
    return () => ipcRenderer.removeListener('window-dragging', handler);
  },
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  onWindowState: (callback: (state: { filled: boolean }) => void) => {
    const handler = (_event: IpcRendererEvent, state: { filled: boolean }) => callback(state);
    ipcRenderer.on('window-state', handler);
    return () => ipcRenderer.removeListener('window-state', handler);
  },
};

// ---------------------------------------------------------------------------
// Microsoft authentication
// ---------------------------------------------------------------------------
const authApi = {
  authenticateMS: () => ipcRenderer.send('authenticate-ms'),
  onAuthSuccess: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('auth-success', handler);
    return () => ipcRenderer.removeListener('auth-success', handler);
  },
  logOut: () => ipcRenderer.invoke('logout'),
  getAvatar: () => ipcRenderer.invoke('get-avatar'),
  onAvatarUpdated: (callback: (dataUrl: string | null) => void) => {
    const handler = (_event: IpcRendererEvent, dataUrl: string | null) => callback(dataUrl);
    ipcRenderer.on('avatar-updated', handler);
    return () => ipcRenderer.removeListener('avatar-updated', handler);
  },
};

// ---------------------------------------------------------------------------
// Launch pipeline + game lifecycle
// ---------------------------------------------------------------------------
const launchApi = {
  installAndLaunchMC: () => ipcRenderer.send('install-and-launch-mc'),
  cancelLaunch: () => ipcRenderer.send('cancel-launch'),
  onProgress: (callback: (data: { percent: number; status: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { percent: number; status: string }) => callback(data);
    ipcRenderer.on('launch-progress', handler);
    return () => ipcRenderer.removeListener('launch-progress', handler);
  },
  getGameState: () => ipcRenderer.invoke('get-game-state'),
  stopGame: () => ipcRenderer.invoke('stop-game'),
};

// ---------------------------------------------------------------------------
// Server info, community links, news
// ---------------------------------------------------------------------------
const launcherApi = {
  getLauncherInfo: () => ipcRenderer.invoke('get-launcher-info'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  openLink: (key: 'discord' | 'store') => ipcRenderer.invoke('open-link', key),
  copyServerAddress: () => ipcRenderer.invoke('copy-server-address'),
  getNews: () => ipcRenderer.invoke('get-news'),
  onNewsUpdated: (callback: (feed: NewsFeed) => void) => {
    const handler = (_event: IpcRendererEvent, feed: NewsFeed) => callback(feed);
    ipcRenderer.on('news-updated', handler);
    return () => ipcRenderer.removeListener('news-updated', handler);
  },
  openNewsLink: (id: string) => ipcRenderer.invoke('open-news-link', id),
};

// ---------------------------------------------------------------------------
// Launcher self-update
// ---------------------------------------------------------------------------
const updaterApi = {
  getUpdateState: () => ipcRenderer.invoke('updater:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const handler = (_event: IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on('updater:state', handler);
    return () => ipcRenderer.removeListener('updater:state', handler);
  },
};

// ---------------------------------------------------------------------------
// Settings, folders, logging
// ---------------------------------------------------------------------------
const utilityApi = {
  getRamInfo: () => ipcRenderer.invoke('get-ram-info'),
  openGameFolder: () => ipcRenderer.invoke('open-game-folder'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => ipcRenderer.send('log', level, message),
};

contextBridge.exposeInMainWorld('electron', {
  ...windowApi,
  ...authApi,
  ...launchApi,
  ...launcherApi,
  ...updaterApi,
  ...utilityApi,
});

/** User-editable settings the renderer may read/write (allowlisted in main/rendererConfig.ts). */
contextBridge.exposeInMainWorld('config', {
  get: (key: keyof LauncherConfig) => ipcRenderer.invoke('get-config', key),
  set: (key: keyof LauncherConfig, value: unknown) => ipcRenderer.send('set-config', key, value),
});
