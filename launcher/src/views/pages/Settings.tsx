/** Settings page: game (memory, auto-join, JVM arguments), launcher (language, minimize) and account. */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import Button from '../../components/Button';
import DropdownMenu, { DropdownItem } from '../../components/DropdownMenu';
import MemorySlider from '../../components/MemorySlider';
import { CollapsibleRow, SettingRow, SettingsSection } from '../../components/SettingsLayout';
import Switch from '../../components/Switch';
import { useTranslation } from '../../contexts/I18nContext';
import { isLocale, LOCALE_NAMES, SUPPORTED_LOCALES } from '../../i18n';
import type { RamInfo } from '../../types/api/ramInfo';
import { useAvatar } from '../../utils/useAvatar';

/** Dragging the slider fires many changes; save once it settles. */
const RAM_SAVE_DELAY_MS = 300;

const LogOutIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M16 17L21 12M21 12L16 7M21 12H9M9 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H9"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const logOut = async () => {
    await window.electron.logOut();
    window.location.reload();
};

const Settings = () => {
    const { t, locale, setLanguage } = useTranslation();
    const avatarUrl = useAvatar();

    const [ramInfo, setRamInfo] = useState<RamInfo | null>(null);
    const [ram, setRam] = useState<number | null>(null);
    const [jvmArgs, setJvmArgs] = useState('');
    const [autoJoinServer, setAutoJoinServer] = useState(true);
    const [minimizeOnLaunch, setMinimizeOnLaunch] = useState(false);
    const [username, setUsername] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const [info, savedRam, savedJvmArgs, autoJoin, minimize, auth] = await Promise.all([
                    window.electron.getRamInfo(),
                    window.config.get('ram'),
                    window.config.get('jvmArgs'),
                    window.config.get('autoJoinServer'),
                    window.config.get('minimizeOnLaunch'),
                    window.config.get('auth'),
                ]);
                setRamInfo(info);
                setRam(typeof savedRam === 'number' ? savedRam : info.recommended);
                if (typeof savedJvmArgs === 'string') setJvmArgs(savedJvmArgs);
                if (typeof autoJoin === 'boolean') setAutoJoinServer(autoJoin);
                if (typeof minimize === 'boolean') setMinimizeOnLaunch(minimize);
                if (auth?.username) setUsername(auth.username);
            } catch (error) {
                window.electron.log('error', `Failed to load settings: ${(error as Error).message}`);
            }
        };
        load();
    }, []);

    // Pending RAM save, flushed when leaving the page so a quick drag-and-leave still sticks.
    const pendingRam = useRef<{ timer: ReturnType<typeof setTimeout>; value: number } | null>(null);

    const flushRam = useCallback(() => {
        if (!pendingRam.current) return;
        clearTimeout(pendingRam.current.timer);
        window.config.set('ram', pendingRam.current.value);
        pendingRam.current = null;
    }, []);

    useEffect(() => flushRam, [flushRam]);

    const handleRamChange = (value: number) => {
        setRam(value);
        if (pendingRam.current) clearTimeout(pendingRam.current.timer);
        pendingRam.current = { value, timer: setTimeout(flushRam, RAM_SAVE_DELAY_MS) };
    };

    const handleToggle = (key: 'autoJoinServer' | 'minimizeOnLaunch') => (value: boolean) => {
        window.config.set(key, value);
        if (key === 'autoJoinServer') setAutoJoinServer(value);
        else setMinimizeOnLaunch(value);
    };

    const numberFormat = new Intl.NumberFormat(locale.replace('_', '-'), { maximumFractionDigits: 1 });
    const formatGb = (mb: number) => t('units.gb', { value: numberFormat.format(mb / 1024) });

    const languageItems: DropdownItem[] = SUPPORTED_LOCALES.map((option) => ({ value: option, label: LOCALE_NAMES[option] }));

    return (
        <div className="settings">
            <div className="settings__inner">
                <h1 className="settings__title">{t('settings')}</h1>

                <SettingsSection title={t('settings_sections.game')}>
                    <SettingRow
                        titleId="setting-memory"
                        title={t('memory.title')}
                        description={t('memory.description')}
                        control={ram !== null && <span className="memory-value">{formatGb(ram)}</span>}
                    >
                        {ramInfo && ram !== null && (
                            <MemorySlider
                                value={ram}
                                info={ramInfo}
                                onChange={handleRamChange}
                                format={formatGb}
                                recommendedLabel={t('memory.recommended')}
                                labelledBy="setting-memory"
                            />
                        )}
                    </SettingRow>
                    <SettingRow
                        titleId="setting-auto-join"
                        title={t('auto_join.title')}
                        description={t('auto_join.description')}
                        control={
                            <Switch
                                checked={autoJoinServer}
                                onChange={handleToggle('autoJoinServer')}
                                labelledBy="setting-auto-join"
                            />
                        }
                    />
                    <CollapsibleRow title={t('advanced.title')} description={t('advanced.description')}>
                        <label className="jvm-args">
                            <span className="jvm-args__label">{t('custom_jvm_args.title')}</span>
                            <textarea
                                className="jvm-args__input custom-scrollbar"
                                value={jvmArgs}
                                onChange={(event) => setJvmArgs(event.target.value)}
                                onBlur={() => window.config.set('jvmArgs', jvmArgs.trim())}
                                rows={2}
                                spellCheck={false}
                            />
                            <span className="jvm-args__hint">{t('custom_jvm_args.description')}</span>
                        </label>
                    </CollapsibleRow>
                </SettingsSection>

                <SettingsSection title={t('settings_sections.launcher')}>
                    <SettingRow
                        title={t('language')}
                        control={
                            <DropdownMenu
                                className="language-select"
                                items={languageItems}
                                value={languageItems.find((item) => item.value === locale)}
                                onSelect={(item) => {
                                    if (isLocale(item.value)) setLanguage(item.value);
                                }}
                            />
                        }
                    />
                    <SettingRow
                        titleId="setting-minimize"
                        title={t('minimize_on_launch.title')}
                        description={t('minimize_on_launch.description')}
                        control={
                            <Switch
                                checked={minimizeOnLaunch}
                                onChange={handleToggle('minimizeOnLaunch')}
                                labelledBy="setting-minimize"
                            />
                        }
                    />
                </SettingsSection>

                <SettingsSection title={t('settings_sections.account')}>
                    <SettingRow
                        leading={<img className="account-avatar" src={avatarUrl} alt="" draggable="false" />}
                        title={username || '…'}
                        description={t('microsoft_account')}
                        control={
                            <Button variant="danger" size="sm" icon={<LogOutIcon />} onClick={() => logOut()}>
                                {t('log_out')}
                            </Button>
                        }
                    />
                </SettingsSection>
            </div>
        </div>
    );
};

export default Settings;
