export interface Site {
  site_id: string;
  display_name: string;
  load_zone: "WEST" | "SOUTH" | "HOUSTON" | "NORTH";
  settlement_point: string;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  heat_rate_mmbtu_mwh: number;
  vom_mwh: number;
  min_up_time_h?: number;
  ramp_limit_mw_per_h?: number;
  min_down_time_h?: number;
  confidence?: number; // 0-1 fraction
}

export interface ForecastPoint {
  timestamp: string;
  p10: number;
  p50: number;
  p90: number;
  actual?: number;
}

export interface SiteRisk {
  site_id: string;
  p5_npv: number;
  p50_npv: number;
  p95_npv: number;
  cvar_95_npv: number;
  prob_loss: number;
  capex: number;
}

export interface SiteScore {
  site_id: string;
  display_name: string;
  load_zone: "WEST" | "SOUTH" | "HOUSTON" | "NORTH";
  composite_score: number; // integer 20-85 from backend
  rank: number;
  p50_npv: number; // raw dollars
  prob_loss: number; // fraction 0-1
  capacity_mw: number;
  expected_annual_spread: number; // $/MWh
  profitable_hours_pct: number; // already in percent form (e.g. 44.0 = 44%)
}

export interface FeatureAttribution {
  feature: string;
  family: "market" | "weather" | "grid" | "calendar";
  contribution: number;
}

export interface DispatchInterval {
  timestamp: string;
  action: "generate" | "import";
  generate_mw: number;
  lmp: number;
  gen_cost: number;
  spread: number;
}

// =============== API response shapes ===============

export interface SiteRiskResponse {
  site_id: string;
  p5_npv: number;
  p50_npv: number;
  p95_npv: number;
  cvar_95_npv: number;
  prob_loss: number;
  capex: number;
  mean_npv: number;
  std_npv: number;
  npv_paths_sample: number[];
}

export interface ForecastResponse {
  site_id: string;
  horizon_hours: number;
  generated_at: string;
  model_version: string;
  points: ForecastPoint[];
}

export interface AttributionResponse {
  site_id: string;
  features: FeatureAttribution[];
  model_version: string;
  explainer: string;
}

export interface DecisionRecord {
  decision_id: string;
  timestamp: string;
  site_id: string;
  type: string;
  action: string;
  confidence: number;
  feature_hash: string;
  model_version: string;
  feature_version: string;
}

export interface DecisionsResponse {
  decisions: DecisionRecord[];
  total: number;
}

export interface DecisionDetail extends DecisionRecord {
  features: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface RiskFactor {
  name: string;
  impact_usd_m: number;
  probability: number;
}

export interface RiskFactorsResponse {
  site_id: string;
  factors: RiskFactor[];
  computed_from?: { capex_usd_m: number; p50_npv_usd_m: number };
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  sites_loaded: number;
  gold_rows: number;
  shap_loaded: boolean;
  decisions_logged: number;
  model_version: string;
  model_name: string;
  backtest_mae_usd: number;
  backtest_improvement_over_naive_pct: number;
  last_precompute: string;
  p50_latency_ms: number;
}

export interface ReplayResponse {
  decision_id: string;
  byte_identical: boolean;
  feature_hash: string;
  original_output?: Record<string, unknown>;
  replayed_output?: Record<string, unknown>;
  message?: string;
}
