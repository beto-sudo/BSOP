'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import en from './locales/en.json';
import es from './locales/es.json';

export type Locale = 'en' | 'es';
type Dict = Record<string, string>;

const dicts: Record<Locale, Dict> = { en, es };

function translate(dict: Dict, key: string, vars?: Record<string, string | number>): string {
  let str = dict[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return str;
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('es');

  useEffect(() => {
    const stored = localStorage.getItem('bsop-locale') as Locale | null;
    if (stored === 'en' || stored === 'es') {
      setLocaleState(stored);
    }
  }, []);

  function setLocale(newLocale: Locale) {
    setLocaleState(newLocale);
    localStorage.setItem('bsop-locale', newLocale);
  }

  function t(key: string, vars?: Record<string, string | number>) {
    return translate(dicts[locale], key, vars);
  }

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
