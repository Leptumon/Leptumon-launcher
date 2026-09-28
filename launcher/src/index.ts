/**
 * Electron main process bootstrap.
 *
 * Startup order:
 *   1. Single-instance lock + crash guards
 *   2. IPC handlers (auth, launcher info, launch, settings, updater, window)
 *   3. Main BrowserWindow
 *   4. Background self-update check
 *
 * Implementation lives under ./main/ (see launcher/ARCHITECTURE.md).
 */
import { app, BrowserWindow } from 'electron';

import { logger } from './core/utils/logger';
import { isLocale, matchSystemLocale, setLocale } from './i18n';
import { registerCrashGuards } from './main/crashGuards';
import { LAUNCHER_DISPLAY_NAME } from './constants/launcher';
import { registerIpcHandlers } from './main/registerIpc';
import { getConfig, setConfig } from './main/settings';
import { initUpdater } from './main/updater';
import { createMainWindow, getMainWindow } from './main/window';

if (require('electron-squirrel-startup')) {
  app.quit();
}

// A second copy would fight over the OAuth callback port and the game folder.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

registerCrashGuards();
app.setName(LAUNCHER_DISPLAY_NAME);

app.on('second-instance', () => {
  const window = getMainWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.on('ready', async () => {
  try {
    await logger.init('info');
  } catch {
    // Logging to disk is best-effort.
  }

  logger.info(`${LAUNCHER_DISPLAY_NAME} ${app.getVersion()} starting (${process.platform}/${process.arch})`);
  // First run: follow the system language when the launcher has it, otherwise French.
  if (!isLocale(getConfig('language'))) {
    const preferred = [...app.getPreferredSystemLanguages(), app.getSystemLocale(), app.getLocale()];
    const detected = matchSystemLocale(preferred);
    setConfig('language', detected);
    logger.info(`First run: system languages [${preferred.join(', ')}] -> ${detected}`);
  }
  // Before any window, dialog, or menu so main-process strings use the player's language.
  setLocale(getConfig('language'));
  await registerIpcHandlers();
  await createMainWindow();
  initUpdater(getMainWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});
