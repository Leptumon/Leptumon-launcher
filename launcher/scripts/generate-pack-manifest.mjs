#!/usr/bin/env node
/**
 * Builds the hosted pack manifest the launcher installs from (modpack.manifestUrl).
 *
 * Point it at a clean install of the pack (a Prism Launcher or CurseForge app
 * instance, imported but ideally never launched). It hashes every pack file,
 * links jars Modrinth already hosts to Modrinth's CDN, and copies the rest into
 * <out>/objects/ for you to upload. Output:
 *
 *   <out>/manifest.json            → serve at modpack.manifestUrl
 *   <out>/objects/<ab>/<sha1>      → files served from --base-url/objects/...
 *
 * Objects are content-addressed, so re-running for a new pack version only adds
 * files; keep old objects online so players mid-update never hit a 404.
 *
 * Usage:
 *   node scripts/generate-pack-manifest.mjs --instance <dir> --base-url https://files.example.com/leptumon \
 *     [--out pack-dist] [--name "All the Mons"] [--version 1.3.0] \
 *     [--minecraft 1.21.1] [--loader neoforge-21.1.249] [--no-modrinth]
 *
 * Minecraft and loader versions are read from mmc-pack.json (Prism) or
 * minecraftinstance.json (CurseForge app) when not given.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const FORMAT_VERSION = 1;
const MODRINTH_API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'egelosing/leptumon-launcher-pack-generator';
const HASH_PARALLELISM = 16;
const MODRINTH_BATCH = 500;

/** Runtime and per-player data that must never ship in the pack. */
const EXCLUDED_TOP_LEVEL = new Set([
  'saves', 'logs', 'crash-reports', 'screenshots', 'backups', 'downloads',
  'journeymap', 'xaero', 'XaeroWaypoints', 'XaeroWorldMap', 'debug',
  'servers.dat', 'servers.dat_old', 'usercache.json', 'usernamecache.json',
  'command_history.txt', 'realms_persistence.json', 'launcher_profiles.json',
  'patchouli_data.json', 'minecraftinstance.json', 'mmc-pack.json', 'instance.cfg', 'modlist.html',
]);
const EXCLUDED_NAME = /(\.log|\.tmp|\.disabled|\.DS_Store|Thumbs\.db)$|^hs_err_pid/;
/** Player preferences: installed once, never overwritten by pack updates. */
const KEEP_FILES = new Set(['options.txt', 'optionsof.txt', 'optionsshaders.txt']);
/** Where Modrinth can host the file; everything else is always self-hosted. */
const MODRINTH_FOLDERS = new Set(['mods', 'resourcepacks', 'shaderpacks']);

const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

const parseArgs = (argv) => {
  const args = { out: 'pack-dist', modrinth: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-modrinth') { args.modrinth = false; continue; }
    if (!arg.startsWith('--')) fail(`Unexpected argument: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for ${arg}`);
    args[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    i++;
  }
  return args;
};

const isAllowedUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
};

const readJson = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
};

/** Prism keeps the game in minecraft/ or .minecraft/; the CurseForge app uses the instance root. */
const findGameDir = (instance) => {
  for (const candidate of [path.join(instance, 'minecraft'), path.join(instance, '.minecraft'), instance]) {
    if (existsSync(path.join(candidate, 'mods'))) return candidate;
  }
  return fail(`No mods/ folder found in ${instance} (checked minecraft/, .minecraft/ and the folder itself)`);
};

const detectVersions = async (instance) => {
  const prism = await readJson(path.join(instance, 'mmc-pack.json'));
  if (prism?.components) {
    const component = (uid) => prism.components.find((c) => c.uid === uid)?.version;
    const neoforge = component('net.neoforged');
    const fabric = component('net.fabricmc.fabric-loader');
    const cfg = await fs.readFile(path.join(instance, 'instance.cfg'), 'utf8').catch(() => '');
    return {
      name: /^name=(.+)$/m.exec(cfg)?.[1]?.trim(),
      minecraft: component('net.minecraft'),
      loader: neoforge ? `neoforge-${neoforge}` : fabric ? `fabric-${fabric}` : undefined,
    };
  }

  const curseforge = await readJson(path.join(instance, 'minecraftinstance.json'));
  if (curseforge) {
    return { name: curseforge.name, minecraft: curseforge.gameVersion, loader: curseforge.baseModLoader?.name };
  }
  return {};
};

const walk = async (dir, root = dir) => {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).split(path.sep).join('/');
    const segments = relative.split('/');
    if (segments.some((segment) => segment.startsWith('.'))) continue;
    if (segments.length === 1 && EXCLUDED_TOP_LEVEL.has(entry.name)) continue;
    if (entry.isDirectory()) files.push(...await walk(full, root));
    else if (entry.isFile() && !EXCLUDED_NAME.test(entry.name)) files.push(relative);
  }
  return files;
};

const hashFile = async (file) => {
  const hash = createHash('sha1');
  let size = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha1: hash.digest('hex'), size };
};

const mapLimit = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
};

