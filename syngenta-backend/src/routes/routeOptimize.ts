import { Router, Request, Response } from 'express';
import { optimizeRoute } from '../services/routeOptimizer';
import { getVisitPlan } from '../services/prioritization';

const router = Router();

/**
 * GET /api/route-optimize?repId=REP_0001[&date=YYYY-MM-DD][&limit=10]
 *
 * Runs prioritisation, then TSP-optimises the top-`limit` retailers (default 10)
 * with anomaly-discounted haversine costs. Returns the visit order, the rep's
 * start point, and per-stop coordinates so the frontend can render the route
 * without round-tripping for geo info.
 *
 * Optional alt mode: POST /api/route-optimize with { repId, retailerIds: string[] }
 * lets the caller hand in an explicit subset.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { repId, date, limit } = req.query as { repId?: string; date?: string; limit?: string };
    if (!repId) return res.status(400).json({ success: false, error: 'repId is required' });

    const cap = parseInt(limit || '10', 10);
    const plan = await getVisitPlan(repId, date || new Date().toISOString().slice(0, 10));
    const retailerIds = plan.slice(0, cap).map(p => p.retailer_id);
    if (retailerIds.length === 0) {
      return res.json({ success: true, route: [], total_distance_km: 0, stops: [], note: 'No retailers in plan' });
    }

    const result = await optimizeRoute({ repId, retailerIds });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { repId, retailerIds } = req.body as { repId?: string; retailerIds?: string[] };
    if (!repId || !Array.isArray(retailerIds) || retailerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'repId and non-empty retailerIds[] are required' });
    }
    const result = await optimizeRoute({ repId, retailerIds });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
