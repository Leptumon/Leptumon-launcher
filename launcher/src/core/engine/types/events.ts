/**
 * Event system types
 */

export interface DownloadProgress {
    total: number;
    current: number;
    percentage: number;
    speed: number; // bytes per second
    file: string;
}

export interface LaunchEvent {
    type: 'starting' | 'running' | 'exited';
    exitCode?: number;
    error?: string;
}
