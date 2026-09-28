/** Locates the java executable inside an extracted JDK directory tree. */
import path from 'path';
import type { Dirent } from 'fs';
import { access, readdir } from 'fs/promises';

function javaBinaryName(osName?: string): string {
    return osName === 'windows' || osName === 'win32' ? 'java.exe' : 'java';
}

async function canAccess(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

function javaExecutableCandidates(installDir: string, binaryName: string): string[] {
    return [
        path.join(installDir, 'bin', binaryName),
        path.join(installDir, 'Contents', 'Home', 'bin', binaryName),
    ];
}

/**
 * Resolves Java after extraction. macOS JDK archives can leave one wrapper
 * directory behind (`jdk-*.jdk/Contents/Home/bin/java`) if the archive starts
 * with `./`, so managed installs need to tolerate that shape too.
 */
export async function resolveJavaExecutable(
    installDir: string,
    osName?: string
): Promise<string | null> {
    const binaryName = javaBinaryName(osName);

    for (const candidate of javaExecutableCandidates(installDir, binaryName)) {
        if (await canAccess(candidate)) return candidate;
    }

    let entries: Dirent[];
    try {
        entries = await readdir(installDir, { withFileTypes: true });
    } catch {
        return null;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const nestedDir = path.join(installDir, entry.name);
        for (const candidate of javaExecutableCandidates(nestedDir, binaryName)) {
            if (await canAccess(candidate)) return candidate;
        }
    }

    return null;
}

export function defaultJavaExecutablePath(installDir: string, osName?: string): string {
    return path.join(installDir, 'bin', javaBinaryName(osName));
}
