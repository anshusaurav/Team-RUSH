/**
 * Drop every collection the seed populates, then re-run the seed. Used when
 * Mongo has drifted from the canonical CSVs (duplicate rows from a re-run,
 * leftover extender data that wasn't fully cleaned, stale outcomes from
 * manual testing, etc.) and we want a known-good baseline before submission.
 *
 *   npx ts-node scripts/resetAndReseed.ts
 *
 * What it does:
 *   1. Connects to the Atlas URI in .env (MONGODB_URI)
 *   2. Drops: pos, retailers, repterritories, visitlogs, inventories, growers,
 *      whatsapplogs, visitoutcomes, anomalyflags
 *   3. Calls into the same seed loaders src/scripts/seed.ts uses, against
 *      DATASET_PATH (../dataset by default)
 *
 * Safe to re-run. Outcomes are wiped too — if you want to keep the demo
 * outcomes you logged through the UI, log them again after the reset.
 */

import 'dotenv/config';
import { spawnSync } from 'child_process';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db';
import POS from '../src/models/POS';
import Retailer from '../src/models/Retailer';
import RepTerritory from '../src/models/RepTerritory';
import VisitLog from '../src/models/VisitLog';
import Inventory from '../src/models/Inventory';
import Grower from '../src/models/Grower';
import WhatsappLog from '../src/models/WhatsappLog';
import VisitOutcome from '../src/models/VisitOutcome';
import AnomalyFlag from '../src/models/AnomalyFlag';

async function dropAll() {
  const collections: Array<{ name: string; model: any }> = [
    { name: 'POS',           model: POS },
    { name: 'Retailer',      model: Retailer },
    { name: 'RepTerritory',  model: RepTerritory },
    { name: 'VisitLog',      model: VisitLog },
    { name: 'Inventory',     model: Inventory },
    { name: 'Grower',        model: Grower },
    { name: 'WhatsappLog',   model: WhatsappLog },
    { name: 'VisitOutcome',  model: VisitOutcome },
    { name: 'AnomalyFlag',   model: AnomalyFlag },
  ];
  for (const { name, model } of collections) {
    const before = await model.estimatedDocumentCount();
    await model.deleteMany({});
    console.log(`  ${name.padEnd(14)} cleared: ${before} -> 0`);
  }
}

async function main() {
  console.log('Connecting to MongoDB…');
  await connectDB();

  console.log('\nDropping seeded collections…');
  await dropAll();

  console.log('\nDisconnecting before re-seed (seed.ts opens its own connection)…');
  await mongoose.disconnect();

  console.log('\nRunning seed.ts…');
  const seedPath = path.resolve(__dirname, '..', 'src', 'scripts', 'seed.ts');
  const result = spawnSync('npx', ['ts-node', seedPath], {
    stdio: 'inherit',
    shell: true,
    cwd: path.resolve(__dirname, '..'),
  });

  if (result.status !== 0) {
    console.error(`\nSeed failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
  console.log('\nReset and reseed complete.');
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
