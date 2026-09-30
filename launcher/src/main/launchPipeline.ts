/**
 * Launch orchestration: CurseForge modpack → Java → NeoForge → Minecraft.
 *
 *  1. Modpack: sync the hosted pack manifest, or the CurseForge file if none is set (core/modpack)
 *  2. Java: managed runtime for the pack's Minecraft version
 *  3. Loader: NeoForge profile from the pack manifest (installer needs Java)
 *  4. Server: pin the server in the multiplayer list, pick the Quick Play target
 *  5. Auth: refresh the Microsoft session into a Minecraft token
 *  6. Spawn: GameLauncher verifies vanilla files and starts the game
 */
import fs from 'fs/promises';

import { app } from 'electron';

import {
  authenticateXBL,
  getMinecraftAccessToken,
  getXstsToken,
  loadRefreshToken,
  refreshMicrosoftToken,
} from '../core/auth/microsoft/authenticate';
import { FabricInstaller, NeoForgeInstaller } from '../core/engine/downloader/modloader';
import { resolveVersionInheritance } from '../core/engine/downloader/parser';
import { LaunchOptions } from '../core/engine/launch/orchestrator';
import { VersionJson } from '../core/engine/types/version-json';
import { isVersionAtLeast } from '../core/engine/utils/version';
import { getCacheDir, getInstanceMinecraftPath, getLauncherDataPath } from '../core/launch/pathManager';
import type { ModpackTarget } from '../core/modpack/common';
import { ensureModpack } from '../core/modpack/installer';
import { ensureManifestModpack } from '../core/modpack/manifest';
import { progressEmitter } from '../core/progress-emitter';
import { ensureServerListed } from '../core/server/serversDat';
import { parseServerAddress } from '../core/server/status';
import { loadClientConfig } from '../core/utils/clientConfig';
import { logger } from '../core/utils/logger';
import { reportLaunch } from '../core/utils/playerTelemetry';
import { t } from '../i18n';
import { AuthConfig } from '../types/config/LauncherConfig';

import { getMicrosoftClientId, redirectURI } from './authConfig';
import { LAUNCHER_NAME, RAM_RECOMMENDED_MB } from '../constants/launcher';
import type { LaunchPhase, LaunchProgressStatus } from './launchProgress';
import { getConfig, normalizeRamMb } from './settings';

export type LaunchPipelineDeps = {
  javaManager: import('../core/engine/java/manager').JavaManager;
  gameLauncher: import('../core/engine/launch/orchestrator').GameLauncher;
  signal: AbortSignal;
  isCancelled: () => boolean;
};

export type LaunchPipelineResult = {
  success: boolean;
  error?: string;
};

const throwIfCancelled = (isCancelled: () => boolean): void => {
  if (isCancelled()) {
    const error = new Error('AbortError');
    error.name = 'AbortError';
    throw error;
  }
};

const emitPhase = (phase: LaunchPhase, progress: number, status: LaunchProgressStatus): void => {
  progressEmitter.emit('phase-progress', { phase, progress, status });
};

const userAgent = (): string => `${LAUNCHER_NAME}/${app.getVersion()}`;

/** Phase 1: install or update the modpack: hosted manifest first, CurseForge as the alternative. */
const installModpack = async (deps: LaunchPipelineDeps, instanceDir: string): Promise<ModpackTarget> => {
  const cfg = await loadClientConfig();
  const onProgress = (progress: number, status: LaunchProgressStatus) => {
    if (!deps.isCancelled()) emitPhase('modpack', progress, status);
  };

  if (cfg.modpack.manifestUrl) {
    return ensureManifestModpack({
      instanceDir,
      manifestUrl: cfg.modpack.manifestUrl,
      userAgent: userAgent(),
      signal: deps.signal,
      onProgress,
    });
  }

  return ensureModpack({
    instanceDir,
    cacheDir: getCacheDir(),
    config: cfg.curseforge,
    userAgent: userAgent(),
    signal: deps.signal,
    onProgress,
  });
};

/** Phase 2: Java for this Minecraft version (NeoForge's installer runs on it too). */
const ensureJava = async (deps: LaunchPipelineDeps, mcVersion: string): Promise<{ executablePath: string }> => {
  throwIfCancelled(deps.isCancelled);
  emitPhase('java', 0.05, { key: 'launch.java_checking' });

  const requirement = deps.javaManager.getRequirement(mcVersion);
  const runtime = await deps.javaManager.ensureVersion(requirement.recommendedVersion, (percent) => {
    if (deps.isCancelled()) return;
    emitPhase('java', percent / 100, { key: 'launch.java_downloading', params: { percent: percent.toFixed(1) } });
  });

  emitPhase('java', 1, { key: 'launch.java_ready' });
  return runtime;
};

