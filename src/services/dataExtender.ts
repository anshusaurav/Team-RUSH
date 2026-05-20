/**
 * Data extender — projects the synthetic dataset forward from its last
 * timestamp to "yesterday" so live 30-day windows on the dashboard return
 * meaningful numbers in May 2026 (the raw seed data ends late March 2026).
 *
 * Strategy: statistical bootstrap from the trailing 30 days of existing data.
 * No new dependencies; no Python at runtime. Generation is deterministic in IDs
 * so re-runs are idempotent (existing rows fail E11000 and are skipped, OR we
 * detect via max(date) per entity and only extend the gap).
 *
 * Guard env vars (see .env):
 *   EXTEND_DATA_TO_YESTERDAY=true|false   master switch (default false)
 *   EXTEND_MAX_DAYS=60                    safety cap on generated days
 *   EXTEND_SEASONALITY=false              apply off-season dampening (May–Sep)
 *
 * Runs on backend startup, after connectDB() and before anomaly detection.
 */

import POS from '../models/POS';
import Inventory from '../models/Inventory';
import VisitLog from '../models/VisitLog';
import WhatsappLog from '../models/WhatsappLog';
import RepTerritory from '../models/RepTerritory';
import Retailer from '../models/Retailer';
import Grower from '../models/Grower';
import DigitalFunnel from '../models/DigitalFunnel';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

interface ExtenderConfig {
  maxDays: number;
  seasonality: boolean;
  batchSize: number;
}

function getConfig(): ExtenderConfig {
  return {
    maxDays: parseInt(process.env.EXTEND_MAX_DAYS || '60', 10),
    seasonality: process.env.EXTEND_SEASONALITY === 'true',
    batchSize: 1000,
  };
}

export function isExtenderEnabled(): boolean {
  return process.env.EXTEND_DATA_TO_YESTERDAY === 'true';
}

