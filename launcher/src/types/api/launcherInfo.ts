/** Build-time launcher details the renderer needs (from client-config.json + package version). */
export interface LauncherInfo {
  version: string;
  serverName: string;
  serverAddress: string;
  links: {
    discord: string;
    store: string;
  };
  /** Whether a modpack project + file are configured, i.e. Play can install the game. */
  modpackConfigured: boolean;
}
