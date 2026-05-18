import { AnomalyFlag } from '@/lib/api';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const severityColor: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

const typeLabel: Record<string, string> = {
  stock_out: '📦 Out',
  demand_spike: '📈 Spike',
  low_inventory: '⚠ Low',
  visit_gap: '🕐 Gap',
};

export default function AnomalySummaryBanner({ anomalies }: { anomalies: AnomalyFlag[] }) {
  const highCount = anomalies.filter(a => a.severity === 'high').length;
  const top = anomalies.filter(a => a.severity !== 'low').slice(0, 4);

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
          <AlertTriangle size={15} />
          {anomalies.length} active alert{anomalies.length !== 1 ? 's' : ''} in territory
          {highCount > 0 && <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full">{highCount} high</span>}
        </div>
        <Link href="/anomalies" className="text-xs text-red-600 underline">View all</Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {top.map((a, i) => (
          <span key={i} className={`text-xs px-2 py-0.5 rounded border ${severityColor[a.severity]}`}>
            {typeLabel[a.anomaly_type] ?? a.anomaly_type}
            {a.sku_name ? `: ${a.sku_name}` : ''}
          </span>
        ))}
        {anomalies.length > 4 && (
          <span className="text-xs px-2 py-0.5 rounded border border-gray-200 bg-gray-100 text-gray-500">
            +{anomalies.length - 4} more
          </span>
        )}
      </div>
    </div>
  );
}
