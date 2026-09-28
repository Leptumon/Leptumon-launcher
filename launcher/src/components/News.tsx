/**
 * Home news panel, left of the launch card. Articles come from client-config
 * `news.url` through main/news.ts; the panel is hidden when no feed is set.
 * Cards scroll sideways (wheel, trackpad, or the arrows over the row's edges)
 * and open in a dialog.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useTranslation } from '../contexts/I18nContext';
import { NewsArticle } from '../types/api/news';

import Button from './Button';
import NewsArticleDialog from './NewsArticleDialog';

/** getNews() answers from the cache and refreshes in the background when it is stale. */
const REFRESH_INTERVAL_MS = 10 * 60_000;
/** A cached feed arrives almost at once; the skeleton only shows for a real wait. */
const SKELETON_DELAY_MS = 250;

type PanelState =
    | { status: 'loading' }
    | { status: 'hidden' }
    | { status: 'error' }
    | { status: 'ready'; articles: NewsArticle[] };

export const formatNewsDate = (iso: string | undefined, locale: string, style: 'short' | 'long'): string => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const sameYear = date.getFullYear() === new Date().getFullYear();
    const options: Intl.DateTimeFormatOptions = style === 'short'
        ? { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }
        : { day: 'numeric', month: 'long', year: 'numeric' };
    return new Intl.DateTimeFormat(locale.replace('_', '-'), options).format(date);
};