// --------------------------------------------------------------------------
// Utilities — random sampling primitives
// --------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function poissonSample(lambda: number): number {
  // Knuth's algorithm — fine for our small λ values (typically < 5).
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[randInt(0, items.length - 1)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function dateOnly(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// Sunday-aligned week end (matches the seed CSV convention).
function weekEndSunday(d: Date): Date {
  const x = dateOnly(d);
  const dow = x.getUTCDay(); // 0 = Sun
  const diff = (7 - dow) % 7;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

// Monday-aligned week start — matches digital_funnel_weekly.csv (week_start_date
// is always a Monday in the seed data).
function weekStartMonday(d: Date): Date {
  const x = dateOnly(d);
  const dow = x.getUTCDay(); // 0=Sun..6=Sat
  const back = dow === 0 ? 6 : dow - 1; // days since the most recent Monday
  x.setUTCDate(x.getUTCDate() - back);
  return x;
}

// Seasonality multiplier: 1.0 during Rabi (Oct–Apr), 0.55 off-season.
function seasonalityMultiplier(d: Date, enabled: boolean): number {
  if (!enabled) return 1.0;
  const m = d.getUTCMonth() + 1; // 1..12
  return (m >= 10 || m <= 4) ? 1.0 : 0.55;
}

// --------------------------------------------------------------------------
// POS extension
// --------------------------------------------------------------------------

/**
 * For each retailer, learns daily transaction rate + per-SKU mix from the
 * trailing 30 days of existing POS data, then generates Poisson-sampled
 * transactions per day up to yesterday. Deterministic transaction_id leans on
 * the existing unique:true index for idempotency.
 */
async function extendPOS(asOfYesterday: Date, cfg: ExtenderConfig): Promise<number> {
  console.log('[Extend] POS: starting…');

  // 1. Per-retailer max date + last-30d profile (rate, SKU mix, day-of-week mix).
  const profiles = await POS.aggregate<{
    _id: string;
    last_date: Date;
    rows: Array<{ sku_id: string; sku_name: string; sku_qty: number; sku_price: number; dow: number }>;
  }>([
    { $sort: { transaction_date: -1 } },
    {
      $group: {
        _id: '$retailer_id',
        last_date: { $first: '$transaction_date' },
        rows: {
          $push: {
            sku_id: '$sku_id',
            sku_name: '$sku_name',
            sku_qty: '$sku_qty',
            sku_price: '$sku_price',
            dow: { $dayOfWeek: '$transaction_date' }, // 1=Sun..7=Sat
          },
        },
      },
    },
    { $project: { _id: 1, last_date: 1, rows: { $slice: ['$rows', 200] } } }, // cap memory
  ]);

  console.log(`[Extend] POS: ${profiles.length} retailers profiled`);

  const out: Array<{
    retailer_id: string;
    transaction_id: string;
    sku_id: string;
    sku_name: string;
    sku_qty: number;
    sku_price: number;
    transaction_date: Date;
  }> = [];

  for (const p of profiles) {
    const retailerStart = addDays(dateOnly(p.last_date), 1);
    const endDate = dateOnly(asOfYesterday);
    if (retailerStart > endDate) continue;

    // Build profile structures
    const skuKeys: string[] = [];
    const skuWeights: number[] = [];
    const skuMeta = new Map<string, { sku_id: string; sku_name: string; lastPrice: number; qtyMean: number; qtyN: number }>();
    const dowCounts = [0, 0, 0, 0, 0, 0, 0]; // index 0=Sun..6=Sat (we'll map dow-1)
    let totalTx = 0;
    const distinctDates = new Set<string>();

    for (const r of p.rows) {
      const key = r.sku_id || r.sku_name;
      if (!skuMeta.has(key)) {
        skuKeys.push(key);
        skuWeights.push(0);
        skuMeta.set(key, { sku_id: r.sku_id, sku_name: r.sku_name, lastPrice: r.sku_price, qtyMean: r.sku_qty, qtyN: 1 });
      } else {
        const m = skuMeta.get(key)!;
        m.qtyMean = (m.qtyMean * m.qtyN + r.sku_qty) / (m.qtyN + 1);
        m.qtyN++;
        m.lastPrice = r.sku_price; // most recent (because we sorted desc above)
      }
      skuWeights[skuKeys.indexOf(key)]++;
      dowCounts[(r.dow - 1) % 7]++;
      totalTx++;
    }
    if (totalTx === 0) continue;

    // Days span covered by these rows — approximate from the cap (200 rows worth).
    // If retailer transacts daily, ~200/30 ≈ 6 tx/day. We don't actually need
    // exact daysSpan; we just need a per-day baseline rate.
    // Approximate "daysSpan" by counting distinct dates we'd see — since rows
    // are already a slice, fall back to 30 as a safe default for active retailers.
    const daysSpan = Math.max(7, Math.min(30, Math.floor(totalTx / 1.5)));
    const baseRate = totalTx / daysSpan; // tx/day

    // Day-of-week multipliers normalised around 1.0
    const dowMean = dowCounts.reduce((s, v) => s + v, 0) / 7 || 1;
    const dowMul = dowCounts.map(c => (c / dowMean) || 0.5);

    for (let day = new Date(retailerStart); day <= endDate; day = addDays(day, 1)) {
      const dow = day.getUTCDay(); // 0..6
      const seasonMul = seasonalityMultiplier(day, cfg.seasonality);
      const lambda = baseRate * (dowMul[dow] || 1) * seasonMul;
      const n = poissonSample(lambda);

      for (let i = 0; i < n; i++) {
        const skuKey = pickWeighted(skuKeys, skuWeights);
        const meta = skuMeta.get(skuKey);
        if (!meta) continue;
        // Sample qty around the historical mean; clamp to >=1
        const qty = Math.max(1, Math.round(meta.qtyMean + (Math.random() - 0.5) * meta.qtyMean));
        out.push({
          retailer_id: p._id,
          transaction_id: `EXT_${yyyymmdd(day)}_${p._id}_${i}`,
          sku_id: meta.sku_id,
          sku_name: meta.sku_name,
          sku_qty: qty,
          sku_price: meta.lastPrice,
          transaction_date: day,
        });
      }
    }
  }

  return await batchInsert(POS, out, 'POS', cfg.batchSize);
}

// --------------------------------------------------------------------------
// VisitLog extension
// --------------------------------------------------------------------------

/**
 * For each rep, learns weekly visit cadence + tehsil mix + visit-type mix +
 * product mix from existing visit logs, then samples per-day Bernoulli draws.
 * No retailer_id in VisitLog (tehsil-only), so we sample tehsil from the rep's
 * tehsil_list weighted by historical visits.
 */
async function extendVisitLogs(asOfYesterday: Date, cfg: ExtenderConfig): Promise<number> {
  console.log('[Extend] VisitLog: starting…');

  // Get rep -> tehsil_list (the canonical set we can sample from)
  const reps = await RepTerritory.find().select('rep_id territory_id tehsil_list').lean();
  const repMeta = new Map(reps.map(r => [r.rep_id, r]));

  // Build per-rep profile from existing visit logs
  const profiles = await VisitLog.aggregate<{
    _id: string;
    last_date: Date;
    rows: Array<{ tehsil: string; type: string; product: string; dow: number }>;
    distinctDates: string[];
  }>([
    { $sort: { visit_date: -1 } },
    {
      $group: {
        _id: '$rep_id',
        last_date: { $first: '$visit_date' },
        rows: {
          $push: {
            tehsil: '$visit_tehsil',
            type: '$visit_type',
            product: '$product_recommended',
            dow: { $dayOfWeek: '$visit_date' },
          },
        },
        distinctDates: {
          $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$visit_date' } },
        },
      },
    },
    { $project: { _id: 1, last_date: 1, rows: { $slice: ['$rows', 60] }, distinctDates: 1 } },
  ]);

  const out: Array<{
    rep_id: string;
    visit_date: Date;
    territory_id: string;
    visit_tehsil: string;
    visit_type: string;
    product_recommended: string;
  }> = [];

  for (const p of profiles) {
    const rep = repMeta.get(p._id);
    if (!rep) continue;
    const start = addDays(dateOnly(p.last_date), 1);
    const end = dateOnly(asOfYesterday);
    if (start > end) continue;

    // Build sampling distributions
    const tehsilCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    const productCounts = new Map<string, number>();
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const r of p.rows) {
      tehsilCounts.set(r.tehsil, (tehsilCounts.get(r.tehsil) || 0) + 1);
      typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1);
      productCounts.set(r.product, (productCounts.get(r.product) || 0) + 1);
      dowCounts[(r.dow - 1) % 7]++;
    }
    // Fall back to rep's tehsil_list if no historical visits
    const tehsils = tehsilCounts.size > 0 ? [...tehsilCounts.keys()] : (rep.tehsil_list || []);
    const tehsilWeights = tehsils.map(t => tehsilCounts.get(t) || 1);
    const types = typeCounts.size > 0 ? [...typeCounts.keys()] : ['retailer meeting'];
    const typeWeights = types.map(t => typeCounts.get(t) || 1);
    const products = productCounts.size > 0 ? [...productCounts.keys()] : ['Topik 15 WP'];
    const productWeights = products.map(pr => productCounts.get(pr) || 1);
    if (tehsils.length === 0) continue;

    // visits/day base rate
    const days = Math.max(1, p.distinctDates.length);
    const baseRate = p.rows.length / days; // visits/day on active days
    const activeDayRate = days / 30; // share of days the rep was active (rough)
    const visitProb = Math.min(1, baseRate * activeDayRate * 0.9); // smooth

    const dowMean = dowCounts.reduce((s, v) => s + v, 0) / 7 || 1;
    const dowMul = dowCounts.map(c => (c / dowMean) || 0.3);

    for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
      const dow = day.getUTCDay();
      const p_today = Math.min(0.95, visitProb * (dowMul[dow] || 0.3) * seasonalityMultiplier(day, cfg.seasonality));
      // Sunday — heavy suppression
      const fire = dow === 0 ? Math.random() < p_today * 0.2 : Math.random() < p_today;
      if (!fire) continue;
      // 1-2 visits on active days
      const nVisits = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < nVisits; i++) {
        out.push({
          rep_id: p._id,
          visit_date: day,
          territory_id: rep.territory_id,
          visit_tehsil: pickWeighted(tehsils, tehsilWeights),
          visit_type: pickWeighted(types, typeWeights),
          product_recommended: pickWeighted(products, productWeights),
        });
      }
    }
  }

  // No natural unique key on VisitLog — but we only insert dates strictly after
  // each rep's last visit, so duplicates can't happen on re-run.
  return await batchInsert(VisitLog, out, 'VisitLog', cfg.batchSize);
}

