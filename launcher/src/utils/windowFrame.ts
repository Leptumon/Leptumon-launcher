/**
 * Tags <html> with the platform and whether the window fills the screen, for the
 * rounded-corner rules in styles/main.scss. On Windows and Linux the window is
 * frameless and transparent, so the page rounds its own corners; they go square
 * while maximized or fullscreen. macOS keeps its native corners.
 */
export const trackWindowFrame = (): void => {
    const root = document.documentElement;
    root.dataset.platform = window.electron.platform;

    const apply = ({ filled }: { filled: boolean }) => {
        root.dataset.windowFilled = String(filled);
    };
    window.electron.getWindowState().then(apply).catch(() => {});
    window.electron.onWindowState(apply);
};
