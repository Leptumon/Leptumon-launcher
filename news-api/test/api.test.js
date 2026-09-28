import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { NewsStore } from '../src/store.js';
import { UploadStore } from '../src/uploads.js';

const TOKEN = 'test-token-0123456789abcdefghij';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let dataDir;
let server;
let base;

const start = async () => {
  const config = loadConfig({ NEWS_ADMIN_TOKEN: TOKEN, DATA_DIR: dataDir, PUBLIC_URL: 'https://news.example.com/' });
  const store = new NewsStore(config.dataDir);
  const uploads = new UploadStore(config.dataDir);
  await store.load();
  await uploads.init();
  server = createApp({ config, store, uploads }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
};

const stop = () => new Promise((resolve) => server.close(resolve));

const admin = (route, init = {}) =>
  fetch(`${base}/v1/admin${route}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init.headers },
  });

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leptumon-news-'));
  await start();
});

after(async () => {
  await stop();
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('refuses to start with a short admin token', () => {
  assert.throws(() => loadConfig({ NEWS_ADMIN_TOKEN: 'short' }), /at least 24/);
});

test('starts with an empty feed', async () => {
  const res = await fetch(`${base}/v1/public/news`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await res.json(), { news: [] });
});

test('admin routes need the token', async () => {
  assert.equal((await fetch(`${base}/v1/admin/session`)).status, 401);
  assert.equal((await fetch(`${base}/v1/admin/session`, { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await admin('/session')).status, 204);
});

test('validates articles', async () => {
  const missing = await admin('/news', { method: 'POST', body: JSON.stringify({ title: 'Only a title' }) });
  assert.equal(missing.status, 400);

  const badLink = await admin('/news', {
    method: 'POST',
    body: JSON.stringify({ title: 'T', description: 'D', url: 'http://insecure.example.com' }),
  });
  assert.equal(badLink.status, 400);
  assert.match((await badLink.json()).error, /https/);

  const badJson = await admin('/news', { method: 'POST', body: '{nope' });
  assert.equal(badJson.status, 400);
});

test('creates, lists, updates and deletes articles, and keeps them on disk', async () => {
  const upload = await admin('/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(upload.status, 201);
  const { image, image_url: imageUrl } = await upload.json();
  assert.match(image, /^uploads\/[a-f0-9]{32}\.png$/);
  assert.equal(imageUrl, `https://news.example.com/${image}`);

  const served = await fetch(`${base}/${image}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);

  const first = await admin('/news', {
    method: 'POST',
    body: JSON.stringify({ title: '  Bienvenue  ', description: 'Ligne 1\r\nLigne 2', image, url: 'https://leptunia.fr' }),
  });
  assert.equal(first.status, 201);
  const created = (await first.json()).news;
  assert.equal(created.title, 'Bienvenue');
  assert.equal(created.description, 'Ligne 1\nLigne 2');

  await admin('/news', { method: 'POST', body: JSON.stringify({ title: 'Second', description: 'Plus récent' }) });

  const feed = (await (await fetch(`${base}/v1/public/news`)).json()).news;
  assert.deepEqual(feed.map((item) => item.title), ['Second', 'Bienvenue']);
  assert.equal(feed[1].image, `https://news.example.com/${image}`);
  assert.equal(feed[1].url, 'https://leptunia.fr');

  const updated = await admin(`/news/${created.id}`, { method: 'PUT', body: JSON.stringify({ title: 'Bienvenue à tous' }) });
  assert.equal(updated.status, 200);
  const after = (await updated.json()).news;
  assert.equal(after.title, 'Bienvenue à tous');
  assert.equal(after.description, 'Ligne 1\nLigne 2');

  // Survives a restart.
  await stop();
  await start();
  const single = await fetch(`${base}/v1/public/news/${created.id}`);
  assert.equal((await single.json()).news.title, 'Bienvenue à tous');

  // Deleting the only article that used the uploaded image deletes the file too.
  assert.equal((await admin(`/news/${created.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await admin(`/news/${created.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await fetch(`${base}/${image}`)).status, 404);
});

test('refuses files that are not images', async () => {
  const res = await admin('/images', {
    method: 'POST',
    body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    headers: { 'content-type': 'image/png' },
  });
  assert.equal(res.status, 415);
});

test('serves the admin panel with a strict CSP', async () => {
  const root = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), 'admin/');

  const noSlash = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(noSlash.headers.get('location'), 'admin/');

  const panel = await fetch(`${base}/admin/`);
  assert.equal(panel.status, 200);
  assert.match(panel.headers.get('content-security-policy'), /script-src 'self'/);
});
