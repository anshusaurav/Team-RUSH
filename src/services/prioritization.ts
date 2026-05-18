import RepTerritory from '../models/RepTerritory';
import Retailer from '../models/Retailer';
import VisitLog from '../models/VisitLog';
import Inventory from '../models/Inventory';
import POS from '../models/POS';
import AnomalyFlag from '../models/AnomalyFlag';
import VisitOutcome from '../models/VisitOutcome';
import Grower from '../models/Grower';
import WhatsappLog from '../models/WhatsappLog';
import { getWeatherForDistrict, weatherRiskScore, WeatherSummary } from './weatherService';

export interface ScoreBreakdown {
  days_since_visit: number;
  stock_out_count: number;
  low_stock_count: number;
  sales_velocity_30d: number;
  anomaly_count: number;
  outcome_boost: number;
  biological_urgency: number; // growers with an upcoming crop stage in this tehsil
  digital_intent: number;     // growers who clicked a WhatsApp campaign in this tehsil
  weather_risk: number;       // 0–20 pts from pest-favorable forecast or heavy rain
}

export interface RetailerScore {
  retailer_id: string;
  territory_id: string;
  state: string;
  district: string;
  tehsil: string;
  score: number;
  priority: 'urgent' | 'high' | 'normal';
  proximity_index: number; // position in rep's tehsil_list; 0 = home base, -1 = unknown
  score_breakdown: ScoreBreakdown;
}

