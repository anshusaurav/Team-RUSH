import { Router, Request, Response } from 'express';
import AnomalyFlag from '../models/AnomalyFlag';
import { runAnomalyDetection } from '../services/anomalyDetector';

const router = Router();

/**
 * GET /api/anomalies?territoryId=T001&severity=high&limit=50
 * Returns active anomaly flags for a territory.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { territoryId, severity, limit = '50' } = req.query as {
      territoryId?: string;
      severity?: string;
      limit?: string;
    };

    const filter: Record<string, any> = { resolved: false };
    if (territoryId) filter.territory_id = territoryId;
    if (severity) filter.severity = severity;

    const anomalies = await AnomalyFlag.find(filter)
      .sort({ severity: 1, detected_at: -1 }) // high first
      .limit(parseInt(limit))
      .lean();

    const summary = {
      total: anomalies.length,
      by_type: {
        stock_out: anomalies.filter((a) => a.anomaly_type === 'stock_out').length,
        demand_spike: anomalies.filter((a) => a.anomaly_type === 'demand_spike').length,
        low_inventory: anomalies.filter((a) => a.anomaly_type === 'low_inventory').length,
        visit_gap: anomalies.filter((a) => a.anomaly_type === 'visit_gap').length,
      },
    };

    res.json({ success: true, summary, anomalies });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/anomalies/refresh
 * Manually trigger anomaly detection run (also runs on cron daily).
 */
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    const result = await runAnomalyDetection();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/anomalies/:id/resolve
 * Mark an anomaly as resolved after rep has addressed it.
 */
router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    await AnomalyFlag.findByIdAndUpdate(req.params.id, { resolved: true });
    res.json({ success: true, message: 'Anomaly resolved' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
