'use client';

import { useEffect, useState } from 'react';
import { getAnomalies, resolveAnomaly, refreshAnomalies, AnomalyFlag } from '@/lib/api';
import { AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';

const severityStyle: Record<string, string> = {
  high: 'border-l-red-500 bg-red-50',
  medium: 'border-l-amber-500 bg-amber-50',
  low: 'border-l-yellow-400 bg-yellow-50',
};

const severityBadge: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-yellow-100 text-yellow-700',
};

const typeLabel: Record<string, string> = {
  stock_out:           '📦 Stock Out',
  demand_spike:        '📈 Demand Spike',
  low_inventory:       '⚠ Low Inventory',
  visit_gap:           '🕐 Visit Gap',
  digital_intent:      '📱 Digital Intent',
  weather_alert:       '🌧 Weather Alert',
  brain_demand_spike:  '🧠 ML Demand Spike',
  brain_stockout_risk: '🧠 ML Stockout Risk',
};

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const territoryId = 'TER_0001'; // TODO: tie to selected rep

  const load = async () => {
    setLoading(true);
    const severity = filter === 'all' ? undefined : filter;
    const data = await getAnomalies(territoryId, severity);
    setAnomalies(data.anomalies);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAnomalies();
    await load();
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" /> Alerts
          </h1>
          <p className="text-sm text-gray-500">Territory {territoryId}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-green-700 border border-green-300 rounded-lg px-3 py-1.5 hover:bg-green-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Running...' : 'Re-detect'}
        </button>
      </div>

      {/* Type summary chips */}
      {Object.entries(byType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byType).map(([type, count]) => (
            <div key={type} className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1 text-gray-600">
              {typeLabel[type] ?? type}: <span className="font-bold">{count}</span>
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
            {s.charAt(0).toUpperCase() + s.slice(1)}
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
          No active alerts
        </div>
      ) : (
        <div className="space-y-2">
          {anomalies.map(a => (
            <div key={a._id} className={`border-l-4 rounded-lg p-3 ${severityStyle[a.severity]} flex items-start justify-between gap-3`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-700">{typeLabel[a.anomaly_type] ?? a.anomaly_type}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${severityBadge[a.severity]}`}>
                    {a.severity}
                  </span>
                  {a.sku_name && <span className="text-xs text-gray-500 font-medium">{a.sku_name}</span>}
                </div>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{a.description}</p>
                <p className="text-xs text-gray-400 mt-1">{a.retailer_id} · {new Date(a.detected_at).toLocaleDateString('en-IN')}</p>
              </div>
              <button
                onClick={() => handleResolve(a._id)}
                disabled={resolving === a._id}
                className="shrink-0 text-xs text-green-700 border border-green-300 px-2 py-1 rounded hover:bg-green-50 disabled:opacity-50"
              >
                {resolving === a._id ? '...' : 'Resolve'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
