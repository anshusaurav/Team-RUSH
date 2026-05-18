'use client';

import { useEffect, useState } from 'react';
import { getVisitPlan, getAnomalies, getRepStats, getRep, getWeather, VisitPlanItem, AnomalyFlag, RepStats, WeatherSummary } from '@/lib/api';
import VisitPlanCard from '@/components/VisitPlanCard';
import AnomalySummaryBanner from '@/components/AnomalySummaryBanner';
import WeatherStrip from '@/components/WeatherStrip';
import RepSelector from '@/components/RepSelector';
import StatCard from '@/components/StatCard';
import { RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const [repId, setRepId] = useState<string>('REP_0001');
  const [territoryId, setTerritoryId] = useState<string>('TER_0001');
  const [plan, setPlan] = useState<VisitPlanItem[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [stats, setStats] = useState<RepStats | null>(null);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      // Cache for offline
      localStorage.setItem('visit_plan', JSON.stringify(planData.plan));
      localStorage.setItem('visit_plan_date', today);
      localStorage.setItem('visit_plan_rep', rid);
      // Fetch weather for rep's district (non-critical — don't block on failure)
      if (repData?.rep?.district) {
        getWeather(repData.rep.district).then(setWeather).catch(() => {});
      }
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
    setRepId(rid);
    setTerritoryId(tid);
    load(rid, tid);
  };

  useEffect(() => { load(repId, territoryId); }, []);

  const urgent = plan.filter(p => p.priority === 'urgent').length;
  const high = plan.filter(p => p.priority === 'high').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Daily Visit Plan</h1>
          <p className="text-sm text-gray-500">{today}</p>
        </div>
        <button
          onClick={() => load(repId, territoryId)}
          className="flex items-center gap-1.5 text-sm text-green-700 border border-green-300 rounded-lg px-3 py-1.5 hover:bg-green-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Rep selector */}
      <RepSelector currentRepId={repId} onSelect={handleRepChange} />

      {/* Error */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">{error}</div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Visits This Week" value={stats.visits_this_week} />
          <StatCard label="Acceptance Rate" value={`${stats.acceptance_rate_30d}%`} sub="30 days" />
          <StatCard label="Active Alerts" value={anomalies.length} highlight={anomalies.length > 0} />
        </div>
      )}

      {/* Anomaly banner */}
      {anomalies.length > 0 && <AnomalySummaryBanner anomalies={anomalies} />}

      {/* Weather strip */}
      {weather && <WeatherStrip weather={weather} />}

      {/* Visit plan */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-gray-700">Recommended Visits</h2>
          {urgent > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{urgent} urgent</span>}
          {high > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{high} high</span>}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : plan.length === 0 ? (
          <div className="text-center py-10 text-gray-400">No retailers found for this rep.</div>
        ) : (
          <div className="space-y-3">
            {plan.map((item, i) => (
              <VisitPlanCard key={item.retailer_id} rank={i + 1} item={item} repId={repId} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
