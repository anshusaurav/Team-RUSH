/**
 * RF Advisor — pure-JS inference on a pre-trained sklearn RandomForest.
 *
 * Training happens in Python (scripts/train_rf.py), which outputs
 * src/data/rfModel.json. This module loads that JSON at startup and
 * runs tree traversal for predictions in < 1ms — no Python at runtime.
 *
 * To retrain: MONGODB_URI=... python3 scripts/train_rf.py
 * Then commit src/data/rfModel.json and redeploy.
 */

import path from 'path';
import fs from 'fs';
import Retailer from '../models/Retailer';
import Grower from '../models/Grower';
import WhatsappLog from '../models/WhatsappLog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SerializedTree {
  feature:        number[];
  threshold:      number[];
  children_left:  number[];
  children_right: number[];
  value:          number[][];   // [n_nodes, n_classes]
}

interface RFModel {
  trees:          SerializedTree[];
  n_classes:      number;
  product_labels: string[];
  feature_names:  string[];
  trained_at:     string;
  trained_on:     number;
  n_estimators:   number;
}

// ─── Encodings (must match train_rf.py) ──────────────────────────────────────

const CROP_MAP: Record<string, number> = {
  wheat: 0, chickpea: 1, mustard: 2, barley: 3,
  lentil: 4, potato: 5, cumin: 6, safflower: 7, maize: 8,
};

const STAGE_MAP: Record<string, number> = {
  tillering: 1, flowering: 2, pod_formation: 3,
};

const PRODUCT_CATEGORY: Record<string, string> = {
  'Actara 25 WG':      'insecticide',
  'Alto 5 SC':         'fungicide',
  'Amistar 250 SC':    'fungicide',
  'Axial 50 EC':       'herbicide',
  'Cruiser 350 FS':    'seed treatment',
  'Kavach 75 WP':      'fungicide',
  'Movondo':           'herbicide',
  'Score 250 EC':      'fungicide',
  'Tilt 250 EC':       'fungicide',
  'Topik 15 WP':       'herbicide',
  'Vertimec 1.8 EC':   'insecticide / acaricide',
  'Vibrance Integral': 'seed treatment',
};

// ─── Module-level state ────────────────────────────────────────────────────────

let rfModel: RFModel | null = null;

// Cached per-tehsil lookups (rebuilt lazily on first predict call)
let tehsilCropMap = new Map<string, { crop: string; stages: { stage: string; approx: Date }[] }>();
let tehsilClickMap = new Map<string, number>();
let mapsBuilt = false;

// ─── Load model from JSON ─────────────────────────────────────────────────────

export function loadModel(): void {
  // Look next to source file first (dev), then from project root (production/Render)
  const candidates = [
    path.join(__dirname, '../data/rfModel.json'),          // dist/services → dist/data (dev copy)
    path.join(process.cwd(), 'src/data/rfModel.json'),     // project root → src/data (Render)
  ];
  const modelPath = candidates.find(fs.existsSync) ?? candidates[0];
  if (!fs.existsSync(modelPath)) {
    console.warn('[RF] rfModel.json not found — run scripts/train_rf.py to generate it.');
    return;
  }
  try {
    rfModel = JSON.parse(fs.readFileSync(modelPath, 'utf8')) as RFModel;
    console.log(
      `[RF] ✓ Model loaded — ${rfModel.n_estimators} trees, ` +
      `${rfModel.n_classes} classes, trained on ${rfModel.trained_on.toLocaleString()} samples ` +
      `(${rfModel.trained_at})`
    );
  } catch (err: any) {
    console.error('[RF] Failed to load rfModel.json:', err.message);
  }
}

// ─── Pure-JS tree traversal ───────────────────────────────────────────────────

/** Traverse one decision tree and return class vote counts at the leaf. */
function traverseTree(tree: SerializedTree, features: number[]): number[] {
  let node = 0;
  while (tree.children_left[node] !== -1) {
    node = features[tree.feature[node]] <= tree.threshold[node]
      ? tree.children_left[node]
      : tree.children_right[node];
  }
  return tree.value[node];  // class counts at this leaf
}

/** Aggregate votes across all trees, return { label, confidence }. */
function forestPredict(model: RFModel, features: number[]): { label: number; confidence: number } {
  const votes = new Array<number>(model.n_classes).fill(0);

  for (const tree of model.trees) {
    const leafCounts = traverseTree(tree, features);
    // Winner of this tree = class with most samples at the leaf
    const winner = leafCounts.indexOf(Math.max(...leafCounts));
    votes[winner]++;
  }

  const label      = votes.indexOf(Math.max(...votes));
  const confidence = votes[label] / model.n_estimators;
  return { label, confidence };
}

// ─── Feature vector ───────────────────────────────────────────────────────────

function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

function buildFeatureVector(
  date: Date,
  crop: string,
  stages: { stage: string; approx: Date }[],
  visitType: string,
  waClicks: number,
): number[] {
  const month    = date.getMonth() + 1;
  const doy      = dayOfYear(date);
  const cropCode = CROP_MAP[crop] ?? 0;

  let stageCode  = 0;
  let daysSince  = 45;
  let daysToNext = 90;

  const sorted = [...stages].sort((a, b) => a.approx.getTime() - b.approx.getTime());
  for (const s of sorted) {
    const diff = Math.floor((date.getTime() - s.approx.getTime()) / 86_400_000);
    if (diff >= -7 && diff <= 30) {
      stageCode = STAGE_MAP[s.stage] ?? 0;
      daysSince = Math.max(0, diff);
    } else if (diff < -7) {
      daysToNext = Math.min(daysToNext, Math.abs(diff));
      break;
    }
  }

  const visitCode = visitType === 'demo' ? 1 : visitType === 'training' ? 2 : 0;

  return [
    month,
    doy,
    cropCode,
    stageCode,
    Math.max(-45, Math.min(45, daysSince)),
    Math.min(90, daysToNext),
    visitCode,
    Math.min(20, waClicks),
  ];
}

