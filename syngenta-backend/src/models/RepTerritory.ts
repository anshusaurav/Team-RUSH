import mongoose, { Schema, Document } from 'mongoose';

export interface IRepTerritory extends Document {
  rep_id: string;
  territory_id: string;
  territory_name: string;
  state: string;
  district: string;
  tehsil_list: string[];
}

const RepTerritorySchema = new Schema<IRepTerritory>({
  rep_id: { type: String, required: true, unique: true, index: true },
  territory_id: { type: String, required: true, index: true },
  territory_name: String,
  state: String,
  district: String,
  tehsil_list: [String],
});

export default mongoose.model<IRepTerritory>('RepTerritory', RepTerritorySchema);
