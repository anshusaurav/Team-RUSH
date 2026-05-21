'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getVisitPlan, getAnomalies, getRepStats, getRep, getWeather, VisitPlanItem, AnomalyFlag, RepStats, WeatherSummary, Rep } from '@/lib/api';
import VisitPlanCard from '@/components/VisitPlanCard';
import CompactSnapshot from '@/components/CompactSnapshot';
import RepSelector from '@/components/RepSelector';
import StatCard from '@/components/StatCard';
import TerritoryInsight from '@/components/TerritoryInsight';
import { RefreshCw, List, Map as MapIcon, CheckCircle } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { useSelectedRep } from '@/lib/useSelectedRep';

// Leaflet touches `window` on import — load only on the client and only when
// the user switches to the map view (keeps default list-view bundle slim).
const VisitPlanMap = dynamic(() => import('@/components/VisitPlanMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] rounded-lg bg-gray-100 animate-pulse" />
  ),
});

const VIEW_KEY = 'dashboard_view';
type ViewMode = 'list' | 'map';

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function DashboardInner() {
  const { t, setAutoLocale } = useLocale();
  const { repId, territoryId, setRep, hydrated } = useSelectedRep();
  const searchParams = useSearchParams();
  const visitDone = searchParams.get('visitDone'); // retailer ID just logged
  const [plan, setPlan] = useState<VisitPlanItem[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [stats, setStats] = useState<RepStats | null>(null);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Map view is the default — list is opt-in via the toggle.
  const [view, setView] = useState<ViewMode>('map');
  const [rep, setRepObj] = useState<Rep | null>(null);

  // Restore last-used view preference (overrides the default).
  useEffect(() => {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === 'map' || stored === 'list') setView(stored);
  }, []);

  const handleViewChange = (v: ViewMode) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const today = new Date().toISOString().split('T')[0];

  const load = async (rid: string, tid: string) => {
    setLoading(true);
    setError('');
    try {
      const [planData, anomalyData, statsData, repData] = await Promise.all([
        getVisitPlan(rid, today),
        getAnomalies(tid),
        getRepStats(rid),
        getRep(rid),
      ]);
      setPlan(planData.plan ?? []);
      setAnomalies(anomalyData.anomalies ?? []);
      setStats(statsData);
      setRepObj(repData?.rep ?? null);
      // Cache for offline
      localStorage.setItem('visit_plan', JSON.stringify(planData.plan));
      localStorage.setItem('visit_plan_date', today);
      localStorage.setItem('visit_plan_rep', rid);
      // Fetch weather for rep's district (non-critical — don't block on failure)
      if (repData?.rep?.district) {
        getWeather(repData.rep.district).then(setWeather).catch(() => {});
      }
      // Auto-pick the UI locale from rep's state (no-op if user already overrode).
      setAutoLocale(repData?.rep?.state);
    } catch {
      setError('Could not reach backend. Showing cached data if available.');
      const cached = localStorage.getItem('visit_plan');
      const cachedDate = localStorage.getItem('visit_plan_date');
      const cachedRep = localStorage.getItem('visit_plan_rep');
      if (cached && cachedDate === today && cachedRep === rid) setPlan(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  };

  const handleRepChange = (rid: string, tid: string) => {
    setRep(rid, tid);
    load(rid, tid);
  };

  // Wait until localStorage has been read before firing the first load,
  // so a rep chosen on another page is honored immediately.
  useEffect(() => {
    if (hydrated) load(repId, territoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const urgent = plan.filter(p => p.priority === 'urgent').length;
  const high = plan.filter(p => p.priority === 'high').length;

  const totalOutcomes = stats
    ? Object.values(stats.outcomes_this_month || {}).reduce((s, n) => s + n, 0)
    : 0;

  return (
    <div className="page-shell space-y-5">
      {/* ─── Header: title + date + refresh ─────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900">
            {t('dashboard.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => load(repId, territoryId)}
          className="flex items-center gap-1.5 text-sm text-green-700 border border-green-300 rounded-lg px-3 py-1.5 hover:bg-green-50 transition-colors"
        >
          <RefreshCw size={14} /> {t('common.refresh')}
        </button>
      </div>

      {/* ─── Rep selector ───────────────────────────────────────────── */}
      <RepSelector currentRepId={repId} onSelect={handleRepChange} />

      {/* ─── Visit-logged success banner ─────────────────────────────── */}
      {visitDone && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-300 rounded-lg px-4 py-2.5 text-sm text-green-800 font-medium">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          Visit at <strong>{visitDone}</strong> logged — plan refreshed, stop removed.
        </div>
      )}

      {/* ─── Offline / error banner ─────────────────────────────────── */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          {t('dashboard.error')}
        </div>
      )}

      {/* ─── Today snapshot — weather + alert chips, dense, out of the
            main flow so the visit plan stays the hero. ───────────────── */}
      <CompactSnapshot weather={weather} anomalies={anomalies} />

      {/* ─── Territory Intelligence — LLM strategic overview (manager view) */}
      {!loading && <TerritoryInsight territoryId={territoryId} />}

      {/* ─── Visit plan (HERO) — map by default, list opt-in ────────── */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-lg font-semibold text-gray-900">
              {t('dashboard.recommendedVisits')}
            </h2>
            {urgent > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                {t('dashboard.urgentTag', { count: urgent })}
              </span>
            )}
            {high > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {t('dashboard.highTag', { count: high })}
              </span>
            )}
          </div>
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5 shrink-0 shadow-sm">
            <button
              type="button"
              onClick={() => handleViewChange('list')}
              aria-pressed={view === 'list'}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                view === 'list' ? 'bg-green-700 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <List size={12} /> {t('dashboard.viewList')}
            </button>
            <button
              type="button"
              onClick={() => handleViewChange('map')}
              aria-pressed={view === 'map'}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                view === 'map' ? 'bg-green-700 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <MapIcon size={12} /> {t('dashboard.viewMap')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : plan.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white border border-dashed border-gray-200 rounded-lg">
            {t('dashboard.noRetailers')}
          </div>
        ) : view === 'map' ? (
          <VisitPlanMap plan={plan} repId={repId} date={today} repDistrict={rep?.district} />
        ) : (
          <div className="space-y-5">
            {plan.map((item, i) => (
              <VisitPlanCard key={item.retailer_id} rank={i + 1} item={item} repId={repId} />
            ))}
          </div>
        )}
      </section>

      {/* ─── KPI strip — below the work, summary view ───────────────── */}
      {stats && (
        <section>
          <h3 className="font-display text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
            {t('dashboard.performanceHeader')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label={t('dashboard.stats.visitsThisWeek')} value={stats.visits_this_week} />
            <StatCard
              label={t('dashboard.stats.acceptanceRate')}
              value={totalOutcomes === 0 ? '—' : `${stats.acceptance_rate_30d}%`}
              sub={
                totalOutcomes === 0
                  ? t('dashboard.stats.noOutcomes')
                  : t(totalOutcomes === 1 ? 'dashboard.stats.outcomesSub' : 'dashboard.stats.outcomesSubPlural', { n: totalOutcomes })
              }
            />
            <StatCard
              label={t('dashboard.stats.revenuePerFieldDay')}
              value={`₹${formatCompact(stats.revenue_per_field_day_30d)}`}
              sub={t('dashboard.stats.fieldDaysSub', { days: stats.field_days_30d })}
            />
            <StatCard
              label={t('dashboard.stats.coverageEfficiency')}
              value={`${stats.coverage_efficiency_30d}%`}
              sub={t('dashboard.stats.tehsilsSub', { visited: stats.tehsils_visited_30d, total: stats.tehsils_total })}
            />
            <StatCard
              label={t('dashboard.stats.activeAlerts')}
              value={anomalies.length}
              highlight={anomalies.length > 0}
            />
          </div>
        </section>
      )}
    </div>
  );
}

// useSearchParams() requires a Suspense boundary during prerendering.
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="h-8 bg-gray-200 rounded animate-pulse w-48" /></div>}>
      <DashboardInner />
    </Suspense>
  );
}
