/** Eclipse Adoptium (Temurin) JDK download URL resolver. */
import { getMinecraftOsName, getMinecraftArch } from '../types/platform';

/**
 * Resolves the download URL for an Eclipse Adoptium (Temurin) JDK.
 * 
 * @param version - The major Java version (e.g., 8, 17, 21).
 * @param os - The OS (defaults to current).
 * @param arch - The architecture (defaults to current).
 * @returns The download URL.
 */
export function resolveAdoptiumUrl(
    version: number,
    os: string = getMinecraftOsName(),
    arch: string = getMinecraftArch()
): string {
    const adoptiumOs = os === 'osx' ? 'mac' : os;

    let adoptiumArch = arch;
    // Map Minecraft/Node arch to Adoptium arch
    if (arch === 'x86') adoptiumArch = 'x32';
    if (arch === 'arm64') adoptiumArch = 'aarch64';

    // API v3: binary/latest/{feature_version}/{release_type}/{os}/{arch}/{image_type}/{jvm_impl}/{heap_size}/{vendor}
    return `https://api.adoptium.net/v3/binary/latest/${version}/ga/${adoptiumOs}/${adoptiumArch}/jdk/hotspot/normal/eclipse`;
}
