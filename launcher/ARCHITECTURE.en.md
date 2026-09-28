# Launcher architecture

[Français](ARCHITECTURE.md) · **English**

A map of how the Leptumon Launcher is put together, so you can find the right file quickly.

## Processes

```text
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (React)          preload.ts          Main process     │
│  ─────────────────         ──────────          ─────────────    │
│  views/ + components/  →  contextBridge  →  main/registerIpc.ts │
│  contexts/                  window.electron      main/* modules │
│  renderer.tsx               window.config       core/*          │
└─────────────────────────────────────────────────────────────────┘
```

- The renderer has no Node access. It only talks to `window.electron` and `window.config`.
- The preload script is the typed IPC bridge (`preload.ts` and `types/electron.d.ts`).
- The main process handles sign-in, downloads, settings, server pings, updates and starting Minecraft.

## Where things live

| Path | What it does |
| ---- | ------------ |
| `src/index.ts` | App startup (single-instance lock, crash guards, ready handler) |
| `src/main/registerIpc.ts` | Every `ipcMain` handler |
| `src/main/launchPipeline.ts` | The launch steps: modpack, Java, NeoForge, server, sign-in, game |
| `src/main/launchProgress.ts` | Turns the steps into one progress value for the UI |
| `src/main/updater.ts` | Launcher self-update from GitHub Releases |
| `src/main/settings.ts` | `electron-store` persistence and the RAM range for this machine |
| `src/main/rendererConfig.ts` | The settings React is allowed to read and write |
| `src/main/window.ts` | `BrowserWindow` setup: native traffic lights on macOS, frameless and transparent with custom controls elsewhere. Tells the renderer when the window is maximized or fullscreen (square corners). |
| `src/main/news.ts` | Home-screen news: last feed kept in `news-cache.json`, refreshed in the background, links opened by article id |
| `src/core/news/feed.ts` | Downloads and checks the `news.url` feed (API or static `news.json`) |
| `src/main/avatarCache.ts` | Player heads cached on disk so they show up instantly |
| `src/core/modpack/manifest.ts` | Syncs the hosted pack manifest into the instance (the default) |
| `src/core/modpack/installer.ts` | Installs or updates a CurseForge modpack release (when there's no manifest) |
| `src/core/modpack/curseforge.ts` | CurseForge Core API client |
| `src/core/modpack/common.ts` | Shared download queue, state files, folders the pack owns |
| `scripts/generate-pack-manifest.mjs` | Builds `manifest.json` and the self-hosted objects from a pack instance |
| `src/core/server/status.ts` | Server List Ping (players, MOTD, version, latency, icon) |
| `src/core/server/motd.ts` | Turns MOTD JSON and § codes into styled text |
| `src/core/server/serversDat.ts` | Pins the server in the multiplayer list |
| `src/core/engine/` | Java download, NeoForge/Fabric install, Minecraft download and launch |
| `src/core/auth/microsoft/` | OAuth flow and the local callback server |
| `src/core/utils/clientConfig.ts` | Loads and checks `assets/client-config.json` |
| `src/constants/launcher.ts` | Launcher name, RAM limits, default settings |
| `src/views/`, `src/components/` | The UI (see below) |
| `src/contexts/` | React state: launch progress and strings |

## What happens on Play

When the player clicks Play, `main/registerIpc.ts` hands off to `main/launchPipeline.ts`:

1. Modpack. With `modpack.manifestUrl` set, `core/modpack/manifest.ts` fetches the manifest and downloads only missing, damaged or changed files (the README explains the sync rules). Otherwise `core/modpack/installer.ts` uses CurseForge. If `.leptumon/modpack.json` already records the configured `curseforge.fileId`, this step finishes right away. If not, it:
   - downloads the pack archive
   - looks up every entry through the CurseForge API
   - downloads mods, resource packs and shader packs in parallel
   - applies the overrides
   - removes files the previous version installed that the new one dropped
   - writes the state file
2. Java (`core/engine/java/`). Temurin, or Zulu where needed, for the pack's Minecraft version, stored in `{data}/jdk`.
3. Loader (`core/engine/downloader/modloader/neoforge.ts`). Runs NeoForge's installer jar with `--install-client` against the shared data folder, and reuses an existing `neoforge-<version>` profile.
4. Server (`core/server/serversDat.ts`). Keeps the server first in `servers.dat`. If "Join the server on launch" is on, it passes `--quickPlayMultiplayer`.
5. Sign-in. Refreshes the Microsoft tokens into a Minecraft session token.
6. Launch. `GameLauncher.launch()` checks the vanilla client, libraries and assets, then starts the game.

Errors meant for players are thrown as `UserFacingError` (`core/utils/errors.ts`). The message shows on the launch card and `detail` goes to the log.

## IPC at a glance

| Preload API | IPC channel | Handler |
| ----------- | ----------- | ------- |
| `installAndLaunchMC` / `cancelLaunch` | `install-and-launch-mc` / `cancel-launch` | `registerLaunchHandlers` |
| `getLauncherInfo` | `get-launcher-info` | `registerLauncherInfoHandlers` |
| `getServerStatus` | `get-server-status` (cached for 10 s) | `registerLauncherInfoHandlers` |
| `openLink('discord' \| 'store')` | `open-link` | `registerLauncherInfoHandlers` |
| `getNews` / `onNewsUpdated` / `openNewsLink(id)` | `get-news` / `news-updated` / `open-news-link` | `registerNewsHandlers` |
| `getWindowState` / `onWindowState` | `get-window-state` / `window-state` | `registerWindowHandlers` |
| `getAvatar` / `onAvatarUpdated` | `get-avatar` / `avatar-updated` | `registerAuthHandlers` |
| `getRamInfo` | `get-ram-info` | `registerConfigHandlers` |
| `getUpdateState` / `checkForUpdates` / `installUpdate` | `updater:*` | `registerUpdaterHandlers` |
| `config.get/set` | `get-config` / `set-config` | `registerConfigHandlers` |

The full list is in `preload.ts` (grouped by section) and `main/registerIpc.ts`.

## The UI

The UI started from a launcher template and was redesigned for Leptumon. The News panel fills the space next to the launch card when a feed is configured; otherwise the card stands alone.

| Area | Main files |
| ---- | ---------- |
| Routing and sign-in gate | `components/RouterContainer.tsx` |
| Sign-in screen | `views/Login.tsx`, `components/LoginForm.tsx` |
| Window shell | `views/MainPage.tsx` (fade between pages), `components/Sidebar.tsx` (home, Discord and Store, settings, avatar, sliding active marker), `components/Titlebar/` |
| Home | `views/pages/HomePage.tsx`, which shows `Content/Content.tsx` (logo) and `Footer.tsx` (news and launch card) |
| News | `components/News.tsx` (cards that scroll with the wheel, trackpad or the arrows over the row's edges; hidden without a feed), `components/NewsArticleDialog.tsx` (full article, "Open link" button) |
| Window corners | `utils/windowFrame.ts` and the `clip-path` block in `styles/main.scss`: on Windows and Linux the page rounds the window itself (`$radius-window`), square when maximized |
| Launch card and live status | `components/LaunchButton.tsx` (player count in the status pill, MOTD as its tooltip, status text that wraps when it's long), `ProgressBar.tsx`, `MiniProgressPill.tsx` |
| Links | `components/SocialMediaLinks.tsx` and `SidebarIcons.tsx`, shown in the sidebar |
| Updates | `components/UpdatePrompt.tsx` (asks to restart when a launcher update is ready) |
| Settings | `views/pages/Settings.tsx`, `components/SettingsLayout.tsx` (sections, rows, collapsible row), `MemorySlider.tsx`, `DropdownMenu.tsx` |
| Shared controls | `components/Button.tsx`, `Switch.tsx`, `ConfirmDialog.tsx` |
| Player head | `utils/useAvatar.ts`, fed by `main/avatarCache.ts` |
| Strings | `i18n/<locale>.json` (11 languages) through `i18n/index.ts` and `contexts/I18nContext.tsx`. First-run language detection is in `src/index.ts`. |
| Look and feel | `styles/base/_variables.scss` (every colour, radius, text size and animation curve), `styles/base/_mixins.scss`, and `constants/motion.ts` with the same animation values for the motion package. Inter 4.1 is bundled in `assets/fonts/inter/`. |

## Adding things

### A new build-time setting

1. Add it to `types/config/ClientConfig.ts`.
2. Validate it in `core/utils/clientConfig.ts`.
3. Add it to `assets/client-config.json` and to the tables in both READMEs.

### A new player setting

1. Add the key to `types/config/LauncherConfig.ts`.
2. Allow it in `main/rendererConfig.ts` if React needs to read or write it.
3. Use `window.config` from React.

### A new language

1. Add `i18n/<locale>.json` with exactly the same keys as `en_US.json`, keeping every `<placeholder>`.
2. Import it into `STRINGS` in `i18n/index.ts` and add its native name to `LOCALE_NAMES`.

First-run detection matches on the language code, so the new language is picked up automatically.

### New launch behaviour

Edit `main/launchPipeline.ts` or the relevant `core/` module, and keep the step comments up to date.

## Dependency overrides

The `overrides` in `package.json` pin build-tool dependencies to patched versions so `npm audit` stays clean. Two of them have no fixed release upstream, so small shims live in `vendor/`:

| Shim | Replaces | Why |
| ---- | -------- | --- |
| `vendor/extract-zip` | `extract-zip` 2.0.1 (used by `@electron/packager` 18 in Forge 7) | It has an unpatched symlink path traversal. The shim forwards to `@electron-internal/extract-zip`, the hardened extractor `@electron/packager` 20 uses. |
| `vendor/image-size` | `image-size` 0.7 (used by `appdmg` for the DMG background) | Its denial-of-service issues are only fixed in 2.x, which changed the API. The shim keeps 0.7's `sizeOf(path, callback)` on top of 2.x. |

Both are only used while building; nothing in `vendor/` ends up in the app. Once Electron Forge 8 is stable (it uses `@electron/packager` 20), the `extract-zip` shim can go. Run `npm audit` after updating dependencies and remove overrides that aren't needed anymore.

## Code conventions

- Main process logic goes in `src/main/` or `src/core/`, not in `index.ts`.
- Anything privileged never runs in React. It always goes through `preload.ts`.
- Every build-time config field is optional. A missing value leads to a "coming soon" state, not a crash.
- Comments explain why (business rules, step order), not what obvious code does.
