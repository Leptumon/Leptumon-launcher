#!/usr/bin/env node
/**
 * Replaces the "__TRACKING_SECRET__" placeholder in src/assets/client-config.json
 * with the real value from the TRACKING_SECRET environment variable.
 *
 * Runs in CI (see .github/workflows/release.yml), right after `npm ci` and
 * before `npm run make`, so the real secret is baked into the compiled app
 * without ever being committed to the (public) repo. Locally, the placeholder
 * is left as-is — set TRACKING_SECRET yourself before `npm start` if you need
 * to test the telemetry feature end to end.
 */
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'src', 'assets', 'client-config.json');
const secret = process.env.TRACKING_SECRET;

if (!secret) {
  console.log('[inject-secret] TRACKING_SECRET not set, leaving client-config.json untouched.');
  process.exit(0);
}

const raw = fs.readFileSync(configPath, 'utf8');
if (!raw.includes('__TRACKING_SECRET__')) {
  console.log('[inject-secret] No __TRACKING_SECRET__ placeholder found, nothing to do.');
  process.exit(0);
}

fs.writeFileSync(configPath, raw.split('__TRACKING_SECRET__').join(secret), 'utf8');
console.log('[inject-secret] Tracking secret injected into client-config.json.');