/**
 * Standalone runner for the dataExtender service.
 *
 * Usage:
 *   npm run extend-data        # extends POS, VisitLog, Inventory, WhatsApp,
 *                              # DigitalFunnel forward to yesterday.
 *
 * Unlike the backend startup path (which checks EXTEND_DATA_TO_YESTERDAY=true),
 * this script runs the extender unconditionally — it's designed for local
 * one-off use when you point MONGODB_URI at a local Mongo and want fresh data
 * without keeping the server attached.
 *
 * EXTEND_MAX_DAYS and EXTEND_SEASONALITY are still honoured.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { extendDataToYesterday } from '../services/dataExtender';

async function main() {
  // Force-enable the extender for this run regardless of .env (the gate exists
  // so production restarts don't accidentally re-extend; the standalone script
  // is always explicit).
  process.env.EXTEND_DATA_TO_YESTERDAY = 'true';

  console.log('[extend-data] Connecting to MongoDB…');
  await connectDB();

  const t0 = Date.now();
  await extendDataToYesterday();
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[extend-data] Finished in ${dt}s`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[extend-data] Failed:', err);
  process.exit(1);
});
