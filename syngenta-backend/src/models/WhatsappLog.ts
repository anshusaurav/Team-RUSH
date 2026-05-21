import mongoose, { Schema, Document } from 'mongoose';

export interface IWhatsappLog extends Document {
  id: string;
  campaign_product: string;
  campaign_crop: string;
  grower_id: string;
  message_sent_date: Date;
  delivered_status: boolean;
  opened_status: boolean;
  clicked_status: boolean;
}

const WhatsappLogSchema = new Schema<IWhatsappLog>({
  id: { type: String, unique: true, index: true },
  campaign_product: String,
  campaign_crop: String,
  grower_id: { type: String, index: true },
  message_sent_date: Date,
  delivered_status: Boolean,
  opened_status: Boolean,
  clicked_status: Boolean,
});

export default mongoose.model<IWhatsappLog>('WhatsappLog', WhatsappLogSchema);
