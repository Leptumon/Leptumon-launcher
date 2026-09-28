/** Home launch card: server name + live status, the signed-in player, and the Play button. */
import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';

import { BRAND_NAME } from '../constants/launcher';
import { useTranslation } from '../contexts/I18nContext';
import { useLaunch } from '../contexts/LaunchContext';
import { AuthConfig } from '../types/config/LauncherConfig';
import { MotdLine } from '../types/api/serverStatus';

import ProgressBar from './ProgressBar';
import ConfirmDialog from './ConfirmDialog';
import { useAvatar } from '../utils/useAvatar';

const motdToText = (lines: MotdLine[] | undefined) =>
    (lines ?? []).map((line) => line.map((segment) => segment.text).join('').trim()).join('\n');

const LABEL_MAX_PX = 24;
const LABEL_MIN_PX = 18;

const LaunchButton = () => {
    const { t } = useTranslation();
    const { isLaunching, isRunning, progress, status, lastError, launch, abortLaunch, stopGame } = useLaunch();

    // Set up state to hold the ACTIVE account data
    const [authData, setAuthData] = useState<AuthConfig | null>(null);
    const [serverOnline, setServerOnline] = useState<boolean | null>(null);
    const [playerCounts, setPlayerCounts] = useState<{ online: number; max: number } | null>(null);
    const [motd, setMotd] = useState('');

    const [showStopDialog, setShowStopDialog] = useState(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    // Label sizing, measured on the widest text the current state can show so the
    // size doesn't jitter as numbers tick up. Shrinks from 24px to 18px on one
    // line; anything longer wraps onto two lines at 18px instead of getting tiny.
    const [label, setLabel] = useState({ size: LABEL_MAX_PX, wrap: false });
    const measureRef = useRef<HTMLSpanElement>(null);

    // Determines the "worst case" string for the current state
    const getWorstCaseText = () => {
        if (isRunning) return t('stop');
        if (!isLaunching) return t('play');
        if (!status) return t('launch.initializing');

        if (typeof status === 'string') return status; // Legacy fallback

        // Widest values: the percentage at two digits, the file counter at its total.
        const params = { ...status.params };
        if (params.percent) params.percent = '00.0';
        if (params.done && params.total) params.done = params.total;

        return t(status.key, params);
    };

    const maxText = getWorstCaseText();

    useLayoutEffect(() => {
        const el = measureRef.current;
        if (!el) return;

        const maxWidth = el.parentElement!.clientWidth;
        for (let size = LABEL_MAX_PX; size >= LABEL_MIN_PX; size -= 1) {
            el.style.fontSize = `${size}px`;
            if (el.offsetWidth <= maxWidth) {
                setLabel({ size, wrap: false });
                return;
            }
        }
        setLabel({ size: LABEL_MIN_PX, wrap: true });
    }, [maxText]); // The worst-case text only changes with the state, the language or the file total

    // Use useEffect to fetch the data when the component mounts
    useEffect(() => {
        const fetchAuthData = async () => {
            try {
                const auth = await window.config.get('auth');
                if (auth) {
                    setAuthData(auth);
                }
            } catch (error) {
                window.electron.log('error', `Failed to get auth data in LaunchButton: ${(error as Error).message}`);
            }
        };

        fetchAuthData();
    }, []); // Empty array ensures this runs only once

    // Fetch server status periodically
    useEffect(() => {
        let mounted = true;
        let interval: any;
        const fetchStatus = async () => {
            try {
                const res = await window.electron.getServerStatus();
                if (!mounted) return;
                setServerOnline(res.online);
                setPlayerCounts(res.players ? { online: res.players.online, max: res.players.max } : null);
                setMotd(res.online ? motdToText(res.motd) : '');
            } catch (e) {
                if (!mounted) return;
                setServerOnline(false);
                setPlayerCounts(null);
                setMotd('');
            }
        };
        fetchStatus();
        interval = setInterval(fetchStatus, 30000);
        return () => {
            mounted = false;
            if (interval) clearInterval(interval);
        };
    }, []);

    // --- Action Handlers ---
    const handleLaunch = async () => {
        if (isRunning) { setShowStopDialog(true); return; }
        // If launching, clicking means CANCEL
        if (isLaunching) { setShowCancelDialog(true); return; }

        await launch();
    };

    // Use the state for rendering. Handle the loading case.
    const username = authData?.username || '...';
    const avatarUrl = useAvatar();

    // Helper to render localized status
    const renderStatus = (s: string | { key: string; params?: any } | undefined) => {
        if (!s) return t('launch.initializing');
        if (typeof s === 'string') return s; // Fallback for legacy strings
        return t(s.key, s.params);
    };

    return (
        <div className="launch-button">
            <div className="launch-info">
                <div className="header-group">
                    <div className="header-row">
                        <span className="version-info">{BRAND_NAME}</span>
                        <div className="server-status-pill" title={motd || undefined}>
                            {serverOnline === null ? (
                                <span className="server-status loading">{t('server_status.checking')}</span>
                            ) : serverOnline ? (
                                <>
                                    <span className="status-dot online" />
                                    <span className="server-status">
                                        {playerCounts ? `${playerCounts.online}/${playerCounts.max}` : t('server_status.online')}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="status-dot offline" />
                                    <span className="server-status">{t('server_status.offline')}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="user-info">
                        <img
                            src={avatarUrl}
                            draggable="false"
                        />
                        {lastError && !isLaunching ? (
                            // The last launch failed; say why instead of "Launching as".
                            <span className="username is-error" title={lastError}>{lastError}</span>
                        ) : (
                            <span className="username">{t('launching_as', { username: username })}</span>
                        )}
                    </div>
                </div>
            </div>
            <div className={`button ${isRunning ? 'stop' : (isLaunching ? 'inactive' : '')}`} onClick={handleLaunch}>
                <span className={`button-label${label.wrap ? ' is-wrapped' : ''}`} style={{ fontSize: label.size }}>
                    {isRunning ? t('stop') : (isLaunching ? renderStatus(status) : t('play'))}
                </span>
                <span ref={measureRef} className="button-label button-label--measure" aria-hidden="true">
                    {maxText}
                </span>
            </div>
            {isLaunching && <ProgressBar percent={progress} />}
            <ConfirmDialog
                open={showStopDialog}
                title={t('stop_game.title')}
                message={t('stop_game.message')}
                confirmText={t('stop_game.confirm')}
                confirmVariant="danger"
                cancelText={t('stop_game.cancel')}
                onConfirm={async () => { setShowStopDialog(false); await stopGame(); }}
                onCancel={() => setShowStopDialog(false)}
            />
            <ConfirmDialog
                open={showCancelDialog}
                title={t('cancel_launch.title')}
                message={t('cancel_launch.message')}
                confirmText={t('cancel_launch.confirm')}
                confirmVariant="danger"
                cancelText={t('cancel_launch.cancel')}
                onConfirm={() => {
                    setShowCancelDialog(false);
                    abortLaunch();
                }}
                onCancel={() => setShowCancelDialog(false)}
            />
        </div>
    );
}

export default LaunchButton;
