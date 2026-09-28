/**
 * Downloads and reads the news feed at client-config `news.url`.
 *
 * The feed is either the news API's /v1/public/news or a static news.json;
 * both look like `{ "news": [{ id, title, description, image?, url?, created_at? }] }`
 * (a bare array also works). Malformed entries are skipped instead of failing
 * the whole feed, so one typo in a hand-edited file doesn't hide every article.
 * Nothing from the feed is ever rendered as HTML.
 */
import type { NewsArticle } from '../../types/api/news';

/** An article plus the link only the main process keeps (the renderer opens it by id). */
export type FeedArticle = NewsArticle & { link?: string };

const MAX_ARTICLES = 20;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 10_000;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** Plain http is only allowed for a news API running on this machine, for testing. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const isAllowedFeedUrl = (url: URL): boolean =>
  url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';

/** Resolves relative paths against the feed (so a static news.json can use "images/x.png"). */
const resolveUrl = (value: unknown, base: string, allowed: (url: URL) => boolean): string | undefined => {
  const text = asText(value, 2048);
  if (!text) return undefined;
  try {
    const url = new URL(text, base);
    return allowed(url) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const asIsoDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** Turns a parsed feed into articles, newest first. Throws when it is not a feed at all. */
export const parseNewsFeed = (raw: unknown, feedUrl: string): FeedArticle[] => {
  const list = Array.isArray(raw) ? raw : asObject(raw).news;
  if (!Array.isArray(list)) throw new Error('not a news feed (expected { "news": [...] })');

  const seenIds = new Set<string>();
  const articles: FeedArticle[] = [];

  list.forEach((entry, index) => {
    const item = asObject(entry);
    const title = asText(item.title, MAX_TITLE_LENGTH);
    if (!title) return;

    let id = asText(typeof item.id === 'number' ? String(item.id) : item.id, 100) || String(index);
    if (seenIds.has(id)) id = `${id}-${index}`;
    seenIds.add(id);

    const link = resolveUrl(item.url, feedUrl, (url) => url.protocol === 'https:');
    articles.push({
      id,
      title,
      body: asText(item.description, MAX_BODY_LENGTH),
      image: resolveUrl(item.image, feedUrl, isAllowedFeedUrl),
      hasLink: Boolean(link),
      link,
      publishedAt: asIsoDate(item.created_at ?? item.date),
    });
  });

  // The API already sends newest first. A hand-written file is only re-sorted
  // when every article has a date; otherwise its own order is kept.
  if (articles.every((article) => article.publishedAt)) {
    articles.sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
  }
  return articles.slice(0, MAX_ARTICLES);
};

export const fetchNewsFeed = async (feedUrl: string, userAgent: string): Promise<FeedArticle[]> => {
  const url = new URL(feedUrl);
  if (!isAllowedFeedUrl(url)) throw new Error('news.url must be an https:// address');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    if (text.length > MAX_FEED_BYTES) throw new Error('feed is larger than 2 MB');
    return parseNewsFeed(JSON.parse(text), response.url || url.href);
  } finally {
    clearTimeout(timer);
  }
};
