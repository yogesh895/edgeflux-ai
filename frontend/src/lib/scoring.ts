import type { Site, SiteRisk, SiteScore } from "@/types";

export interface ScoredSite {
  site_id: string;
  composite: number; // 0-100 integer
  rank: number;
  tier: "top" | "mid" | "bottom";
}

export const TIER_COLOR: Record<ScoredSite["tier"], string> = {
  top: "#1D9E75",
  mid: "#BA7517",
  bottom: "#888780",
};

// 200MW -> 12px, 600MW -> 20px, linear
export function radiusForCapacity(mw: number): number {
  const r = 12 + ((mw - 200) / 400) * 8;
  return Math.max(8, Math.min(22, r));
}

export const LOAD_ZONES = ["WEST", "SOUTH", "HOUSTON", "NORTH"] as const;
export type LoadZone = (typeof LOAD_ZONES)[number];

/** Convert backend SiteScore[] (rank pre-computed) into ScoredSite[] with tiers. */
export function tierize(scores: SiteScore[]): ScoredSite[] {
  // Backend returns composite_score as an integer in [20,85]; rank ascending from 1.
  const sorted = [...scores].sort((a, b) => a.rank - b.rank);
  const n = sorted.length || 1;
  return sorted.map((s, idx) => ({
    site_id: s.site_id,
    composite: Math.round(s.composite_score),
    rank: s.rank ?? idx + 1,
    tier: idx < Math.ceil(n / 3) ? "top" : idx < Math.ceil((2 * n) / 3) ? "mid" : "bottom",
  }));
}

export function indexBy<T extends { site_id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((i) => [i.site_id, i]));
}

/** Compute a quick risk-like summary from SiteScore — only used for back-compat fallbacks. */
export function syntheticRiskFromScore(score: SiteScore, capacityMw: number): SiteRisk {
  const capex = capacityMw * 700_000;
  const p50 = score.composite_score * capex * 1.3;
  const spread = capex * 0.9;
  return {
    site_id: score.site_id,
    p5_npv: p50 - spread,
    p50_npv: p50,
    p95_npv: p50 + spread,
    cvar_95_npv: p50 - spread * 1.1,
    prob_loss: Math.max(0.05, Math.min(0.5, 0.5 - score.composite_score * 0.4)),
    capex,
  };
}

export const fmtMoneyM = (v: number) => `$${(v / 1_000_000).toFixed(0)}M`;
