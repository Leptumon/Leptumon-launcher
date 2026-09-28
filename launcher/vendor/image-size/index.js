'use strict';

/**
 * Shim for appdmg 0.6.6 (the DMG maker), which pins image-size ^0.7 and reads
 * the DMG background size with `sizeOf(path, callback)`. image-size <=2.0.2 has
 * denial-of-service advisories (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq) and
 * 2.x changed the API, so this keeps the old call shape on top of the fixed 2.x.
 */
const { imageSizeFromFile } = require('image-size-v2/fromFile');

module.exports = function sizeOf(filePath, callback) {
  if (typeof callback !== 'function') {
    throw new Error('image-size (vendor): only the callback form sizeOf(path, callback) is supported');
  }
  imageSizeFromFile(filePath).then((size) => callback(null, size), callback);
};
