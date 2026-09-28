/** Azul Zulu JDK download URL resolver (fallback for some ARM64 macOS builds). */
import { getMinecraftOsName, getMinecraftArch } from '../types/platform';

/**
 * Resolves the download URL for an Azul Zulu JDK.
 * 
 * Zulu is preferred for ARM64 Java 8 on macOS since Adoptium
 * doesn't provide Java 8 for ARM64 macOS.
 * 
 * @param version - The major Java version (e.g., 8, 17, 21).
 * @param os - The OS (defaults to current).
 * @param arch - The architecture (defaults to current).
 * @returns The download URL.
 */
export function resolveZuluUrl(
    version: number,
    os: string = getMinecraftOsName(),
    arch: string = getMinecraftArch()
): string {
    // Map to Zulu naming conventions
    const zuluOs = os === 'osx' ? 'macos' : os === 'windows' ? 'win' : os;
    const zuluArch = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x64' : 'i686';
    const ext = os === 'windows' ? 'zip' : 'tar.gz';
    const bundle = os === 'osx' ? 'jdk' : 'jdk'; // macOS uses .tar.gz for JDK

    // Zulu CDN URL format
    // https://cdn.azul.com/zulu/bin/zulu{zulu_version}-ca-jdk{java_version}-{os}_{arch}.{ext}
    // We use the API to get the latest URL
    return `https://api.azul.com/metadata/v1/zulu/packages/?java_version=${version}&os=${zuluOs}&arch=${zuluArch}&archive_type=${ext}&java_package_type=jdk&javafx_bundled=false&release_status=ga&availability_types=CA&certifications=tck&page=1&page_size=1`;
}

/**
 * Fetches the actual download URL from the Azul Zulu API.
 * 
 * @param version - The major Java version.
 * @param os - The OS.
 * @param arch - The architecture.
 * @returns The direct download URL.
 */
export async function fetchZuluDownloadUrl(
    version: number,
    os: string = getMinecraftOsName(),
    arch: string = getMinecraftArch()
): Promise<string> {
    const zuluOs = os === 'osx' ? 'macos' : os === 'windows' ? 'win' : os;
    const zuluArch = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x64' : 'i686';
    const ext = os === 'windows' ? 'zip' : 'tar.gz';

    const apiUrl = `https://api.azul.com/metadata/v1/zulu/packages/?java_version=${version}&os=${zuluOs}&arch=${zuluArch}&archive_type=${ext}&java_package_type=jdk&javafx_bundled=false&release_status=ga&availability_types=CA&certifications=tck&page=1&page_size=1`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch Zulu API: ${response.status}`);
    }

    const data = await response.json() as Array<{ download_url: string }>;
    if (!data || data.length === 0) {
        throw new Error(`No Zulu JDK found for Java ${version} ${os} ${arch}`);
    }

    return data[0]!.download_url;
}

/**
 * Checks if Zulu should be preferred for the given configuration.
 * Zulu is preferred for ARM64 macOS when Adoptium doesn't have the version:
 * - Java 8: Adoptium doesn't have ARM64 macOS
 * - Java 16: Adoptium doesn't have ARM64 macOS (short-lived version)
 */
export function shouldPreferZulu(version: number, os: string, arch: string): boolean {
    // Versions Adoptium doesn't have for ARM64 macOS
    const versionsNeedingZulu = [8, 16];
    return versionsNeedingZulu.includes(version) && os === 'osx' && arch === 'arm64';
}