// --------------------------------------------------------------------------
// Inventory extension
// --------------------------------------------------------------------------

/**
 * For each retailer × SKU, projects the inventory forward one week at a time
 * up to the most recent Sunday on or before yesterday. Velocity is drawn from
 * the trailing 30d POS for that pair. Occasional restock events bump qty back
 * toward typical level.
 */
async function extendInventory(asOfYesterday: Date, cfg: ExtenderConfig): Promise<number> {
  console.log('[Extend] Inventory: starting…');

  // Latest snapshot per (retailer, sku)
  const latestByPair = await Inventory.aggregate<{
    _id: { retailer_id: string; sku_id: string };
    sku_name: string;
    sku_qty: number;
    week_end_date: Date;
  }>([
    { $sort: { week_end_date: -1 } },
    {
      $group: {
        _id: { retailer_id: '$retailer_id', sku_id: '$sku_id' },
        sku_name: { $first: '$sku_name' },
        sku_qty: { $first: '$sku_qty' },
        week_end_date: { $first: '$week_end_date' },
      },
    },
  ]);

  // Per-pair 30d velocity from POS (units/week)
  const velocity = await POS.aggregate<{
    _id: { retailer_id: string; sku_id: string };
    units: number;
    span_days: number;
  }>([
    { $sort: { transaction_date: -1 } },
    {
      $group: {
        _id: { retailer_id: '$retailer_id', sku_id: '$sku_id' },
        units: { $sum: '$sku_qty' },
        first: { $first: '$transaction_date' },
        last: { $last: '$transaction_date' },
      },
    },
    {
      $project: {
        units: 1,
        span_days: {
          $max: [1, { $divide: [{ $subtract: ['$first', '$last'] }, 1000 * 86400] }],
        },
      },
    },
  ]);

  const velMap = new Map<string, number>(); // key = retailer|sku → units/week
  for (const v of velocity) {
    const key = `${v._id.retailer_id}|${v._id.sku_id}`;
    const perDay = v.units / Math.max(7, v.span_days);
    velMap.set(key, perDay * 7);
  }

  const endWeek = weekEndSunday(asOfYesterday);
  const out: Array<{
    retailer_id: string;
    sku_id: string;
    sku_name: string;
    sku_qty: number;
    week_end_date: Date;
  }> = [];

  for (const snap of latestByPair) {
    const startWeek = addDays(weekEndSunday(snap.week_end_date), 7);
    if (startWeek > endWeek) continue;
    const key = `${snap._id.retailer_id}|${snap._id.sku_id}`;
    const weeklyVel = velMap.get(key) ?? 1; // default 1 unit/week if no POS

    let qty = snap.sku_qty;
    for (let wk = new Date(startWeek); wk <= endWeek; wk = addDays(wk, 7)) {
      // Drawdown — noisy around the mean velocity
      const drawdown = Math.max(0, Math.round(weeklyVel * (0.6 + Math.random() * 0.8)));
      qty = Math.max(0, qty - drawdown);
      // 18% chance of a restock event back toward "typical"
      if (Math.random() < 0.18) {
        const typical = Math.max(weeklyVel * 4, 15); // ~4 weeks of stock
        qty = Math.round(typical * (0.9 + Math.random() * 0.4));
      }
      out.push({
        retailer_id: snap._id.retailer_id,
        sku_id: snap._id.sku_id,
        sku_name: snap.sku_name,
        sku_qty: qty,
        week_end_date: new Date(wk),
      });
    }
  }

  return await batchInsert(Inventory, out, 'Inventory', cfg.batchSize);
}

