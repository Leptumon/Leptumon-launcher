/**
 * Launcher self-update from GitHub Releases.
 *
 * Shortly after startup (and every few hours) the latest release of
 * `updates.githubRepo` is compared with the running version. A newer build is
 * downloaded in the background, then applied when the player clicks Restart:
 *   - Windows: runs the release's Squirrel Setup.exe, which updates in place and relaunches
 *   - macOS:   swaps the .app bundle for the one in the release zip and relaunches
 *   - Linux:   opens the release page (.deb/.rpm installs need the package manager)
 */
import { execFile, spawn } from 'child_process';
import { constants as fsConstants } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { app, BrowserWindow, shell } from 'electron';

import { LAUNCHER_NAME } from '../constants/launcher';
import { downloadLargeFile } from '../core/engine/downloader/queue';
import { loadClientConfig } from '../core/utils/clientConfig';
import { logger } from '../core/utils/logger';
import type { UpdateState } from '../types/api/updater';

const execFileAsync = promisify(execFile);

const FIRST_CHECK_DELAY_MS = 5_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

type ReleaseAsset = { name: string; size: number; browser_download_url: string };
type GithubRelease = { tag_name: string; html_url: string; assets?: ReleaseAsset[] };

let state: UpdateState = { status: 'idle', currentVersion: app.getVersion() };
let downloadedFile: string | null = null;
let inFlightCheck: Promise<void> | null = null;
let getWindow: () => BrowserWindow | null = () => null;

const setState = (patch: Partial<UpdateState>): void => {
  state = { ...state, ...patch };
  const window = getWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send('updater:state', state);
  }
};

export const getUpdateState = (): UpdateState => state;

/** Numeric x.y.z comparison; a pre-release sorts below its release (1.2.0-beta < 1.2.0). */
export const compareVersions = (a: string, b: string): number => {
  const parse = (version: string) => {
    const [core, pre = ''] = version.replace(/^v/i, '').split('-', 2);
    return { parts: core.split('.').map((part) => parseInt(part, 10) || 0), pre };
  };
  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < Math.max(left.parts.length, right.parts.length, 3); i++) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre.localeCompare(right.pre, undefined, { numeric: true }) > 0 ? 1 : -1;
};

/** Matches the artifact names .github/workflows/release.yml uploads. */
const pickAsset = (assets: ReleaseAsset[]): ReleaseAsset | null => {
  const named = (suffix: string) =>
    assets.find((asset) => asset.name.toLowerCase().endsWith(suffix) && asset.browser_download_url.startsWith('https://')) ?? null;

  if (process.platform === 'win32') return named('-win32-x64-setup.exe');
  if (process.platform === 'darwin') return named(`-darwin-${process.arch}.zip`);
  return null;
};

const downloadUpdate = async (asset: ReleaseAsset): Promise<void> => {
  const dir = path.join(os.tmpdir(), `${LAUNCHER_NAME}-update`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const destination = path.join(dir, path.basename(asset.name));

  logger.info(`[updater] Downloading ${asset.name}`);
  setState({ status: 'downloading', progress: 0 });

  let lastPercent = 0;
  await downloadLargeFile(asset.browser_download_url, destination, (progress) => {
    const percent = Math.floor(progress.percentage);
    if (percent !== lastPercent) {
      lastPercent = percent;
      setState({ progress: percent });
    }
  }, DOWNLOAD_TIMEOUT_MS);

  const { size } = await fs.stat(destination);
  if (asset.size && size !== asset.size) {
    throw new Error(`Downloaded update is ${size} bytes, expected ${asset.size}`);
  }

  downloadedFile = destination;
  logger.info(`[updater] Update ${state.latestVersion} ready at ${destination}`);
  setState({ status: 'ready', progress: 100 });
};

const runCheck = async (): Promise<void> => {
  if (state.status === 'downloading' || state.status === 'ready') return;

  const { updates } = await loadClientConfig();
  if (!REPO_PATTERN.test(updates.githubRepo)) {
    setState({ status: 'disabled' });
    return;
  }
  // Dev builds would "update" into a packaged app; opt in explicitly to test the flow.
  if (!app.isPackaged && process.env.LEPTUMON_UPDATER_DEV !== '1') {
    setState({ status: 'disabled' });
    return;
  }

  setState({ status: 'checking', error: undefined });
  try {
    const response = await fetch(`https://api.github.com/repos/${updates.githubRepo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${LAUNCHER_NAME}/${app.getVersion()}`,
      },
    });
    if (response.status === 404) {
      // Repo has no published release yet.
      setState({ status: 'up-to-date' });
      return;
    }
    if (!response.ok) {
      throw new Error(`GitHub API returned HTTP ${response.status}`);
    }

    const release = await response.json() as GithubRelease;
    const latestVersion = release.tag_name.replace(/^v/i, '');
    if (compareVersions(latestVersion, app.getVersion()) <= 0) {
      setState({ status: 'up-to-date', latestVersion });
      return;
    }

    logger.info(`[updater] Launcher ${latestVersion} is available (running ${app.getVersion()})`);
    setState({ latestVersion, releaseUrl: release.html_url });

    const asset = pickAsset(release.assets ?? []);
    if (!asset) {
      setState({ status: 'manual' });
      return;
    }
    await downloadUpdate(asset);
  } catch (error) {
    logger.warn(`[updater] Update check failed: ${(error as Error).message}`);
    setState({ status: 'error', error: (error as Error).message });
  }
};

