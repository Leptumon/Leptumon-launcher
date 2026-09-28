/**
 * IPC channel registration: wires renderer requests (preload.ts) to main-process logic.
 *
 * Handlers are grouped by concern. To add a feature:
 *   1. Register a handler here
 *   2. Expose it in preload.ts and types/electron.d.ts
 *   3. Call it from React
 */
import fs from 'fs/promises';
import path from 'path';

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';

import { authenticate, logOut } from '../core/auth/microsoft/authenticate';
import { getInstanceMinecraftPath } from '../core/launch/pathManager';
import { queryServerStatus } from '../core/server/status';
import { loadClientConfig } from '../core/utils/clientConfig';
import { UserFacingError } from '../core/utils/errors';
import { t } from '../i18n';
import { logger } from '../core/utils/logger';
import type { LauncherInfo } from '../types/api/launcherInfo';
import type { ServerStatus } from '../types/api/serverStatus';

import { getMicrosoftClientId, loadMicrosoftClientId, redirectURI } from './authConfig';
import { clearRendererAvatar, getAvatar } from './avatarCache';
import {
  getGameLauncher,
  getJavaManager,
  initEngineServices,
  launchStatus,
  resetLaunchStatus,
} from './engineContext';
import { runLaunchPipeline } from './launchPipeline';
import { createLaunchProgressSession } from './launchProgress';
import { getNews, openNewsLink } from './news';
import { getRendererConfig, redactConfigForLog, setRendererConfig } from './rendererConfig';
import { getConfig, getRamInfo, resetUserSettings } from './settings';
import { checkForUpdates, getUpdateState, installUpdate } from './updater';
import { getMainWindow, getWindowState } from './window';

/** The home screen polls every 30s; a short cache absorbs duplicate callers. */
const SERVER_STATUS_TTL_MS = 10_000;

let isLaunchCancelled = false;
let launchAbortController: AbortController | null = null;

