/**
 * TypeScript types for window.electron and window.config (must match preload.ts).
 */
import { LauncherInfo } from "./api/launcherInfo";
import { NewsFeed } from "./api/news";
import { RamInfo } from "./api/ramInfo";
import { ServerStatus } from "./api/serverStatus";
import { UpdateState } from "./api/updater";
import { LauncherConfig } from "./config/LauncherConfig";

type LaunchStatusValue = string | { key: string; params?: Record<string, string> };

declare global {
  interface Window {
    electron: {
      platform: NodeJS.Platform;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      onGlobalPointer: (callback: (coords: { x: number; y: number; clientX?: number; clientY?: number }) => void) => () => void;
      onWindowDragging: (callback: (dragging: boolean) => void) => () => void;
      /** `filled` while maximized or fullscreen (square corners). */
      getWindowState: () => Promise<{ filled: boolean }>;
      onWindowState: (callback: (state: { filled: boolean }) => void) => () => void;

      authenticateMS: () => void;
      onAuthSuccess: (callback: () => void) => () => void;
      logOut: () => Promise<void>;
      /** Signed-in player's head as a data URL (cached on disk), or null if unavailable. */
      getAvatar: () => Promise<string | null>;
      onAvatarUpdated: (callback: (dataUrl: string | null) => void) => () => void;

      installAndLaunchMC: () => void;
      cancelLaunch: () => void;
      onProgress: (callback: (data: { percent: number; status: LaunchStatusValue }) => void) => () => void;
      getGameState: () => Promise<{
        isRunning: boolean;
        isLaunching?: boolean;
        progress?: number;
        status?: LaunchStatusValue;
      }>;
      stopGame: () => Promise<void>;

      getLauncherInfo: () => Promise<LauncherInfo>;
      getServerStatus: () => Promise<ServerStatus>;
      openLink: (key: 'discord' | 'store') => Promise<void>;
      copyServerAddress: () => Promise<string>;
      /** Cached feed right away; rejects only when there is no cache and the feed can't be reached. */
      getNews: () => Promise<NewsFeed>;
      /** A background refresh found different articles. */
      onNewsUpdated: (callback: (feed: NewsFeed) => void) => () => void;
      openNewsLink: (id: string) => Promise<void>;

      getUpdateState: () => Promise<UpdateState>;
      checkForUpdates: () => Promise<void>;
      /** Resolves false when refused because a launch or game is running. */
      installUpdate: () => Promise<boolean>;
      onUpdateState: (callback: (state: UpdateState) => void) => () => void;

      getRamInfo: () => Promise<RamInfo>;
      openGameFolder: () => Promise<string>;
      openLogsFolder: () => Promise<string>;
      resetSettings: () => Promise<{ ram: number; minimizeOnLaunch: boolean; autoJoinServer: boolean; jvmArgs: string }>;
      log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
    };
    config: {
      get: <K extends keyof LauncherConfig>(key: K) => Promise<LauncherConfig[K]>;
      set: <K extends keyof LauncherConfig>(key: K, value: LauncherConfig[K]) => void;
    }
  }
}

export { };
