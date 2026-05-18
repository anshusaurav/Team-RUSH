import { Router, Request, Response } from 'express';
import {
  loadBrainModel,
  getBrainModelStatus,
  getVelocityData,
  getTopSkuForRetailer,
  detectBrainAnomalies,
} from '../services/brainAdvisor';
import AnomalyFlag from '../models/AnomalyFlag';

const router = Router();

/**
 * GET /api/brain-anomalies/status
 * Returns LSTM model metadata.
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, model: getBrainModelStatus() });
});

/**
 * POST /api/brain-anomalies/reload
 * Hot-reloads brainModel.json without restarting the server.
 * Call after running scripts/trainBrain.js and committing the updated JSON.
 */
router.post('/reload', (_req: Request, res: Response) => {
  try {
    loadBrainModel();
    res.json({ success: true, model: getBrainModelStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/brain-anomalies/velocity?retailerId=R001&sku=Actara+25+WG
 *
 * Returns last N weeks of weekly sales + LSTM predicted next-week value.
 * If `sku` is omitted, uses the retailer's top-selling SKU.
 * Used by the frontend VelocityChart component.
 */
router.get('/velocity', async (req: Request, res: Response) => {
  try {
    const { retailerId, sku } = req.query as { retailerId?: string; sku?: string };
    if (!retailerId) {
      return res.status(400).json({ success: false, error: 'retailerId is required' });
    }

    let skuName = sku;
    if (!skuName) {
      const top = await getTopSkuForRetailer(retailerId);
      if (!top) {
        return res.status(404).json({ success: false, error: 'No SKU data found for this retailer' });
      }
      skuName = top;
    }

    const data = await getVelocityData(retailerId, skuName);
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Insufficient POS history for LSTM prediction (need at least 4 weeks)',
      });
    }

    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/brain-anomalies/detect
 * Runs LSTM evaluation across all active retailer+SKU combos and writes
 * brain_demand_spike / brain_stockout_risk flags to anomalyflags collection.
 */
router.post('/detect', async (_req: Request, res: Response) => {
  try {
    const flags = await detectBrainAnomalies();
    if (flags.length > 0) {
      await AnomalyFlag.insertMany(flags, { ordered: false }).catch(() => {});
    }
    res.json({ success: true, flagged: flags.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
