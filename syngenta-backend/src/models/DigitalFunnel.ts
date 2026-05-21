import mongoose, { Schema, Document } from 'mongoose';

/**
 * Weekly campaign-level digital funnel metrics (from digital_funnel_weekly.csv).
 *
 * Top-of-funnel marketing telemetry — not used by the visit-plan scorer (which
 * relies on per-grower whatsapp_campaign clicks instead). Stored so the
 * dataExtender can project the time series forward and so a future
 * campaign-analytics view has something real to plot.
 */
export interface IDigitalFunnel extends Document {
  campaign_id: string;
  week_start_date: Date;
  social_post_impression: number;
  landing_page_visits: number;
  lead_form_submission: number;
  campaign_crop: string;
  campaign_product: string;
}

const DigitalFunnelSchema = new Schema<IDigitalFunnel>({
  campaign_id:            { type: String, index: true },
  week_start_date:        { type: Date,   index: true },
  social_post_impression: Number,
  landing_page_visits:    Number,
  lead_form_submission:   Number,
  campaign_crop:          String,
  campaign_product:       String,
});

// Composite unique key — one row per (campaign, week). Lets the extender
// re-run idempotently (duplicates skipped under ordered:false).
DigitalFunnelSchema.index({ campaign_id: 1, week_start_date: 1 }, { unique: true });

export default mongoose.model<IDigitalFunnel>('DigitalFunnel', DigitalFunnelSchema);
