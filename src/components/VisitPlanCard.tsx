'use client';

import Link from 'next/link';
import { VisitPlanItem } from '@/lib/api';
import { MapPin, Clock, Package, TrendingUp, AlertTriangle, Leaf, Smartphone } from 'lucide-react';

const priorityStyle: Record<string, string> = {
  urgent: 'border-red-400 bg-red-50',
  high: 'border-amber-400 bg-amber-50',
  normal: 'border-gray-200 bg-white',
};

const priorityBadge: Record<string, string> = {
  urgent: 'bg-red-600 text-white',
  high: 'bg-amber-500 text-white',
  normal: 'bg-gray-200 text-gray-600',
};

function proximityLabel(index: number): { label: string; className: string } {
  if (index < 0) return { label: '', className: '' };
  if (index === 0) return { label: 'Home base', className: 'bg-green-100 text-green-700' };
  if (index <= 2) return { label: 'Nearby', className: 'bg-teal-50 text-teal-700' };
  if (index <= 5) return { label: 'In range', className: 'bg-gray-100 text-gray-500' };
  return { label: 'Farther out', className: 'bg-gray-100 text-gray-400' };
}

export default function VisitPlanCard({
  rank, item, repId,
}: {
  rank: number; item: VisitPlanItem; repId: string;
}) {
  const { score_breakdown: sb } = item;
  const daysLabel = sb.days_since_visit === -1 ? 'Never visited' : `${sb.days_since_visit}d ago`;
  const prox = proximityLabel(item.proximity_index);
  const bioUrgency = sb.biological_urgency ?? 0;
  const digitalIntent = sb.digital_intent ?? 0;

  return (
    <Link href={`/retailer/${item.retailer_id}?repId=${repId}`}>
      <div className={`border-l-4 rounded-lg p-4 cursor-pointer shadow-sm hover:shadow-md transition-shadow ${priorityStyle[item.priority]}`}>

        {/* Header row: rank + retailer ID + badges + score */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="text-2xl font-bold text-gray-300 leading-none mt-0.5">#{rank}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-800">{item.retailer_id}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityBadge[item.priority]}`}>
                  {item.priority.toUpperCase()}
                </span>
                {prox.label && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${prox.className}`}>
                    {prox.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <MapPin size={11} /> {item.tehsil}, {item.district}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-green-700">{item.score}</div>
            <div className="text-xs text-gray-400">score</div>
          </div>
        </div>

        {/* Biological urgency + digital intent signals */}
        {(bioUrgency > 0 || digitalIntent > 0) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {bioUrgency > 0 && (
              <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Leaf size={10} /> {bioUrgency} grower{bioUrgency > 1 ? 's' : ''} at crop stage
              </span>
            )}
            {digitalIntent > 0 && (
              <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                <Smartphone size={10} /> {digitalIntent} WhatsApp click{digitalIntent > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mt-3 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <Clock size={11} className="text-gray-400" /> {daysLabel}
          </div>
          <div className="flex items-center gap-1">
            <Package size={11} className={sb.stock_out_count > 0 ? 'text-red-500' : 'text-gray-400'} />
            {sb.stock_out_count > 0
              ? <span className="text-red-600 font-medium">{sb.stock_out_count} out</span>
              : 'In stock'}
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp size={11} className="text-gray-400" /> {sb.sales_velocity_30d} units
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle size={11} className={sb.anomaly_count > 0 ? 'text-red-400' : 'text-gray-300'} />
            {sb.anomaly_count > 0
              ? <span className="text-red-600 font-medium">{sb.anomaly_count} alert{sb.anomaly_count > 1 ? 's' : ''}</span>
              : 'No alerts'}
          </div>
        </div>

      </div>
    </Link>
  );
}