// ─── Build tehsil maps (lazy, once per process) ───────────────────────────────

async function ensureMaps(): Promise<void> {
  if (mapsBuilt) return;

  const growerAgg = await Grower.aggregate([
    {
      $group: {
        _id:    '$tehsil',
        crops:  { $push: '$grower_crop_calendar.crop' },
        stages: { $push: '$grower_crop_calendar.stages' },
      },
    },
  ]);

  for (const g of growerAgg) {
    const freq: Record<string, number> = {};
    for (const c of g.crops as string[]) if (c) freq[c] = (freq[c] ?? 0) + 1;
    const crop = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'wheat';

    const stageSet: Record<string, Date> = {};
    for (const arr of g.stages as any[]) {
      if (!Array.isArray(arr)) continue;
      for (const s of arr) {
        if (s?.stage && s?.approx) stageSet[s.stage] = new Date(s.approx as string);
      }
    }
    tehsilCropMap.set(g._id, {
      crop,
      stages: Object.entries(stageSet).map(([stage, approx]) => ({ stage, approx })),
    });
  }

  const since = new Date(Date.now() - 30 * 86_400_000);
  const clickAgg = await WhatsappLog.aggregate([
    { $match: { clicked_status: true, message_sent_date: { $gte: since } } },
    { $lookup: { from: 'growers', localField: 'grower_id', foreignField: 'grower_id', as: 'grower' } },
    { $unwind: '$grower' },
    { $group: { _id: '$grower.tehsil', clicks: { $sum: 1 } } },
  ]);
  for (const c of clickAgg) tehsilClickMap.set(c._id as string, c.clicks as number);

  mapsBuilt = true;
  console.log(`[RF] Tehsil maps ready — ${tehsilCropMap.size} tehsils`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function predictBestProduct(retailerId: string): Promise<{
  product_recommended: string;
  confidence: number;
  reasoning: string;
  model_trained_on: number;
  trained_at: string | null;
}> {
  if (!rfModel) {
    throw new Error('RF model not loaded. Run scripts/train_rf.py and commit rfModel.json.');
  }

  await ensureMaps();

  const retailer = await Retailer.findOne({ retailer_id: retailerId }).lean();
  if (!retailer) throw new Error(`Retailer ${retailerId} not found`);

  const tehsil     = retailer.tehsil as string;
  const tehsilData = tehsilCropMap.get(tehsil) ?? { crop: 'wheat', stages: [] };
  const clicks     = tehsilClickMap.get(tehsil) ?? 0;
  const now        = new Date();

  const features             = buildFeatureVector(now, tehsilData.crop, tehsilData.stages, 'retailer meeting', clicks);
  const { label, confidence} = forestPredict(rfModel, features);
  const product              = rfModel.product_labels[label] ?? rfModel.product_labels[0];

  // Resolve active stage for reasoning
  let stageCode = 0;
  const sorted = [...tehsilData.stages].sort((a, b) => a.approx.getTime() - b.approx.getTime());
  for (const s of sorted) {
    const diff = Math.floor((now.getTime() - s.approx.getTime()) / 86_400_000);
    if (diff >= -7 && diff <= 30) { stageCode = STAGE_MAP[s.stage] ?? 0; break; }
  }

  const reasoning = buildReasoning(product, tehsilData.crop, stageCode, now.getMonth() + 1, confidence, clicks);

  return {
    product_recommended: product,
    confidence:          Math.round(confidence * 100) / 100,
    reasoning,
    model_trained_on:    rfModel.trained_on,
    trained_at:          rfModel.trained_at ?? null,
  };
}

function buildReasoning(
  product: string, crop: string, stageCode: number,
  month: number, confidence: number, clicks: number,
): string {
  const stageNames  = ['pre-season', 'tillering', 'flowering', 'pod formation'];
  const stageName   = stageNames[stageCode] ?? 'current stage';
  const category    = PRODUCT_CATEGORY[product] ?? 'agrochemical';
  const season      = (month >= 10 || month <= 4) ? 'Rabi' : 'Kharif';
  const cropDisplay = crop.charAt(0).toUpperCase() + crop.slice(1);

  const parts = [
    `${cropDisplay} is at ${stageName} during the ${season} season.`,
    `${product} (${category}) is the top-ranked recommendation at this crop stage across ${rfModel?.trained_on.toLocaleString()} historical territory visits.`,
  ];
  if (clicks > 0) parts.push(`${clicks} nearby growers recently clicked related WhatsApp campaigns.`);
  parts.push(`Model confidence: ${Math.round(confidence * 100)}% (${rfModel?.n_estimators} decision trees).`);
  return parts.join(' ');
}

export function getModelStatus() {
  return {
    trained:       rfModel !== null,
    trained_on:    rfModel?.trained_on ?? 0,
    trained_at:    rfModel?.trained_at ?? null,
    n_estimators:  rfModel?.n_estimators ?? 0,
    classes:       rfModel?.n_classes ?? 0,
    features:      rfModel?.feature_names ?? [],
    inference:     'pure-js tree traversal (< 1ms)',
  };
}
