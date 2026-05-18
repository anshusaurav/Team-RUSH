#!/usr/bin/env node
/**
 * Brain.js LSTMTimeStep Training Script — Syngenta Field Force Intelligence
 *
 * Queries POS transactions from MongoDB Atlas, builds per-retailer+SKU weekly
 * sales sequences, then trains a brain.js LSTMTimeStep to predict the next
 * week's sales velocity from the prior WINDOW weeks.
 *
 * Uses LSTMTimeStep (numeric time-series LSTM) rather than the character-level
 * LSTM — this is the correct recurrent network for regression on float sequences.
 *
 * To keep pure-JS training tractable, the script randomly samples up to
 * MAX_SEQUENCES training windows. Full history is still used for normalization.
 *
 * Usage:
 *   node scripts/trainBrain.js
 *   MONGODB_URI=<atlas_uri> node scripts/trainBrain.js
 *
 * Output: src/data/brainModel.json
 * After training: commit the file and push — Render auto-deploys.
 * Hot-reload without restart: POST /api/brain-anomalies/reload
 */

require('dotenv/config');
const brain        = require('brain.js/dist/browser.js');
const { MongoClient } = require('mongodb');
const fs           = require('fs');
const path         = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const WINDOW         = 4;    // input weeks → predict 1 ahead
const MIN_WEEKS      = 6;    // minimum weeks a retailer+SKU pair must have
const HISTORY_WEEKS  = 16;   // how far back to pull POS data
const MAX_SEQUENCES  = 800;  // cap training set (pure-JS perf limit)
const ITERATIONS     = 200;
const ERROR_THRESH   = 0.05;
const HIDDEN_LAYERS  = [8];

const PRODUCTS = [
  'Actara 25 WG', 'Alto 5 SC', 'Amistar 250 SC', 'Axial 50 EC',
  'Cruiser 350 FS', 'Kavach 75 WP', 'Movondo', 'Score 250 EC',
  'Tilt 250 EC', 'Topik 15 WP', 'Vertimec 1.8 EC', 'Vibrance Integral',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weekKey(date) {
  const d   = new Date(date);
  const day = d.getDay();
  const off = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), off).toISOString().slice(0, 10);
}

