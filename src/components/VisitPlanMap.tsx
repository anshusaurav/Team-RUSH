'use client';

/**
 * Leaflet-based map of today's visit plan for the selected rep. Numbered pins
 * coloured by priority (urgent/high/normal), popups linking to retailer detail,
 * polyline drawn in visit order so the rep sees the planned route shape.
 *
 * Uses district centroids (from /api/weather/districts) + a stable per-retailer
 * jitter (mapCoords.ts) — no per-retailer GPS in the dataset.
 *
 * This component must be loaded with `dynamic(..., { ssr: false })` since
 * Leaflet touches `window` on import.
 */

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { VisitPlanItem, getOptimizedRoute, OptimizedRoute } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleProvider';

interface Props {
  plan: VisitPlanItem[];
  repId: string;
  /** Date in YYYY-MM-DD; the optimizer keys its plan to this. */
  date: string;
  /** Rep's home district — used as a fallback if the route call fails. */
  repDistrict?: string;
}

// Numbered teardrop pin built inline so we don't ship marker image assets.
function makeIcon(rank: number, priority: 'urgent' | 'high' | 'normal') {
  const bg = priority === 'urgent' ? '#dc2626' : priority === 'high' ? '#f59e0b' : '#6b7280';
  const html = `
    <div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      background:${bg};transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
      border:2px solid white;
    ">
      <span style="transform:rotate(45deg);color:white;font-weight:700;font-size:11px;">${rank}</span>
    </div>`;
  return L.divIcon({
    html,
    className: 'visit-plan-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -28],
  });
}

// Home (rep base) marker — distinct shape so it doesn't get confused with stops.
function makeHomeIcon() {
  const html = `
    <div style="
      width:26px;height:26px;border-radius:50%;
      background:#15803d;border:3px solid white;
      box-shadow:0 2px 5px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;color:white;font-size:12px;
    ">⌂</div>`;
  return L.divIcon({ html, className: 'visit-plan-home', iconSize: [26, 26], iconAnchor: [13, 13] });
}

// Helper component to fit bounds AFTER the map is mounted (MapContainer is
// imperative for view changes after first paint).
function FitBounds({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  }, [points, map]);
  return null;
}

export default function VisitPlanMap({ plan, repId, date, repDistrict }: Props) {
  const { t } = useLocale();
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [error, setError] = useState(false);

  // Lookup priority + tehsil from the plan so popups can show them.
  const planById = useMemo(() => {
    const m = new Map<string, VisitPlanItem>();
    plan.forEach(p => m.set(p.retailer_id, p));
    return m;
  }, [plan]);

  useEffect(() => {
    setRoute(null);
    setError(false);
    if (plan.length === 0) return;
    getOptimizedRoute(repId, date, 10)
      .then(r => setRoute(r))
      .catch(() => setError(true));
  }, [repId, date, plan]);

  if (plan.length === 0) {
    return (
      <div className="h-[420px] rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-xs text-gray-400">
        {t('dashboard.noRetailers')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[420px] rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-xs text-red-600 px-4 text-center">
        {t('dashboard.error')}
      </div>
    );
  }

  if (!route) {
    return (
      <div className="h-[420px] rounded-lg bg-gray-100 animate-pulse flex items-center justify-center text-xs text-gray-400">
        {t('common.loading')}
      </div>
    );
  }

  // Stops in optimized order; rank = position along the route, starting from
  // the rep's home base. (Priority badge is shown separately in the popup.)
  const stops = route.stops.map((s, i) => {
    const planItem = planById.get(s.retailer_id);
    return {
      ...s,
      rank: i + 1,
      priority: planItem?.priority ?? 'normal',
      score: planItem?.score,
      tehsil: planItem?.tehsil,
      district: planItem?.district,
    };
  });

  const polyline: LatLngExpression[] = [
    [route.start.lat, route.start.lon],
    ...stops.map(s => [s.lat, s.lon] as LatLngExpression),
  ];

  const center: LatLngExpression = repDistrict
    ? [route.start.lat, route.start.lon]
    : (polyline[0] as LatLngExpression);

  return (
    <div className="h-[420px] rounded-lg overflow-hidden border border-gray-200 relative">
      <MapContainer
        center={center}
        zoom={9}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={18}
        />

        <FitBounds points={polyline} />

        {/* Route polyline (home → stops in optimized order) */}
        {polyline.length > 1 && (
          <Polyline
            positions={polyline}
            pathOptions={{ color: '#15803d', weight: 3, opacity: 0.7, dashArray: '6 6' }}
          />
        )}

        {/* Rep home marker */}
        <Marker position={[route.start.lat, route.start.lon]} icon={makeHomeIcon()}>
          <Popup>
            <div className="text-xs font-semibold">⌂ {route.start.label}</div>
            <div className="text-xs text-gray-500">{t('visitCard.proximityHome')}</div>
          </Popup>
        </Marker>

        {/* Optimized stops */}
        {stops.map(p => (
          <Marker
            key={p.retailer_id}
            position={[p.lat, p.lon]}
            icon={makeIcon(p.rank, p.priority as 'urgent' | 'high' | 'normal')}
          >
            <Popup>
              <div className="text-xs space-y-1 min-w-[180px]">
                <div className="font-bold text-sm">
                  #{p.rank} · {p.retailer_id}
                </div>
                {p.tehsil && <div className="text-gray-600">{p.tehsil}, {p.district}</div>}
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-1.5 py-0.5 rounded-full font-medium ${
                      p.priority === 'urgent'
                        ? 'bg-red-100 text-red-700'
                        : p.priority === 'high'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {t(`visitCard.priority${(p.priority as string).charAt(0).toUpperCase()}${(p.priority as string).slice(1)}`)}
                  </span>
                  {p.score !== undefined && (
                    <span className="text-gray-500">
                      {t('visitCard.score')}: <strong className="text-green-700">{p.score}</strong>
                    </span>
                  )}
                </div>
                {p.has_anomaly && (
                  <div className="text-[10px] text-red-600">⚠ anomaly · {p.severity}</div>
                )}
                <Link
                  href={`/retailer/${p.retailer_id}?repId=${repId}`}
                  className="block mt-2 text-green-700 font-medium hover:underline"
                >
                  {t('visitCard.openDetail')} →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Total distance + savings (top-right) */}
      <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-md shadow-md px-2.5 py-1.5 text-[11px] z-[400]">
        <div className="font-semibold text-gray-800">{route.total_distance_km.toFixed(1)} km</div>
        {route.improvements.initial_km > route.improvements.final_km && (
          <div className="text-[10px] text-green-700">
            ↓ {(route.improvements.initial_km - route.improvements.final_km).toFixed(1)} km vs NN
          </div>
        )}
      </div>

      {/* Legend (bottom-left) — explicit text color so it stays readable
          regardless of any inherited color from the page wrapper. */}
      <div className="absolute bottom-2 left-2 bg-white rounded-md shadow-md px-2.5 py-1.5 text-[11px] font-medium text-gray-800 z-[400] flex items-center gap-3 border border-gray-200">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block shrink-0" />
          {t('visitCard.priorityUrgent')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shrink-0" />
          {t('visitCard.priorityHigh')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block shrink-0" />
          {t('visitCard.priorityNormal')}
        </span>
      </div>
    </div>
  );
}
