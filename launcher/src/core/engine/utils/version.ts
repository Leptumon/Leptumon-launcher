/** Minecraft release version comparison (1.x.y). Snapshots are not supported. */

const parseRelease = (version: string): [number, number, number] | null => {
    const match = version.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
};

/**
 * True when `version` is the same as or newer than `target`
 * (e.g. isVersionAtLeast('1.21.1', '1.20') → true). Unparseable input → false.
 */
export function isVersionAtLeast(version: string, target: string): boolean {
    const a = parseRelease(version);
    const b = parseRelease(target);
    if (!a || !b) return false;

    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return true;
}
