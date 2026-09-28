'use strict';

/**
 * Stand-in for extract-zip 2.0.1, used by @electron/packager 18 (Electron Forge 7)
 * to unpack the Electron zip. 2.0.1 is the last release and has unpatched
 * symlink path-traversal advisories (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3).
 *
 * This forwards to @electron-internal/extract-zip, the hardened extractor
 * @electron/packager 20 switched to. It is ESM-only, hence the dynamic import.
 * Only `dir` is supported, which is all packager passes; anything else throws
 * rather than being silently ignored.
 */
module.exports = async function extractZip(zipPath, opts = {}) {
  const unsupported = Object.keys(opts).filter((key) => key !== 'dir');
  if (unsupported.length > 0) {
    throw new Error(`extract-zip (vendor): unsupported option(s): ${unsupported.join(', ')}`);
  }
  const { extract } = await import('@electron-internal/extract-zip');
  return extract(zipPath, { dir: opts.dir });
};
