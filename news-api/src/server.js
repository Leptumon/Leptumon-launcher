/** Entry point: `npm start`. Reads settings from the environment or a .env file. */
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { NewsStore } from './store.js';
import { UploadStore } from './uploads.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file: settings come from the real environment (Docker, systemd).
}

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const store = new NewsStore(config.dataDir);
const uploads = new UploadStore(config.dataDir);
await store.load();
await uploads.init();

const server = createApp({ config, store, uploads }).listen(config.port, config.host, () => {
  console.log(`Leptumon news API listening on http://${config.host}:${config.port} (data in ${config.dataDir})`);
  if (!config.publicUrl) {
    console.log('PUBLIC_URL is not set; uploaded image links will use the address each request came in on.');
  }
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
