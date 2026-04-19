import type {
  Site,
  SiteScore,
  SiteRiskResponse,
  ForecastResponse,
  AttributionResponse,
  DecisionsResponse,
  DecisionDetail,
  ReplayResponse,
  RiskFactorsResponse,
  HealthResponse,
} from "@/types";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) || "http://localhost:8000";

async function jsonOrThrow<T>(r: Response, label: string): Promise<T> {
  if (!r.ok) throw new Error(`${label} failed: ${r.status}`);
  return r.json() as Promise<T>;
}

export async function getSites(): Promise<Site[]> {
  const r = await fetch(`${API_BASE}/api/sites`);
  return jsonOrThrow<Site[]>(r, "getSites");
}

export async function getSiteScores(): Promise<SiteScore[]> {
  const r = await fetch(`${API_BASE}/api/sites/scores`);
  return jsonOrThrow<SiteScore[]>(r, "getSiteScores");
}

export async function getSiteRisk(siteId: string): Promise<SiteRiskResponse> {
  const r = await fetch(`${API_BASE}/api/sites/${siteId}/risk`);
  return jsonOrThrow<SiteRiskResponse>(r, "getSiteRisk");
}

export async function getSiteForecast(
  siteId: string,
  horizon = 72,
): Promise<ForecastResponse> {
  const r = await fetch(`${API_BASE}/api/sites/${siteId}/forecast?horizon=${horizon}`);
  return jsonOrThrow<ForecastResponse>(r, "getSiteForecast");
}

export async function getSiteAttribution(siteId: string): Promise<AttributionResponse> {
  const r = await fetch(`${API_BASE}/api/sites/${siteId}/attribution`);
  return jsonOrThrow<AttributionResponse>(r, "getSiteAttribution");
}

export async function getDecisions(): Promise<DecisionsResponse> {
  const r = await fetch(`${API_BASE}/api/decisions`);
  return jsonOrThrow<DecisionsResponse>(r, "getDecisions");
}

export async function getDecisionDetail(decisionId: string): Promise<DecisionDetail> {
  const r = await fetch(`${API_BASE}/api/decisions/${decisionId}`);
  return jsonOrThrow<DecisionDetail>(r, "getDecisionDetail");
}

export async function replayDecision(decisionId: string): Promise<ReplayResponse> {
  const r = await fetch(`${API_BASE}/api/decisions/${decisionId}/replay`, {
    method: "POST",
  });
  return jsonOrThrow<ReplayResponse>(r, "replayDecision");
}

export async function getRiskFactors(siteId: string): Promise<RiskFactorsResponse> {
  const r = await fetch(`${API_BASE}/api/sites/${siteId}/risk-factors`);
  return jsonOrThrow<RiskFactorsResponse>(r, "getRiskFactors");
}

export async function getHealth(): Promise<HealthResponse> {
  const r = await fetch(`${API_BASE}/api/health`);
  return jsonOrThrow<HealthResponse>(r, "getHealth");
}

// Stable query keys for invalidation
export const queryKeys = {
  sites: ["sites"] as const,
  scores: ["scores"] as const,
  risk: (siteId: string) => ["risk", siteId] as const,
  riskFactors: (siteId: string) => ["riskFactors", siteId] as const,
  forecast: (siteId: string, horizon = 72) => ["forecast", siteId, horizon] as const,
  attribution: (siteId: string) => ["attribution", siteId] as const,
  decisions: ["decisions"] as const,
  decisionDetail: (id: string) => ["decision", id] as const,
  health: ["health"] as const,
};