// --------------------------------------------------------------------------
// WhatsApp log extension
// --------------------------------------------------------------------------

/**
 * Extends per-grower WhatsApp campaign messages forward. Only smartphone users
 * receive messages (matching the seed convention). Deterministic id format
 * WAM_EXT_{YYYYMMDD}_{grower}_{n} relies on the existing unique:true index.
 */
async function extendWhatsappLogs(asOfYesterday: Date, cfg: ExtenderConfig): Promise<number> {
  console.log('[Extend] WhatsApp: starting…');

  const profiles = await WhatsappLog.aggregate<{
    _id: string; // grower_id
    last_date: Date;
    rows: Array<{ product: string; crop: string; delivered: boolean; opened: boolean; clicked: boolean }>;
  }>([
    { $sort: { message_sent_date: -1 } },
    {
      $group: {
        _id: '$grower_id',
        last_date: { $first: '$message_sent_date' },
        rows: {
          $push: {
            product: '$campaign_product',
            crop: '$campaign_crop',
            delivered: '$delivered_status',
            opened: '$opened_status',
            clicked: '$clicked_status',
          },
        },
      },
    },
    { $project: { _id: 1, last_date: 1, rows: { $slice: ['$rows', 20] } } },
  ]);

  // Validate growers still exist + are smartphone users
  const growerIds = profiles.map(p => p._id);
  const growers = await Grower.find({ grower_id: { $in: growerIds }, device_type: 'smartphone' })
    .select('grower_id')
    .lean();
  const validGrowers = new Set(growers.map(g => g.grower_id));

  const out: Array<{
    id: string;
    campaign_product: string;
    campaign_crop: string;
    grower_id: string;
    message_sent_date: Date;
    delivered_status: boolean;
    opened_status: boolean;
    clicked_status: boolean;
  }> = [];

  for (const p of profiles) {
    if (!validGrowers.has(p._id)) continue;
    const start = addDays(dateOnly(p.last_date), 1);
    const end = dateOnly(asOfYesterday);
    if (start > end) continue;

    const lastRow = p.rows[0];
    if (!lastRow) continue;
    // Empirical engagement rates
    const totalSends = p.rows.length;
    const deliveredRate = p.rows.filter(r => r.delivered).length / totalSends;
    const openedRate = p.rows.filter(r => r.opened).length / totalSends;
    const clickedRate = p.rows.filter(r => r.clicked).length / totalSends;

    // Send cadence: ~once every 14 days — Bernoulli(1/14) per day
    let counter = 0;
    for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
      if (Math.random() > 1 / 14) continue;
      const delivered = Math.random() < deliveredRate;
      const opened = delivered && Math.random() < openedRate / (deliveredRate || 1);
      const clicked = opened && Math.random() < clickedRate / (openedRate || 1);
      out.push({
        id: `WAM_EXT_${yyyymmdd(day)}_${p._id}_${counter++}`,
        campaign_product: lastRow.product,
        campaign_crop: lastRow.crop,
        grower_id: p._id,
        message_sent_date: day,
        delivered_status: delivered,
        opened_status: opened,
        clicked_status: clicked,
      });
    }
  }

  return await batchInsert(WhatsappLog, out, 'WhatsApp', cfg.batchSize);
}