export const checkForUpdates = (): Promise<void> => {
  inFlightCheck ??= runCheck().finally(() => {
    inFlightCheck = null;
  });
  return inFlightCheck;
};

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const isWritable = async (dir: string): Promise<boolean> => {
  try {
    await fs.access(dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Replaces the running .app with the downloaded one after this process exits.
 * `ditto` keeps the framework symlinks and permissions a JS unzip would lose.
 */
const applyMacUpdate = async (zipPath: string): Promise<void> => {
  const bundle = path.resolve(process.execPath, '..', '..', '..');
  const replaceable = bundle.endsWith('.app')
    && !bundle.includes('/AppTranslocation/')
    && await isWritable(path.dirname(bundle));

  if (!replaceable) {
    // Running from the DMG, a translocated path, or a read-only folder.
    logger.warn(`[updater] Cannot replace ${bundle} in place; opening the release page instead`);
    if (state.releaseUrl) await shell.openExternal(state.releaseUrl);
    return;
  }

  const extractDir = path.join(path.dirname(zipPath), 'extracted');
  await fs.rm(extractDir, { recursive: true, force: true });
  await execFileAsync('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);
  const newApp = (await fs.readdir(extractDir)).find((name) => name.endsWith('.app'));
  if (!newApp) {
    throw new Error('Update archive does not contain an .app bundle');
  }

  const script = [
    '#!/bin/sh',
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done`,
    `OLD=${shellQuote(bundle)}`,
    `NEW=${shellQuote(path.join(extractDir, newApp))}`,
    'rm -rf "$OLD.previous"',
    'if mv "$OLD" "$OLD.previous" && mv "$NEW" "$OLD"; then',
    '  rm -rf "$OLD.previous"',
    'elif [ ! -d "$OLD" ]; then',
    '  mv "$OLD.previous" "$OLD"',
    'fi',
    'xattr -dr com.apple.quarantine "$OLD" 2>/dev/null',
    'open "$OLD"',
  ].join('\n');

  const scriptPath = path.join(path.dirname(zipPath), 'apply-update.sh');
  await fs.writeFile(scriptPath, script, { mode: 0o755 });
  spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
};

/** Applies a downloaded update (quits the launcher), or opens the release page. */
export const installUpdate = async (): Promise<void> => {
  try {
    if (state.status !== 'ready' || !downloadedFile) {
      if (state.releaseUrl) await shell.openExternal(state.releaseUrl);
      return;
    }

    logger.info(`[updater] Installing ${state.latestVersion}`);
    if (process.platform === 'win32') {
      spawn(downloadedFile, [], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
    } else if (process.platform === 'darwin') {
      await applyMacUpdate(downloadedFile);
    } else if (state.releaseUrl) {
      await shell.openExternal(state.releaseUrl);
    }
  } catch (error) {
    logger.error(`[updater] Failed to install update: ${(error as Error).message}`);
    setState({ status: 'error', error: (error as Error).message });
  }
};

export const initUpdater = (windowGetter: () => BrowserWindow | null): void => {
  getWindow = windowGetter;
  setTimeout(() => void checkForUpdates(), FIRST_CHECK_DELAY_MS);
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
};