const ChevronIcon = ({ direction }: { direction: 'left' | 'right' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
            d={direction === 'left' ? 'M15 18L9 12L15 6' : 'M9 18L15 12L9 6'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const NewsCard = ({ article, onOpen }: { article: NewsArticle; onOpen: () => void }) => {
    const { locale } = useTranslation();
    const [imageFailed, setImageFailed] = useState(false);
    const showImage = Boolean(article.image) && !imageFailed;
    const date = formatNewsDate(article.publishedAt, locale, 'short');

    return (
        <button type="button" className={`news-card${showImage ? ' news-card--image' : ''}`} onClick={onOpen}>
            {showImage && (
                <img
                    className="news-card__image"
                    src={article.image}
                    alt=""
                    draggable={false}
                    onError={() => setImageFailed(true)}
                />
            )}
            <span className="news-card__text">
                {date && <span className="news-card__date">{date}</span>}
                <span className="news-card__title">{article.title}</span>
                {!showImage && article.body && <span className="news-card__excerpt">{article.body}</span>}
            </span>
        </button>
    );
};

const News = () => {
    const { t, locale } = useTranslation();
    const [state, setState] = useState<PanelState>({ status: 'loading' });
    const [showSkeleton, setShowSkeleton] = useState(false);
    const [openArticle, setOpenArticle] = useState<NewsArticle | null>(null);
    const [edges, setEdges] = useState({ start: false, end: false });
    const trackRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const feed = await window.electron.getNews();
            setState(feed.configured ? { status: 'ready', articles: feed.articles } : { status: 'hidden' });
        } catch (error) {
            window.electron.log('warn', `News unavailable: ${(error as Error).message}`);
            // Articles already on screen stay; the error only replaces a panel with nothing in it.
            setState((previous) => (previous.status === 'ready' ? previous : { status: 'error' }));
        }
    }, []);

    useEffect(() => {
        void load();
        const skeletonTimer = window.setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
        const refreshTimer = window.setInterval(() => {
            void load();
        }, REFRESH_INTERVAL_MS);
        const unsubscribe = window.electron.onNewsUpdated((feed) => {
            setState({ status: 'ready', articles: feed.articles });
        });
        return () => {
            window.clearTimeout(skeletonTimer);
            window.clearInterval(refreshTimer);
            unsubscribe();
        };
    }, [load]);

    const articles = state.status === 'ready' ? state.articles : [];

    /** Which ends of the row have cards hidden past them (drives the arrows and edge fades). */
    const updateEdges = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        const maxScroll = track.scrollWidth - track.clientWidth;
        setEdges({ start: track.scrollLeft > 1, end: track.scrollLeft < maxScroll - 1 });
    }, []);

    useLayoutEffect(() => {
        updateEdges();
        const track = trackRef.current;
        if (!track) return;
        const observer = new ResizeObserver(updateEdges);
        observer.observe(track);
        return () => observer.disconnect();
    }, [articles, updateEdges]);

    // A mouse wheel only scrolls vertically; turn that into sideways scrolling.
    // Trackpads already send horizontal deltas and are left alone.
    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        const onWheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            if (track.scrollWidth <= track.clientWidth) return;
            event.preventDefault();
            track.scrollLeft += event.deltaY;
        };
        track.addEventListener('wheel', onWheel, { passive: false });
        return () => track.removeEventListener('wheel', onWheel);
    }, [articles]);

    /** Moves one card left or right, lining the card up with the start of the row. */
    const step = (direction: 1 | -1) => {
        const track = trackRef.current;
        if (!track) return;
        const cards = Array.from(track.children) as HTMLElement[];
        const offsets = cards.map((card) => card.offsetLeft - cards[0].offsetLeft);
        const current = track.scrollLeft;
        const target = direction === 1
            ? offsets.find((offset) => offset > current + 1)
            : [...offsets].reverse().find((offset) => offset < current - 1);
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        track.scrollTo({ left: target ?? (direction === 1 ? track.scrollWidth : 0), behavior: reduceMotion ? 'auto' : 'smooth' });
    };

    // Nothing at all until there is something to show, so an unconfigured feed never flashes a panel.
    if (state.status === 'hidden' || (state.status === 'loading' && !showSkeleton)) return null;

    return (
        <section className="news" aria-labelledby="news-heading" aria-busy={state.status === 'loading'}>
            <div className="news__header">
                <h2 id="news-heading" className="news__heading">{t('news.title')}</h2>
            </div>

            {state.status === 'loading' && (
                <div className="news__track">
                    <span className="news-card news-card--skeleton" />
                    <span className="news-card news-card--skeleton" />
                    <span className="news-card news-card--skeleton" />
                </div>
            )}

            {state.status === 'error' && (
                <div className="news__message">
                    <span>{t('news.error')}</span>
                    <Button size="sm" onClick={() => void load()}>
                        {t('news.retry')}
                    </Button>
                </div>
            )}

            {state.status === 'ready' && articles.length === 0 && (
                <div className="news__message">
                    <span>{t('news.empty')}</span>
                </div>
            )}

            {articles.length > 0 && (
                <div className="news__viewport">
                    <div
                        ref={trackRef}
                        className={[
                            'news__track',
                            edges.start && 'news__track--fade-start',
                            edges.end && 'news__track--fade-end',
                        ].filter(Boolean).join(' ')}
                        onScroll={updateEdges}
                    >
                        {articles.map((article) => (
                            <NewsCard key={article.id} article={article} onOpen={() => setOpenArticle(article)} />
                        ))}
                    </div>
                    {/* Arrows float over the row's edges and fade out when that end is reached. */}
                    <button
                        type="button"
                        className={`news__arrow news__arrow--prev${edges.start ? '' : ' is-hidden'}`}
                        onClick={() => step(-1)}
                        disabled={!edges.start}
                        aria-label={t('news.previous')}
                    >
                        <ChevronIcon direction="left" />
                    </button>
                    <button
                        type="button"
                        className={`news__arrow news__arrow--next${edges.end ? '' : ' is-hidden'}`}
                        onClick={() => step(1)}
                        disabled={!edges.end}
                        aria-label={t('news.next')}
                    >
                        <ChevronIcon direction="right" />
                    </button>
                </div>
            )}

            {openArticle && (
                <NewsArticleDialog
                    article={openArticle}
                    date={formatNewsDate(openArticle.publishedAt, locale, 'long')}
                    onClose={() => setOpenArticle(null)}
                />
            )}
        </section>
    );
};

export default News;
