'use client';

import { useEffect, useState } from 'react';
import { getAnomalies, resolveAnomaly, refreshAnomalies, AnomalyFlag } from '@/lib/api';
import { AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { useSelectedRep } from '@/lib/useSelectedRep';
import RepSelector from '@/components/RepSelector';

// Clean card pattern (mirrors VisitPlanCard) — white body, thin grey border,
// soft severity-tinted ring, flush top accent bar. No left ribbon, no bg
// tint, no broken corners.
const severityCardStyle: Record<string, string> = {
  high:   'border-gray-200 ring-1 ring-red-100',
  medium: 'border-gray-200 ring-1 ring-amber-100',
  low:    'border-gray-200',
};

const severityAccent: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-400',
  low:    '',
};

const severityBadge: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-yellow-100 text-yellow-700',
};

const filterKeys: Record<string, string> = {
  all: 'anomalies.filterAll',
  high: 'anomalies.filterHigh',
  medium: 'anomalies.filterMedium',
  low: 'anomalies.filterLow',
};

const severityKeys: Record<string, string> = {
  high: 'anomalies.severityHigh',
  medium: 'anomalies.severityMedium',
  low: 'anomalies.severityLow',
};

export default function AnomaliesPage() {
  const { t, locale } = useLocale();
  const dateLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const { repId, territoryId, setRep, hydrated } = useSelectedRep();
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = async (tid: string, sev: string) => {
    setLoading(true);
    const severity = sev === 'all' ? undefined : sev;
    const data = await getAnomalies(tid, severity);
    setAnomalies(data.anomalies);
    setLoading(false);
  };

  // Re-fetch when severity filter or selected territory changes (after hydration).
  useEffect(() => {
    if (hydrated) load(territoryId, filter);
  }, [filter, territoryId, hydrated]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAnomalies();
    await load(territoryId, filter);
    setRefreshing(false);
  };

  const handleResolve = async (id: string) => {
    setResolving(id);
    await resolveAnomaly(id);
    setAnomalies(prev => prev.filter(a => a._id !== id));
    setResolving(null);
  };

  const byType = anomalies.reduce<Record<string, number>>((acc, a) => {
    acc[a.anomaly_type] = (acc[a.anomaly_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-shell space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" /> {t('anomalies.title')}
          </h1>
          <p className="text-sm text-gray-500">{t('anomalies.territory', { id: territoryId })}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-green-700 border border-green-300 rounded-lg px-3 py-1.5 hover:bg-green-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? t('anomalies.redetecting') : t('anomalies.redetect')}
        </button>
      </div>

      {/* Rep / territory selector — shared with Dashboard via localStorage */}
      <RepSelector currentRepId={repId} onSelect={(rid, tid) => setRep(rid, tid)} />

      {/* Type summary chips */}
      {Object.entries(byType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byType).map(([type, count]) => (
            <div key={type} className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1 text-gray-600">
              {t(`anomalies.typeLong.${type}`)}: <span className="font-bold">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Severity filter */}
      <div className="flex gap-2">
        {['all', 'high', 'medium', 'low'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === s ? 'bg-green-700 text-white border-green-700' : 'border-gray-200 text-gray-600 hover:border-green-400'
            }`}
          >
            {t(filterKeys[s])}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}
        </div>
      ) : anomalies.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle size={32} className="mx-auto mb-2 text-green-300" />
          {t('anomalies.noAlerts')}
        </div>
      ) : (
        <div className="space-y-4">
          {anomalies.map(a => (
            <div
              key={a._id}
              className={`relative z-0 hover:z-10 overflow-hidden bg-white border rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow flex items-start justify-between gap-3 ${severityCardStyle[a.severity]}`}
            >
              {/* Thin top accent bar (only for high/medium severity) — sits
                  flush with the rounded corners thanks to overflow-hidden. */}
              {severityAccent[a.severity] && (
                <div className={`absolute inset-x-0 top-0 h-1 ${severityAccent[a.severity]}`} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-700">{t(`anomalies.typeLong.${a.anomaly_type}`)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${severityBadge[a.severity]}`}>
                    {t(severityKeys[a.severity])}
                  </span>
                  {a.sku_name && <span className="text-xs text-gray-500 font-medium">{a.sku_name}</span>}
                </div>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{a.description}</p>
                <p className="text-xs text-gray-400 mt-1">{a.retailer_id} · {new Date(a.detected_at).toLocaleDateString(dateLocale)}</p>
              </div>
              <button
                onClick={() => handleResolve(a._id)}
                disabled={resolving === a._id}
                className="shrink-0 text-xs text-green-700 border border-green-300 px-2 py-1 rounded hover:bg-green-50 disabled:opacity-50"
              >
                {resolving === a._id ? t('anomalies.resolving') : t('anomalies.resolve')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
