/** Java runtime metadata after download/extract (path, version, platform). */
export interface JavaRuntimeInfo {
    /** Java major version (e.g. 8, 17, 21) */
    majorVersion: number;
    /** Platform OS (windows, mac, linux) */
    os: string;
    /** Architecture (x64, x86, arm64) */
    arch: string;
    /** Path to the Java executable binary */
    executablePath: string;
    /** Path to the installation directory */
    installPath: string;
}

export interface JavaDownloadOptions {
    /** Java major version to download */
    majorVersion: number;
    /** Checksum validation (if known) */
    checksum?: string;
    /** Force redownload even if exists */
    force?: boolean;
    /** Platform override */
    os?: 'windows' | 'osx' | 'linux';

    /** Architecture override */
    arch?: 'x64' | 'x86' | 'arm64';
    /** Destination directory (base for jdk/{version}) */
    destination?: string;
    /** Progress callback (0-100) */
    onProgress?: (progress: number) => void;
}
