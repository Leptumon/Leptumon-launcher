/**
 * CurseForge Core API client (https://docs.curseforge.com/rest-api/).
 *
 * Only what game setup needs: modpack file lookup, batched mod/file metadata,
 * and download-URL resolution. Every request carries the `x-api-key` from
 * client-config.json.
 */
const API_BASE = 'https://api.curseforge.com';
/** CurseForge caps batched lookups; stay well under it. */
const BATCH_SIZE = 500;
const MAX_ATTEMPTS = 3;

/** CurseForge project classes the installer knows where to put. */
export const CURSEFORGE_CLASS = {
    mods: 6,
    resourcePacks: 12,
    shaders: 6552,
} as const;

export interface CurseForgeFile {
    id: number;
    modId: number;
    displayName: string;
    fileName: string;
    fileLength: number;
    /** Null when the author disabled third-party distribution (or CF withholds it). */
    downloadUrl: string | null;
}

export interface CurseForgeMod {
    id: number;
    name: string;
    slug: string;
    classId: number | null;
    allowModDistribution: boolean | null;
    links?: { websiteUrl?: string };
}

export class CurseForgeApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'CurseForgeApiError';
    }
}

const chunk = <T>(items: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CurseForgeClient {
    constructor(private readonly apiKey: string, private readonly userAgent: string) {}

    /** Retries network failures, 429 and 5xx; other HTTP errors fail immediately. */
    private async request<T>(method: 'GET' | 'POST', route: string, body?: unknown, signal?: AbortSignal): Promise<T> {
        let lastError: Error = new Error(`CurseForge API ${method} ${route} failed`);

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            let response: Response;
            try {
                response = await fetch(`${API_BASE}${route}`, {
                    method,
                    signal,
                    headers: {
                        'x-api-key': this.apiKey,
                        Accept: 'application/json',
                        'User-Agent': this.userAgent,
                        ...(body ? { 'Content-Type': 'application/json' } : {}),
                    },
                    body: body ? JSON.stringify(body) : undefined,
                });
            } catch (error) {
                if ((error as Error).name === 'AbortError') throw error;
                lastError = error as Error;
                await sleep(attempt * 1500);
                continue;
            }

            if (response.ok) {
                return ((await response.json()) as { data: T }).data;
            }

            lastError = new CurseForgeApiError(`CurseForge API ${method} ${route} failed: HTTP ${response.status}`, response.status);
            if (response.status !== 429 && response.status < 500) throw lastError;
            await sleep(attempt * 1500);
        }

        throw lastError;
    }

    getModFile(modId: number, fileId: number, signal?: AbortSignal): Promise<CurseForgeFile> {
        return this.request<CurseForgeFile>('GET', `/v1/mods/${modId}/files/${fileId}`, undefined, signal);
    }

    /**
     * Asks CurseForge for a download URL when the file metadata omitted one.
     * Returns null when the author does not allow third-party downloads.
     */
    async getDownloadUrl(modId: number, fileId: number, signal?: AbortSignal): Promise<string | null> {
        try {
            const url = await this.request<string>('GET', `/v1/mods/${modId}/files/${fileId}/download-url`, undefined, signal);
            return typeof url === 'string' && url.startsWith('https://') ? url : null;
        } catch (error) {
            if (error instanceof CurseForgeApiError && (error.status === 403 || error.status === 404)) return null;
            throw error;
        }
    }

    async getFiles(fileIds: number[], signal?: AbortSignal): Promise<CurseForgeFile[]> {
        const results: CurseForgeFile[] = [];
        for (const ids of chunk(fileIds, BATCH_SIZE)) {
            results.push(...await this.request<CurseForgeFile[]>('POST', '/v1/mods/files', { fileIds: ids }, signal));
        }
        return results;
    }

    async getMods(modIds: number[], signal?: AbortSignal): Promise<CurseForgeMod[]> {
        const results: CurseForgeMod[] = [];
        for (const ids of chunk(modIds, BATCH_SIZE)) {
            results.push(...await this.request<CurseForgeMod[]>('POST', '/v1/mods', { modIds: ids }, signal));
        }
        return results;
    }
}
