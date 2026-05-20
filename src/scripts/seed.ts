import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';

import RepTerritory from '../models/RepTerritory';
import Retailer from '../models/Retailer';
import VisitLog from '../models/VisitLog';
import Inventory from '../models/Inventory';
import POS from '../models/POS';
import Grower from '../models/Grower';
import WhatsappLog from '../models/WhatsappLog';
import DigitalFunnel from '../models/DigitalFunnel';

const DATASET_PATH = process.env.DATASET_PATH
  ? path.resolve(process.env.DATASET_PATH)
  : path.resolve(__dirname, '../../../dataset');
const BATCH_SIZE = 500;

function csvPath(filename: string) {
  return path.join(DATASET_PATH, filename);
}

function parseBool(val: string): boolean {
  return val === 'True' || val === 'true' || val === '1';
}

function parseJSON(val: string): any {
  try { return JSON.parse(val); } catch { return {}; }
}

async function streamAndInsert<T>(
  filename: string,
  transform: (row: any) => T | null,
  Model: mongoose.Model<any>,
  label: string
) {
  return new Promise<void>((resolve, reject) => {
    const filePath = csvPath(filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ File not found: ${filePath}, skipping.`);
      return resolve();
    }

    let batch: T[] = [];
    let total = 0;
    let errors = 0;

    const stream = fs.createReadStream(filePath).pipe(csv());

    stream.on('data', async (row: any) => {
      const doc = transform(row);
      if (!doc) return;
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        stream.pause();
        const toInsert = batch.splice(0, BATCH_SIZE);
        try {
          await Model.insertMany(toInsert, { ordered: false });
          total += toInsert.length;
          process.stdout.write(`\r  ${label}: ${total} inserted`);
        } catch (e: any) {
          // Ignore duplicate key errors (E11000) — safe for re-runs
          const dupes = e?.writeErrors?.filter((we: any) => we.code === 11000)?.length || 0;
          total += toInsert.length - (e?.writeErrors?.length || 0) + dupes;
          errors += (e?.writeErrors?.length || 0) - dupes;
        }
        stream.resume();
      }
    });

    stream.on('end', async () => {
      if (batch.length > 0) {
        try {
          await Model.insertMany(batch, { ordered: false });
          total += batch.length;
        } catch (e: any) {
          const dupes = e?.writeErrors?.filter((we: any) => we.code === 11000)?.length || 0;
          total += batch.length - (e?.writeErrors?.length || 0) + dupes;
        }
      }
      console.log(`\r  ✓ ${label}: ${total} documents loaded${errors ? ` (${errors} errors)` : ''}`);
      resolve();
    });

    stream.on('error', reject);
  });
}

async function seed() {
  console.log('Connecting to MongoDB...');
  await connectDB();

  const args = process.argv.slice(2);
  const only = args.length > 0 ? args : null; // e.g. ts-node seed.ts reps retailers

  console.log('\nStarting seed. Dataset path:', DATASET_PATH);
  console.log('Run with args to seed specific tables, e.g.: ts-node seed.ts reps retailers\n');

  // 1. Reps & Territories
  if (!only || only.includes('reps')) {
    await streamAndInsert(
      'reps_territory.csv',
      (row) => ({
        rep_id: row.rep_id?.trim(),
        territory_id: row.territory_id?.trim(),
        territory_name: row.territory_name?.trim(),
        state: row.state?.trim(),
        district: row.district?.trim(),
        tehsil_list: parseJSON(row.tehsil_list || '[]'),
      }),
      RepTerritory,
      'Reps/Territories'
    );
  }

  // 2. Retailers
  if (!only || only.includes('retailers')) {
    await streamAndInsert(
      'retailers.csv',
      (row) => ({
        retailer_id: row.retailer_id?.trim(),
        territory_id: row.territory_id?.trim(),
        state: row.state?.trim(),
        district: row.district?.trim(),
        tehsil: row.tehsil?.trim(),
      }),
      Retailer,
      'Retailers'
    );
  }

  // 3. Visit Logs
  if (!only || only.includes('visits')) {
    await streamAndInsert(
      'retailer_visit_log.csv',
      (row) => ({
        rep_id: row.rep_id?.trim(),
        visit_date: new Date(row.visit_date),
        territory_id: row.territory_id?.trim(),
        visit_tehsil: row.visit_tehsil?.trim(),
        visit_type: row.visit_type?.trim(),
        product_recommended: row.product_recommended?.trim(),
      }),
      VisitLog,
      'Visit Logs'
    );
  }

  // 4. Inventory (largest file — 310K rows, will take ~30s)
  if (!only || only.includes('inventory')) {
    console.log('  Loading inventory (310K rows, this takes ~30s)...');
    await streamAndInsert(
      'retailer_inventory_weekly.csv',
      (row) => ({
        retailer_id: row.retailer_id?.trim(),
        sku_id: row.sku_id?.trim(),
        sku_name: row.sku_name?.trim(),
        sku_qty: parseInt(row.sku_qty) || 0,
        week_end_date: new Date(row.week_end_date),
      }),
      Inventory,
      'Inventory'
    );
  }

  // 5. POS Transactions (235K rows)
  if (!only || only.includes('pos')) {
    console.log('  Loading POS (235K rows, this takes ~25s)...');
    await streamAndInsert(
      'retailer_pos.csv',
      (row) => ({
        retailer_id: row.retailer_id?.trim(),
        transaction_id: row.transaction_id?.trim(),
        sku_id: row.sku_id?.trim(),
        sku_name: row.sku_name?.trim(),
        sku_qty: parseInt(row.sku_qty) || 0,
        sku_price: parseFloat(row.sku_price) || 0,
        transaction_date: new Date(row.transaction_date),
      }),
      POS,
      'POS Transactions'
    );
  }

  // 6. Growers
  if (!only || only.includes('growers')) {
    await streamAndInsert(
      'growers.csv',
      (row) => ({
        grower_id: row.grower_id?.trim(),
        state: row.state?.trim(),
        district: row.district?.trim(),
        tehsil: row.tehsil?.trim(),
        language: row.language?.trim(),
        device_type: row.device_type?.trim(),
        grower_age: parseInt(row.grower_age) || null,
        gender: row.gender?.trim(),
        grower_crop_calendar: parseJSON(row.grower_crop_calendar || '{}'),
        product_scan: parseBool(row.product_scan),
        product_name: row.product_name?.trim(),
        product_scan_datetime: row.product_scan_datetime ? new Date(row.product_scan_datetime) : null,
        grower_farm_size: parseFloat(row.grower_farm_size) || null,
        offline_campaign_attended: parseBool(row.offline_campaign_attended),
        campaign_attendance_date: row.campaign_attendance_date ? new Date(row.campaign_attendance_date) : null,
      }),
      Grower,
      'Growers'
    );
  }

  // 7. WhatsApp Logs
  if (!only || only.includes('whatsapp')) {
    await streamAndInsert(
      'whatsapp_campaign.csv',
      (row) => ({
        id: row.id?.trim(),
        campaign_product: row.campaign_product?.trim(),
        campaign_crop: row.campaign_crop?.trim(),
        grower_id: row.grower_id?.trim(),
        message_sent_date: new Date(row.message_sent_date),
        delivered_status: parseBool(row.delivered_status),
        opened_status: parseBool(row.opened_status),
        clicked_status: parseBool(row.clicked_status),
      }),
      WhatsappLog,
      'WhatsApp Logs'
    );
  }

  // 8. Digital funnel (campaign-level weekly aggregates — ~104 rows, very small)
  if (!only || only.includes('digital_funnel')) {
    await streamAndInsert(
      'digital_funnel_weekly.csv',
      (row) => ({
        campaign_id:            row.campaign_id?.trim(),
        week_start_date:        new Date(row.week_start_date),
        social_post_impression: parseInt(row.social_post_impression) || 0,
        landing_page_visits:    parseInt(row.landing_page_visits) || 0,
        lead_form_submission:   parseInt(row.lead_form_submission) || 0,
        campaign_crop:          row.campaign_crop?.trim(),
        campaign_product:       row.campaign_product?.trim(),
      }),
      DigitalFunnel,
      'Digital Funnel'
    );
  }

  console.log('\nSeed complete!\n');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
