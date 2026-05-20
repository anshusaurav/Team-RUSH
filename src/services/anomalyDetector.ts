import Inventory from '../models/Inventory';
import { detectBrainAnomalies } from './brainAdvisor';
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

  // Find spikes: current week ≥ 2.5× prior average AND ≥ 10 absolute units.
  // The absolute floor filters out Poisson noise from low-volume SKUs (a SKU
  // going 1→3 units is statistically meaningless even though it's 3×).
  const spikes = currentWeek.filter((c: any) => {
    const key = `${c._id.retailer_id}__${c._id.sku_name}`;
    const avg = priorMap.get(key) || 0;
    return avg > 0 && c.units >= 10 && c.units >= avg * 2.5;
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

/**
 * Soft-dedupe stragglers. Older builds inserted a fresh row every time the
 * detector ran with no unique index, so a redeploy could quickly compound
 * into 10×+ duplicates per (retailer, type, sku). This collapses each
 * natural-key bucket to its single most-recent row.
 *
 * Idempotent. No-op once the upsert path has been live for one full cycle.
 */
async function dedupeAnomalyFlags(): Promise<number> {
  const buckets = await AnomalyFlag.aggregate<{
    _id: { retailer_id: string; anomaly_type: string; sku_name: string };
    keep_id: any;
    all_ids: any[];
  }>([
    { $sort: { detected_at: -1 } },
    {
      $group: {
        _id: {
          retailer_id: '$retailer_id',
          anomaly_type: '$anomaly_type',
          sku_name: '$sku_name',
        },
        keep_id: { $first: '$_id' },
        all_ids: { $push: '$_id' },
      },
    },
    { $match: { $expr: { $gt: [{ $size: '$all_ids' }, 1] } } },
  ]);

  if (!buckets.length) return 0;

  const toDelete = buckets.flatMap((b) => b.all_ids.filter((id) => !id.equals(b.keep_id)));
  if (!toDelete.length) return 0;

  const r = await AnomalyFlag.deleteMany({ _id: { $in: toDelete } });
  console.log(`[anomaly] dedupe: removed ${r.deletedCount} duplicate row(s) across ${buckets.length} bucket(s)`);
  return r.deletedCount ?? 0;
}

export async function runAnomalyDetection(): Promise<{ inserted: number; cleared: number }> {
  // First: collapse any duplicates left over from older builds.
  await dedupeAnomalyFlags();

  // Clear old anomalies (older than 7 days)
  const clearResult = await AnomalyFlag.deleteMany({
    detected_at: { $lt: new Date(Date.now() - 7 * 86400000) },
  });

  const latestWeek = await getLatestWeekDate();

  const [stockOutFlags, spikeFlags, gapFlags, intentFlags, weatherFlags, brainFlags] = await Promise.all([
    latestWeek ? detectStockOuts(latestWeek) : [],
    detectDemandSpikes(),
    detectVisitGaps(),
    detectDigitalIntent(),
    detectWeatherAlerts(),
    detectBrainAnomalies(),
  ]);

  const allFlags = [...stockOutFlags, ...spikeFlags, ...gapFlags, ...intentFlags, ...weatherFlags, ...brainFlags];

  // Upsert + reconcile. The detector is the source-of-truth for active
  // anomalies: every row in `allFlags` is upserted (refreshed if it exists,
  // inserted if new), and any *unresolved* row in the DB whose natural key
  // isn't in this run's output is deleted. Without this, tightening a rule
  // or fixing a bad inventory snapshot would leave stale false-positives
  // visible to reps until the 7-day TTL caught up.
  if (allFlags.length > 0) {
    const ops = allFlags.map((f: any) => ({
      updateOne: {
        filter: {
          retailer_id: f.retailer_id,
          anomaly_type: f.anomaly_type,
          sku_name: f.sku_name ?? '',
        },
        update: {
          $set: {
            territory_id: f.territory_id,
            severity:     f.severity,
            description:  f.description,
            detected_at:  new Date(),
            resolved:     false,
          },
        },
        upsert: true,
      },
    }));
    await AnomalyFlag.bulkWrite(ops, { ordered: false }).catch((e) =>
      console.warn('[anomaly] bulkWrite warning:', e?.message || e)
    );
  }

  // Reconcile: delete active rows whose (retailer, type, sku) isn't in the
  // detector's current output. This is what makes threshold tweaks effective
  // immediately. Resolved=true rows are preserved (real user-set state).
  const validKeys = new Set(
    allFlags.map((f: any) => `${f.retailer_id}|${f.anomaly_type}|${f.sku_name ?? ''}`)
  );
  const activeRows = await AnomalyFlag.find({ resolved: false })
    .select('retailer_id anomaly_type sku_name')
    .lean();
  const staleIds = activeRows
    .filter((r) => !validKeys.has(`${r.retailer_id}|${r.anomaly_type}|${r.sku_name ?? ''}`))
    .map((r) => r._id);
  let reconciledCount = 0;
  if (staleIds.length > 0) {
    const dr = await AnomalyFlag.deleteMany({ _id: { $in: staleIds } });
    reconciledCount = dr.deletedCount ?? 0;
    console.log(`[anomaly] reconciled: removed ${reconciledCount} stale active row(s)`);
  }

  console.log(
    `Anomaly detection: ${stockOutFlags.length} stock-outs, ${spikeFlags.length} demand spikes, ` +
    `${gapFlags.length} visit gaps, ${intentFlags.length} digital intent, ` +
    `${weatherFlags.length} weather alerts, ${brainFlags.length} ML (Brain.js)`
  );

  return { inserted: allFlags.length, cleared: clearResult.deletedCount };
}
