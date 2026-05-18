import mongoose, { Schema, Document } from 'mongoose';

export type AnomalyType = 'stock_out' | 'demand_spike' | 'low_inventory' | 'visit_gap';
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
  anomaly_type: { type: String, enum: ['stock_out', 'demand_spike', 'low_inventory', 'visit_gap'] },
  sku_name: String,
  severity: { type: String, enum: ['high', 'medium', 'low'] },
  description: String,
  detected_at: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false, index: true },
});

AnomalyFlagSchema.index({ territory_id: 1, resolved: 1 });

export default mongoose.model<IAnomalyFlag>('AnomalyFlag', AnomalyFlagSchema);
