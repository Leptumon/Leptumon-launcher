/**
 * Download queue manager
 * 
 * Manages parallel downloads with retry, progress tracking, and SHA1 verification.
 */

import { createWriteStream, createReadStream } from 'fs';
import { mkdir, access, stat, rename, unlink } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

import { TypedEventEmitter } from '../types/emitter';
import type { DownloadProgress } from '../types/events';

import type { DownloadTask, DownloadOptions } from './types';

// ============================================================================
// Types
// ============================================================================

interface DownloadQueueEvents {
    [key: string]: unknown;
    progress: DownloadProgress;
    complete: { task: DownloadTask; cached: boolean };
    error: { task: DownloadTask; error: Error };
    done: void;
}

const DEFAULT_OPTIONS: Required<DownloadOptions> = {
    maxParallel: 5,
    retries: 3,
    timeout: 30000,
};

// ============================================================================
// Download Queue
// ============================================================================

/**
 * A parallel download queue with progress tracking and verification.
 */
export class DownloadQueue extends TypedEventEmitter<DownloadQueueEvents> {
    private queue: DownloadTask[] = [];
    private active = 0;
    private completed = 0;
    private failed = 0;
    private totalSize = 0;
    private downloadedSize = 0;
    private options: Required<DownloadOptions> & { signal?: AbortSignal };
    private aborted = false;

    constructor(options: DownloadOptions & { signal?: AbortSignal } = {}) {
        super();
        this.options = { ...DEFAULT_OPTIONS, ...options };
        if (this.options.signal) {
            this.options.signal.addEventListener('abort', () => this.abort());
        }
    }

    /**
     * Add tasks to the queue.
     */
    add(tasks: DownloadTask | DownloadTask[]): void {
        const tasksArray = Array.isArray(tasks) ? tasks : [tasks];
        this.queue.push(...tasksArray);

        // Update total size for progress tracking
        for (const task of tasksArray) {
            if (task.size) {
                this.totalSize += task.size;
            }
        }
    }

    /**
     * Get the number of tasks in the queue.
     */
    get pending(): number {
        return this.queue.length;
    }

    /**
     * Get the number of active downloads.
     */
    get running(): number {
        return this.active;
    }

    /**
     * Abort all downloads.
     */
    abort(): void {
        this.aborted = true;
    }

