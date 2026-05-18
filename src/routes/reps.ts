import { Router, Request, Response } from 'express';
import RepTerritory from '../models/RepTerritory';
import VisitLog from '../models/VisitLog';
import VisitOutcome from '../models/VisitOutcome';

const router = Router();

/**
 * GET /api/reps
 * List all reps with basic info (for login/selector screen).
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const reps = await RepTerritory.find().select('rep_id territory_id territory_name state district').lean();
    res.json({ success: true, total: reps.length, reps });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/reps/:repId
 * Get a single rep's territory details.
 */
router.get('/:repId', async (req: Request, res: Response) => {
  try {
    const rep = await RepTerritory.findOne({ rep_id: req.params.repId }).lean();
    if (!rep) return res.status(404).json({ success: false, error: 'Rep not found' });
    res.json({ success: true, rep });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/reps/:repId/stats
 * Performance stats for a rep: visits this week, outcomes breakdown.
 */
router.get('/:repId/stats', async (req: Request, res: Response) => {
  try {
    const { repId } = req.params;
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const [visitsThisWeek, outcomesThisMonth] = await Promise.all([
      VisitLog.countDocuments({ rep_id: repId, visit_date: { $gte: oneWeekAgo } }),
      VisitOutcome.aggregate([
        { $match: { rep_id: repId, visit_date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
      ]),
    ]);

    const outcomeMap = Object.fromEntries(outcomesThisMonth.map((o: any) => [o._id, o.count]));
    const totalOutcomes = outcomesThisMonth.reduce((s: number, o: any) => s + o.count, 0);
    const successful = (outcomeMap['sale_made'] || 0) + (outcomeMap['order_placed'] || 0);

    res.json({
      success: true,
      rep_id: repId,
      visits_this_week: visitsThisWeek,
      outcomes_this_month: outcomeMap,
      acceptance_rate_30d: totalOutcomes > 0 ? Math.round((successful / totalOutcomes) * 100) : 0,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
