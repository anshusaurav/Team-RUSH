'use client';

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { useLocale } from '@/lib/i18n/LocaleProvider';

interface WeekPoint {
  label:  string;
  week:   string;
  actual: number;
}

interface VelocityData {
  sku:              string;
  weeks:            WeekPoint[];
  predicted:        number;
  current_qty:      number;
  days_to_stockout: number | null;
  anomaly_type:     'brain_demand_spike' | 'brain_stockout_risk' | null;
  deviation:        number;
}

interface Props {
  data: VelocityData;
}

function CustomTooltip({ active, payload, label, unitTpl }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{unitTpl.replace('{n}', String(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

export default function VelocityChart({ data }: Props) {
  const { t } = useLocale();
  const { sku, weeks, predicted, current_qty, days_to_stockout, anomaly_type, deviation } = data;

  // Build chart data — append a "next week" prediction point
  const chartData = [
    ...weeks.map(w => ({ label: w.label, actual: w.actual, predicted: null as number | null })),
    { label: t('velocityChart.nextWk'), actual: null as number | null, predicted },
  ];

  // Colour scheme
  const isSpike     = anomaly_type === 'brain_demand_spike';
  const isStockout  = anomaly_type === 'brain_stockout_risk';
  const accentColor = isSpike ? '#f59e0b' : isStockout ? '#ef4444' : '#22c55e';
  const predColor   = '#8b5cf6';

  // Stockout urgency label
  const stockoutLabel =
    days_to_stockout !== null
      ? days_to_stockout < 7
        ? t('velocityChart.stockoutSoon', { days: days_to_stockout })
        : days_to_stockout < 14
        ? t('velocityChart.stockLeft', { days: days_to_stockout })
        : null
      : null;

  const unitsTpl = t('velocityChart.unitsTooltip');
  const actualLabel = t('velocityChart.actual');
  const forecastLabel = t('velocityChart.lstmForecast');

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-700">{sku}</p>
          <p className="text-xs text-gray-400">{t('velocityChart.weeklySubtitle')}</p>
        </div>
        <div className="text-right space-y-0.5">
          {stockoutLabel && (
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
              days_to_stockout! < 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {stockoutLabel}
            </span>
          )}
          {anomaly_type && (
            <div>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                isSpike ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              }`}>
                {isSpike ? t('velocityChart.spikeBadge', { n: deviation }) : t('velocityChart.drop')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip content={(props: any) => <CustomTooltip {...props} unitTpl={unitsTpl} />} />

          {/* Actual weekly sales as bars */}
          <Bar
            dataKey="actual"
            name={actualLabel}
            fill={accentColor}
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={24}
          />

          {/* LSTM predicted next week as a single dot + line */}
          <Line
            dataKey="predicted"
            name={forecastLabel}
            stroke={predColor}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 5, fill: predColor, strokeWidth: 0 }}
            connectNulls={false}
          />

          {/* Horizontal reference: last-actual level */}
          {weeks.length > 0 && (
            <ReferenceLine
              y={weeks[weeks.length - 1].actual}
              stroke="#d1d5db"
              strokeDasharray="3 3"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Footer stats */}
      <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
        <span>{t('velocityChart.stockLabel')} <span className="font-semibold text-gray-700">{t('velocityChart.stockValue', { n: current_qty })}</span></span>
        <span>{t('velocityChart.forecastLabel')} <span className="font-semibold" style={{ color: predColor }}>{t('velocityChart.forecastValue', { n: predicted })}</span></span>
      </div>
    </div>
  );
}
