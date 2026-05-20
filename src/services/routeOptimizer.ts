/**
 * TSP-based route optimization for a rep's daily field plan.
 *
 * Pipeline:
 *   1. Resolve geo-coordinates for the rep's home (district centroid) and
 *      each retailer in today's visit plan (centroid + deterministic per-id
 *      jitter — matches the frontend mapCoords.ts so pins line up).
 *   2. Build a symmetric N×N haversine distance matrix using turf.distance.
 *   3. Apply anomaly-aware penalties: inbound edges to retailers with open
 *      anomalies are discounted so the solver enters them earlier in the tour.
 *   4. Solve with nearest-neighbour seed + 2-opt improvement (optimal-or-near
 *      for N≤30 in <10 ms; no native build required).
 *   5. Return retailer IDs in optimized visit order.
 *
 * We solve the OPEN TSP (start at rep's home, end anywhere) — the rep doesn't
 * usually need to return to base in the middle of a planning step. To return
 * the closed tour instead, push `route[0]` onto the end.
 */

import * as turf from '@turf/turf';
import RepTerritory from '../models/RepTerritory';
import Retailer from '../models/Retailer';
import AnomalyFlag from '../models/AnomalyFlag';
import { DISTRICT_COORDS } from '../data/districtCoords';

// --------------------------------------------------------------------------
// Per-retailer coordinate jitter (mirrors syngenta-frontend/src/lib/mapCoords)
// --------------------------------------------------------------------------

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function jitter(retailerId: string, tehsil: string): { dLat: number; dLon: number } {
  const seed = `${retailerId}|${tehsil ?? ''}`;
  const h1 = hash32(seed);
  const h2 = hash32(seed + '#2');
  const r1 = (h1 / 0xffffffff) * 2 - 1;
  const r2 = (h2 / 0xffffffff) * 2 - 1;
  return { dLat: r1 * 0.05, dLon: r2 * 0.05 }; // ~5 km radius
}

// --------------------------------------------------------------------------
// Anomaly-based edge discount
// --------------------------------------------------------------------------

/**
 * Discount applied to INBOUND edges (j → i) when retailer i has an open
 * anomaly. Lower = solver prefers to enter that node earlier in the tour.
 * Multiplicative on top of the raw haversine distance.
 */
const SEVERITY_DISCOUNT: Record<string, number> = {
  high: 0.5,
  medium: 0.7,
  low: 0.85,
};

// --------------------------------------------------------------------------
// 2-opt TSP solver — nearest-neighbour seed + edge-swap improvement
// --------------------------------------------------------------------------

function tourLength(matrix: number[][], tour: number[]): number {
  let total = 0;
  for (let i = 0; i < tour.length - 1; i++) total += matrix[tour[i]][tour[i + 1]];
  return total;
}

function nearestNeighbour(matrix: number[][], start: number): number[] {
  const n = matrix.length;
  const visited = new Set<number>([start]);
  const tour = [start];
  let current = start;
  while (tour.length < n) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      if (matrix[current][j] < bestDist) {
        bestDist = matrix[current][j];
        best = j;
      }
    }
    if (best < 0) break;
    visited.add(best);
    tour.push(best);
    current = best;
  }
  return tour;
}

/** 2-opt swap: reverse segments while it lowers total length. Open-TSP variant — first node is fixed (rep home), last is free. */
function twoOpt(matrix: number[][], initial: number[]): number[] {
  const tour = [...initial];
  let improved = true;
  while (improved) {
    improved = false;
    // Keep tour[0] (rep home) fixed; allow swaps among positions [1, n-1].
    for (let i = 1; i < tour.length - 2; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        // Current edges: (i-1, i) and (j, j+1 OR end)
        const a = tour[i - 1];
        const b = tour[i];
        const c = tour[j];
        const d = j + 1 < tour.length ? tour[j + 1] : null;

        const before = matrix[a][b] + (d !== null ? matrix[c][d] : 0);
        const after  = matrix[a][c] + (d !== null ? matrix[b][d] : 0);

        if (after + 1e-9 < before) {
          // Reverse the segment [i..j]
          let lo = i;
          let hi = j;
          while (lo < hi) {
            [tour[lo], tour[hi]] = [tour[hi], tour[lo]];
            lo++;
            hi--;
          }
          improved = true;
        }
      }
    }
  }
  return tour;
}

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

export interface OptimizeInput {
  repId: string;
  retailerIds: string[]; // Subset to route (usually today's visit plan)
}

