/**
 * Weather + Agro-climate Service
 *
 * Data sources (both free, no API key required):
 *  - Open-Meteo  → 7-day weather forecast (rain, temp, humidity)
 *  - NASA POWER  → Agricultural solar radiation & soil moisture proxy (historical/recent)
 *
 * Results are cached in memory per district for 6 hours to avoid hitting
 * the APIs on every visit-plan request.
 */

import https from 'https';
import { getCoordsForDistrict } from '../data/districtCoords';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DailyWeather {
  date: string;
  rain_mm: number;          // precipitation sum (mm)
  temp_max_c: number;       // max temperature °C
  temp_min_c: number;       // min temperature °C
  humidity_max_pct: number; // max relative humidity %
}

export interface WeatherSummary {
  district: string;
  lat: number;
  lon: number;
  forecast: DailyWeather[];           // 7-day Open-Meteo forecast
  pest_risk: 'high' | 'medium' | 'low';  // computed from humidity + temp
  heavy_rain_days: number;            // days with rain > 20 mm in next 7 days
  heat_stress_days: number;           // days with temp > 38°C in next 7 days
  ndvi_proxy: number | null;          // NASA POWER solar radiation (W/m²) as crop stress proxy
  risk_summary: string;               // one-line human-readable summary
  fetched_at: Date;
}

// ── In-memory cache (6-hour TTL) ─────────────────────────────────────────────

const cache = new Map<string, WeatherSummary>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isFresh(summary: WeatherSummary): boolean {
  return Date.now() - summary.fetched_at.getTime() < CACHE_TTL_MS;
}

// ── HTTP helper (no axios dependency) ────────────────────────────────────────

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'syngenta-field-copilot/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${url}`)); }
      });
    }).on('error', reject);
  });
}

// ── Open-Meteo forecast ───────────────────────────────────────────────────────

async function fetchOpenMeteo(lat: number, lon: number): Promise<DailyWeather[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,relative_humidity_2m_max` +
    `&forecast_days=7&timezone=Asia%2FKolkata`;

  const data = await fetchJSON(url);
  const d = data.daily;

  return (d.time as string[]).map((date: string, i: number) => ({
    date,
    rain_mm:          Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
    temp_max_c:       Math.round((d.temperature_2m_max[i] ?? 0) * 10) / 10,
    temp_min_c:       Math.round((d.temperature_2m_min[i] ?? 0) * 10) / 10,
    humidity_max_pct: Math.round(d.relative_humidity_2m_max[i] ?? 0),
  }));
}

// ── NASA POWER (agro solar radiation as NDVI proxy) ───────────────────────────

async function fetchNASAPower(lat: number, lon: number): Promise<number | null> {
  try {
    const today = new Date();
    const end = today.toISOString().slice(0, 10).replace(/-/g, '');
    const startDate = new Date(today.getTime() - 10 * 86400000);
    const start = startDate.toISOString().slice(0, 10).replace(/-/g, '');

    const url =
      `https://power.larc.nasa.gov/api/temporal/daily/point` +
      `?parameters=ALLSKY_SFC_SW_DWN&community=AG` +
      `&longitude=${lon}&latitude=${lat}` +
      `&start=${start}&end=${end}&format=JSON`;

    const data = await fetchJSON(url);
    const values: number[] = Object.values(
      data?.properties?.parameter?.ALLSKY_SFC_SW_DWN ?? {}
    );
    const valid = values.filter((v) => v >= 0);
    if (!valid.length) return null;
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return Math.round(avg * 10) / 10; // W/m² — lower = more cloud cover / crop stress
  } catch {
    return null; // non-fatal — NDVI proxy is best-effort
  }
}

// ── Risk computation ──────────────────────────────────────────────────────────

