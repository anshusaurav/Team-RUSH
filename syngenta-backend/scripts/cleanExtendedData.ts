/**
 * One-off cleanup: removes rows the data-extender added so Atlas stays under
 * the 512 MB free-tier cap. Safe to run multiple times.
 *
 * Identifies extended rows by:
 *   - POS:       transaction_id starts with `EXT_`
 *   - WhatsApp:  id starts with `WAM_EXT_`
 *   - VisitLog:  visit_date > CUTOFF  (no natural ID tag)
 *   - Inventory: week_end_date > CUTOFF
 *
 * CUTOFF is `2026-04-05` — the documented end of the seed dataset (per
 * dataset/DATA_DICTIONARY.md, "October 2025 – April 2026"). Visit logs and
 * inventory snapshots beyond that date can only have come from the extender.
 *
 * Run with:  npx ts-node scripts/cleanExtendedData.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db';
import POS from '../src/models/POS';
import WhatsappLog from '../src/models/WhatsappLog';
import VisitLog from '../src/models/VisitLog';
import Inventory from '../src/models/Inventory';
import AnomalyFlag from '../src/models/AnomalyFlag';

const CUTOFF = new Date('2026-04-05T00:00:00Z');

async function dbSize(): Promise<{ collections: any[]; totalMB: number }> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');
  const stats: any = await db.command({ dbStats: 1 });
  const colls = ['pos', 'whatsapplogs', 'visitlogs', 'inventories', 'anomalyflags', 'retailers', 'reps_territories', 'growers'];
  const out = [];
  for (const c of colls) {
    try {
      const s: any = await db.command({ collStats: c });
      out.push({ name: c, count: s.count, sizeMB: +(s.size / 1024 / 1024).toFixed(1), storageMB: +(s.storageSize / 1024 / 1024).toFixed(1) });
    } catch {}
  }
  return { collections: out, totalMB: +(stats.dataSize / 1024 / 1024).toFixed(1) };
}

async function main() {
  console.log('Connecting to MongoDB…');
  await connectDB();

  const before = await dbSize();
  console.log(`\nBEFORE — total data: ${before.totalMB} MB`);
  console.table(before.collections);

  // Delete in order of size, largest first
  console.log('\nDeleting extended POS rows (transaction_id ~ /^EXT_/)…');
  const r1 = await POS.deleteMany({ transaction_id: { $regex: /^EXT_/ } });
  console.log(`  → POS removed: ${r1.deletedCount}`);

  console.log('Deleting extended Inventory snapshots (week_end_date > 2026-04-05)…');
  const r2 = await Inventory.deleteMany({ week_end_date: { $gt: CUTOFF } });
  console.log(`  → Inventory removed: ${r2.deletedCount}`);

  console.log('Deleting extended WhatsApp rows (id ~ /^WAM_EXT_/)…');
  const r3 = await WhatsappLog.deleteMany({ id: { $regex: /^WAM_EXT_/ } });
  console.log(`  → WhatsApp removed: ${r3.deletedCount}`);

  console.log('Deleting extended VisitLog rows (visit_date > 2026-04-05)…');
  const r4 = await VisitLog.deleteMany({ visit_date: { $gt: CUTOFF } });
  console.log(`  → VisitLog removed: ${r4.deletedCount}`);

  // Anomalies were generated against extended data — clear them so next
  // startup repopulates against the cleaned baseline.
  console.log('Clearing AnomalyFlag (will be regenerated on next backend startup)…');
  const r5 = await AnomalyFlag.deleteMany({});
  console.log(`  → AnomalyFlag removed: ${r5.deletedCount}`);

  const after = await dbSize();
  console.log(`\nAFTER — total data: ${after.totalMB} MB (freed ${(before.totalMB - after.totalMB).toFixed(1)} MB)`);
  console.table(after.collections);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