// --------------------------------------------------------------------------
// Digital funnel extension
// --------------------------------------------------------------------------

/**
 * Projects each marketing campaign's weekly funnel (impressions, landing page
 * visits, lead form submissions) forward to the most recent Monday on or
 * before yesterday. Per-campaign mean + std are learned from the existing
 * rows; new weeks are sampled as Poisson(mean) with the historical mean as λ.
 *
 * Idempotent — the (campaign_id, week_start_date) compound unique index drops
 * duplicates under ordered:false.
 */
async function extendDigitalFunnel(asOfYesterday: Date, cfg: ExtenderConfig): Promise<number> {
  console.log('[Extend] DigitalFunnel: starting…');

  const profiles = await DigitalFunnel.aggregate<{
    _id: string; // campaign_id
    last_week: Date;
    crop: string;
    product: string;
    impressions: number[];
    visits: number[];
    leads: number[];
  }>([
    { $sort: { week_start_date: -1 } },
    {
      $group: {
        _id: '$campaign_id',
        last_week: { $first: '$week_start_date' },
        crop:      { $first: '$campaign_crop' },
        product:   { $first: '$campaign_product' },
        impressions: { $push: '$social_post_impression' },
        visits:      { $push: '$landing_page_visits' },
        leads:       { $push: '$lead_form_submission' },
      },
    },
  ]);

  if (profiles.length === 0) {
    console.log('[Extend] DigitalFunnel: no campaigns found, skipping');
    return 0;
  }

  const endWeek = weekStartMonday(asOfYesterday);
  const out: Array<{
    campaign_id: string;
    week_start_date: Date;
    social_post_impression: number;
    landing_page_visits: number;
    lead_form_submission: number;
    campaign_crop: string;
    campaign_product: string;
  }> = [];

  for (const p of profiles) {
    const start = addDays(weekStartMonday(p.last_week), 7);
    if (start > endWeek) continue;

    const impMean = p.impressions.reduce((s, v) => s + v, 0) / p.impressions.length;
    const visMean = p.visits.reduce((s, v) => s + v, 0)      / p.visits.length;
    const ledMean = p.leads.reduce((s, v) => s + v, 0)       / p.leads.length;

    for (let wk = new Date(start); wk <= endWeek; wk = addDays(wk, 7)) {
      const seasonMul = seasonalityMultiplier(wk, cfg.seasonality);
      out.push({
        campaign_id:            p._id,
        week_start_date:        new Date(wk),
        // Poisson-sample around the historical mean for realism; clamp to 0+
        social_post_impression: Math.max(0, poissonSample(impMean * seasonMul)),
        landing_page_visits:    Math.max(0, poissonSample(visMean * seasonMul)),
        lead_form_submission:   Math.max(0, poissonSample(ledMean * seasonMul)),
        campaign_crop:          p.crop,
        campaign_product:       p.product,
      });
    }
  }

  return await batchInsert(DigitalFunnel, out, 'DigitalFunnel', cfg.batchSize);
}

