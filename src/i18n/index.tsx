import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import german from './de.json';
export type Language = 'en' | 'de';
export type Translate = (message: string, values?: Record<string, string | number>) => string;
const dictionary: Record<string, string> = german;
export function translate(
  message: string,
  language: Language,
  values: Record<string, string | number> = {},
): string {
  const trimmed = message.trim();
  let text =
    language === 'de' && dictionary[trimmed]
      ? message.replace(trimmed, dictionary[trimmed])
      : message;
  // Generated names are UI labels, unlike local place names which remain untouched.
  if (language === 'de' && text === message) {
    const outside = message.match(
      /^This point is outside the (.+) pilot\. Choose a point inside the dashed coverage boundary\.$/,
    );
    if (outside)
      return `Dieser Punkt liegt ausserhalb des Pilotgebiets ${translate(outside[1], language)}. Wähle einen Punkt innerhalb der gestrichelten Gebietsgrenze.`;
    const status = message.match(
      /^The area could not download \((\d+)\)\. Try again when connected\.$/,
    );
    if (status)
      return translate(
        'The area could not download ({status}). Try again when connected.',
        language,
        { status: status[1] },
      );
    const patterns: [RegExp, string][] = [
      [/^Map point · (.+)$/, 'Kartenpunkt · $1'],
      [/^Mapped path (\d+) m from place$/, 'Kartierter Weg $1 m vom Ort entfernt'],
      [/^Start: (.+)$/, 'Start: $1'],
      [/^Destination: (.+)$/, 'Ziel: $1'],
      [/^Stop (\d+): (.+)$/, 'Zwischenziel $1: $2'],
      [/^Leg (\d+): (.+)$/, 'Etappe $1: $2'],
    ];
    for (const [pattern, replacement] of patterns)
      if (pattern.test(message)) {
        text = message.replace(pattern, replacement);
        const colon = text.indexOf(': ');
        if (colon >= 0)
          text = text.slice(0, colon + 2) + translate(text.slice(colon + 2), language);
        break;
      }
  }
  return text.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
export function chooseLanguage(
  path: string,
  query: string,
  saved: string | null,
  browser: string,
): Language {
  const explicit = new URLSearchParams(query).get('lang');
  if (explicit === 'en' || explicit === 'de') return explicit;
  if (path === '/de' || path.startsWith('/de/')) return 'de';
  if (saved === 'en' || saved === 'de') return saved;
  return browser.startsWith('de') ? 'de' : 'en';
}
const I18n = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
  locale: string;
  number: (value: number, decimals?: number) => string;
  localPath: (path: string) => string;
} | null>(null);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setCurrent] = useState<Language>(() => {
    let saved = null;
    try {
      saved = localStorage.getItem('cw-language');
    } catch {
      /* Storage is optional. */
    }
    return chooseLanguage(location.pathname, location.search, saved, navigator.language);
  });
  const setLanguage = (next: Language) => {
    setCurrent(next);
    try {
      localStorage.setItem('cw-language', next);
    } catch {
      /* Storage is optional. */
    }
    const url = new URL(location.href);
    url.pathname = next === 'de' ? '/de/' : '/';
    url.searchParams.delete('lang');
    history.replaceState({}, '', url);
  };
  useEffect(() => {
    document.documentElement.lang = language;
    document.title =
      language === 'de'
        ? 'Cooler Walks — Fusswege mit mehr Schatten'
        : 'Cooler Walks — Walking routes with more shade';
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute(
        'href',
        language === 'de' ? '/manifest-de.webmanifest' : '/manifest.webmanifest',
      );
  }, [language]);
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (message: string, values?: Record<string, string | number>) =>
        translate(message, language, values),
      locale: language === 'de' ? 'de-DE' : 'en-GB',
      number: (number: number, decimals = 0) =>
        new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(number),
      localPath: (path: string) => `${language === 'de' ? '/de' : ''}${path}`,
    }),
    [language],
  );
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export function useI18n() {
  const context = useContext(I18n);
  if (!context) throw new Error('Missing language provider');
  return context;
}
