/** Launcher self-update state pushed from main/updater.ts to the renderer. */
export type UpdateStatus =
  | 'idle'
  | 'disabled' // no githubRepo configured, or a dev build
  | 'checking'
  | 'up-to-date'
  | 'downloading'
  | 'ready' // downloaded, applied on restart
  | 'manual' // newer release exists but this platform installs it by hand (Linux)
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  /** Download progress, 0 to 100. */
  progress?: number;
  releaseUrl?: string;
  error?: string;
}
