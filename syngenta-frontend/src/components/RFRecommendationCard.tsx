'use client';

import { useEffect, useState } from 'react';
import { getRFRecommendation, RFRecommendation } from '@/lib/api';
import { BrainCircuit, Loader2, AlertCircle } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';

export default function RFRecommendationCard({ retailerId }: { retailerId: string }) {
  const { t, locale } = useLocale();
  const numberLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const [data, setData]       = useState<RFRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    getRFRecommendation(retailerId)
      .then(setData)
      .catch((e) => setError(e?.response?.data?.error ?? e.message))
      .finally(() => setLoading(false));
  }, [retailerId]);

  if (loading) {
    return (
      <div className="border border-purple-100 rounded-xl p-4 bg-purple-50 flex items-center gap-2 text-sm text-purple-600">
        <Loader2 size={14} className="animate-spin shrink-0" />
        {t('rfCard.predicting')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex items-start gap-2 text-xs text-gray-500">
        <AlertCircle size={13} className="shrink-0 mt-0.5" />
        <span>{t('rfCard.errorPrefix')} {error}</span>
      </div>
    );
  }

  if (!data) return null;

  const pct = Math.round(data.confidence * 100);
  const barColor = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="border border-purple-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 border-b border-purple-100">
        <BrainCircuit size={14} className="text-purple-600 shrink-0" />
        <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">{t('rfCard.header')}</span>
        <span className="ml-auto text-xs text-purple-400">
          {t('rfCard.visitsTrained', { n: data.model_trained_on.toLocaleString(numberLocale) })}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3 bg-white">
        {/* Product + confidence */}
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-gray-800 text-sm">{data.product_recommended}</span>
          <span className="text-xs text-gray-500 shrink-0">{t('rfCard.confidence', { pct })}</span>
        </div>

        {/* Confidence bar */}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Reasoning — backend prose, kept in source language */}
        <p className="text-xs text-gray-600 leading-relaxed">{data.reasoning}</p>
      </div>
    </div>
  );
}
