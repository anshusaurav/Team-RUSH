import mongoose, { Schema, Document } from 'mongoose';

export interface IInventory extends Document {
  retailer_id: string;
  sku_id: string;
  sku_name: string;
  sku_qty: number;
  week_end_date: Date;
}

const InventorySchema = new Schema<IInventory>({
  retailer_id: { type: String, required: true, index: true },
  sku_id: String,
  sku_name: String,
  sku_qty: Number,
  week_end_date: { type: Date, index: true },
});

// Compound index for efficient "latest week per retailer" queries
InventorySchema.index({ retailer_id: 1, week_end_date: -1 });

export default mongoose.model<IInventory>('Inventory', InventorySchema);
