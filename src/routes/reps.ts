import { Router, Request, Response } from 'express';
import RepTerritory from '../models/RepTerritory';
import Retailer from '../models/Retailer';
import VisitLog from '../models/VisitLog';
import VisitOutcome from '../models/VisitOutcome';
import POS from '../models/POS';

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

    // Anchor windows to the latest data point in POS so the synthetic dataset
    // (which ends in late March 2026) shows meaningful 7d/30d metrics today.
    const latestPos = await POS.findOne().sort({ transaction_date: -1 }).select('transaction_date').lean();
    const asOf = latestPos?.transaction_date ? new Date(latestPos.transaction_date) : new Date();
    const oneWeekAgo = new Date(asOf.getTime() - 7 * 86400000);
    const thirtyDaysAgo = new Date(asOf.getTime() - 30 * 86400000);

    // Need the rep's territory + tehsil_list to scope revenue and coverage
    const rep = await RepTerritory.findOne({ rep_id: repId }).lean();
    const territoryIds = rep ? [rep.territory_id] : [];
    const tehsilsTotal = rep?.tehsil_list?.length || 0;

    const [
      visitsThisWeek,
      outcomesThisMonth,
      retailersInTerritory,
      uniqueVisitDays,
      uniqueTehsilsVisited,
    ] = await Promise.all([
      VisitLog.countDocuments({ rep_id: repId, visit_date: { $gte: oneWeekAgo } }),
      VisitOutcome.aggregate([
        { $match: { rep_id: repId, visit_date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
      ]),
      territoryIds.length
        ? Retailer.find({ territory_id: { $in: territoryIds } }).select('retailer_id').lean()
        : Promise.resolve([] as Array<{ retailer_id: string }>),
      VisitLog.aggregate([
        { $match: { rep_id: repId, visit_date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$visit_date' } } } },
        { $count: 'days' },
      ]),
      VisitLog.aggregate([
        { $match: { rep_id: repId, visit_date: { $gte: thirtyDaysAgo }, visit_tehsil: { $ne: null } } },
        { $group: { _id: '$visit_tehsil' } },
        { $count: 'tehsils' },
      ]),
    ]);

    // 30-day POS revenue across the rep's territory retailers
    const retailerIds = retailersInTerritory.map(r => r.retailer_id);
    const [posAgg] = retailerIds.length
      ? await POS.aggregate([
          { $match: { retailer_id: { $in: retailerIds }, transaction_date: { $gte: thirtyDaysAgo } } },
          { $group: { _id: null, revenue: { $sum: { $multiply: ['$sku_qty', '$sku_price'] } } } },
        ])
      : [];

    const totalRevenue30d = posAgg?.revenue || 0;
    const fieldDays = uniqueVisitDays[0]?.days || 0;
    const tehsilsVisited = uniqueTehsilsVisited[0]?.tehsils || 0;

    const outcomeMap = Object.fromEntries(outcomesThisMonth.map((o: any) => [o._id, o.count]));
    const totalOutcomes = outcomesThisMonth.reduce((s: number, o: any) => s + o.count, 0);
    const successful = (outcomeMap['sale_made'] || 0) + (outcomeMap['order_placed'] || 0);

    res.json({
      success: true,
      rep_id: repId,
      as_of: asOf.toISOString().slice(0, 10),
      visits_this_week: visitsThisWeek,
      outcomes_this_month: outcomeMap,
      acceptance_rate_30d: totalOutcomes > 0 ? Math.round((successful / totalOutcomes) * 100) : 0,
      // Revenue per field day: territory POS revenue (last 30d) / unique visit days (last 30d).
      // Tehsil-level visit logs mean we attribute to the territory, not specific retailers.
      revenue_per_field_day_30d: fieldDays > 0 ? Math.round(totalRevenue30d / fieldDays) : 0,
      revenue_total_30d: Math.round(totalRevenue30d),
      field_days_30d: fieldDays,
      // Coverage efficiency: distinct tehsils visited (30d) / total tehsils in territory.
      coverage_efficiency_30d: tehsilsTotal > 0 ? Math.round((tehsilsVisited / tehsilsTotal) * 100) : 0,
      tehsils_visited_30d: tehsilsVisited,
      tehsils_total: tehsilsTotal,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
