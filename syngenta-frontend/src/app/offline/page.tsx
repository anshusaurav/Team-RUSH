'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';

export default function OfflinePage() {
  const { t } = useLocale();
  return (
    <div className="page-shell flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
        <WifiOff size={32} className="text-amber-500" />
      </div>

      <h1 className="text-xl font-bold text-gray-800">{t('offline.title')}</h1>
      <p className="text-sm text-gray-500 max-w-xs">{t('offline.message')}</p>

      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 text-sm text-green-700 border border-green-300 rounded-lg px-4 py-2 hover:bg-green-50"
      >
        <RefreshCw size={14} /> {t('offline.tryAgain')}
      </button>
    </div>
  );
}
