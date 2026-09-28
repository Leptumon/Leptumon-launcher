/** Home-screen news, shared by main (main/news.ts) and the renderer. */

export interface NewsArticle {
  /** Stable key from the feed, used to open the article's link. */
  id: string;
  title: string;
  /** Plain text. Line breaks are part of the content. */
  body: string;
  /** Absolute https image URL. */
  image?: string;
  /** The article has a link; open it with window.electron.openNewsLink(id). */
  hasLink: boolean;
  /** ISO date the article was published, when the feed gives one. */
  publishedAt?: string;
}

export interface NewsFeed {
  /** False when client-config.json has no news.url; the panel is hidden. */
  configured: boolean;
  /** Newest first. */
  articles: NewsArticle[];
}
