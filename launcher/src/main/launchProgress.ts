/**
 * Weighted launch progress aggregation across modpack / java / loader / game phases.
 *
 * The launch pipeline emits coarse phase updates on progressEmitter; this
 * module turns them into a single 0 to 100 percent for the renderer UI.
 */
import { BrowserWindow } from 'electron';

import { progressEmitter } from '../core/progress-emitter';
import { GameLauncher } from '../core/engine/launch/orchestrator';

import { launchStatus } from './engineContext';

export type LaunchProgressStatus =
  | string
  | { key: string; params?: Record<string, string> };

export type LaunchPhase = 'modpack' | 'java' | 'loader' | 'game';

/**
 * The modpack phase dominates a first install (~500 files); on later launches
 * it completes instantly and the bar moves on to game file verification.
 */
const PHASE_WEIGHTS: Record<LaunchPhase, number> = {
  modpack: 0.45,
  java: 0.1,
  loader: 0.15,
  game: 0.3,
};

export type LaunchProgressSession = {
  forwardProgress: (status?: LaunchProgressStatus) => void;
  attachDownloadProgressListener: (gameLauncher: GameLauncher) => void;
  detach: () => void;
};

export const createLaunchProgressSession = (
  window: BrowserWindow,
  isCancelled: () => boolean,
): LaunchProgressSession => {
  const phaseProgress: Record<LaunchPhase, number> = { modpack: 0, java: 0, loader: 0, game: 0 };
  let lastPercentSent = 0;

  const computeTotal = (): number => {
    let total = 0;
    for (const [phase, weight] of Object.entries(PHASE_WEIGHTS) as [LaunchPhase, number][]) {
      total += (phaseProgress[phase] ?? 0) * weight;
    }
    return Math.min(1, total);
  };

  const forwardProgress = (status?: LaunchProgressStatus): void => {
    if (isCancelled()) return;
    const computed = Math.round(computeTotal() * 100);
    const next = Math.max(lastPercentSent, Math.min(100, computed));
    lastPercentSent = next;
    launchStatus.progress = next;
    launchStatus.status = status ?? '';
    if (!window.isDestroyed()) {
      window.webContents.send('launch-progress', { percent: next, status: status ?? '' });
    }
  };

  const phaseListener = (update: {
    phase: LaunchPhase;
    progress: number;
    status?: LaunchProgressStatus;
  }): void => {
    if (isCancelled()) return;
    phaseProgress[update.phase] = Math.max(0, Math.min(1, update.progress));
    forwardProgress(update.status);
  };

  progressEmitter.on('phase-progress', phaseListener);

  const progressListener = (progress: {
    percent?: number;
    stage?: string;
    action?: string;
  }): void => {
    const percent = (progress.percent ?? 0).toFixed(1);
    let statusKey = 'launch.downloading_files';
    if (progress.stage === 'assets') {
      // Use one stable label for the whole assets stage. Switching per-file between
      // downloading/verifying (most files are cached) makes the text flicker.
      statusKey = 'launch.downloading_assets';
    } else if (progress.stage === 'libraries') {
      statusKey = 'launch.downloading_libraries';
    } else if (progress.stage === 'client') {
      statusKey = 'launch.downloading_client';
    }
    const status = { key: statusKey, params: { percent } };
    progressEmitter.emit('phase-progress', {
      phase: 'game',
      progress: (progress.percent ?? 0) / 100,
      status,
    });
  };

  let attachedLauncher: GameLauncher | null = null;

  return {
    forwardProgress,
    attachDownloadProgressListener: (gameLauncher) => {
      attachedLauncher = gameLauncher;
      gameLauncher.on('downloadProgress', progressListener);
    },
    detach: () => {
      progressEmitter.removeListener('phase-progress', phaseListener);
      if (attachedLauncher) {
        attachedLauncher.off('downloadProgress', progressListener);
        attachedLauncher = null;
      }
    },
  };
};
