/** Launcher-specific error types thrown by the game engine. */
export class LauncherError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LauncherError';
    }
}

export class LauncherDownloadError extends LauncherError {
    constructor(message: string) {
        super(message);
        this.name = 'LauncherDownloadError';
    }
}

export class LauncherLaunchError extends LauncherError {
    constructor(message: string) {
        super(message);
        this.name = 'LauncherLaunchError';
    }
}