/**
 * Signed-in player's head for <img src>, shared by every screen.
 *
 * The main process serves it from a disk cache (main/avatarCache.ts), and the
 * last value is kept in memory so remounting a page never flashes. Until a
 * head is known this returns a transparent pixel, never a default skin.
 */
import { useEffect, useSyncExternalStore } from 'react';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let current: string | null = null;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setCurrent = (dataUrl: string | null): void => {
    if (dataUrl === current) return;
    current = dataUrl;
    listeners.forEach((listener) => listener());
};

window.electron.onAvatarUpdated((dataUrl) => {
    request = null;
    setCurrent(dataUrl);
});

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const getSnapshot = () => current ?? TRANSPARENT_PIXEL;

export const useAvatar = (): string => {
    useEffect(() => {
        if (current || request) return;
        request = window.electron
            .getAvatar()
            .then(setCurrent)
            .catch((error) => window.electron.log('warn', `Failed to load avatar: ${(error as Error).message}`))
            .finally(() => {
                request = null;
            });
    }, []);

    return useSyncExternalStore(subscribe, getSnapshot);
};
