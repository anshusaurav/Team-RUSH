'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, AlertTriangle, Users, Sprout } from 'lucide-react';
import LanguagePicker from './LanguagePicker';
import { useLocale } from '@/lib/i18n/LocaleProvider';

const links = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/anomalies', labelKey: 'nav.alerts', icon: AlertTriangle },
  { href: '/reps', labelKey: 'nav.reps', icon: Users },
];

export default function Navbar() {
  const pathname = usePathname();
  const { t } = useLocale();

  // Landing page (/) gets a minimal marketing-style top bar: brand on the
  // left, language picker on the right. Lighter than the full app navbar so
  // it doesn't compete with the hero, but still shows the Disha mark.
  const isLanding = pathname === '/';
  if (isLanding) {
    return (
      <header className="absolute top-0 inset-x-0 z-30">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="font-display flex items-center gap-2 text-gray-900 hover:opacity-80 transition-opacity">
            <span className="w-7 h-7 rounded-md bg-green-700 flex items-center justify-center shadow-sm">
              <Sprout size={15} className="text-white" />
            </span>
            <span className="font-bold text-lg tracking-tight">{t('brand')}</span>
            {/* Syngenta logo — filter:brightness(0) renders all fills as black on the light landing navbar */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/syngenta-logo.svg"
              alt="Syngenta"
              className="hidden sm:block ml-2 opacity-40"
              style={{ height: '14px', filter: 'brightness(0)' }}
            />
          </Link>
          <div className="bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-gray-200 px-1 py-1">
            <LanguagePicker />
          </div>
        </div>
      </header>
    );
  }

  return (
    <nav className="bg-gradient-to-r from-green-800 to-green-700 text-white shadow-md sticky top-0 z-20">
      <div className="max-w-2xl mx-auto px-4 flex items-center justify-between h-14 gap-2">
        <Link
          href="/"
          className="font-display font-bold text-lg tracking-tight flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <span className="w-7 h-7 rounded-md bg-white/15 flex items-center justify-center">
            <Sprout size={15} className="text-green-100" />
          </span>
          <span>{t('brand')}</span>
        </Link>
        <div className="flex items-center gap-1">
          {links.map(({ href, labelKey, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-white/15 text-white'
                  : 'text-green-50/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={15} />
              <span>{t(labelKey)}</span>
            </Link>
          ))}
          <LanguagePicker variant="on-dark" />
        </div>
      </div>
    </nav>
  );
}
