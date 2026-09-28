/**
 * HTTP routes.
 *
 *   GET    /v1/public/news          Feed the launcher reads: { news: [...] }, newest first
 *   GET    /v1/public/news/:id      One article: { news: {...} }
 *   GET    /v1/admin/session        204 when the admin token is valid
 *   GET    /v1/admin/news           Same list, with stored image values for editing
 *   POST   /v1/admin/news           Create      { title, description, image?, url? }
 *   PUT    /v1/admin/news/:id       Update      (only the fields sent)
 *   DELETE /v1/admin/news/:id       Delete
 *   POST   /v1/admin/images         Upload an image (raw body, image/png|jpeg|webp|gif)
 *   GET    /uploads/:name           Uploaded images
 *   GET    /admin/                  Admin panel
 *   GET    /healthz                 Liveness check
 *
 * Admin routes need `Authorization: Bearer <NEWS_ADMIN_TOKEN>`.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { CONTENT_TYPES, UPLOAD_NAME, UPLOAD_PREFIX } from './uploads.js';
import { validateArticle } from './validate.js';

const ADMIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'admin');

/** Failed admin logins allowed per address before it has to wait. */
const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const ADMIN_PANEL_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  // Articles may use images hosted anywhere over https.
  "img-src 'self' https: data: blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();

const createLoginLimiter = () => {
  const failures = new Map();

  const entryFor = (key) => {
    const entry = failures.get(key);
    if (entry && entry.resetAt > Date.now()) return entry;
    failures.delete(key);
    return null;
  };

  return {
    isBlocked: (key) => (entryFor(key)?.count ?? 0) >= MAX_FAILED_LOGINS,
    recordFailure: (key) => {
      const entry = entryFor(key) ?? { count: 0, resetAt: Date.now() + FAILED_LOGIN_WINDOW_MS };
      entry.count += 1;
      failures.set(key, entry);
      // Keeps the map small on a server that sees many different addresses.
      if (failures.size > 10_000) {
        for (const [ip, value] of failures) if (value.resetAt <= Date.now()) failures.delete(ip);
      }
    },
  };
};

