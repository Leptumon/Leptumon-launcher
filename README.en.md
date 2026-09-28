# Leptumon Launcher

[Français](README.md) · **English**

The desktop launcher for **Leptumon**, a laid-back community Minecraft server running **All the Mons** (Cobblemon + All the Mods) on Minecraft 1.21.1 with NeoForge. It's built with Electron, React and TypeScript.

- How the code is organised: [`launcher/ARCHITECTURE.en.md`](launcher/ARCHITECTURE.en.md)
- Logo and brand assets: [`branding/README.en.md`](branding/README.en.md)

## What it does

- Leptumon branding throughout: logo, app icons, background and the Windows installer splash.
- 11 languages: French, English, German, Spanish, Polish, Portuguese (Brazil), Russian, Turkish, Hindi, Japanese and Simplified Chinese. On first launch it follows the system language and falls back to French. Players can change it in Settings.
- Microsoft sign-in, with a check that the account actually owns Minecraft.
- One-click setup. Play installs All the Mons from the hosted pack manifest (CurseForge is the fallback), then NeoForge, Minecraft and a Java runtime, so players don't need anything installed beforehand.
- Updates without reinstalling:
  - Modpack: publish a new manifest and players move to the new pack version on their next Play. No launcher release needed.
  - Launcher: when a releases repository is configured, it checks GitHub Releases at startup, downloads new builds in the background and asks to restart. This is currently turned off.