// --------------------------------------------------------------------------
// Insertion helper
// --------------------------------------------------------------------------

async function batchInsert(
  Model: any,
  docs: any[],
  label: string,
  batchSize: number
): Promise<number> {
  if (docs.length === 0) {
    console.log(`[Extend] ${label}: nothing to insert`);
    return 0;
  }
  let inserted = 0;
  let dupes = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const slice = docs.slice(i, i + batchSize);
    try {
      const r = await Model.insertMany(slice, { ordered: false, rawResult: true });
      inserted += r.insertedCount ?? slice.length;
    } catch (e: any) {
      // ordered:false continues past dupes; count successes from the partial result
      const writeErrors = e?.writeErrors?.length || e?.result?.result?.writeErrors?.length || 0;
      const inserts = (slice.length - writeErrors);
      inserted += inserts;
      dupes += writeErrors;
    }
  }
  console.log(`[Extend] ${label}: ${inserted} inserted${dupes ? ` (${dupes} skipped as duplicates)` : ''}`);
  return inserted;
}

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

export async function extendDataToYesterday(): Promise<void> {
  if (!isExtenderEnabled()) {
    console.log('[Extend] EXTEND_DATA_TO_YESTERDAY=false — skipping data extension');
    return;
  }

  const cfg = getConfig();
  const today = dateOnly(new Date());
  const yesterday = addDays(today, -1);

  // Look at the latest POS row to learn how far behind the data is
  const latestPos = await POS.findOne().sort({ transaction_date: -1 }).select('transaction_date').lean();
  if (!latestPos?.transaction_date) {
    console.log('[Extend] No POS data found — skipping (run seed first)');
    return;
  }

  const lastDate = dateOnly(latestPos.transaction_date);
  const gapDays = Math.floor((yesterday.getTime() - lastDate.getTime()) / 86400000);
  if (gapDays <= 0) {
    console.log('[Extend] Data already up-to-date');
    return;
  }

  // Safety cap to avoid runaway generation
  const cappedEnd = gapDays > cfg.maxDays ? addDays(lastDate, cfg.maxDays) : yesterday;
  console.log(`[Extend] Extending data from ${lastDate.toISOString().slice(0, 10)} → ${cappedEnd.toISOString().slice(0, 10)} (${Math.min(gapDays, cfg.maxDays)} days)`);

  const t0 = Date.now();
  try {
    const [pos, visits, inv, wa, funnel] = await Promise.all([
      extendPOS(cappedEnd, cfg),
      extendVisitLogs(cappedEnd, cfg),
      extendInventory(cappedEnd, cfg),
      extendWhatsappLogs(cappedEnd, cfg),
      extendDigitalFunnel(cappedEnd, cfg),
    ]);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[Extend] Done in ${dt}s — POS ${pos}, VisitLog ${visits}, Inventory ${inv}, WhatsApp ${wa}, DigitalFunnel ${funnel}`);
  } catch (err: any) {
    console.error('[Extend] Failed:', err?.message || err);
    // Non-fatal — backend continues to start; metrics will fall back to as_of anchor.
  }
}
