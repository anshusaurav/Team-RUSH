import { Router, Request, Response } from 'express';
import VisitOutcome from '../models/VisitOutcome';

const router = Router();

/**
 * POST /api/outcomes
 * Log a field visit result. Used to continuously improve recommendation scoring.
 * Body: { repId, retailerId, outcome, productDiscussed, notes, aiRecommendationUsed }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { repId, retailerId, outcome, productDiscussed, notes, aiRecommendationUsed } = req.body;

    if (!repId || !retailerId || !outcome)
      return res.status(400).json({ success: false, error: 'repId, retailerId, and outcome are required' });

    const doc = await VisitOutcome.create({
      rep_id: repId,
      retailer_id: retailerId,
      outcome,
      product_discussed: productDiscussed,
      notes,
      ai_recommendation_used: aiRecommendationUsed ?? false,
      visit_date: new Date(),
    });

    res.status(201).json({ success: true, outcome_id: doc._id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/outcomes?repId=REP001&limit=20
 * Returns recent visit outcomes for a rep (for history view).
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { repId, retailerId, limit = '20' } = req.query as {
      repId?: string;
      retailerId?: string;
      limit?: string;
    };

    const filter: Record<string, any> = {};
    if (repId) filter.rep_id = repId;
    if (retailerId) filter.retailer_id = retailerId;

    const outcomes = await VisitOutcome.find(filter)
      .sort({ visit_date: -1 })
      .limit(parseInt(limit))
      .lean();

    // Compute acceptance rate (sale_made + order_placed) / total
    const total = outcomes.length;
    const successful = outcomes.filter((o) => ['sale_made', 'order_placed'].includes(o.outcome)).length;

    res.json({
      success: true,
      total,
      acceptance_rate: total > 0 ? Math.round((successful / total) * 100) : 0,
      outcomes,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
