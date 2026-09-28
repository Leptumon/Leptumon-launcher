/** Sidebar links (Discord, Store). URLs live in client-config.json; main opens them by key. */
import React, { useEffect, useState } from 'react';

import { useTranslation } from '../contexts/I18nContext';

import { DiscordIcon, StoreIcon } from './SidebarIcons';

type LinkKey = 'discord' | 'store';

const LINKS: LinkKey[] = ['discord', 'store'];

const SocialMediaLinks = () => {
    const { t } = useTranslation();
    const [links, setLinks] = useState<Record<string, string>>({});

    useEffect(() => {
        window.electron.getLauncherInfo().then((info) => setLinks(info.links));
    }, []);

    const available = LINKS.filter((key) => typeof links[key] === 'string' && links[key].startsWith('http'));
    if (available.length === 0) return null;

    return (
        <>
            <div className="sidebar__divider" aria-hidden="true" />
            {available.map((key) => {
                const label = key === 'discord' ? 'Discord' : t('store');
                return (
                    <button
                        type="button"
                        className="sidebar-item"
                        key={key}
                        title={label}
                        aria-label={label}
                        onClick={() => window.electron.openLink(key)}
                    >
                        <span className="sidebar-item__icon">
                            {key === 'discord' ? <DiscordIcon /> : <StoreIcon />}
                        </span>
                    </button>
                );
            })}
        </>
    );
};

export default SocialMediaLinks;
