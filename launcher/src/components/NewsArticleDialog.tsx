/** A news article opened from the home panel: image, date, full text, and its link if it has one. */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslation } from '../contexts/I18nContext';
import { NewsArticle } from '../types/api/news';

import Button from './Button';

type NewsArticleDialogProps = {
    article: NewsArticle;
    /** Already formatted for the player's language; empty when the feed has no date. */
    date: string;
    onClose: () => void;
};

const ExternalLinkIcon = () => (
    <svg viewBox="0 0 24 24" fill="none">
        <path
            d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const NewsArticleDialog: React.FC<NewsArticleDialogProps> = ({ article, date, onClose }) => {
    const { t } = useTranslation();
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="news-dialog-title" onClick={onClose}>
            <div className="modal-card news-dialog" onClick={(event) => event.stopPropagation()}>
                {article.image && !imageFailed && (
                    <img
                        className="news-dialog__image"
                        src={article.image}
                        alt=""
                        draggable={false}
                        onError={() => setImageFailed(true)}
                    />
                )}
                <div className="news-dialog__content custom-scrollbar">
                    {date && <span className="news-dialog__date">{date}</span>}
                    <span id="news-dialog-title" className="modal-title">{article.title}</span>
                    {article.body && <p className="news-dialog__body">{article.body}</p>}
                </div>
                <div className="modal-actions news-dialog__actions">
                    {article.hasLink && (
                        <Button variant="secondary" icon={<ExternalLinkIcon />} onClick={() => void window.electron.openNewsLink(article.id)}>
                            {t('news.open_link')}
                        </Button>
                    )}
                    <Button variant="primary" onClick={onClose} autoFocus>
                        {t('news.close')}
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default NewsArticleDialog;
