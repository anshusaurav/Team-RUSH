export type Locale = 'en' | 'hi';

export const LOCALES: Locale[] = ['en', 'hi'];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी',
};

// Short tag shown on the picker button (must fit ~3 chars).
export const LOCALE_CODE_LABELS: Record<Locale, string> = {
  en: 'EN',
  hi: 'हिं',
};

// States whose primary language is Hindi (used to auto-pick locale by rep location).
const HINDI_BELT = new Set([
  'Bihar',
  'Uttar Pradesh',
  'Madhya Pradesh',
  'Rajasthan',
  'Haryana',
  'Delhi',
  'Himachal Pradesh',
  'Uttarakhand',
  'Jharkhand',
  'Chhattisgarh',
]);

export function stateToLocale(state: string | undefined | null): Locale {
  return state && HINDI_BELT.has(state) ? 'hi' : 'en';
}
