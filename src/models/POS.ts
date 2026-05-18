import mongoose, { Schema, Document } from 'mongoose';

export interface IPOS extends Document {
  retailer_id: string;
  transaction_id: string;
  sku_id: string;
  sku_name: string;
  sku_qty: number;
  sku_price: number;
  transaction_date: Date;
}

const POSSchema = new Schema<IPOS>({
  retailer_id: { type: String, required: true, index: true },
  transaction_id: { type: String, unique: true },
  sku_id: String,
  sku_name: String,
  sku_qty: Number,
  sku_price: Number,
  transaction_date: { type: Date, index: true },
});

POSSchema.index({ retailer_id: 1, transaction_date: -1 });

export default mongoose.model<IPOS>('POS', POSSchema);
