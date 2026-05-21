/**
 * Local Mongo bootstrap — runs a persistent MongoMemoryServer on port 27017.
 *
 * Why mongodb-memory-server (not the official Windows MSI):
 *   - No admin / UAC. No service registration. No installer flakiness.
 *   - On first launch it downloads a portable mongod binary (~80 MB) to
 *     ~/.cache/mongodb-binaries; subsequent launches are instant.
 *   - We pin the port (27017) and the dbPath (./local-mongo-data) so data
 *     survives across `Ctrl+C` and re-runs — it's not the usual "ephemeral
 *     test DB" usage of the package.
 *
 * Usage:
 *   npm run start-local-mongo     # foreground; Ctrl+C to stop
 *
 * MONGODB_URI for the backend stays mongodb://127.0.0.1:27017/syngenta-local.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';

const PORT     = 27017;
const DB_NAME  = 'syngenta-local';
const DATA_DIR = path.resolve(__dirname, '../../local-mongo-data');

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[local-mongo] Created data dir: ${DATA_DIR}`);
  }

  console.log('[local-mongo] Starting mongod (first run downloads ~80 MB binary)…');
  const server = await MongoMemoryServer.create({
    instance: {
      port: PORT,
      dbName: DB_NAME,
      dbPath: DATA_DIR,
      storageEngine: 'wiredTiger',
    },
    binary: {
      // Pin to a known-good Mongo version. Tweak if you need a different one.
      version: '7.0.14',
    },
  });

  const uri = server.getUri();
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`[local-mongo] Listening on ${uri}`);
  console.log(`[local-mongo] Data dir: ${DATA_DIR}`);
  console.log('[local-mongo] Press Ctrl+C to stop.');
  console.log('──────────────────────────────────────────────────────────\n');

  // Stay alive until interrupted
  const stop = async (sig: string) => {
    console.log(`\n[local-mongo] ${sig} received — shutting down…`);
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT',  () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  // Keep the event loop busy
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error('[local-mongo] Failed to start:', err);
  process.exit(1);
});
