import mongoose, { Schema, Document } from 'mongoose';

export interface IGrower extends Document {
  grower_id: string;
  state: string;
  district: string;
  tehsil: string;
  language: string;
  device_type: string;
  grower_age: number;
  gender: string;
  grower_crop_calendar: Record<string, any>;
  product_scan: boolean;
  product_name: string;
  product_scan_datetime: Date;
  grower_farm_size: number;
  offline_campaign_attended: boolean;
  campaign_attendance_date: Date;
}

const GrowerSchema = new Schema<IGrower>({
  grower_id: { type: String, required: true, unique: true, index: true },
  state: String,
  district: String,
  tehsil: { type: String, index: true },
  language: String,
  device_type: String,
  grower_age: Number,
  gender: String,
  grower_crop_calendar: Schema.Types.Mixed,
  product_scan: Boolean,
  product_name: String,
  product_scan_datetime: Date,
  grower_farm_size: Number,
  offline_campaign_attended: Boolean,
  campaign_attendance_date: Date,
});

export default mongoose.model<IGrower>('Grower', GrowerSchema);