export interface OptimizedRoute {
  route: string[];           // Ordered retailer_ids (rep home is implicit at index 0)
  total_distance_km: number; // Sum of haversine distances along the route
  raw_distance_km: number;   // Same route, ignoring anomaly discounts (for reporting)
  stops: Array<{
    retailer_id: string;
    lat: number;
    lon: number;
    has_anomaly: boolean;
    severity?: 'high' | 'medium' | 'low';
  }>;
  start: { lat: number; lon: number; label: string };
  solver: 'nearest-neighbour+2-opt';
  improvements: { initial_km: number; final_km: number };
}

export async function optimizeRoute({ repId, retailerIds }: OptimizeInput): Promise<OptimizedRoute> {
  if (retailerIds.length === 0) {
    throw new Error('No retailers to route');
  }

  // 1. Rep home — district centroid of the territory
  const rep = await RepTerritory.findOne({ rep_id: repId }).lean();
  if (!rep) throw new Error(`Rep ${repId} not found`);
  const homeCoords = DISTRICT_COORDS[rep.district];
  if (!homeCoords) {
    throw new Error(`No coordinates for rep's home district "${rep.district}"`);
  }

  // 2. Retailer coords (centroid + deterministic jitter)
  const retailers = await Retailer.find({ retailer_id: { $in: retailerIds } })
    .select('retailer_id district tehsil')
    .lean();
  const byId = new Map(retailers.map(r => [r.retailer_id, r]));

  const nodes: Array<{ id: string; lat: number; lon: number }> = [
    { id: '__home__', lat: homeCoords.lat, lon: homeCoords.lon },
  ];

  for (const rid of retailerIds) {
    const r = byId.get(rid);
    if (!r) continue;
    const c = DISTRICT_COORDS[r.district];
    if (!c) continue;
    const { dLat, dLon } = jitter(r.retailer_id, r.tehsil);
    nodes.push({ id: r.retailer_id, lat: c.lat + dLat, lon: c.lon + dLon });
  }

  // 3. Open anomalies on these retailers → per-node discount
  const flagged = await AnomalyFlag.find({
    retailer_id: { $in: retailerIds },
    resolved: false,
  })
    .select('retailer_id severity')
    .lean();
  // Take the worst severity per retailer (high > medium > low).
  const sevRank = { high: 3, medium: 2, low: 1 } as const;
  const worstSeverity = new Map<string, 'high' | 'medium' | 'low'>();
  for (const a of flagged) {
    const sev = a.severity as 'high' | 'medium' | 'low';
    const prior = worstSeverity.get(a.retailer_id);
    if (!prior || sevRank[sev] > sevRank[prior]) worstSeverity.set(a.retailer_id, sev);
  }

  // 4. Distance matrix (km via turf), with inbound discount for anomalous nodes.
  const n = nodes.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const rawMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const km = turf.distance(
        turf.point([nodes[i].lon, nodes[i].lat]),
        turf.point([nodes[j].lon, nodes[j].lat]),
        { units: 'kilometers' }
      );
      rawMatrix[i][j] = km;
      const discount = (() => {
        const tid = nodes[j].id;
        const sev = worstSeverity.get(tid);
        return sev ? SEVERITY_DISCOUNT[sev] : 1;
      })();
      matrix[i][j] = km * discount;
    }
  }

  // 5. Solve: nearest-neighbour from home → 2-opt improvement.
  const initial = nearestNeighbour(matrix, 0);
  const optimized = twoOpt(matrix, initial);

  // Drop the home node (index 0) from the returned id list
  const route = optimized.slice(1).map(i => nodes[i].id);

  return {
    route,
    total_distance_km: +tourLength(matrix, optimized).toFixed(2),
    raw_distance_km: +tourLength(rawMatrix, optimized).toFixed(2),
    stops: optimized.slice(1).map(i => ({
      retailer_id: nodes[i].id,
      lat: nodes[i].lat,
      lon: nodes[i].lon,
      has_anomaly: worstSeverity.has(nodes[i].id),
      severity: worstSeverity.get(nodes[i].id),
    })),
    start: { lat: homeCoords.lat, lon: homeCoords.lon, label: rep.district },
    solver: 'nearest-neighbour+2-opt',
    improvements: {
      initial_km: +tourLength(matrix, initial).toFixed(2),
      final_km: +tourLength(matrix, optimized).toFixed(2),
    },
  };
}