- A RAM slider with presets and a recommendation for the player's machine (6 GB minimum, 8 GB by default), plus a field for custom JVM arguments.
- Live server info on the home screen: online status and player count, with the MOTD on hover.
- Play joins the server straight from the title screen (Quick Play) and keeps it pinned at the top of the multiplayer list.
- A News panel next to the launch card, with image cards and a full-article view. Articles come from a feed you choose (see [News](#news)); with no feed set, the panel stays hidden.
- Discord and Store links in the sidebar.
- Rounded window corners on Windows and Linux (macOS keeps its native ones).
- Runs on Windows, macOS (Intel and Apple Silicon) and Linux.

## Configuration values

Everything here lives in [`launcher/src/assets/client-config.json`](launcher/src/assets/client-config.json).

| Value | Key | Status |
| ----- | --- | ------ |
| Microsoft Azure client ID | `microsoftClientId` | Set. The Azure app has to allow personal Microsoft accounts, use the redirect URI `http://localhost:59016/auth/callback`, and be approved for the Minecraft services API. |
| Pack manifest URL | `modpack.manifestUrl` | Set to `https://leptumon.voxelith.dev/manifest.json` (hosted behind Cloudflare). |
| CurseForge API key | `curseforge.apiKey` | Optional. Only used when `modpack.manifestUrl` is empty. Getting a key needs an approved application at <https://console.curseforge.com>. |
| All the Mons release | `curseforge.fileId` | Set to `8822048` (All the Mons 1.3.0). To change it, take the number at the end of the release's CurseForge URL (`.../all-the-mons/files/<fileId>`). The launcher never picks "latest" by itself. |
| Server address | `server.address` | Set to `leptunia.fr` (default port 25565). |
| News feed | `news.url` | Empty, so the News panel is hidden. Set it to the feed address once the news server is online (see [News](#news)). |
| Releases repository | `updates.githubRepo` | Empty, so launcher self-update is off. To turn it on, put the `owner/repo` of the public GitHub repository the release workflow publishes to. |

The CurseForge project ID for All the Mons (`1356598`) is already filled in.

## Configuration

`client-config.json` is baked into each build, so players can't change it. Changing it means shipping a new release, which existing installs pick up through the self-updater once that's turned on.

```json
{
  "microsoftClientId": "ac0cda15-bdc4-4e19-88bf-b1c884a0e8f7",
  "modpack": { "manifestUrl": "https://leptumon.voxelith.dev/manifest.json" },
  "curseforge": { "apiKey": "", "projectId": 1356598, "fileId": 8822048 },
  "server": { "name": "Leptumon", "address": "leptunia.fr" },
  "links": {
    "discord": "https://discord.com/invite/s5yxVPfJGE",
    "store": "https://leptumon-webshop.tebex.io/"
  },
  "news": { "url": "" },
  "updates": { "githubRepo": "" }
}
```

| Key | What it's for |
| --- | ------------- |
| `microsoftClientId` | The Azure OAuth app used for Microsoft sign-in |
| `modpack.manifestUrl` | The hosted pack manifest. When it's set, the launcher installs from it and ignores `curseforge` |
| `curseforge.apiKey` | CurseForge Core API key |
| `curseforge.projectId` | The modpack project (All the Mons) |
| `curseforge.fileId` | The exact modpack release to install. The Minecraft and NeoForge versions come from that release. |
| `server.name` | Name shown on the home screen and in the multiplayer list |
| `server.address` | Server that's pinged for live status and joined on Play (`_minecraft._tcp` SRV records work) |
| `links.discord` / `links.store` | The Discord and Store buttons in the sidebar. These are the only URLs the launcher will open. |
| `news.url` | The News panel's feed: the news API's `/v1/public/news`, or a static `news.json`. Empty hides the panel. Only `https://` addresses are accepted. |
| `updates.githubRepo` | Where launcher releases are published |

Player settings (RAM, JVM arguments, auto-join, minimize while playing, language, account) are stored locally with `electron-store`.

## What happens when you press Play

`launcher/src/main/launchPipeline.ts` runs these steps in order:

1. Modpack: syncs the hosted pack manifest, or the configured CurseForge release when there's no manifest (`core/modpack/`).
2. Java: downloads the Java version that Minecraft release needs (`core/engine/java/`).
3. NeoForge: runs the official installer without a window (`core/engine/downloader/modloader/neoforge.ts`).
4. Server: pins the server in `servers.dat` and sets the Quick Play target.
5. Sign-in: refreshes the Microsoft session into a Minecraft token.
6. Launch: checks the vanilla files and starts the game.

The game folder sits inside the launcher data folder:

```text
minecraft/instances/Leptumon/minecraft
```

### Hosted pack manifest

The launcher installs the pack from a `manifest.json` that you host, so no CurseForge API key is needed. The manifest lists the Minecraft and NeoForge versions and every file's URL, SHA-1 and size.

To publish a pack version:

1. Import the pack into Prism Launcher or the CurseForge app. Ideally don't launch it, so no files created at runtime end up in the pack.
2. Generate the manifest:

   ```bash
   cd launcher
   node scripts/generate-pack-manifest.mjs \
     --instance "<path to the instance folder>" \
     --base-url https://<your file host>/leptumon \
     --version 1.3.0
   ```

   Jars that Modrinth already hosts are linked to Modrinth's CDN. Everything else is copied into `pack-dist/objects/`, and the self-hosted mods are listed in `pack-dist/self-hosted-mods.txt`. The Minecraft and loader versions are read from the instance; `--minecraft` and `--loader neoforge-<version>` override them.
3. Upload `pack-dist/` to the base URL, keeping its paths. Upload `objects/` first and `manifest.json` last, so players never get a manifest pointing at files that aren't there yet. Serve `manifest.json` with a short cache. Objects are named by their content, so leave old ones online; a new version only adds files.
4. The first time only: set `modpack.manifestUrl` to `<base-url>/manifest.json` and build the launcher.

The generator skips worlds, logs, screenshots, hidden and `.disabled` files, and instance metadata. `options.txt` is only installed when it's missing, so players keep their game settings across updates.

### How modpack installs and updates work

With the hosted manifest (state in `.leptumon/manifest-state.json`):

- The manifest is fetched on every Play. If nothing changed, only missing or wrong-size files are downloaded again, so launches stay quick and config tweaks are kept.
- When it changes, new and changed files are downloaded and verified. Files that left the pack are removed from `mods/`, `resourcepacks/` and `shaderpacks/`. Anywhere else, they're only removed if the player never edited them.
- If the file host is down, players who already have the pack can still play. Only a first install fails.

With CurseForge (state in `.leptumon/modpack.json`), used when `modpack.manifestUrl` is empty:

- The installed release is recorded in `.leptumon/modpack.json` inside the game folder. When it matches `curseforge.fileId`, Play skips CurseForge entirely.
- When `fileId` changes, the launcher:
  1. downloads the new pack's mods, resource packs and shader packs
  2. applies its overrides (configs, quests, scripts)
  3. removes files the previous version installed that the new one dropped

  Worlds, screenshots and mods players added themselves are left alone.
- Mod authors can block third-party downloads on CurseForge. No third-party launcher is allowed to download those files, so setup stops and the log lists them. Check this before picking a pack release.

### Launcher self-update

Only active once `updates.githubRepo` is set.

- Windows: runs the release's Squirrel `Setup.exe`, which updates in place and relaunches.
- macOS: swaps the `.app` for the one in the release zip and relaunches. The app needs to live in a writable folder like `/Applications`, not run from the DMG. Builds aren't signed, so the very first launch needs right-click, then Open.
- Linux: opens the release page, since `.deb` and `.rpm` updates go through the package manager.
- The updater looks for the asset names produced by [`.github/workflows/release.yml`](.github/workflows/release.yml). Tags have to be semver (`v1.0.1`) and match `version` in `launcher/package.json`.
- It won't restart while the game is running.

## News

The home screen's News panel shows the articles from the feed set in `news.url`. The launcher keeps the last feed it received on disk, so news shows up instantly at startup, even offline, and then refreshes in the background. Articles are plain text with an optional image and link.

The feed comes from the [`news-api/`](news-api/README.en.md) folder, run on your server (Docker or Node.js): it serves the feed and an admin page to publish articles. Without a server, a hand-edited `news.json` put online anywhere works too.

| Option | `news.url` |
| ------ | ---------- |
| `news-api/` on your server | `https://<your domain>/v1/public/news` |
| Static file | `https://<your site>/news.json` |

Since `news.url` is built into each release, pick a stable address, such as a dedicated subdomain.

## Repository layout

```text
.
├── launcher/                 Electron app
│   ├── src/
│   │   ├── index.ts              Main process startup
│   │   ├── main/                 Window, IPC, settings, launch pipeline, updater
│   │   ├── core/
│   │   │   ├── auth/microsoft/   OAuth flow and local callback server
│   │   │   ├── modpack/          CurseForge client and modpack installer
│   │   │   ├── server/           Server list ping, MOTD parsing, servers.dat
│   │   │   ├── engine/           Java, NeoForge/Fabric, Minecraft download and launch
│   │   │   └── utils/            Config, logging, errors
│   │   ├── renderer.tsx          React entry
│   │   ├── preload.ts            Bridge between the page and the main process
│   │   ├── views/ components/ contexts/ styles/
│   │   └── assets/               Logo, background, icons, font, client-config.json
│   ├── scripts/              Logo, icon and installer GIF generators, multi-platform build
│   └── vendor/               Small build-time shims for patched dependencies
├── news-api/                 News server and admin page (optional, see News)
├── branding/                 Source logo and brand notes
└── .github/workflows/        Release builds
```

## Development

You'll need Node.js 22.15 or newer (22 or 24 LTS; Electron Forge packaging is unreliable on Node 25+), npm and Git.

```bash
cd launcher
npm ci
node node_modules/electron/install.js   # only if npm skipped Electron's download script
npm start
```

Sign in with a Microsoft account that owns Minecraft and press Play to try the whole flow. Handy while developing:

- `LEPTUMON_NO_DEVTOOLS=1 npm start` starts without the DevTools panel
- `LEPTUMON_UPDATER_DEV=1` turns on the update check in a dev build

## Building and releasing

```bash
cd launcher
npm run package    # unpacked app
npm run make       # installers for this platform, in launcher/out/
```

Build each platform on its own OS; `Dockerfile.build` covers Linux x64 without a desktop.

To release:

1. Bump `version` in `launcher/package.json`.
2. Publish a GitHub Release tagged `v<version>`.

[`.github/workflows/release.yml`](.github/workflows/release.yml) then builds Windows x64, macOS x64 and ARM64, and Linux x64, and attaches the installers. Once self-update is on, running launchers pick up the new version within a few hours or on their next start.

## Where the launcher keeps its data

| Platform | Folder |
| -------- | ------ |
| Windows | `%APPDATA%\Leptumon-Launcher` |
| macOS | `~/Library/Application Support/Leptumon-Launcher` |
| Linux | `~/.leptumon-launcher` |

That folder holds the Java runtime, the shared Minecraft and NeoForge files, the game folder, the last news feed (`news-cache.json`) and `launcher-logs/`. Game logs are in `{game folder}/logs`.

---

Built and delivered by [Ege on Fiverr](https://fiverr.com/egelosing).
