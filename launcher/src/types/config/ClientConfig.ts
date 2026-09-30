/**
 * Build-time config baked into the app (launcher/src/assets/client-config.json).
 * Players cannot override it. Change it and ship a new launcher release, which
 * existing installs pick up through the self-updater.
 */
export type ClientConfig = {
  /**
   * Microsoft Azure app (client) ID. Must allow personal Microsoft accounts and
   * register http://localhost:59016/auth/callback as a redirect URI.
   */
  microsoftClientId: string;
  /** Hosted pack manifest. When set, it is used instead of CurseForge. */
  modpack: {
    /**
     * HTTPS URL of the manifest.json made by scripts/generate-pack-manifest.mjs.
     * Fetched on every Play, so publishing a new manifest updates players without a launcher release.
     */
    manifestUrl: string;
  };
  /** The CurseForge modpack game setup installs when no manifest is configured. */
  curseforge: {
    /** CurseForge Core API key from https://console.curseforge.com. */
    apiKey: string;
    /** Modpack project ID (All the Mons = 1356598). */
    projectId: number | null;
    /**
     * Exact modpack file (release) ID to install. The launcher never picks
     * "latest" on its own; bump this to roll players onto a new pack version.
     */
    fileId: number | null;
  };
  /** Minecraft server shown on the home screen and joined on launch. */
  server: {
    /** Display name, also used for the multiplayer list entry. */
    name: string;
    /** `host` or `host:port`. Empty until the server address is known. */
    address: string;
  };
  links: {
    discord: string;
    store: string;
  };
  /** News panel on the home screen, next to the launch card. */
  news: {
    /**
     * HTTPS URL of the feed: the news API's `/v1/public/news` endpoint, or a
     * static `news.json` hosted anywhere (see news-api/README.md). Both return
     * `{ "news": [...] }`. Empty hides the panel.
     */
    url: string;
  };
  updates: {
    /** `owner/repo` whose GitHub Releases host launcher builds. Empty disables self-update. */
    githubRepo: string;
  };
  /**
   * Optional admin-side visibility into who is playing. When set, the launcher
   * POSTs the player's Minecraft username, UUID and login type to `trackingUrl`
   * (your own log_launch.php endpoint) right after a successful login, each
   * time Play is pressed. `trackingSecret` is sent as the X-Telemetry-Secret
   * header and must match the one in that endpoint's config.php. Note this
   * secret ships inside the launcher, so treat it as spam-filtering, not a
   * true secret. Empty `trackingUrl` disables the whole thing.
   */
  telemetry: {
    trackingUrl: string;
    trackingSecret: string;
  };
};
