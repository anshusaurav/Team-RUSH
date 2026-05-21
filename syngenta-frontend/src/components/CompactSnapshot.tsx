'use client';

/**
 * Compact dashboard snapshot strip. Pulls two pieces of context out of the
 * main flow so the visit plan stays the hero:
 *   - Weather → small pill showing district, pest-risk dot, key counts
 *   - Anomalies → small pill linking to /anomalies
 *
 * Both pills are inline, ~32–36px tall, and stay above the visit plan.
 * The full WeatherStrip and AnomalySummaryBanner UIs still exist (used
 * elsewhere); this component is a denser summary for the dashboard.
 */

import Link from 'next/link';
import { CloudRain, Thermometer, AlertTriangle, Leaf } from 'lucide-react';
import { WeatherSummary, AnomalyFlag } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleProvider';

interface Props {
  weather: WeatherSummary | null;
  anomalies: AnomalyFlag[];
}

const riskClass: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-500',
  low:    'bg-green-500',
};

const riskTextClass: Record<string, string> = {
  high:   'border-red-200 bg-red-50 text-red-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low:    'border-green-200 bg-green-50 text-green-800',
};

export default function CompactSnapshot({ weather, anomalies }: Props) {
  const { t } = useLocale();

  if (!weather && anomalies.length === 0) return null;

  const highCount = anomalies.filter(a => a.severity === 'high').length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Weather chip */}
      {weather && (
        <div
          className={`inline-flex items-center gap-2 border rounded-full pl-2.5 pr-3 py-1.5 text-xs font-medium ${riskTextClass[weather.pest_risk]}`}
          title={weather.risk_summary}
        >
          <span className={`w-2 h-2 rounded-full ${riskClass[weather.pest_risk]}`} />
          <span className="font-semibold">{weather.district}</span>
          <span className="opacity-50">·</span>
          <span className="capitalize">{t(`weather.pestRisk${weather.pest_risk.charAt(0).toUpperCase()}${weather.pest_risk.slice(1)}`)}</span>
          {weather.heavy_rain_days > 0 && (
            <>
              <span className="opacity-30">·</span>
              <span className="flex items-center gap-0.5">
                <CloudRain size={11} />
                {t('weather.daysRainShort', { n: weather.heavy_rain_days })}
              </span>
            </>
          )}
          {weather.heat_stress_days > 0 && (
            <>
              <span className="opacity-30">·</span>
              <span className="flex items-center gap-0.5">
                <Thermometer size={11} />
                {t('weather.daysHeatShort', { n: weather.heat_stress_days })}
              </span>
            </>
          )}
          {weather.ndvi_proxy !== null && (
            <>
              <span className="opacity-30">·</span>
              <span className="flex items-center gap-0.5">
                <Leaf size={11} />
                {weather.ndvi_proxy} W/m²
              </span>
            </>
          )}
        </div>
      )}

      {/* Alert chip (links to /anomalies) */}
      {anomalies.length > 0 && (
        <Link
          href="/anomalies"
          className="inline-flex items-center gap-1.5 border border-red-200 bg-red-50 text-red-800 rounded-full pl-2.5 pr-3 py-1.5 text-xs font-medium hover:bg-red-100 transition-colors"
        >
          <AlertTriangle size={12} />
          {t(
            anomalies.length === 1 ? 'dashboard.snapshotAlertChip' : 'dashboard.snapshotAlertChipPlural',
            { count: anomalies.length, high: highCount }
          )}
        </Link>
      )}
    </div>
  );
}
