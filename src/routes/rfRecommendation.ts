import { Router, Request, Response } from 'express';
import { predictBestProduct, getModelStatus, loadModel } from '../services/rfAdvisor';

const router = Router();

/**
 * POST /api/rf-recommendation
 * Body: { retailerId: string }
 * Returns ML-based product recommendation with confidence + reasoning.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.body;
    if (!retailerId) {
      return res.status(400).json({ success: false, error: 'retailerId is required' });
    }
    const result = await predictBestProduct(retailerId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/rf-recommendation/status
 * Returns current model state.
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, model: getModelStatus() });
});

/**
 * POST /api/rf-recommendation/reload
 * Hot-reloads rfModel.json without restarting the server.
 * Run after updating the model file via scripts/train_rf.py.
 */
router.post('/reload', (_req: Request, res: Response) => {
  try {
    loadModel();
    res.json({ success: true, model: getModelStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
