/**
 * Filesystem layout for launcher-managed data.
 *
 *  {base}/jdk/                          managed Java runtimes
 *  {base}/versions|libraries|assets/    shared Minecraft + NeoForge files
 *  {base}/cache/                        transient downloads (modpack archives)
 *  {base}/avatars/                      cached player heads for the UI
 *  {base}/news-cache.json               last news feed, shown offline and at startup
 *  {base}/minecraft/instances/Leptumon/
 *    minecraft/                         the game directory (mods, configs, saves)
 *
 * There is a single instance: the modpack is installed into it and updated in
 * place, so worlds, screenshots and player-added mods survive pack updates.
 */
import os from 'os';
import path from 'path';

import { BRAND_NAME } from '../../constants/launcher';
import { LauncherPathInfo } from '../../types/utils/launcherPathInfo';

const APP_DIR_NAME = 'Leptumon-Launcher';

const resolveBaseDir = (): string => {
  const homeDir = os.homedir();

  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), APP_DIR_NAME);
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', APP_DIR_NAME);
    case 'linux':
      return path.join(homeDir, `.${APP_DIR_NAME.toLowerCase()}`);
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
};

const getLauncherDataPath = (): LauncherPathInfo => {
  const base = resolveBaseDir();
  return {
    base,
    javaDir: path.join(base, 'jdk'),
    minecraftDir: path.join(base, 'minecraft'),
  };
};

const getCacheDir = (): string => path.join(resolveBaseDir(), 'cache');

const getAvatarCacheDir = (): string => path.join(resolveBaseDir(), 'avatars');

const getNewsCacheFile = (): string => path.join(resolveBaseDir(), 'news-cache.json');

const getInstanceMinecraftPath = (): string =>
  path.join(getLauncherDataPath().minecraftDir, 'instances', BRAND_NAME, 'minecraft');

export { getAvatarCacheDir, getCacheDir, getInstanceMinecraftPath, getLauncherDataPath, getNewsCacheFile };
