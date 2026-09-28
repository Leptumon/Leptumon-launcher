/**
 * Shape of persisted user settings (electron-store).
 * Build-time values (server, modpack, links) live in ClientConfig, not here.
 */
import type { Locale } from '../../i18n';

export type LauncherConfig = {
    /**
     * Single stored account.
     */
    auth?: AuthConfig;
    ram: number;
    minimizeOnLaunch?: boolean;
    /** Join the Leptumon server straight from the title screen. */
    autoJoinServer?: boolean;
    /** Optional extra JVM arguments (space-separated). */
    jvmArgs?: string;
    /** UI language; detected from the system on first run (French if unsupported), changeable in Settings. */
    language?: Locale;
};

export interface AuthConfig {
    loginType: 'microsoft' | 'offline' | undefined;
    username: string;
    uuid: string;
    refreshToken: string;
}
