import { Router, Request, Response } from 'express';
import Retailer from '../models/Retailer';
import Inventory from '../models/Inventory';
import POS from '../models/POS';
import AnomalyFlag from '../models/AnomalyFlag';
import VisitLog from '../models/VisitLog';

const router = Router();

/**
 * GET /api/retailers/:retailerId
 * Full retailer profile including current inventory, recent sales, and active alerts.
 */
router.get('/:retailerId', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;

    const retailer = await Retailer.findOne({ retailer_id: retailerId }).lean();
    if (!retailer) return res.status(404).json({ success: false, error: 'Retailer not found' });

    const latestWeek = await Inventory.findOne({ retailer_id: retailerId })
      .sort({ week_end_date: -1 })
      .select('week_end_date')
      .lean();

    const [inventory, topProducts, anomalies, recentVisits] = await Promise.all([
      latestWeek
        ? Inventory.find({ retailer_id: retailerId, week_end_date: latestWeek.week_end_date })
            .select('sku_id sku_name sku_qty -_id')
            .lean()
        : [],

      POS.aggregate([
        {
          $match: {
            retailer_id: retailerId,
            transaction_date: { $gte: new Date(Date.now() - 30 * 86400000) },
          },
        },
        {
          $group: {
            _id: '$sku_name',
            units: { $sum: '$sku_qty' },
            revenue: { $sum: { $multiply: ['$sku_qty', '$sku_price'] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        { $project: { sku_name: '$_id', units: 1, revenue: { $round: ['$revenue', 2] }, _id: 0 } },
      ]),

      AnomalyFlag.aggregate([
        { $match: { retailer_id: retailerId, resolved: false } },
        { $sort: { severity: 1 } },
        { $group: { _id: { anomaly_type: '$anomaly_type', sku_name: '$sku_name' }, doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $project: { anomaly_type: 1, sku_name: 1, severity: 1, description: 1, detected_at: 1, _id: 0 } },
        { $limit: 5 },
      ]),

      VisitLog.find({ visit_tehsil: retailer.tehsil })
        .sort({ visit_date: -1 })
        .limit(5)
        .select('rep_id visit_date visit_type product_recommended -_id')
        .lean(),
    ]);

    res.json({
      success: true,
      retailer,
      inventory,
      latest_inventory_week: latestWeek?.week_end_date,
      top_products_30d: topProducts,
      active_anomalies: anomalies,
      recent_visits: recentVisits,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/retailers?territoryId=T001&tehsil=Rohtak&page=1&limit=20
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { territoryId, tehsil, page = '1', limit = '20' } = req.query as Record<string, string>;
    const filter: Record<string, any> = {};
    if (territoryId) filter.territory_id = territoryId;
    if (tehsil) filter.tehsil = tehsil;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [retailers, total] = await Promise.all([
      Retailer.find(filter).skip(skip).limit(parseInt(limit)).lean(),
      Retailer.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: parseInt(page), retailers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
