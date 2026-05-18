import mongoose, { Schema, Document } from 'mongoose';

export interface IVisitLog extends Document {
  rep_id: string;
  visit_date: Date;
  territory_id: string;
  visit_tehsil: string;
  visit_type: string;
  product_recommended: string;
}

const VisitLogSchema = new Schema<IVisitLog>({
  rep_id: { type: String, required: true, index: true },
  visit_date: { type: Date, index: true },
  territory_id: { type: String, index: true },
  visit_tehsil: String,
  visit_type: String,
  product_recommended: String,
});

export default mongoose.model<IVisitLog>('VisitLog', VisitLogSchema);
