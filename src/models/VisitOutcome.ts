import mongoose, { Schema, Document } from 'mongoose';

export type OutcomeType = 'sale_made' | 'order_placed' | 'no_purchase';

export interface IVisitOutcome extends Document {
  rep_id: string;
  retailer_id: string;
  visit_date: Date;
  outcome: OutcomeType;
  product_discussed: string;
  notes: string;
  ai_recommendation_used: boolean;
  created_at: Date;
}

const VisitOutcomeSchema = new Schema<IVisitOutcome>({
  rep_id: { type: String, required: true, index: true },
  retailer_id: { type: String, required: true, index: true },
  visit_date: { type: Date, default: Date.now },
  outcome: { type: String, enum: ['sale_made', 'order_placed', 'no_purchase'], required: true },
  product_discussed: String,
  notes: String,
  ai_recommendation_used: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.model<IVisitOutcome>('VisitOutcome', VisitOutcomeSchema);