function computeRisk(forecast: DailyWeather[]): {
  pest_risk: 'high' | 'medium' | 'low';
  heavy_rain_days: number;
  heat_stress_days: number;
  risk_summary: string;
} {
  const heavy_rain_days = forecast.filter((d) => d.rain_mm > 20).length;
  const heat_stress_days = forecast.filter((d) => d.temp_max_c > 38).length;

  // Pest-favorable: high humidity (>75%) AND warm temps (22–32°C) — ideal for fungal diseases
  const pestFavorableDays = forecast.filter(
    (d) => d.humidity_max_pct > 75 && d.temp_max_c >= 22 && d.temp_max_c <= 35
  ).length;

  let pest_risk: 'high' | 'medium' | 'low';
  if (pestFavorableDays >= 4 || heavy_rain_days >= 3) pest_risk = 'high';
  else if (pestFavorableDays >= 2 || heavy_rain_days >= 1) pest_risk = 'medium';
  else pest_risk = 'low';

  const parts: string[] = [];
  if (heavy_rain_days > 0) parts.push(`${heavy_rain_days} heavy-rain day${heavy_rain_days > 1 ? 's' : ''}`);
  if (heat_stress_days > 0) parts.push(`${heat_stress_days} heat-stress day${heat_stress_days > 1 ? 's' : ''}`);
  if (pestFavorableDays > 0) parts.push(`${pestFavorableDays} pest-favorable day${pestFavorableDays > 1 ? 's' : ''}`);
  const risk_summary = parts.length
    ? `Next 7 days: ${parts.join(', ')}.`
    : 'Favourable weather — no acute risks in the next 7 days.';

  return { pest_risk, heavy_rain_days, heat_stress_days, risk_summary };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getWeatherForDistrict(district: string): Promise<WeatherSummary | null> {
  // Return cached result if still fresh
  const cached = cache.get(district);
  if (cached && isFresh(cached)) return cached;

  const coords = getCoordsForDistrict(district);
  if (!coords) return null;

  const { lat, lon } = coords;

  // Fetch forecast and NDVI proxy in parallel
  const [forecast, ndvi_proxy] = await Promise.all([
    fetchOpenMeteo(lat, lon),
    fetchNASAPower(lat, lon),
  ]);

  const { pest_risk, heavy_rain_days, heat_stress_days, risk_summary } = computeRisk(forecast);

  const summary: WeatherSummary = {
    district,
    lat,
    lon,
    forecast,
    pest_risk,
    heavy_rain_days,
    heat_stress_days,
    ndvi_proxy,
    risk_summary,
    fetched_at: new Date(),
  };

  cache.set(district, summary);
  return summary;
}

/**
 * Compute a 0–25 weather risk score for the prioritization engine.
 *
 * Composition (additive, capped at 25):
 *   - base from pest_risk (0 / 10 / 20)
 *   - rainBonus: heavy_rain_days × 3, capped at +6 — pre-rain urgency
 *   - ndviBonus: low solar irradiance proxy → crop stress signal, capped at +5
 *
 * Why NDVI: low irradiance (< 450 W/m² avg over the last ~10 days) means
 * the area's been under thick cloud cover, which combined with humid heat
 * accelerates fungal disease pressure and stresses standing crops — i.e.
 * input demand may spike soon. NASA POWER returns this for free, we just
 * weren't using it.
 */
export function weatherRiskScore(summary: WeatherSummary | null): number {
  if (!summary) return 0;
  const base = summary.pest_risk === 'high' ? 20 : summary.pest_risk === 'medium' ? 10 : 0;
  const rainBonus = Math.min(summary.heavy_rain_days * 3, 6);
  // ndvi_proxy is W/m². Lower = more cloud / crop stress.
  const ndviBonus =
    summary.ndvi_proxy === null  ? 0 :
    summary.ndvi_proxy < 350     ? 5 :
    summary.ndvi_proxy < 450     ? 2 :
                                   0;
  return Math.min(base + rainBonus + ndviBonus, 25);
}

/** Pre-warm the cache for all districts at startup / cron. */
export async function prefetchAllDistrictWeather(districts: string[]): Promise<void> {
  await Promise.allSettled(districts.map((d) => getWeatherForDistrict(d)));
  console.log(`[Weather] Pre-fetched ${districts.length} districts`);
}
