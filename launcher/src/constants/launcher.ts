/** Shared launcher identity strings (HTTP headers, logs, game process metadata). */
export const LAUNCHER_NAME = 'Leptumon-Launcher';
export const LAUNCHER_DISPLAY_NAME = 'Leptumon Launcher';

/** Brand name shown in the UI and used for the game instance folder. */
export const BRAND_NAME = 'Leptumon';

/** Microsoft OAuth redirect registered in Azure AD. */
export const MICROSOFT_REDIRECT_URI = 'http://localhost:59016/auth/callback';

/**
 * RAM allocation bounds, in MB. All the Mons is a ~500 mod pack; below 6 GB it
 * stutters and runs out of memory. The floor is still capped by the machine's
 * physical memory (see normalizeRamMb) so low-RAM machines get what they have.
 */
export const RAM_MIN_MB = 6144; // 6 GB, the modpack floor
export const RAM_RECOMMENDED_MB = 8192;
export const RAM_MAX_MB = 32768; // 32 GB ceiling
export const RAM_OS_HEADROOM_MB = 512; // leave this much for the OS when sizing to system memory
export const RAM_STEP_MB = 4; // align allocations to 4 MB steps

/** Default user settings on first run and after "Reset settings". */
export const DEFAULT_USER_SETTINGS = {
  ram: RAM_RECOMMENDED_MB,
  minimizeOnLaunch: false,
  autoJoinServer: true,
  jvmArgs: '',
} as const;