/** Fisher-Yates shuffle, in place */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI
    || 'mongodb+srv://db_user:asdfgh1234@cluster0.iqbjoic.mongodb.net/syngenta?appName=Cluster0';

  console.log('[Brain] Connecting to MongoDB...');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('syngenta');

  // ── 1. Load POS ──────────────────────────────────────────────────────────
  const since = new Date(Date.now() - HISTORY_WEEKS * 7 * 86_400_000);
  console.log(`[Brain] Querying POS (last ${HISTORY_WEEKS} weeks)...`);
  const pos = await db.collection('pos').find(
    { transaction_date: { $gte: since } },
    { projection: { retailer_id: 1, sku_name: 1, sku_qty: 1, transaction_date: 1, _id: 0 } }
  ).toArray();
  console.log(`[Brain] ${pos.length.toLocaleString()} POS records loaded`);

  // ── 2. Group by retailer + SKU + week ────────────────────────────────────
  const seriesMap = new Map(); // "retailer__sku" → Map<weekISO, units>
  for (const tx of pos) {
    if (!PRODUCTS.includes(tx.sku_name)) continue;
    const key = `${tx.retailer_id}__${tx.sku_name}`;
    if (!seriesMap.has(key)) seriesMap.set(key, new Map());
    const wk = weekKey(tx.transaction_date);
    seriesMap.get(key).set(wk, (seriesMap.get(key).get(wk) || 0) + tx.sku_qty);
  }
  console.log(`[Brain] ${seriesMap.size} retailer+SKU series built`);

  // ── 3. Per-SKU normalization max ─────────────────────────────────────────
  const skuMax = {};
  for (const [key, weekMap] of seriesMap) {
    const sku = key.split('__')[1];
    for (const units of weekMap.values()) {
      skuMax[sku] = Math.max(skuMax[sku] || 0, units);
    }
  }
  for (const sku of PRODUCTS) if (!skuMax[sku]) skuMax[sku] = 1;

  // ── 4. Build sliding-window sequences ────────────────────────────────────
  // LSTMTimeStep format: [v0, v1, v2, v3, v4]  (first WINDOW = input, last = target)
  const allSequences = [];
  let pairsSkipped = 0;
  for (const [key, weekMap] of seriesMap) {
    const sku    = key.split('__')[1];
    const maxVal = skuMax[sku];
    const sorted = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length < MIN_WEEKS) { pairsSkipped++; continue; }
    const vals = sorted.map(([, u]) => Math.min(u / maxVal, 1));
    for (let i = 0; i <= vals.length - WINDOW - 1; i++) {
      allSequences.push(vals.slice(i, i + WINDOW + 1));
    }
  }
  console.log(`[Brain] ${allSequences.length} sequences total (${pairsSkipped} pairs skipped for < ${MIN_WEEKS} weeks)`);

  // Cap to MAX_SEQUENCES via random sampling
  shuffle(allSequences);
  const sequences = allSequences.slice(0, MAX_SEQUENCES);
  console.log(`[Brain] Training on ${sequences.length} sampled sequences (cap: ${MAX_SEQUENCES})`);

  if (sequences.length < 20) {
    console.error('[Brain] Too few sequences. Aborting.');
    process.exit(1);
  }

  // ── 5. Train LSTMTimeStep ─────────────────────────────────────────────────
  // LSTMTimeStep is brain.js's numeric time-series LSTM — designed for float
  // regression, not character prediction. Predicts the last value from prior values.
  console.log(`\n[Brain] Training LSTMTimeStep (hiddenLayers=${JSON.stringify(HIDDEN_LAYERS)}, iterations=${ITERATIONS})...`);
  const net = new brain.recurrent.LSTMTimeStep({ hiddenLayers: HIDDEN_LAYERS });
  const t0  = Date.now();
  net.train(sequences, {
    iterations:  ITERATIONS,
    errorThresh: ERROR_THRESH,
    log:         true,
    logPeriod:   20,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[Brain] ✓ Trained in ${elapsed}s`);

  // Sanity check on a held-out sequence
  try {
    const sample = sequences[0];
    const input  = sample.slice(0, WINDOW);
    const actual = sample[WINDOW];
    const pred   = net.run(input);
    console.log(`[Brain] Sanity check — input: [${input.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  actual: ${actual.toFixed(4)}  predicted: ${(typeof pred === 'number' ? pred : 0).toFixed(4)}`);
  } catch (e) {
    console.warn('[Brain] Sanity check skipped:', e.message);
  }

  // ── 6. Serialise ─────────────────────────────────────────────────────────
  const output = {
    model:       net.toJSON(),
    sku_max:     skuMax,
    window:      WINDOW,
    products:    PRODUCTS,
    hidden_layers: HIDDEN_LAYERS,
    network_type: 'LSTMTimeStep',
    trained_at:  new Date().toISOString(),
    trained_on:  sequences.length,
    total_sequences: allSequences.length,
    n_series:    seriesMap.size,
  };

  const outPath = path.normalize(path.join(__dirname, '..', 'src', 'data', 'brainModel.json'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output));
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);

  console.log(`\n[Brain] ✓ Model saved → ${outPath} (${kb} KB)`);
  console.log('[Brain] Done. Next steps:');
  console.log('  git add src/data/brainModel.json && git commit -m "retrain brain lstm" && git push');
  console.log('  Or hot-reload live server: POST /api/brain-anomalies/reload');

  await client.close();
}

main().catch(err => {
  console.error('[Brain] Fatal:', err.message);
  process.exit(1);
});
