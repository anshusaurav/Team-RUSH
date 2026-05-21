/**
 * Deterministic per-retailer coordinate jitter.
 *
 * Backend retailers are identified by tehsil only — we don't have per-retailer
 * GPS. We DO have district centroids (33 of them) via /api/weather/districts.
 * For the map view, we scatter retailers around their district centroid using
 * a hash of the retailer_id, so:
 *   - Two retailers in the same district don't stack on the same pin
 *   - The same retailer always lands at the same point (stable across reloads)
 *
 * Jitter radius: ~3–8 km in lat/lon degrees. A district is typically 30–80 km
 * across, so the scatter stays well inside district bounds.
 */

// FNV-1a-ish 32-bit hash; deterministic, fast, no deps.
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Project (retailer_id, tehsil) to a deterministic offset from the district
 * centroid. Returns delta-lat / delta-lon in degrees.
 */
function offset(retailerId: string, tehsil: string | undefined): { dLat: number; dLon: number } {
  const seed = `${retailerId}|${tehsil ?? ''}`;
  const h1 = hash32(seed);
  const h2 = hash32(seed + '#2');
  // Map each hash to [-1, 1]
  const r1 = (h1 / 0xffffffff) * 2 - 1;
  const r2 = (h2 / 0xffffffff) * 2 - 1;
  // ~0.05° ≈ 5.5 km in latitude; ~0.05° ≈ 5 km in longitude near India's latitudes
  return { dLat: r1 * 0.05, dLon: r2 * 0.05 };
}

export interface DistrictCoord {
  district: string;
  state: string;
  lat: number;
  lon: number;
}

export function retailerLatLon(
  retailer: { retailer_id: string; district: string; tehsil?: string },
  districts: Record<string, DistrictCoord>
): { lat: number; lon: number } | null {
  const d = districts[retailer.district];
  if (!d) return null;
  const { dLat, dLon } = offset(retailer.retailer_id, retailer.tehsil);
  return { lat: d.lat + dLat, lon: d.lon + dLon };
}