export async function getVisitPlan(repId: string, date: string): Promise<RetailerScore[]> {
  const rep = await RepTerritory.findOne({ rep_id: repId });
  if (!rep) throw new Error(`Rep ${repId} not found`);

  const retailers = await Retailer.find({ territory_id: rep.territory_id }).lean();
  if (!retailers.length) return [];

  const retailerIds = retailers.map((r) => r.retailer_id);
  const targetDate = new Date(date);
  const tehsilList: string[] = rep.tehsil_list || [];

  // Fetch weather for every unique district in this territory (parallel, cached)
  const districts = [...new Set(retailers.map((r) => r.district).filter(Boolean))];
  const weatherByDistrict = new Map<string, WeatherSummary | null>();
  await Promise.all(
    districts.map(async (district) => {
      const w = await getWeatherForDistrict(district).catch(() => null);
      weatherByDistrict.set(district, w);
    })
  );

  const thirtyDaysAgo = new Date(targetDate.getTime() - 30 * 86400000);
  // Biological window: stages occurring within ±7 days past and 21 days ahead of target date
  const bioWindowStart = new Date(targetDate.getTime() - 7 * 86400000);
  const bioWindowEnd = new Date(targetDate.getTime() + 21 * 86400000);

  const [
    latestWeek,
    anomalyCounts,
    outcomeCounts,
    recentVisits,
    biologicalByTehsil,
    digitalByTehsil,
  ] = await Promise.all([
    // Latest inventory snapshot date
    Inventory.findOne({ retailer_id: { $in: retailerIds } })
      .sort({ week_end_date: -1 })
      .select('week_end_date')
      .lean(),

    // Active anomaly counts per retailer
    AnomalyFlag.aggregate([
      { $match: { retailer_id: { $in: retailerIds }, resolved: false } },
      { $group: { _id: '$retailer_id', count: { $sum: 1 } } },
    ]),

    // Positive outcome history (sales/orders in last 30 days) per retailer
    VisitOutcome.aggregate([
      {
        $match: {
          rep_id: repId,
          retailer_id: { $in: retailerIds },
          outcome: { $in: ['sale_made', 'order_placed'] },
          visit_date: { $gte: new Date(Date.now() - 30 * 86400000) },
        },
      },
      { $group: { _id: '$retailer_id', count: { $sum: 1 } } },
    ]),

    // Last visit date per tehsil for this rep
    VisitLog.aggregate([
      { $match: { rep_id: repId } },
      { $group: { _id: '$visit_tehsil', last_visit: { $max: '$visit_date' } } },
    ]),

    // Biological urgency: count growers per tehsil with a crop stage within the scoring window.
    // The crop_calendar.stages array contains objects like { stage: "tillering", approx: "2026-01-15" }.
    Grower.aggregate([
      { $match: { tehsil: { $in: tehsilList } } },
      { $addFields: { stages: { $ifNull: ['$grower_crop_calendar.stages', []] } } },
      { $unwind: { path: '$stages', preserveNullAndEmptyArrays: false } },
      {
        $match: {
          $expr: {
            $and: [
              { $gte: [{ $toDate: '$stages.approx' }, bioWindowStart] },
              { $lte: [{ $toDate: '$stages.approx' }, bioWindowEnd] },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$tehsil',
          count: { $sum: 1 },
          stages: { $addToSet: '$stages.stage' },
        },
      },
    ]),

    // Digital intent: growers in the territory who clicked a WhatsApp campaign in last 30 days,
    // grouped by tehsil. These represent high-intent buyers who need a physical follow-up.
    WhatsappLog.aggregate([
      { $match: { clicked_status: true, message_sent_date: { $gte: thirtyDaysAgo } } },
      {
        $lookup: {
          from: 'growers',
          localField: 'grower_id',
          foreignField: 'grower_id',
          as: 'grower',
        },
      },
      { $unwind: '$grower' },
      { $match: { 'grower.tehsil': { $in: tehsilList } } },
      {
        $group: {
          _id: '$grower.tehsil',
          count: { $sum: 1 },
          products: { $addToSet: '$campaign_product' },
        },
      },
    ]),
  ]);

  const latestWeekDate = latestWeek?.week_end_date;

  // Build lookup maps
  const anomalyMap = new Map(anomalyCounts.map((a: any) => [a._id, a.count]));
  const outcomeMap = new Map(outcomeCounts.map((o: any) => [o._id, o.count]));
  const visitMap = new Map(recentVisits.map((v: any) => [v._id, new Date(v.last_visit)]));
  const bioMap = new Map(biologicalByTehsil.map((b: any) => [b._id, b.count]));
  const digitalMap = new Map(digitalByTehsil.map((d: any) => [d._id, d.count]));

  // Bulk fetch inventory for all retailers at latest week
  const inventoryByRetailer = latestWeekDate
    ? await Inventory.aggregate([
        { $match: { retailer_id: { $in: retailerIds }, week_end_date: latestWeekDate } },
        {
          $group: {
            _id: '$retailer_id',
            stock_outs: { $sum: { $cond: [{ $eq: ['$sku_qty', 0] }, 1, 0] } },
            low_stock: { $sum: { $cond: [{ $and: [{ $gt: ['$sku_qty', 0] }, { $lte: ['$sku_qty', 5] }] }, 1, 0] } },
          },
        },
      ])
    : [];

  const inventoryMap = new Map(inventoryByRetailer.map((i: any) => [i._id, i]));

  // Bulk fetch 30-day sales velocity per retailer
  const salesVelocity = await POS.aggregate([
    { $match: { retailer_id: { $in: retailerIds }, transaction_date: { $gte: thirtyDaysAgo } } },
    { $group: { _id: '$retailer_id', total_units: { $sum: '$sku_qty' } } },
  ]);
  const salesMap = new Map(salesVelocity.map((s: any) => [s._id, s.total_units]));

  // Score each retailer
  const scores: RetailerScore[] = retailers.map((retailer) => {
    const lastVisit = visitMap.get(retailer.tehsil);
    const daysSince = lastVisit
      ? Math.floor((targetDate.getTime() - lastVisit.getTime()) / 86400000)
      : 999;

    const inv = inventoryMap.get(retailer.retailer_id) || { stock_outs: 0, low_stock: 0 };
    const stockOuts = inv.stock_outs;
    const lowStock = inv.low_stock;
    const salesVel = salesMap.get(retailer.retailer_id) || 0;
    const anomalyCount = anomalyMap.get(retailer.retailer_id) || 0;
    const outcomeBoost = outcomeMap.get(retailer.retailer_id) || 0;
    const bioUrgency = bioMap.get(retailer.tehsil) || 0;
    const digitalCount = digitalMap.get(retailer.tehsil) || 0;
    const proximityIndex = tehsilList.indexOf(retailer.tehsil);
    const weatherSummary = weatherByDistrict.get(retailer.district) ?? null;
    const weatherScore = weatherRiskScore(weatherSummary);

    // Scoring formula — tunable weights
    const recencyScore    = Math.min(daysSince, 30) * 2;              // max 60
    const stockOutScore   = stockOuts * 15;                           // 15 pts per out-of-stock SKU
    const lowStockScore   = lowStock * 5;                             // 5 pts per low-stock SKU
    const salesScore      = Math.min(salesVel / 5, 20);              // max 20
    const anomalyScore    = anomalyCount * 20;                        // 20 pts per active alert
    const outcomeScore    = outcomeBoost * 10;                        // 10 pts per recent successful visit
    const proximityBoost  = proximityIndex >= 0 ? Math.max(0, 5 - proximityIndex) : 0; // max 5
    const bioScore        = Math.min(bioUrgency * 5, 25);            // max 25 — crop approaching critical stage
    const digitalScore    = Math.min(digitalCount * 3, 15);          // max 15 — growers with digital buying intent
    // weatherScore is already capped at 20 by weatherRiskScore()

    const score =
      recencyScore + stockOutScore + lowStockScore + salesScore +
      anomalyScore + outcomeScore + proximityBoost + bioScore + digitalScore + weatherScore;

    return {
      retailer_id: retailer.retailer_id,
      territory_id: retailer.territory_id,
      state: retailer.state,
      district: retailer.district,
      tehsil: retailer.tehsil,
      score: Math.round(score),
      priority: score >= 90 ? 'urgent' : score >= 55 ? 'high' : 'normal',
      proximity_index: proximityIndex,
      score_breakdown: {
        days_since_visit:   daysSince === 999 ? -1 : daysSince,
        stock_out_count:    stockOuts,
        low_stock_count:    lowStock,
        sales_velocity_30d: salesVel,
        anomaly_count:      anomalyCount,
        outcome_boost:      outcomeBoost,
        biological_urgency: bioUrgency,
        digital_intent:     digitalCount,
        weather_risk:       weatherScore,
      },
    };
  });

  // Return top 15, sorted by score descending
  return scores.sort((a, b) => b.score - a.score).slice(0, 15);
}
