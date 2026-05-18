import Inventory from '../models/Inventory';
import POS from '../models/POS';
import Retailer from '../models/Retailer';
import VisitLog from '../models/VisitLog';
import RepTerritory from '../models/RepTerritory';
import AnomalyFlag from '../models/AnomalyFlag';
import Grower from '../models/Grower';
import WhatsappLog from '../models/WhatsappLog';
import { getWeatherForDistrict } from './weatherService';
import { DISTRICT_COORDS } from '../data/districtCoords';

async function getLatestWeekDate(): Promise<Date | null> {
  const result = await Inventory.findOne().sort({ week_end_date: -1 }).select('week_end_date').lean();
  return result?.week_end_date ?? null;
}

async function detectStockOuts(latestWeek: Date) {
  const stockOuts = await Inventory.aggregate([
    { $match: { week_end_date: latestWeek, sku_qty: 0 } },
    {
      $lookup: {
        from: 'retailers',
        localField: 'retailer_id',
        foreignField: 'retailer_id',
        as: 'retailer',
      },
    },
    { $unwind: '$retailer' },
    {
      $project: {
        retailer_id: 1,
        territory_id: '$retailer.territory_id',
        sku_name: 1,
      },
    },
  ]);

  const flags = stockOuts.map((s: any) => ({
    retailer_id: s.retailer_id,
    territory_id: s.territory_id,
    anomaly_type: 'stock_out',
    sku_name: s.sku_name,
    severity: 'high',
    description: `${s.sku_name} is out of stock as of ${latestWeek.toDateString()}`,
  }));

  return flags;
}

async function detectDemandSpikes() {
  const fiveWeeksAgo = new Date(Date.now() - 5 * 7 * 86400000);
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000);

  // Get current week sales per retailer+sku
  const currentWeek = await POS.aggregate([
    { $match: { transaction_date: { $gte: oneWeekAgo } } },
    { $group: { _id: { retailer_id: '$retailer_id', sku_name: '$sku_name' }, units: { $sum: '$sku_qty' } } },
  ]);

  // Get prior 4-week average per retailer+sku
  const priorWeeks = await POS.aggregate([
    { $match: { transaction_date: { $gte: fiveWeeksAgo, $lt: oneWeekAgo } } },
    { $group: { _id: { retailer_id: '$retailer_id', sku_name: '$sku_name' }, avg_units: { $avg: '$sku_qty' } } },
  ]);

  const priorMap = new Map(
    priorWeeks.map((p: any) => [`${p._id.retailer_id}__${p._id.sku_name}`, p.avg_units])
  );

  // Find spikes: current week > 2x prior average
  const spikes = currentWeek.filter((c: any) => {
    const key = `${c._id.retailer_id}__${c._id.sku_name}`;
    const avg = priorMap.get(key) || 0;
    return avg > 0 && c.units > avg * 2;
  });

  if (!spikes.length) return [];

  // Enrich with territory_id
  const retailerIds = [...new Set(spikes.map((s: any) => s._id.retailer_id))];
  const retailers = await Retailer.find({ retailer_id: { $in: retailerIds } })
    .select('retailer_id territory_id')
    .lean();
  const territoryMap = new Map(retailers.map((r) => [r.retailer_id, r.territory_id]));

  return spikes.map((s: any) => ({
    retailer_id: s._id.retailer_id,
    territory_id: territoryMap.get(s._id.retailer_id) || 'unknown',
    anomaly_type: 'demand_spike',
    sku_name: s._id.sku_name,
    severity: 'medium',
    description: `Demand spike for ${s._id.sku_name}: ${s.units} units this week vs usual average`,
  }));
}

async function detectVisitGaps() {
  // Flag one anomaly per tehsil (not per retailer — tehsils share retailers)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

  const recentVisitTehsils = await VisitLog.distinct('visit_tehsil', {
    visit_date: { $gte: fourteenDaysAgo },
  });
  const visitedSet = new Set(recentVisitTehsils);

  // Get one representative retailer per unvisited tehsil
  const unvisitedTehsils = await Retailer.aggregate([
    { $match: { tehsil: { $nin: Array.from(visitedSet) } } },
    { $group: { _id: '$tehsil', retailer_id: { $first: '$retailer_id' }, territory_id: { $first: '$territory_id' } } },
  ]);

  const gaps = unvisitedTehsils.map((t: any) => ({
    retailer_id: t.retailer_id,
    territory_id: t.territory_id,
    anomaly_type: 'visit_gap',
    sku_name: '',
    severity: 'low',
    description: `No visit to tehsil ${t._id} in the last 14 days`,
  }));

  return gaps;
}

/**
 * Detect tehsils where growers have shown digital buying intent (WhatsApp clicks)
 * but have not received a physical visit in the last 14 days. These are high-priority
 * conversion opportunities — the online signal must be followed up in the field.
 */
