/**
 * String lookup for the launcher UI and player-facing main-process messages.
 *
 * On first run the language follows the system (see matchSystemLocale); French
 * is the fallback because Leptumon is a French server. Players can switch in
 * Settings. English is the fallback for any key missing from a translation.
 * Main and renderer each hold their own current locale: main follows the stored
 * `language` setting, the renderer follows I18nContext.
 */
import de_DE from './de_DE.json';
import en_US from './en_US.json';
import es_ES from './es_ES.json';
import fr_FR from './fr_FR.json';
import hi_IN from './hi_IN.json';
import ja_JP from './ja_JP.json';
import pl_PL from './pl_PL.json';
import pt_BR from './pt_BR.json';
import ru_RU from './ru_RU.json';
import tr_TR from './tr_TR.json';
import zh_CN from './zh_CN.json';

type Replacements = Record<string, string | number>;

/** Order here is the order of the Settings language picker. */
const STRINGS = { fr_FR, en_US, de_DE, es_ES, pl_PL, pt_BR, ru_RU, tr_TR, hi_IN, ja_JP, zh_CN } as const;

export type Locale = keyof typeof STRINGS;

export const DEFAULT_LOCALE: Locale = 'fr_FR';
const FALLBACK_LOCALE: Locale = 'en_US';

/** Language names shown in the Settings picker, each in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  fr_FR: 'Français',
  en_US: 'English',
  de_DE: 'Deutsch',
  es_ES: 'Español',
  pl_PL: 'Polski',
  pt_BR: 'Português (Brasil)',
  ru_RU: 'Русский',
  tr_TR: 'Türkçe',
  hi_IN: 'हिन्दी',
  ja_JP: '日本語',
  zh_CN: '简体中文',
};

export const SUPPORTED_LOCALES = Object.keys(STRINGS) as Locale[];

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(STRINGS, value);

/** Each supported locale is the only one for its language, so matching by language is enough. */
const LOCALE_BY_LANGUAGE = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale.slice(0, 2), locale]),
) as Record<string, Locale>;

/**
 * Picks the launcher language from the system's preferred languages, in order.
 * Matches by language so regional variants work too (fr-CA, fr-BE, pt-PT, zh-Hans-CN).
 * Falls back to French when none of them is supported.
 */
export const matchSystemLocale = (preferred: readonly string[]): Locale => {
  for (const tag of preferred) {
    const language = tag.trim().toLowerCase().split(/[-_]/)[0];
    const match = LOCALE_BY_LANGUAGE[language];
    if (match) return match;
  }
  return DEFAULT_LOCALE;
};

let currentLocale: Locale = DEFAULT_LOCALE;

export const getLocale = (): Locale => currentLocale;

/** Ignores unknown values so a corrupted setting can't break every string. */
export const setLocale = (locale: unknown): void => {
  currentLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;
};

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
};

export const t = (key: string, replacements: Replacements = {}, locale: Locale = currentLocale): string => {
  const value = getNestedValue(STRINGS[locale], key) ?? getNestedValue(STRINGS[FALLBACK_LOCALE], key);
  let translation = typeof value === 'string' ? value : key;

  for (const placeholder in replacements) {
    translation = translation.replace(`<${placeholder}>`, String(replacements[placeholder]));
  }

  return translation;
};
