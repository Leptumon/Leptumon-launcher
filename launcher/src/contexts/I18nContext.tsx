/**
 * React wrapper around i18n string lookups, holding the player's language.
 * Renders nothing until the saved language (set by main on first run) has loaded,
 * so the UI never flashes in the wrong language.
 */
import React, { createContext, useContext, ReactNode, useCallback, useEffect, useState } from 'react';

import { DEFAULT_LOCALE, isLocale, Locale, setLocale, t as translate } from '../i18n';

type Replacements = Record<string, string | number>;

interface I18nContextType {
  t: (key: string, replacements?: Replacements) => string;
  locale: Locale;
  setLanguage: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.config.get('language')
      .then((saved) => {
        if (!isLocale(saved)) return;
        setLocale(saved);
        setLocaleState(saved);
      })
      .catch((error) => window.electron.log('warn', `Failed to read language setting: ${(error as Error).message}`))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale.slice(0, 2);
  }, [locale]);

  const setLanguage = useCallback((next: Locale) => {
    setLocale(next);
    setLocaleState(next);
    window.config.set('language', next);
  }, []);

  const t = useCallback((key: string, replacements: Replacements = {}) => translate(key, replacements, locale), [locale]);

  return (
    <I18nContext.Provider value={{ t, locale, setLanguage }}>
      {loaded ? children : null}
    </I18nContext.Provider>
  );
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};
