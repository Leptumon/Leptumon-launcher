/**
 * News articles, kept in memory and saved to one JSON file (DATA_DIR/news.json).
 *
 * A launcher's worth of news is a few dozen articles, so a database would only
 * add a native dependency to install. The file is written to a temporary name
 * and renamed over the old one, so a crash mid-write never leaves half a file.
 * It is also a valid static feed: `{ "news": [...] }` is exactly what the
 * launcher reads, which keeps backups and moves between hosts trivial.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const EMPTY = { next_id: 1, news: [] };

const byNewestFirst = (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id;

export class NewsStore {
  #file;
  #data = EMPTY;
  #chain = Promise.resolve();

  constructor(dataDir) {
    this.#file = path.join(dataDir, 'news.json');
  }

  async load() {
    let raw;
    try {
      raw = await fs.readFile(this.#file, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.mkdir(path.dirname(this.#file), { recursive: true });
      this.#data = structuredClone(EMPTY);
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.news)) {
      throw new Error(`${this.#file} is not a news file (expected { "news": [...] })`);
    }
    const highestId = parsed.news.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    this.#data = {
      next_id: Math.max(Number(parsed.next_id) || 1, highestId + 1),
      news: parsed.news,
    };
  }

  list() {
    return [...this.#data.news].sort(byNewestFirst);
  }

  get(id) {
    return this.#data.news.find((item) => item.id === id) ?? null;
  }

  create(fields) {
    return this.#mutate((data) => {
      const now = new Date().toISOString();
      const item = { id: data.next_id, ...fields, created_at: now, modified_at: now };
      data.next_id += 1;
      data.news.push(item);
      return item;
    });
  }

  /** Resolves null when the article does not exist. */
  update(id, fields) {
    return this.#mutate((data) => {
      const item = data.news.find((entry) => entry.id === id);
      if (!item) return null;
      Object.assign(item, fields, { modified_at: new Date().toISOString() });
      return item;
    });
  }

  /** Resolves the removed article, or null when it did not exist. */
  remove(id) {
    return this.#mutate((data) => {
      const index = data.news.findIndex((entry) => entry.id === id);
      if (index === -1) return null;
      return data.news.splice(index, 1)[0];
    });
  }

  /** True when some article still shows this image. */
  isImageUsed(image) {
    return this.#data.news.some((item) => item.image === image);
  }

  /**
   * Runs one change at a time against a copy, saves it, and only then makes it
   * the live data. A failed save leaves both the file and memory as they were.
   */
  #mutate(change) {
    const run = this.#chain.then(async () => {
      const next = structuredClone(this.#data);
      const result = change(next);
      const tmp = `${this.#file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      await fs.rename(tmp, this.#file);
      this.#data = next;
      return result === null ? null : structuredClone(result);
    });
    this.#chain = run.catch(() => {});
    return run;
  }
}
