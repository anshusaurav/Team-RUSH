import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Rep {
  rep_id: string;
  territory_id: string;
  territory_name: string;
  state: string;
  district: string;
  tehsil_list: string[];
}

export interface RepStats {
  rep_id: string;
  as_of: string;
  visits_this_week: number;
  outcomes_this_month: Record<string, number>;
  acceptance_rate_30d: number;
  revenue_per_field_day_30d: number;
  revenue_total_30d: number;
  field_days_30d: number;
  coverage_efficiency_30d: number;
  tehsils_visited_30d: number;
  tehsils_total: number;
}

export interface ScoreBreakdown {
  days_since_visit: number;
  stock_out_count: number;
  low_stock_count: number;
  sales_velocity_30d: number;
  anomaly_count: number;
  outcome_boost: number;
  biological_urgency: number; // growers with upcoming crop stage in this tehsil
  digital_intent: number;     // growers who clicked a WhatsApp campaign in this tehsil
  weather_risk?: number;      // 0–20 pts from pest-favorable forecast or heavy rain
}

export interface VisitPlanItem {
  retailer_id: string;
  territory_id: string;
  state: string;
  district: string;
  tehsil: string;
  score: number;
  priority: 'urgent' | 'high' | 'normal';
  proximity_index: number;
  score_breakdown: ScoreBreakdown;
}

export interface DailyWeather {
  date: string;
  rain_mm: number;
  temp_max_c: number;
  temp_min_c: number;
  humidity_max_pct: number;
}

export interface WeatherSummary {
  district: string;
  pest_risk: 'high' | 'medium' | 'low';
  heavy_rain_days: number;
  heat_stress_days: number;
  ndvi_proxy: number | null;
  risk_summary: string;
  forecast: DailyWeather[];
}

export interface AnomalyFlag {
  _id: string;
  retailer_id: string;
  territory_id: string;
  anomaly_type:
    | 'stock_out' | 'demand_spike' | 'low_inventory' | 'visit_gap'
    | 'digital_intent' | 'weather_alert'
    | 'brain_demand_spike' | 'brain_stockout_risk';
  sku_name: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  detected_at: string;
  resolved: boolean;
}

export interface VelocityWeekPoint {
  label:  string;
  week:   string;
  actual: number;
}

export interface VelocityData {
  sku:              string;
  weeks:            VelocityWeekPoint[];
  predicted:        number;
  current_qty:      number;
  days_to_stockout: number | null;
  anomaly_type:     'brain_demand_spike' | 'brain_stockout_risk' | null;
  deviation:        number;
}

export interface RetailerDetail {
  retailer: { retailer_id: string; territory_id: string; state: string; district: string; tehsil: string };
  inventory: { sku_id: string; sku_name: string; sku_qty: number }[];
  latest_inventory_week: string;
  top_products_30d: { sku_name: string; units: number; revenue: number }[];
  active_anomalies: AnomalyFlag[];
  recent_visits: { rep_id: string; visit_date: string; visit_type: string; product_recommended: string }[];
}

export interface NextBestAction {
  advice: string;
  provider_used: 'claude' | 'gemini';
  context_snapshot: {
    currentInventory: { sku_name: string; sku_qty: number }[];
    topSellingProducts: { sku_name: string; units: number; revenue: number }[];
    activeAnomalies: { anomaly_type: string; sku_name: string; severity: string; description: string }[];
  };
}

export type AIProvider = 'claude' | 'gemini';

export interface RFRecommendation {
  product_recommended: string;
  confidence: number;
  reasoning: string;
  model_trained_on: number;
  trained_at: string | null;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const getReps = () =>
  api.get<{ total: number; reps: Rep[] }>('/api/reps').then(r => r.data);

export const getRep = (repId: string) =>
  api.get<{ rep: Rep }>(`/api/reps/${repId}`).then(r => r.data);

export const getRepStats = (repId: string) =>
  api.get<RepStats>(`/api/reps/${repId}/stats`).then(r => r.data);

export const getVisitPlan = (repId: string, date: string) =>
  api.get<{ plan: VisitPlanItem[]; total: number; date: string }>('/api/visit-plan', { params: { repId, date } }).then(r => r.data);

export const getAnomalies = (territoryId: string, severity?: string) =>
  api.get<{ summary: { total: number; by_type: Record<string, number> }; anomalies: AnomalyFlag[] }>(
    '/api/anomalies', { params: { territoryId, severity } }
  ).then(r => r.data);

export const resolveAnomaly = (id: string) =>
  api.patch(`/api/anomalies/${id}/resolve`).then(r => r.data);

export const refreshAnomalies = () =>
  api.post<{ inserted: number; cleared: number }>('/api/anomalies/refresh').then(r => r.data);

export const getRetailer = (retailerId: string) =>
  api.get<RetailerDetail>(`/api/retailers/${retailerId}`).then(r => r.data);

export const getNextBestAction = (repId: string, retailerId: string, provider?: AIProvider) =>
  api.post<NextBestAction>('/api/next-best-action', { repId, retailerId, provider }).then(r => r.data);

export const getActiveProvider = () =>
  api.get<{ active_provider: AIProvider; available_providers: string[]; models: Record<string, string> }>(
    '/api/next-best-action/active-provider'
  ).then(r => r.data);

export const getTerritoryInsight = (territoryId: string, provider?: AIProvider) =>
  api.get<{ insight: string; provider_used: AIProvider }>(
    '/api/next-best-action/territory-insight', { params: { territoryId, provider } }
  ).then(r => r.data);

export const logOutcome = (payload: {
  repId: string; retailerId: string; outcome: string;
  productDiscussed: string; notes: string; aiRecommendationUsed: boolean;
}) => api.post('/api/outcomes', payload).then(r => r.data);

export const getOutcomes = (repId: string) =>
  api.get<{ total: number; acceptance_rate: number; outcomes: any[] }>('/api/outcomes', { params: { repId } }).then(r => r.data);

export const getRFRecommendation = (retailerId: string) =>
  api.post<RFRecommendation & { success: boolean }>('/api/rf-recommendation', { retailerId }).then(r => r.data);

export const getWeather = (district: string) =>
  api.get<{ success: boolean; weather: WeatherSummary }>('/api/weather', { params: { district } }).then(r => r.data.weather);

export const getVelocityData = (retailerId: string, sku?: string) =>
  api.get<VelocityData & { success: boolean }>(
    '/api/brain-anomalies/velocity',
    { params: { retailerId, ...(sku ? { sku } : {}) } }
  ).then(r => r.data);

export interface DistrictCoordEntry {
  district: string;
  state: string;
  lat: number;
  lon: number;
}

export const getDistrictCoords = () =>
  api.get<{ success: boolean; total: number; districts: DistrictCoordEntry[] }>('/api/weather/districts')
    .then(r => r.data.districts);

export interface OptimizedStop {
  retailer_id: string;
  lat: number;
  lon: number;
  has_anomaly: boolean;
  severity?: 'high' | 'medium' | 'low';
}

export interface OptimizedRoute {
  route: string[];
  total_distance_km: number;
  raw_distance_km: number;
  stops: OptimizedStop[];
  start: { lat: number; lon: number; label: string };
  solver: string;
  improvements: { initial_km: number; final_km: number };
}

export const getOptimizedRoute = (repId: string, date: string, limit = 10) =>
  api.get<{ success: boolean } & OptimizedRoute>('/api/route-optimize', {
    params: { repId, date, limit },
  }).then(r => r.data);