const registerConfigHandlers = (): void => {
  ipcMain.handle('get-config', (_event, key) => getRendererConfig(key));

  ipcMain.on('set-config', (_event, key, value) => {
    try {
      setRendererConfig(key, value);
      logger.info(`Config changed: ${String(key)} = ${redactConfigForLog(String(key), value)}`);
    } catch (error) {
      logger.warn(`[ipc] Rejected config write for ${String(key)}: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('get-ram-info', () => getRamInfo());
  ipcMain.handle('reset-settings', () => resetUserSettings());
};

const registerLauncherInfoHandlers = (): void => {
  ipcMain.handle('get-launcher-info', async (): Promise<LauncherInfo> => {
    const cfg = await loadClientConfig();
    return {
      version: app.getVersion(),
      serverName: cfg.server.name,
      serverAddress: cfg.server.address,
      links: { ...cfg.links },
      modpackConfigured: Boolean(cfg.modpack.manifestUrl || (cfg.curseforge.projectId && cfg.curseforge.fileId)),
    };
  });

  let cachedStatus: { at: number; value: ServerStatus } | null = null;
  let inFlightStatus: Promise<ServerStatus> | null = null;

  ipcMain.handle('get-server-status', async (): Promise<ServerStatus> => {
    const { server } = await loadClientConfig();
    if (!server.address) return { configured: false, online: false };
    if (cachedStatus && Date.now() - cachedStatus.at < SERVER_STATUS_TTL_MS) return cachedStatus.value;

    inFlightStatus ??= queryServerStatus(server.address)
      .then((value) => {
        cachedStatus = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inFlightStatus = null;
      });
    return inFlightStatus;
  });

  // Only the configured links can be opened; the renderer never passes URLs.
  ipcMain.handle('open-link', async (_event, key: unknown) => {
    if (key !== 'discord' && key !== 'store') return;
    const url = (await loadClientConfig()).links[key];
    if (/^https:\/\//i.test(url)) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('copy-server-address', async () => {
    const { server } = await loadClientConfig();
    if (server.address) clipboard.writeText(server.address);
    return server.address;
  });
};

const registerNewsHandlers = (): void => {
  ipcMain.handle('get-news', () => getNews());
  ipcMain.handle('open-news-link', (_event, id: unknown) => openNewsLink(id));
};

const registerFolderHandlers = (): void => {
  const openFolder = async (dir: string): Promise<string> => {
    await fs.mkdir(dir, { recursive: true });
    const result = await shell.openPath(dir);
    if (result) throw new Error(result);
    return dir;
  };

  ipcMain.handle('open-game-folder', () => openFolder(getInstanceMinecraftPath()));
  ipcMain.handle('open-logs-folder', () => openFolder(path.join(getInstanceMinecraftPath(), 'logs')));
};

const registerWindowHandlers = (): void => {
  ipcMain.on('minimize-window', () => getMainWindow()?.minimize());

  ipcMain.on('maximize-window', () => {
    const window = getMainWindow();
    if (!window) return;
    if (process.platform === 'darwin') {
      window.isFullScreen() ? window.setFullScreen(false) : window.setFullScreen(true);
    } else {
      window.isMaximized() ? window.unmaximize() : window.maximize();
    }
  });

  ipcMain.on('close-window', () => getMainWindow()?.close());

  ipcMain.handle('get-window-state', () => getWindowState());

  ipcMain.on('log', (_event, level: 'debug' | 'info' | 'warn' | 'error', message: string) => {
    const safeLevel = ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info';
    const safeMessage = typeof message === 'string' ? message.slice(0, 4000) : String(message);
    logger[safeLevel](`[Renderer] ${safeMessage}`);
  });
};

const registerAuthHandlers = (): void => {
  ipcMain.on('authenticate-ms', (event) => {
    logger.info('Microsoft authentication initiated.');
    void authenticate(getMicrosoftClientId(), redirectURI, event.sender).catch((error) => {
      const message = (error as Error).message;
      logger.error('[auth] Microsoft authentication could not start: ' + message);
      dialog.showMessageBox({
        type: 'error',
        title: t('errors.microsoft_unavailable_title'),
        message: t('errors.microsoft_unavailable_message'),
        detail: message,
      }).catch(() => {});
    });
  });

  ipcMain.handle('logout', async () => {
    await logOut();
    clearRendererAvatar();
  });

  ipcMain.handle('get-avatar', () => getAvatar());
};

const registerLaunchHandlers = (): void => {
  const gameLauncher = getGameLauncher();

  ipcMain.on('install-and-launch-mc', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      logger.warn('Ignoring launch request from an unknown webContents.');
      return;
    }

    if (launchStatus.isLaunching || gameLauncher.running) {
      logger.warn('Ignoring launch request because a launch/game is already active.');
      if (!window.isDestroyed()) {
        window.webContents.send('launch-progress', {
          percent: launchStatus.progress,
          status: launchStatus.status || {
            key: gameLauncher.running ? 'launch.running' : 'launch.initializing',
          },
        });
      }
      return;
    }

    isLaunchCancelled = false;
    launchAbortController = new AbortController();
    let launchSuccess = false;

    launchStatus.isLaunching = true;
    launchStatus.progress = 0;
    launchStatus.status = { key: 'launch.initializing' };

    logger.info('Launch requested.');

    const progress = createLaunchProgressSession(window, () => isLaunchCancelled);
    progress.attachDownloadProgressListener(gameLauncher);

    try {
      const result = await runLaunchPipeline({
        javaManager: getJavaManager(),
        gameLauncher,
        signal: launchAbortController.signal,
        isCancelled: () => isLaunchCancelled,
      });

      if (!result.success) {
        throw new Error(result.error ?? 'Launch failed');
      }

      launchSuccess = true;
      progress.forwardProgress({ key: 'launch.running' });
    } catch (error) {
      const err = error as Error;
      if (err?.name === 'AbortError' || err?.message === 'AbortError') {
        logger.info('Launch process was cancelled by user.');
        if (!isLaunchCancelled && !window.isDestroyed()) {
          window.webContents.send('launch-progress', { percent: 0, status: { key: 'launch.cancelled' } });
        }
        return;
      }

      const detail = err instanceof UserFacingError && err.detail ? ` (${err.detail})` : '';
      logger.error(`Failed to launch Minecraft: ${err?.message}${detail}`);
      if (err?.stack) logger.debug(err.stack);
      if (!isLaunchCancelled && !window.isDestroyed()) {
        window.webContents.send('launch-progress', {
          percent: 0,
          status: { key: 'launch.error', params: { message: err?.message ?? 'Unknown error' } },
        });
      }
    } finally {
      if (launchSuccess && !isLaunchCancelled && !window.isDestroyed()) {
        window.webContents.send('launch-progress', { percent: 100, status: '' });
      }

      progress.detach();
      resetLaunchStatus();
      launchAbortController = null;

      if (getConfig('minimizeOnLaunch') && launchSuccess && !isLaunchCancelled) {
        window.minimize();
      }
    }
  });

  ipcMain.on('cancel-launch', () => {
    logger.info('Launch cancellation requested via IPC.');
    isLaunchCancelled = true;
    if (launchAbortController) {
      try {
        launchAbortController.abort();
      } catch {
        // Already aborted.
      }
      launchAbortController = null;
    }
    gameLauncher.abortLaunch();
  });

  ipcMain.handle('get-game-state', () => ({
    isRunning: gameLauncher.running,
    isLaunching: launchStatus.isLaunching,
    progress: launchStatus.progress,
    status: launchStatus.status,
  }));

  ipcMain.handle('stop-game', async () => {
    logger.info('Stop game requested by user.');
    gameLauncher.kill();
    logger.info('Game stop sequence completed.');
  });
};

const registerUpdaterHandlers = (): void => {
  ipcMain.handle('updater:get-state', () => getUpdateState());
  ipcMain.handle('updater:check', () => checkForUpdates());
  ipcMain.handle('updater:install', async () => {
    // Quitting mid-install or mid-game would orphan the game process.
    if (launchStatus.isLaunching || getGameLauncher().running) return false;
    await installUpdate();
    return true;
  });
};

/** Registers every IPC channel used by the renderer. */
export const registerIpcHandlers = async (): Promise<void> => {
  await loadMicrosoftClientId();
  initEngineServices();

  registerConfigHandlers();
  registerLauncherInfoHandlers();
  registerNewsHandlers();
  registerFolderHandlers();
  registerWindowHandlers();
  registerAuthHandlers();
  registerLaunchHandlers();
  registerUpdaterHandlers();
};