async function detectDigitalIntent() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

  // Growers who clicked a WhatsApp campaign link in last 30 days, grouped by tehsil
  const clicksByTehsil = await WhatsappLog.aggregate([
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
    {
      $group: {
        _id: '$grower.tehsil',
        click_count: { $sum: 1 },
        products: { $addToSet: '$campaign_product' },
      },
    },
  ]);

  if (!clicksByTehsil.length) return [];

  // Which of these tehsils have been visited recently?
  const tehsilsWithIntent = clicksByTehsil.map((t: any) => t._id).filter(Boolean);
  const recentlyVisited = await VisitLog.distinct('visit_tehsil', {
    visit_tehsil: { $in: tehsilsWithIntent },
    visit_date: { $gte: fourteenDaysAgo },
  });
  const visitedSet = new Set(recentlyVisited);

  // For unvisited tehsils, find one representative retailer per tehsil
  const unvisited = clicksByTehsil.filter((t: any) => t._id && !visitedSet.has(t._id));
  if (!unvisited.length) return [];

  const retailerReps = await Retailer.aggregate([
    { $match: { tehsil: { $in: unvisited.map((t: any) => t._id) } } },
    { $group: { _id: '$tehsil', retailer_id: { $first: '$retailer_id' }, territory_id: { $first: '$territory_id' } } },
  ]);
  const retailerMap = new Map(retailerReps.map((r: any) => [r._id, r]));

  return unvisited
    .map((t: any) => {
      const rep = retailerMap.get(t._id);
      if (!rep) return null;
      const productList = (t.products as string[]).slice(0, 3).join(', ');
      return {
        retailer_id: rep.retailer_id,
        territory_id: rep.territory_id,
        anomaly_type: 'digital_intent',
        sku_name: productList,
        severity: 'medium',
        description: `${t.click_count} grower${t.click_count > 1 ? 's' : ''} clicked campaign links for ${productList} in ${t._id} — no field visit in 14 days`,
      };
    })
    .filter(Boolean);
}

/**
 * Detect districts with high weather risk (heavy rain or pest-favorable conditions)
 * and create weather_alert anomalies for the most at-risk retailer in each district.
 * This tells reps: visit before the rain arrives / while pest pressure is building.
 */
async function detectWeatherAlerts() {
  const districts = Object.keys(DISTRICT_COORDS);

  const weatherResults = await Promise.allSettled(
    districts.map((d) => getWeatherForDistrict(d))
  );

  const riskyDistricts = weatherResults
    .map((r, i) => ({ district: districts[i], weather: r.status === 'fulfilled' ? r.value : null }))
    .filter((x) => x.weather && (x.weather.pest_risk === 'high' || x.weather.heavy_rain_days >= 2));

  if (!riskyDistricts.length) return [];

  const flags: any[] = [];

  for (const { district, weather } of riskyDistricts) {
    if (!weather) continue;

    // Pick one representative retailer per risky district
    const rep = await Retailer.findOne({ district }).select('retailer_id territory_id').lean();
    if (!rep) continue;

    const isRain = weather.heavy_rain_days >= 2;
    const isPest = weather.pest_risk === 'high';
    const severity = isRain && isPest ? 'high' : 'medium';

    const parts: string[] = [];
    if (isRain) parts.push(`${weather.heavy_rain_days} heavy-rain days forecast`);
    if (isPest) parts.push('pest-favorable conditions (high humidity + warm temps)');

    flags.push({
      retailer_id:  rep.retailer_id,
      territory_id: rep.territory_id,
      anomaly_type: 'weather_alert',
      sku_name:     '',
      severity,
      description:  `${district}: ${parts.join(' and ')} in the next 7 days — ${weather.risk_summary}`,
    });
  }

  return flags;
}

export async function runAnomalyDetection(): Promise<{ inserted: number; cleared: number }> {
  // Clear old anomalies (older than 7 days)
  const clearResult = await AnomalyFlag.deleteMany({
    detected_at: { $lt: new Date(Date.now() - 7 * 86400000) },
  });

  const latestWeek = await getLatestWeekDate();

  const [stockOutFlags, spikeFlags, gapFlags, intentFlags, weatherFlags] = await Promise.all([
    latestWeek ? detectStockOuts(latestWeek) : [],
    detectDemandSpikes(),
    detectVisitGaps(),
    detectDigitalIntent(),
    detectWeatherAlerts(),
  ]);

  const allFlags = [...stockOutFlags, ...spikeFlags, ...gapFlags, ...intentFlags, ...weatherFlags];

  if (allFlags.length > 0) {
    await AnomalyFlag.insertMany(allFlags, { ordered: false }).catch(() => {});
  }

  console.log(
    `Anomaly detection: ${stockOutFlags.length} stock-outs, ${spikeFlags.length} demand spikes, ` +
    `${gapFlags.length} visit gaps, ${intentFlags.length} digital intent, ${weatherFlags.length} weather alerts`
  );

  return { inserted: allFlags.length, cleared: clearResult.deletedCount };
}