/** Phase 3: install the pack's mod loader profile into the shared versions folder. */
const installLoader = async (
  deps: LaunchPipelineDeps,
  target: ModpackTarget,
  javaPath: string,
): Promise<{ versionId: string; versionJson: VersionJson }> => {
  throwIfCancelled(deps.isCancelled);
  const loaderName = target.loader.type === 'neoforge' ? 'NeoForge' : 'Fabric';
  const installer = target.loader.type === 'neoforge' ? new NeoForgeInstaller() : new FabricInstaller();
  emitPhase('loader', 0.02, { key: 'launch.loader_installing', params: { name: loaderName } });

  const result = await installer.install({
    mcVersion: target.mcVersion,
    loaderVersion: target.loader.version,
    gameDir: getLauncherDataPath().base,
    javaPath,
    signal: deps.signal,
    onProgress: (percent) => {
      if (deps.isCancelled() || typeof percent !== 'number') return;
      emitPhase('loader', percent / 100, { key: 'launch.loader_installing', params: { name: loaderName } });
    },
  });

  emitPhase('loader', 1, { key: 'launch.loader_installed', params: { type: loaderName } });
  return {
    versionId: result.versionId,
    versionJson: await resolveVersionInheritance(result.versionJson),
  };
};

/** Phase 4: keep the server in the multiplayer list and choose the Quick Play target. */
const prepareServerJoin = async (instanceDir: string, mcVersion: string): Promise<LaunchOptions['server']> => {
  const { server } = await loadClientConfig();
  if (!server.address) return undefined;

  try {
    await ensureServerListed(instanceDir, server.name, server.address);
  } catch (error) {
    logger.warn(`[Launch] Could not update servers.dat: ${(error as Error).message}`);
  }

  if (getConfig('autoJoinServer') === false) return undefined;

  const parsed = parseServerAddress(server.address);
  if (!parsed) {
    logger.warn(`[Launch] Ignoring invalid server address "${server.address}"`);
    return undefined;
  }
  return { host: parsed.host, port: parsed.port, legacyFlags: !isVersionAtLeast(mcVersion, '1.20') };
};

/** Phase 5: refresh Microsoft tokens into a Minecraft session access token. */
const resolveAccessToken = async (auth: AuthConfig): Promise<string> => {
  if (auth.loginType !== 'microsoft') {
    return '000000';
  }

  try {
    const refreshToken = await loadRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token found');
    }

    const clientId = getMicrosoftClientId();
    const msTokens = await refreshMicrosoftToken(clientId, redirectURI, refreshToken);
    const xblResult = await authenticateXBL(msTokens.access_token);
    const xstsResult = await getXstsToken(xblResult.Token);
    const userHash = xstsResult.DisplayClaims.xui[0]?.uhs;
    const mcTokenResult = await getMinecraftAccessToken(userHash, xstsResult.Token);

    logger.info('Successfully obtained Minecraft access token.');
    return mcTokenResult.access_token;
  } catch (error) {
    logger.error(`Failed to refresh token before launch: ${(error as Error).message}`);
    throw new Error(t('errors.session_expired'));
  }
};

const parseUserJvmArgs = (): string[] => {
  const raw = ((getConfig('jvmArgs') as string | undefined) ?? '').trim();
  return raw ? raw.split(/\s+/) : [];
};

/** Runs the full pre-game pipeline and spawns Minecraft. */
export const runLaunchPipeline = async (deps: LaunchPipelineDeps): Promise<LaunchPipelineResult> => {
  const auth = getConfig('auth') as AuthConfig | undefined;
  if (!auth) {
    return { success: false, error: t('errors.no_account') };
  }

  // Fire-and-forget: admin-side "who is playing" log. Never awaited, so a slow
  // or unreachable webhook can't delay or fail the actual launch.
  loadClientConfig()
    .then((cfg) =>
      reportLaunch(cfg.telemetry.trackingUrl, cfg.telemetry.trackingSecret, {
        username: auth.username,
        uuid: auth.uuid,
        loginType: auth.loginType === 'offline' ? 'offline' : 'microsoft',
      }),
    )
    .catch((e) => logger.error('Launch telemetry setup failed: ' + (e as Error).message));

  const dataDir = getLauncherDataPath().base;
  const instanceDir = getInstanceMinecraftPath();
  await fs.mkdir(instanceDir, { recursive: true });

  const target = await installModpack(deps, instanceDir);
  const installerJava = await ensureJava(deps, target.mcVersion);
  const { versionId, versionJson } = await installLoader(deps, target, installerJava.executablePath);
  // Same runtime unless the loader profile asks for a different Java major.
  const javaRuntime = await deps.javaManager.ensureForMinecraft(versionJson);

  throwIfCancelled(deps.isCancelled);
  // Game files download inside gameLauncher.launch() below; start the game phase
  // at 0 so real download progress drives the bar instead of jumping to 100%.
  emitPhase('game', 0, { key: 'launch.initializing' });

  const server = await prepareServerJoin(instanceDir, target.mcVersion);
  const accessToken = await resolveAccessToken(auth);
  const customJvmArgs = parseUserJvmArgs();
  logger.info(`[Launch] ${target.name} ${target.version} → ${versionId}; user JVM args: ${customJvmArgs.join(' ') || '(none)'}`);

  const launchOptions: LaunchOptions = {
    version: versionId,
    account: {
      username: auth.username,
      uuid: auth.uuid,
      accessToken,
      type: auth.loginType === 'offline' ? 'offline' : 'microsoft',
    },
    javaPath: javaRuntime.executablePath,
    dataDir,
    gameDir: instanceDir,
    memory: { min: 1024, max: normalizeRamMb(getConfig('ram') || RAM_RECOMMENDED_MB) },
    customJvmArgs,
    server,
    launcherName: LAUNCHER_NAME,
    launcherVersion: app.getVersion(),
  };

  const result = await deps.gameLauncher.launch(launchOptions);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true };
};