const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const createApp = ({ config, store, uploads }) => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  const expectedToken = sha256(config.adminToken);
  const limiter = createLoginLimiter();

  /** Base URL that uploaded images are served under, as players' launchers will reach it. */
  const baseUrlFor = (req) => {
    if (config.publicUrl) return config.publicUrl;
    const prefix = config.trustProxy ? (req.get('x-forwarded-prefix') ?? '').replace(/\/+$/, '') : '';
    return `${req.protocol}://${req.get('host')}${prefix}`;
  };

  const imageUrl = (image, req) =>
    image && image.startsWith(UPLOAD_PREFIX) ? `${baseUrlFor(req)}/${image}` : image;

  const toPublic = (item, req) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    image: imageUrl(item.image, req),
    url: item.url,
    created_at: item.created_at,
    modified_at: item.modified_at,
  });

  /** The admin panel edits the stored image value but previews the resolved one. */
  const toAdmin = (item, req) => ({ ...item, image_url: imageUrl(item.image, req) });

  /** Deletes an uploaded image once no article shows it any more. */
  const releaseImage = async (image) => {
    if (!image || store.isImageUsed(image)) return;
    try {
      await uploads.remove(image);
    } catch (error) {
      console.warn(`Could not delete unused image ${image}: ${error.message}`);
    }
  };

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Public feed. CORS is open so a website can show the same news.
  // -------------------------------------------------------------------------
  const publicRouter = express.Router();
  publicRouter.use((_req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    });
    next();
  });

  publicRouter.get('/news', (req, res) => {
    res.json({ news: store.list().map((item) => toPublic(item, req)) });
  });

  publicRouter.get('/news/:id', (req, res) => {
    const id = parseId(req.params.id);
    const item = id && store.get(id);
    if (!item) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    res.json({ news: toPublic(item, req) });
  });

  app.use('/v1/public', publicRouter);

  // -------------------------------------------------------------------------
  // Admin API
  // -------------------------------------------------------------------------
  const adminRouter = express.Router();

  adminRouter.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (limiter.isBlocked(req.ip)) {
      res.status(429).json({ error: 'Too many failed logins. Try again in 15 minutes.' });
      return;
    }
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    // Comparing fixed-length digests keeps the check constant-time whatever was sent.
    if (token && crypto.timingSafeEqual(sha256(token), expectedToken)) {
      next();
      return;
    }
    limiter.recordFailure(req.ip);
    res.status(401).json({ error: 'Invalid admin token' });
  });

  adminRouter.get('/session', (_req, res) => {
    res.status(204).end();
  });

  adminRouter.get('/news', (req, res) => {
    res.json({ news: store.list().map((item) => toAdmin(item, req)) });
  });

  adminRouter.get('/news/:id', (req, res) => {
    const id = parseId(req.params.id);
    const item = id && store.get(id);
    if (!item) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    res.json({ news: toAdmin(item, req) });
  });

  adminRouter.post('/news', express.json({ limit: '64kb' }), async (req, res) => {
    const { fields, errors } = validateArticle(req.body);
    if (errors.length) {
      res.status(400).json({ error: errors.join('; ') });
      return;
    }
    const item = await store.create(fields);
    res.status(201).json({ news: toAdmin(item, req) });
  });

  adminRouter.put('/news/:id', express.json({ limit: '64kb' }), async (req, res) => {
    const id = parseId(req.params.id);
    const before = id && store.get(id);
    if (!before) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    const { fields, errors } = validateArticle(req.body, { partial: true });
    if (errors.length) {
      res.status(400).json({ error: errors.join('; ') });
      return;
    }
    const item = await store.update(id, fields);
    if (!item) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    if (before.image !== item.image) await releaseImage(before.image);
    res.json({ news: toAdmin(item, req) });
  });

  adminRouter.delete('/news/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const removed = id && (await store.remove(id));
    if (!removed) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    await releaseImage(removed.image);
    res.status(204).end();
  });

  adminRouter.post(
    '/images',
    express.raw({ type: Object.values(CONTENT_TYPES), limit: config.maxImageBytes }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(415).json({ error: 'Send the image as the request body with an image/png, image/jpeg, image/webp or image/gif type' });
        return;
      }
      const image = await uploads.save(req.body);
      if (!image) {
        res.status(415).json({ error: 'Only PNG, JPEG, WebP and GIF images are accepted' });
        return;
      }
      res.status(201).json({ image, image_url: imageUrl(image, req) });
    },
  );

  app.use('/v1/admin', adminRouter);

  // -------------------------------------------------------------------------
  // Uploaded images and the admin panel
  // -------------------------------------------------------------------------
  app.get('/uploads/:name', (req, res, next) => {
    const { name } = req.params;
    if (!UPLOAD_NAME.test(name)) {
      next();
      return;
    }
    const extension = name.slice(name.lastIndexOf('.') + 1);
    res.sendFile(name, {
      root: uploads.dir,
      headers: {
        'Content-Type': CONTENT_TYPES[extension],
        'Content-Security-Policy': "default-src 'none'",
        // Names are content hashes, so a file never changes.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }, (error) => {
      if (error && !res.headersSent) next();
    });
  });

  // Relative redirects keep working when a reverse proxy serves this under a sub-path.
  app.get('/', (_req, res) => res.redirect('admin/'));
  app.use('/admin', (req, res, next) => {
    // "/admin" without the slash would resolve the panel's relative links one level too high.
    if (req.path === '/' && !req.originalUrl.split('?')[0].endsWith('/')) {
      res.redirect('admin/');
      return;
    }
    res.set({
      'Content-Security-Policy': ADMIN_PANEL_CSP,
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-cache',
    });
    next();
  }, express.static(ADMIN_DIR, { redirect: false }));

  // -------------------------------------------------------------------------
  // Errors
  // -------------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    const status = Number(error.status || error.statusCode) || 500;
    if (status >= 500) console.error(error);
    const message = status === 413
      ? 'Too large'
      : status === 400 && error.type === 'entity.parse.failed'
        ? 'Invalid JSON'
        : status >= 500 ? 'Internal server error' : error.message;
    res.status(status).json({ error: message });
  });

  return app;
};
