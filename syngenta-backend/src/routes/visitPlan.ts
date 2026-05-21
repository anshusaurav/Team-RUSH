import { Router, Request, Response } from 'express';
import { getVisitPlan } from '../services/prioritization';

const router = Router();

/**
 * GET /api/visit-plan?repId=REP001&date=2026-05-17
 * Returns ordered list of retailers to visit today with scoring breakdown.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { repId, date } = req.query as { repId: string; date?: string };
    if (!repId) return res.status(400).json({ success: false, error: 'repId is required' });

    const targetDate = date || new Date().toISOString().split('T')[0];
    const plan = await getVisitPlan(repId, targetDate);

    res.json({ success: true, rep_id: repId, date: targetDate, total: plan.length, plan });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
