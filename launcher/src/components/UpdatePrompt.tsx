/**
 * Launcher self-update prompt. The updater downloads new versions in the
 * background; once one is ready this asks to restart, using the existing
 * confirm dialog. Never shown while the game is launching or running.
 */
import React, { useEffect, useState } from 'react';

import { useTranslation } from '../contexts/I18nContext';
import { useLaunch } from '../contexts/LaunchContext';
import type { UpdateState } from '../types/api/updater';

import ConfirmDialog from './ConfirmDialog';

const UpdatePrompt = () => {
    const { t } = useTranslation();
    const { isRunning, isLaunching } = useLaunch();
    const [state, setState] = useState<UpdateState | null>(null);
    const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = window.electron.onUpdateState(setState);
        // A pushed event may beat the initial fetch; keep whichever arrived first.
        window.electron.getUpdateState()
            .then((initial) => setState((current) => current ?? initial))
            .catch((error) => window.electron.log('warn', `Failed to read update state: ${(error as Error).message}`));
        return unsubscribe;
    }, []);

    const version = state?.latestVersion ?? '';
    const ready = state?.status === 'ready';
    const open = Boolean(state)
        && (ready || state?.status === 'manual')
        && version !== dismissedVersion
        && !isRunning
        && !isLaunching;

    return (
        <ConfirmDialog
            open={open}
            title={t('update.title')}
            message={ready ? t('update.ready_message', { version }) : t('update.manual_message', { version })}
            confirmText={ready ? t('update.restart') : t('update.download')}
            cancelText={t('update.later')}
            onConfirm={() => {
                setDismissedVersion(version);
                void window.electron.installUpdate();
            }}
            onCancel={() => setDismissedVersion(version)}
        />
    );
};

export default UpdatePrompt;
