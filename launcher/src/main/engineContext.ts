/**
 * Shared game-engine instances and launch-session state for the main process.
 */
import { JavaManager } from '../core/engine/java/manager';
import { GameLauncher } from '../core/engine/launch/orchestrator';
import { getLauncherDataPath } from '../core/launch/pathManager';
import { logger } from '../core/utils/logger';

export type LaunchStatusSnapshot = {
  isLaunching: boolean;
  progress: number;
  status: string | { key: string; params?: Record<string, string> };
};

export const launchStatus: LaunchStatusSnapshot = {
  isLaunching: false,
  progress: 0,
  status: '',
};

let javaManager: JavaManager | null = null;
let gameLauncher: GameLauncher | null = null;

export const getJavaManager = (): JavaManager => {
  if (!javaManager) {
    throw new Error('JavaManager not initialized. Call initEngineServices() first.');
  }
  return javaManager;
};

export const getGameLauncher = (): GameLauncher => {
  if (!gameLauncher) {
    throw new Error('GameLauncher not initialized. Call initEngineServices() first.');
  }
  return gameLauncher;
};

export const initEngineServices = (): void => {
  const dataPath = getLauncherDataPath().base;
  javaManager = new JavaManager(dataPath);
  gameLauncher = new GameLauncher();

  gameLauncher.on('event', (event) => {
    if (event.type === 'exited') {
      logger.info(`Game exited with code ${event.exitCode ?? 'unknown'} error=${event.error}`);
    }
  });

  gameLauncher.on('stdout', (text) => {
    logger.info(`[Minecraft] ${text}`);
  });

  gameLauncher.on('stderr', (text) => {
    logger.error(`[Minecraft Error] ${text}`);
  });
};

export const resetLaunchStatus = (): void => {
  launchStatus.isLaunching = false;
  launchStatus.progress = 0;
  launchStatus.status = '';
};
