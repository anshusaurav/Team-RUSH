'use client';

import { useEffect, useRef, useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { LOCALES, LOCALE_LABELS, LOCALE_CODE_LABELS } from '@/lib/i18n/types';

interface Props {
  /** "on-dark" = white-ish text for the green navbar; "on-light" = dark
      slate text for the floating pill on the landing page. Default is light
      so the picker stays readable wherever it lands. */
  variant?: 'on-dark' | 'on-light';
}

export default function LanguagePicker({ variant = 'on-light' }: Props) {
  const { locale, setLocale, hasOverride, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const buttonClass =
    variant === 'on-dark'
      ? 'text-white hover:bg-white/15'
      : 'text-gray-700 hover:bg-gray-100';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${buttonClass}`}
      >
        <Globe size={15} />
        <span>{LOCALE_CODE_LABELS[locale]}</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 min-w-40 z-30 overflow-hidden"
        >
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
            {t('language.title')}
          </div>
          {LOCALES.map(l => (
            <button
              key={l}
              type="button"
              role="option"
              aria-selected={l === locale}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`flex items-center justify-between w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                l === locale ? 'font-semibold text-green-700' : 'text-gray-700'
              }`}
            >
              <span>{LOCALE_LABELS[l]}</span>
              {l === locale && <Check size={14} />}
            </button>
          ))}
          {!hasOverride && (
            <div className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100">
              {t('language.autoNote')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
