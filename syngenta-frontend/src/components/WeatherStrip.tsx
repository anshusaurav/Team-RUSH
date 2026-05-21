'use client';

import { WeatherSummary } from '@/lib/api';
import { CloudRain, Thermometer, Leaf } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';

const riskColor = {
  high:   'bg-red-50 border-red-200 text-red-800',
  medium: 'bg-amber-50 border-amber-200 text-amber-800',
  low:    'bg-green-50 border-green-200 text-green-700',
};

const riskDot = {
  high:   'bg-red-500',
  medium: 'bg-amber-400',
  low:    'bg-green-500',
};

export default function WeatherStrip({ weather }: { weather: WeatherSummary }) {
  const { t, locale } = useLocale();
  const weekdayLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const riskKey = `weather.pestRisk${weather.pest_risk.charAt(0).toUpperCase() + weather.pest_risk.slice(1)}`;

  return (
    <div className={`border rounded-lg px-3 py-2.5 text-xs ${riskColor[weather.pest_risk]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <span className={`w-2 h-2 rounded-full shrink-0 ${riskDot[weather.pest_risk]}`} />
          {weather.district} — {t(riskKey)}
        </div>
        <div className="flex items-center gap-3 text-xs opacity-80 shrink-0">
          {weather.heavy_rain_days > 0 && (
            <span className="flex items-center gap-1">
              <CloudRain size={11} /> {t('weather.daysRainShort', { n: weather.heavy_rain_days })}
            </span>
          )}
          {weather.heat_stress_days > 0 && (
            <span className="flex items-center gap-1">
              <Thermometer size={11} /> {t('weather.daysHeatShort', { n: weather.heat_stress_days })}
            </span>
          )}
          {weather.ndvi_proxy !== null && (
            <span className="flex items-center gap-1">
              <Leaf size={11} /> {weather.ndvi_proxy} W/m²
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 opacity-75 leading-relaxed">{weather.risk_summary}</p>

      {/* 3-day mini forecast */}
      <div className="grid grid-cols-3 gap-1.5 mt-2">
        {weather.forecast.slice(0, 3).map((d) => (
          <div key={d.date} className="bg-white bg-opacity-50 rounded px-1.5 py-1 text-center">
            <div className="font-medium">{new Date(d.date).toLocaleDateString(weekdayLocale, { weekday: 'short' })}</div>
            <div className="flex items-center justify-center gap-0.5 mt-0.5">
              <CloudRain size={9} className={d.rain_mm > 5 ? 'text-blue-500' : 'opacity-30'} />
              <span>{d.rain_mm}mm</span>
            </div>
            <div className="opacity-70">{d.temp_max_c}°C</div>
          </div>
        ))}
      </div>
    </div>
  );
}
