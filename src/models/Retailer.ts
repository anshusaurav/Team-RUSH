import mongoose, { Schema, Document } from 'mongoose';

export interface IRetailer extends Document {
  retailer_id: string;
  territory_id: string;
  state: string;
  district: string;
  tehsil: string;
}

const RetailerSchema = new Schema<IRetailer>({
  retailer_id: { type: String, required: true, unique: true, index: true },
  territory_id: { type: String, required: true, index: true },
  state: String,
  district: String,
  tehsil: { type: String, index: true },
});

export default mongoose.model<IRetailer>('Retailer', RetailerSchema);
