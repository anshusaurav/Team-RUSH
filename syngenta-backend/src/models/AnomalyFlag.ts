import mongoose, { Schema, Document } from 'mongoose';

export type AnomalyType =
  | 'stock_out'
  | 'demand_spike'
  | 'low_inventory'
  | 'visit_gap'
  | 'digital_intent'
  | 'weather_alert'
  | 'brain_demand_spike'
  | 'brain_stockout_risk';
export type SeverityType = 'high' | 'medium' | 'low';

export interface IAnomalyFlag extends Document {
  retailer_id: string;
  territory_id: string;
  anomaly_type: AnomalyType;
  sku_name: string;
  severity: SeverityType;
  description: string;
  detected_at: Date;
  resolved: boolean;
}

const AnomalyFlagSchema = new Schema<IAnomalyFlag>({
  retailer_id: { type: String, required: true, index: true },
  territory_id: { type: String, required: true, index: true },
  anomaly_type: {
    type: String,
    enum: [
      'stock_out', 'demand_spike', 'low_inventory', 'visit_gap',
      'digital_intent', 'weather_alert',
      'brain_demand_spike', 'brain_stockout_risk',
    ],
  },
  sku_name: String,
  severity: { type: String, enum: ['high', 'medium', 'low'] },
  description: String,
  detected_at: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false, index: true },
});

AnomalyFlagSchema.index({ territory_id: 1, resolved: 1 });
// Query-speed index on the natural key. Not unique on purpose — we don't want
// a deploy migration to fail if Render/Atlas already contains duplicates from
// older builds. Uniqueness is enforced softly: runAnomalyDetection() calls
// dedupeAnomalyFlags() at the top of every run, and the detection path itself
// uses bulkWrite upserts keyed on this same triple.
AnomalyFlagSchema.index({ retailer_id: 1, anomaly_type: 1, sku_name: 1 });

export default mongoose.model<IAnomalyFlag>('AnomalyFlag', AnomalyFlagSchema);
