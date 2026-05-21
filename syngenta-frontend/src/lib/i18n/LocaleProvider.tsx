'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Locale, stateToLocale } from './types';
import en from './dict/en';
import hi from './dict/hi';

const DICTS: Record<Locale, typeof en> = { en, hi };

type Vars = Record<string, string | number>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Set locale based on a rep state, only if the user has not manually overridden. */
  setAutoLocale: (state: string | undefined | null) => void;
  /** Whether the user has manually overridden the auto-detected locale. */
  hasOverride: boolean;
  /** Translate a dotted key with optional `{var}` interpolation. Falls back to EN. */
  t: (key: string, vars?: Vars) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = 'app_locale';
const OVERRIDE_KEY = 'app_locale_override';

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

function lookup(dict: unknown, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [hasOverride, setHasOverride] = useState(false);

  // Restore persisted locale on first mount.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'hi') setLocaleState(stored);
    setHasOverride(localStorage.getItem(OVERRIDE_KEY) === '1');
  }, []);

  // Keep <html lang> in sync so screen readers + page metadata match the UI.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l);
    localStorage.setItem(OVERRIDE_KEY, '1');
    setHasOverride(true);
    setLocaleState(l);
  }, []);

  const setAutoLocale = useCallback((state: string | undefined | null) => {
    if (localStorage.getItem(OVERRIDE_KEY) === '1') return; // user has chosen explicitly
    const auto = stateToLocale(state);
    localStorage.setItem(STORAGE_KEY, auto);
    setLocaleState(auto);
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const direct = lookup(DICTS[locale], key);
      if (direct !== undefined) return interpolate(direct, vars);
      const fallback = lookup(DICTS.en, key);
      return interpolate(fallback ?? key, vars);
    },
    [locale]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, setAutoLocale, hasOverride, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