    /**
     * Start processing the queue.
     */
    async start(): Promise<{ completed: number; failed: number }> {
        this.aborted = this.options.signal?.aborted ?? false;
        this.completed = 0;
        this.failed = 0;

        while ((this.queue.length > 0 || this.active > 0) && !this.aborted) {
            // Start new downloads up to maxParallel
            while (this.active < this.options.maxParallel && this.queue.length > 0 && !this.aborted) {
                const task = this.queue.shift();
                if (task) {
                    this.active++;
                    void this.processTask(task);
                }
            }

            // Wait a bit before checking again
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        while (this.active > 0) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        await this.emit('done', undefined);
        return { completed: this.completed, failed: this.failed };
    }

    /**
     * Process a single download task.
     */
    private async processTask(task: DownloadTask): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.options.retries; attempt++) {
            if (this.aborted) break;

            try {
                if (await this.verifyExistingFile(task)) {
                    this.completed++;
                    if (task.size) {
                        this.downloadedSize += task.size;
                    }
                    await this.emit('complete', { task, cached: true });
                    this.active--;
                    return;
                }

                // Download the file
                await this.downloadFile(task);

                // Verify hash if provided
                if (task.sha1) {
                    const actualHash = await this.computeFileHash(task.destination);
                    if (actualHash !== task.sha1) {
                        try {
                            await unlink(task.destination);
                        } catch {
                            // Ignore cleanup errors; the next retry will fail verification if it remains.
                        }
                        throw new Error(`SHA1 mismatch: expected ${task.sha1}, got ${actualHash}`);
                    }
                }

                this.completed++;
                await this.emit('complete', { task, cached: false });
                this.active--;
                return;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Wait before retry (exponential backoff)
                if (attempt < this.options.retries) {
                    await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }

        // All retries exhausted
        try {
            await unlink(task.destination);
        } catch {
            // Ignore cleanup errors.
        }
        this.failed++;
        await this.emit('error', { task, error: lastError ?? new Error('Unknown error') });
        this.active--;
    }

    /**
     * Check if a file already exists with the correct hash.
     */
    private async verifyExistingFile(task: DownloadTask): Promise<boolean> {
        try {
            await access(task.destination);

            // Check size if provided
            if (task.size) {
                const stats = await stat(task.destination);
                if (stats.size !== task.size) {
                    return false;
                }
            }

            // Check hash if provided
            if (task.sha1) {
                const actualHash = await this.computeFileHash(task.destination);
                if (actualHash !== task.sha1) {
                    return false;
                }
            }

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Compute SHA1 hash of a file.
     */
    private async computeFileHash(filePath: string): Promise<string> {
        const hash = createHash('sha1');
        const stream = createReadStream(filePath);

        for await (const chunk of stream) {
            hash.update(chunk);
        }

        return hash.digest('hex');
    }

    /**
     * Download a file with progress tracking.
     */
    private async downloadFile(task: DownloadTask): Promise<void> {
        // Ensure directory exists
        const dir = path.dirname(task.destination);
        await mkdir(dir, { recursive: true });

        // Use a temp file during download
        const tempPath = `${task.destination}.tmp`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

        const fetchOptions: RequestInit = {
            signal: controller.signal // Only use internal signal here for now
        };

        // If externally aborted, we want to stop. Fetch API doesn't support multiple signals directly easily without polyfill
        // But our processTask loops actively check `this.aborted`
        // We can manually abort the controller if external signal fires
        const abortHandler = () => controller.abort();
        if (this.options.signal) {
            this.options.signal.addEventListener('abort', abortHandler, { once: true });
        }

        try {
            const response = await fetch(task.url, fetchOptions);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
            let downloaded = 0;
            const startTime = Date.now();

            // Create a transform stream for progress tracking
            const reader = response.body.getReader();
            const readable = new Readable({
                async read() {
                    try {
                        const { done, value } = await reader.read();
                        if (done) {
                            this.push(null);
                        } else {
                            downloaded += value.length;

                            // Emit progress
                            const elapsed = (Date.now() - startTime) / 1000;
                            const speed = elapsed > 0 ? downloaded / elapsed : 0;
                            const total = contentLength || task.size || 0;
                            const percentage = total > 0 ? (downloaded / total) * 100 : 0;

                            void this.emit('progress', {
                                total,
                                current: downloaded,
                                percentage,
                                speed,
                                file: task.destination,
                            });

                            this.push(value);
                        }
                    } catch (err) {
                        this.destroy(err instanceof Error ? err : new Error(String(err)));
                    }
                },
            });

            // Bind emit to queue instance
            const emitFn = this.emit.bind(this);
            readable.emit = function (event: string | symbol, ...args: unknown[]) {
                if (event === 'progress') {
                    void emitFn('progress', args[0] as DownloadProgress);
                }
                return Readable.prototype.emit.apply(this, [event, ...args]);
            };

            const writeStream = createWriteStream(tempPath);
            await pipeline(readable, writeStream);

            // Move temp file to final destination
            await rename(tempPath, task.destination);

            // Update downloaded size for overall progress
            if (task.size) {
                this.downloadedSize += task.size;
            }

        } catch (error) {
            // Clean up temp file on error
            try {
                await unlink(tempPath);
            } catch {
                // Ignore cleanup errors
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
            if (this.options.signal) {
                this.options.signal.removeEventListener('abort', abortHandler);
            }
        }
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Downloads a single file with no queue management.
 * 
 * @param url - URL to download from.
 * @param destination - Path to save the file.
 * @param options - Download options.
 */
export async function downloadFile(
    url: string,
    destination: string,
    options: { sha1?: string; timeout?: number } = {}
): Promise<void> {
    const queue = new DownloadQueue({ maxParallel: 1, timeout: options.timeout ?? 30000 });
    queue.add({ url, destination, sha1: options.sha1 });

    const result = await queue.start();
    if (result.failed > 0) {
        throw new Error(`Failed to download: ${url}`);
    }
}

/**
 * Progress info for download callbacks.
 */
export interface DownloadProgressInfo {
    total: number;
    current: number;
    percentage: number;
    speed: number;
}

/**
 * Downloads a large file (like JDKs) with progress callback and extended timeout.
 * 
 * @param url - URL to download from.
 * @param destination - Path to save the file.
 * @param onProgress - Progress callback.
 * @param timeout - Timeout in ms (default 5 minutes).
 */
export async function downloadLargeFile(
    url: string,
    destination: string,
    onProgress?: (progress: DownloadProgressInfo) => void,
    timeout: number = 300000 // 5 minutes default
): Promise<void> {
    const queue = new DownloadQueue({ maxParallel: 1, timeout });
    queue.add({ url, destination });

    if (onProgress) {
        queue.on('progress', (p) => {
            onProgress({
                total: p.total,
                current: p.current,
                percentage: p.percentage,
                speed: p.speed,
            });
        });
    }

    const result = await queue.start();
    if (result.failed > 0) {
        throw new Error(`Failed to download: ${url}`);
    }
}