/** sha1 → Modrinth CDN URL for every hash Modrinth recognises. */
const lookupModrinth = async (hashes) => {
  const urls = new Map();
  for (let i = 0; i < hashes.length; i += MODRINTH_BATCH) {
    const batch = hashes.slice(i, i + MODRINTH_BATCH);
    const response = await fetch(`${MODRINTH_API}/version_files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ hashes: batch, algorithm: 'sha1' }),
    });
    if (!response.ok) fail(`Modrinth lookup failed: HTTP ${response.status} ${await response.text()}`);
    const versions = await response.json();
    for (const [hash, version] of Object.entries(versions)) {
      const file = version.files?.find((f) => f.hashes?.sha1 === hash);
      if (file?.url?.startsWith('https://cdn.modrinth.com/')) urls.set(hash, file.url);
    }
  }
  return urls;
};

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.instance) fail('--instance is required');
  if (!args.baseUrl) fail('--base-url is required (public URL where the output folder will be served)');
  if (!isAllowedUrl(args.baseUrl)) fail('--base-url must be https://');

  const instance = path.resolve(args.instance);
  const baseUrl = args.baseUrl.replace(/\/+$/, '');
  const out = path.resolve(args.out);
  const gameDir = findGameDir(instance);
  const detected = await detectVersions(instance);

  const minecraft = args.minecraft ?? detected.minecraft;
  const loaderId = args.loader ?? detected.loader;
  const loaderMatch = /^(neoforge|fabric)-(.+)$/i.exec(loaderId ?? '');
  if (!minecraft) fail('Could not detect the Minecraft version; pass --minecraft');
  if (!loaderMatch) fail(`Could not detect a NeoForge/Fabric loader (got "${loaderId ?? ''}"); pass --loader neoforge-<version>`);

  console.log(`Instance:  ${gameDir}`);
  console.log(`Pack:      ${args.name ?? detected.name ?? 'Modpack'} ${args.version ?? ''}`);
  console.log(`Minecraft: ${minecraft}, ${loaderMatch[1].toLowerCase()} ${loaderMatch[2]}`);

  const paths = (await walk(gameDir)).sort();
  console.log(`\nHashing ${paths.length} files...`);
  const hashed = await mapLimit(paths, HASH_PARALLELISM, async (relative) => ({
    path: relative,
    ...await hashFile(path.join(gameDir, relative)),
  }));

  const modrinthCandidates = hashed.filter((file) =>
    MODRINTH_FOLDERS.has(file.path.split('/')[0]) && /\.(jar|zip)$/i.test(file.path));
  let modrinth = new Map();
  if (args.modrinth && modrinthCandidates.length > 0) {
    console.log(`Looking up ${modrinthCandidates.length} jars/zips on Modrinth...`);
    modrinth = await lookupModrinth([...new Set(modrinthCandidates.map((file) => file.sha1))]);
  }

  let hostedBytes = 0;
  let hostedCount = 0;
  const selfHosted = [];
  const files = await mapLimit(hashed, HASH_PARALLELISM, async (file) => {
    let url = modrinth.get(file.sha1);
    if (!url) {
      const objectPath = `objects/${file.sha1.slice(0, 2)}/${file.sha1}`;
      const destination = path.join(out, objectPath);
      const existing = await fs.stat(destination).catch(() => null);
      if (existing?.size !== file.size) {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(path.join(gameDir, file.path), destination);
      }
      url = `${baseUrl}/${objectPath}`;
      hostedBytes += file.size;
      hostedCount++;
      if (MODRINTH_FOLDERS.has(file.path.split('/')[0])) selfHosted.push(file.path);
    }
    return { path: file.path, url, sha1: file.sha1, size: file.size, ...(KEEP_FILES.has(file.path) ? { keep: true } : {}) };
  });

  const manifest = {
    formatVersion: FORMAT_VERSION,
    name: args.name ?? detected.name ?? 'Modpack',
    version: args.version ?? '',
    minecraft,
    loader: { type: loaderMatch[1].toLowerCase(), version: loaderMatch[2] },
    files,
  };
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'self-hosted-mods.txt'), `${selfHosted.join('\n')}\n`);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const modCount = files.filter((file) => file.path.startsWith('mods/')).length;
  const modrinthMods = files.filter((file) => file.path.startsWith('mods/') && file.url.startsWith('https://cdn.modrinth.com/')).length;
  console.log(`
✔ Wrote ${path.join(out, 'manifest.json')}

  Files:        ${files.length} (${formatSize(totalBytes)})
  Mods:         ${modCount} total, ${modrinthMods} from Modrinth, ${modCount - modrinthMods} self-hosted
  Self-hosted:  ${hostedCount} files (${formatSize(hostedBytes)}) → ${out}/objects
                self-hosted mods listed in self-hosted-mods.txt

Next:
  1. Upload the contents of ${out} to ${baseUrl}/ (same paths).
     Serve manifest.json with a short cache (e.g. Cache-Control: max-age=60).
  2. Set modpack.manifestUrl in launcher/src/assets/client-config.json to:
     ${baseUrl}/manifest.json
`);
};

main().catch((error) => fail(error.stack ?? String(error)));
