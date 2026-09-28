import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import type { ForgeConfig } from '@electron-forge/shared-types';
import fs from 'fs-extra';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const execFileAsync = promisify(execFile);
const logosDir = path.join(process.cwd(), 'src/assets/logos');
const requestedPlatforms = process.argv.flatMap((arg, index, args) => {
  if (arg.startsWith('--platform=')) {
    return [arg.slice('--platform='.length)];
  }

  if (arg === '--platform' && args[index + 1]) {
    return [args[index + 1]];
  }

  return [];
});
const targetsWin32 = requestedPlatforms.length === 0 || requestedPlatforms.includes('win32');
const makeSquirrel = process.env.LEPTUMON_SKIP_SQUIRREL !== '1' && targetsWin32;
const makeRpm = process.env.LEPTUMON_SKIP_RPM !== '1';
const loadMakerSquirrel = () => {
  const { MakerSquirrel } = require('@electron-forge/maker-squirrel') as typeof import('@electron-forge/maker-squirrel');
  return MakerSquirrel;
};

const removeCodeSignatureDirs = async (dir: string): Promise<void> => {
  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = await fs.lstat(fullPath);

    if (stat.isDirectory() && entry === '_CodeSignature') {
      await fs.remove(fullPath);
    } else if (stat.isDirectory() && !stat.isSymbolicLink()) {
      await removeCodeSignatureDirs(fullPath);
    }
  }
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: path.join(logosDir, 'logo'),
    executableName: 'leptumon-launcher',
    appBundleId: 'net.leptumon.launcher',
    appCategoryType: 'public.app-category.games',
    // Universal (Intel+Apple) stitching: when a Mach-O file can't be lipo-merged
    // because it only exists/differs in one slice, take the x64 copy instead of
    // erroring with "number of mach-o files is not the same".
    osxUniversal: {
      x64ArchFiles: '*',
    },
    afterComplete: [
      (buildPath: string, electronVersion: string, platform: string, arch: string, done: (err?: Error) => void) => {
        if (platform !== 'darwin') {
          done();
          return;
        }

        const appPath = path.join(buildPath, 'Leptumon Launcher.app');
        const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
        const prepareApp = process.env.LEPTUMON_STRIP_DARWIN_CODE_SIGNATURE === '1'
          ? removeCodeSignatureDirs(appPath)
          : Promise.resolve();

        prepareApp
          .then(() => execFileAsync('/usr/libexec/PlistBuddy', [
              '-c',
              'Set :CFBundleDisplayName Leptumon Launcher',
              infoPlist,
            ]))
          // Editing Info.plist breaks the ad-hoc signature Packager applied, and a
          // bundle whose seal is broken is refused outright on Apple Silicon with
          // "the app is damaged" -- which right-click > Open cannot get past. Re-sign
          // so the worst players see is the usual unidentified-developer prompt.
          .then(() => execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appPath]))
          .then(() => done())
          .catch(done);
      },
    ],
  },
  rebuildConfig: {
    // fs-xattr is a build-time dependency of the DMG maker (appdmg), not the app.
    // Rebuilding it for a non-host arch (e.g. x64 on Apple Silicon) makes appdmg
    // fail to dlopen it on the host; keep it at host arch by never rebuilding it.
    ignoreModules: ['@parcel/watcher', 'fs-xattr'],
  },
  makers: [
    ...(makeSquirrel ? (() => {
      const MakerSquirrel = loadMakerSquirrel();
      return [
        new MakerSquirrel({
          name: 'leptumon_launcher',
          // Squirrel Setup.exe splash. It must be a .gif; the native size is 268×167.
          // Regenerate with scripts/generate-install-loading-gif.py.
          loadingGif: path.join(logosDir, 'install-loading.gif'),
          setupIcon: path.join(logosDir, 'logo.ico'),
          // rcedit.exe is killed by Wine/Rosetta on Apple Silicon; Squirrel still receives setupIcon below.
          skipUpdateIcon: true,
        }),
      ];
    })() : []),
    new MakerZIP({}, ['darwin', 'linux', 'win32']),
    new MakerDeb({}),
    new MakerDMG({
      icon: path.join(process.cwd(), 'src/assets/logos/logo.icns'),
    }),
    // rpm is kept last: cross-building rpm from macOS is flaky, and putting it
    // after zip/deb means a failed rpm doesn't prevent those from being made.
    ...(makeRpm ? [new MakerRpm({})] : []),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      devContentSecurityPolicy: "connect-src 'self' * 'unsafe-eval'",
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],

  hooks: {
    packageAfterCopy: async (config, buildPath, electronVersion, platform, arch) => {
      // Bundled build-time config (server, modpack, links, keys); players cannot override it.
      console.log('Copying client-config.json...');
      const assetsSource = path.join(process.cwd(), 'src/assets/client-config.json');
      const assetsDestDir = path.join(buildPath, 'dist/assets');
      await fs.ensureDir(assetsDestDir);
      await fs.copy(assetsSource, path.join(assetsDestDir, 'client-config.json'));
      console.log('Finished copying client-config.json.');
    }
  }
};

export default config;
