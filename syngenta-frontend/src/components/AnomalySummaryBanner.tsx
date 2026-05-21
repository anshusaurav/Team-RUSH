'use client';

import { AnomalyFlag } from '@/lib/api';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from '@/lib/i18n/LocaleProvider';

const severityColor: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

export default function AnomalySummaryBanner({ anomalies }: { anomalies: AnomalyFlag[] }) {
  const { t } = useLocale();
  const highCount = anomalies.filter(a => a.severity === 'high').length;
  const top = anomalies.filter(a => a.severity !== 'low').slice(0, 4);
  const total = anomalies.length;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
          <AlertTriangle size={15} />
          {t(total === 1 ? 'anomalyBanner.activeIn' : 'anomalyBanner.activeInPlural', { count: total })}
          {highCount > 0 && (
            <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full">
              {t('anomalyBanner.highCount', { n: highCount })}
            </span>
          )}
        </div>
        <Link href="/anomalies" className="text-xs text-red-600 underline">
          {t('common.viewAll')}
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {top.map((a, i) => (
          <span key={i} className={`text-xs px-2 py-0.5 rounded border ${severityColor[a.severity]}`}>
            {t(`anomalyBanner.typeShort.${a.anomaly_type}`)}
            {a.sku_name ? `: ${a.sku_name}` : ''}
          </span>
        ))}
        {anomalies.length > 4 && (
          <span className="text-xs px-2 py-0.5 rounded border border-gray-200 bg-gray-100 text-gray-500">
            {t('anomalyBanner.moreCount', { n: anomalies.length - 4 })}
          </span>
        )}
      </div>
    </div>
  );
}
