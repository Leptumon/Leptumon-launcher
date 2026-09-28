/**
 * Downloader types
 */

export interface DownloadTask {
    url: string;
    destination: string;
    sha1?: string;
    size?: number;
}

export interface DownloadOptions {
    maxParallel?: number;
    retries?: number;
    timeout?: number;
}
