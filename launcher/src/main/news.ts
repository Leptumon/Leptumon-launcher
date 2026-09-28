/**
 * News panel data (client-config `news.url`), cached on disk at {base}/news-cache.json.
 *
 * The cached feed is returned right away, so the panel fills instantly at
 * startup and still has something to show offline. When it is older than a few
 * minutes a fresh copy is fetched in the background and, if anything changed,
 * pushed to the renderer as 'news-updated'. Only the very first load waits for
 * the network.
 */
import fs from 'fs/promises';

import { app, shell } from 'electron';

import { LAUNCHER_NAME } from '../constants/launcher';
import { getNewsCacheFile } from '../core/launch/pathManager';
import { fetchNewsFeed, FeedArticle } from '../core/news/feed';
import { loadClientConfig } from '../core/utils/clientConfig';
import { logger } from '../core/utils/logger';
import type { NewsFeed } from '../types/api/news';

import { getMainWindow } from './window';

const REFRESH_AFTER_MS = 5 * 60_000;

type CachedFeed = { url: string; fetchedAt: number; articles: FeedArticle[] };

let cached: CachedFeed | null = null;
let inFlight: Promise<CachedFeed> | null = null;

/** Links stay in the main process; the renderer only learns that an article has one. */
const toRenderer = (feed: CachedFeed): NewsFeed => ({
  configured: true,
  articles: feed.articles.map(({ link: _link, ...article }) => article),
});

const readDiskCache = async (url: string): Promise<CachedFeed | null> => {
  try {
    const parsed = JSON.parse(await fs.readFile(getNewsCacheFile(), 'utf8')) as CachedFeed;
    // A cache from a different feed (the URL changed in a new build) is ignored.
    return parsed?.url === url && Array.isArray(parsed.articles) && typeof parsed.fetchedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
};

const writeDiskCache = async (feed: CachedFeed): Promise<void> => {
  const file = getNewsCacheFile();
  const temp = `${file}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(feed));
    await fs.rename(temp, file);
  } catch (error) {
    logger.warn(`[news] Could not save the news cache: ${(error as Error).message}`);
  }
};

const refresh = (url: string): Promise<CachedFeed> => {
  inFlight ??= (async () => {
    const articles = await fetchNewsFeed(url, `${LAUNCHER_NAME}/${app.getVersion()}`);
    const feed: CachedFeed = { url, fetchedAt: Date.now(), articles };
    cached = feed;
    await writeDiskCache(feed);
    return feed;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
};

export const getNews = async (): Promise<NewsFeed> => {
  const { news } = await loadClientConfig();
  if (!news.url) return { configured: false, articles: [] };

  if (cached?.url !== news.url) cached = await readDiskCache(news.url);

  if (!cached) {
    try {
      return toRenderer(await refresh(news.url));
    } catch (error) {
      logger.warn(`[news] Could not load ${news.url}: ${(error as Error).message}`);
      throw error;
    }
  }

  if (Date.now() - cached.fetchedAt >= REFRESH_AFTER_MS) {
    const shown = JSON.stringify(cached.articles);
    void refresh(news.url)
      .then((fresh) => {
        if (JSON.stringify(fresh.articles) !== shown) {
          getMainWindow()?.webContents.send('news-updated', toRenderer(fresh));
        }
      })
      .catch((error) => logger.warn(`[news] Refresh failed, showing the cached feed: ${(error as Error).message}`));
  }
  return toRenderer(cached);
};

/** Opens an article's link. The renderer passes the article id, never a URL. */
export const openNewsLink = async (id: unknown): Promise<void> => {
  if (typeof id !== 'string') return;
  const link = cached?.articles.find((article) => article.id === id)?.link;
  if (link && /^https:\/\//i.test(link)) {
    await shell.openExternal(link);
  }
};
