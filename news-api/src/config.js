/**
 * Settings from environment variables (or a .env file next to package.json).
 * See .env.example for what each one does.
 */
import path from 'node:path';

const MIN_TOKEN_LENGTH = 24;

/** Parses TRUST_PROXY the way Express expects: a hop count, true/false, or a name like "loopback". */
const parseTrustProxy = (value) => {
  if (!value) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
};

export const loadConfig = (env = process.env) => {
  const adminToken = (env.NEWS_ADMIN_TOKEN ?? '').trim();
  if (adminToken.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `NEWS_ADMIN_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    );
  }

  const publicUrl = (env.PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  if (publicUrl && !/^https?:\/\/[^/]/i.test(publicUrl)) {
    throw new Error('PUBLIC_URL must start with https:// (or http:// for local testing).');
  }

  const maxImageMb = Number(env.MAX_IMAGE_MB ?? 5);

  return {
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 8787),
    adminToken,
    dataDir: path.resolve(env.DATA_DIR || 'data'),
    publicUrl,
    trustProxy: parseTrustProxy((env.TRUST_PROXY ?? '').trim()),
    maxImageBytes: Math.max(1, Number.isFinite(maxImageMb) ? maxImageMb : 5) * 1024 * 1024,
  };
};
