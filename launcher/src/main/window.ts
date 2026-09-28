/**
 * BrowserWindow creation, application menu, and frameless-window UX helpers.
 *
 * Pointer broadcast and drag detection support custom titlebar hover effects in
 * the renderer (see preload onGlobalPointer / onWindowDragging).
 */
import path from 'path';

import { app, BrowserWindow, Menu, screen } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

import { BRAND_NAME } from '../constants/launcher';
import { t } from '../i18n';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;

export const getMainWindow = (): BrowserWindow | null => mainWindow;

const buildMenuTemplate = (): MenuItemConstructorOptions[] => [
  {
    label: BRAND_NAME,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: t('menu.edit'),
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
  {
    label: t('menu.view'),
    submenu: [
      { role: 'reload' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
];

/** Rebuilds the application menu so its labels follow the current language. */
export const refreshApplicationMenu = (): void => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()));
};

export type WindowState = { filled: boolean };

/** Maximized or fullscreen: the window touches the screen edges, so its corners stay square. */
export const getWindowState = (): WindowState => ({
  filled: Boolean(mainWindow && (mainWindow.isMaximized() || mainWindow.isFullScreen())),
});

const attachWindowStateBroadcast = (window: BrowserWindow): void => {
  const send = () => {
    if (!window.isDestroyed()) window.webContents.send('window-state', getWindowState());
  };
  window.on('maximize', send);
  window.on('unmaximize', send);
  window.on('enter-full-screen', send);
  window.on('leave-full-screen', send);
  window.on('restore', send);
};

const attachPointerBroadcast = (window: BrowserWindow): void => {
  let pointerInterval: NodeJS.Timeout | undefined;

  const startPointerBroadcast = (): void => {
    if (pointerInterval) return;
    pointerInterval = setInterval(() => {
      try {
        if (!mainWindow) return;
        const point = screen.getCursorScreenPoint();
        const bounds = mainWindow.getBounds();
        mainWindow.webContents.send('global-pointer', {
          x: point.x,
          y: point.y,
          clientX: point.x - bounds.x,
          clientY: point.y - bounds.y,
        });
      } catch {
        // Window may be closing.
      }
    }, 16);
  };

  const stopPointerBroadcast = (): void => {
    if (!pointerInterval) return;
    clearInterval(pointerInterval);
    pointerInterval = undefined;
  };

  let dragging = false;
  let draggingDebounce: NodeJS.Timeout | undefined;

  const setDragging = (value: boolean): void => {
    if (dragging === value) return;
    dragging = value;
    mainWindow?.webContents.send('window-dragging', dragging);
  };

  window.on('focus', startPointerBroadcast);
  window.on('blur', stopPointerBroadcast);
  window.on('move', () => {
    setDragging(true);
    if (draggingDebounce) clearTimeout(draggingDebounce);
    draggingDebounce = setTimeout(() => setDragging(false), 120);
  });
  startPointerBroadcast();
};

/**
 * macOS keeps the native traffic lights (with their hover glyphs, fullscreen
 * menu and window shadow) over a hidden title bar; the renderer's 40px titlebar
 * stays as the drag region, and the system rounds the corners. Windows and
 * Linux are frameless and transparent with custom controls; the renderer rounds
 * the corners itself (styles/main.scss) except when the window fills the screen.
 */
const chromeOptions = (): Electron.BrowserWindowConstructorOptions =>
  process.platform === 'darwin'
    ? {
        titleBarStyle: 'hidden',
        // Vertically centred in the 40px titlebar, lined up with the sidebar's left inset.
        trafficLightPosition: { x: 16, y: 13 },
        backgroundColor: '#111111',
      }
    : { frame: false, transparent: true };

export const createMainWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    height: 720,
    width: 1280,
    minHeight: 600,
    minWidth: 1120,
    ...chromeOptions(),
    icon: path.join(process.cwd(), 'src/assets/logos/logo.png'),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      devTools: !app.isPackaged,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  refreshApplicationMenu();
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // External links go through the open-link IPC allowlist, never new windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  attachPointerBroadcast(mainWindow);
  attachWindowStateBroadcast(mainWindow);

  if (!app.isPackaged && process.env.LEPTUMON_NO_DEVTOOLS !== '1') {
    mainWindow.webContents.openDevTools();
  }
};
