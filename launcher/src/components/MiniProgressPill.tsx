/** Compact launch progress indicator shown in the sidebar during install. */
import React, { useState, useRef, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLaunch } from '../contexts/LaunchContext';
import { useTranslation } from '../contexts/I18nContext';

const MiniProgressPill = () => {
    const { isLaunching, progress, status } = useLaunch();
    const location = useLocation();
    const { t } = useTranslation();

    // State for smooth width animation
    const [width, setWidth] = useState<number | undefined>(undefined);
    const measureRef = useRef<HTMLSpanElement>(null);

    // Logic: show if launching and not on the main route.
    const isMainRoute = location.pathname === '/main' || location.pathname === '/main/';

    // Helper to get worst case text for sizing
    const getWorstCaseText = () => {
        if (!status) return t('launch.initializing');
        if (typeof status === 'string') return status;

        // Replace percent with '00.0' (tabular standard width) for more realistic max width
        const params = { ...status.params };
        if (params.percent) params.percent = '00.0';
        return t(status.key, params);
    };

    const maxText = getWorstCaseText();
    const statusKey = typeof status === 'object' ? status?.key : status;

    // Measure width when state changes
    useLayoutEffect(() => {
        if (!isLaunching || isMainRoute) return;

        const el = measureRef.current;
        if (el) {
            // Tighten padding further as per user request
            const newWidth = el.offsetWidth + 34;
            setWidth(Math.max(200, newWidth)); // Min width 200px
        }
    }, [statusKey, isLaunching, isMainRoute]);

    if (!isLaunching || isMainRoute) return null;

    // Helper to render localized status
    const renderStatus = (s: string | { key: string; params?: any } | undefined) => {
        if (!s) return t('launch.initializing');
        if (typeof s === 'string') return s;
        return t(s.key, s.params);
    };

    return (
        <div className="mini-progress-pill" style={{
            width: width ? `${width}px` : 'auto',
            transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
            <div className="pill-content">
                <span className="status-text">{renderStatus(status)}</span>
            </div>

            {/* Hidden span for measurement */}
            <span ref={measureRef} style={{
                position: 'absolute',
                visibility: 'hidden',
                whiteSpace: 'nowrap',
                fontWeight: 500,
                fontSize: '13px',
                fontVariantNumeric: 'tabular-nums'
            }}>
                {maxText}
            </span>

            <div className="pill-progress-bar">
                <div
                    className="pill-progress-fill"
                    style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
            </div>
        </div>
    );
};

export default MiniProgressPill;
