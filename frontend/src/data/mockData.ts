// ============================================================
// Mock data only. Production uses src/lib/api.ts (real backend).
// Kept here as an offline-development fallback only.
// ============================================================
import type { Site, SiteRisk, SiteScore, ForecastPoint, FeatureAttribution } from "@/types";

export const MOCK_FEATURES: FeatureAttribution[] = [
  { feature: "lmp_lag_1h", family: "market", contribution: 8.2 },
  { feature: "hour_of_day", family: "calendar", contribution: 4.1 },
  { feature: "lmp_roll_24h_mean", family: "market", contribution: 3.5 },
  { feature: "renewable_share_proxy", family: "grid", contribution: -2.8 },
  { feature: "cdh", family: "weather", contribution: 2.2 },
  { feature: "temperature_c", family: "weather", contribution: 1.9 },
  { feature: "gas_waha", family: "market", contribution: -1.6 },
  { feature: "reserve_margin_proxy", family: "grid", contribution: -1.4 },
  { feature: "day_of_week", family: "calendar", contribution: 0.9 },
  { feature: "lmp_lag_24h", family: "market", contribution: 0.7 },
];

const M = 1_000_000;

export const SITES: Site[] = [
  { site_id: "s01", display_name: "Permian West A", load_zone: "WEST", settlement_point: "HB_WEST", latitude: 31.85, longitude: -102.37, capacity_mw: 300, heat_rate_mmbtu_mwh: 7.1, vom_mwh: 3.5 },
  { site_id: "s02", display_name: "Permian West B", load_zone: "WEST", settlement_point: "HB_WEST", latitude: 32.01, longitude: -102.10, capacity_mw: 250, heat_rate_mmbtu_mwh: 7.4, vom_mwh: 3.8 },
  { site_id: "s03", display_name: "Midland Ridge", load_zone: "WEST", settlement_point: "LZ_WEST", latitude: 32.00, longitude: -102.08, capacity_mw: 400, heat_rate_mmbtu_mwh: 6.9, vom_mwh: 3.4 },
  { site_id: "s04", display_name: "Laredo South", load_zone: "SOUTH", settlement_point: "LZ_SOUTH", latitude: 27.51, longitude: -99.50, capacity_mw: 200, heat_rate_mmbtu_mwh: 7.6, vom_mwh: 3.9 },
  { site_id: "s05", display_name: "San Antonio East", load_zone: "SOUTH", settlement_point: "HB_SOUTH", latitude: 29.45, longitude: -98.30, capacity_mw: 350, heat_rate_mmbtu_mwh: 7.2, vom_mwh: 3.6 },
  { site_id: "s06", display_name: "Houston Energy", load_zone: "HOUSTON", settlement_point: "LZ_HOUSTON", latitude: 29.76, longitude: -95.37, capacity_mw: 500, heat_rate_mmbtu_mwh: 7.0, vom_mwh: 3.5 },
  { site_id: "s07", display_name: "Houston Ship Ch.", load_zone: "HOUSTON", settlement_point: "HB_HOUSTON", latitude: 29.72, longitude: -95.02, capacity_mw: 450, heat_rate_mmbtu_mwh: 6.8, vom_mwh: 3.4 },
  { site_id: "s08", display_name: "DFW North", load_zone: "NORTH", settlement_point: "LZ_NORTH", latitude: 33.20, longitude: -96.50, capacity_mw: 600, heat_rate_mmbtu_mwh: 7.3, vom_mwh: 3.7 },
  { site_id: "s09", display_name: "DFW Industrial", load_zone: "NORTH", settlement_point: "HB_NORTH", latitude: 32.85, longitude: -96.80, capacity_mw: 350, heat_rate_mmbtu_mwh: 7.5, vom_mwh: 3.85 },
  { site_id: "s10", display_name: "Waco Central", load_zone: "NORTH", settlement_point: "LZ_NORTH", latitude: 31.55, longitude: -97.13, capacity_mw: 300, heat_rate_mmbtu_mwh: 7.4, vom_mwh: 3.75 },
  { site_id: "s11", display_name: "Corpus Gulf", load_zone: "SOUTH", settlement_point: "LZ_SOUTH", latitude: 27.80, longitude: -97.40, capacity_mw: 250, heat_rate_mmbtu_mwh: 7.2, vom_mwh: 3.65 },
  { site_id: "s12", display_name: "El Paso Ridge", load_zone: "WEST", settlement_point: "HB_WEST", latitude: 31.78, longitude: -106.42, capacity_mw: 200, heat_rate_mmbtu_mwh: 7.6, vom_mwh: 3.95 },
];

const riskRaw: Array<[string, number, number, number, number, number, number]> = [
  ["s01", -175, 90, 353, -189, 0.354, 210],
  ["s02", -148, 67, 285, -159, 0.364, 175],
  ["s03", -231, 126, 482, -250, 0.349, 280],
  ["s04", -121, 44, 223, -129, 0.384, 140],
  ["s05", -210, 95, 405, -223, 0.367, 245],
  ["s06", -294, 144, 579, -316, 0.355, 350],
  ["s07", -262, 137, 527, -282, 0.346, 315],
  ["s08", -354, 164, 694, -381, 0.365, 420],
  ["s09", -213, 84, 391, -226, 0.383, 245],
  ["s10", -178, 75, 342, -191, 0.376, 210],
  ["s11", -149, 70, 283, -159, 0.360, 175],
  ["s12", -119, 50, 224, -128, 0.374, 140],
];

export const SITE_RISKS: SiteRisk[] = riskRaw.map(([id, p5, p50, p95, cvar, ploss, capex]) => ({
  site_id: id as string,
  p5_npv: (p5 as number) * M,
  p50_npv: (p50 as number) * M,
  p95_npv: (p95 as number) * M,
  cvar_95_npv: (cvar as number) * M,
  prob_loss: ploss as number,
  capex: (capex as number) * M,
}));

// Composite score: ROI-ish normalized + risk-adjustment
const scored = SITE_RISKS.map((r) => {
  const roi = r.p50_npv / r.capex;
  const riskPenalty = r.prob_loss;
  const composite = roi * (1 - riskPenalty);
  return { site_id: r.site_id, composite };
}).sort((a, b) => b.composite - a.composite);

export const SITE_SCORES: SiteScore[] = scored.map((s, idx) => {
  const risk = SITE_RISKS.find((r) => r.site_id === s.site_id)!;
  const site = SITES.find((x) => x.site_id === s.site_id)!;
  // Rough proxy for expected annual spread ($/MWh) and profitable-hour share.
  const expected_annual_spread = 18 + s.composite * 14 + (site.capacity_mw / 100);
  const profitable_hours_pct = Math.max(0.18, Math.min(0.62, 0.5 - risk.prob_loss * 0.6));
  return {
    site_id: s.site_id,
    display_name: site.display_name,
    load_zone: site.load_zone,
    composite_score: Math.round(s.composite * 100),
    rank: idx + 1,
    p50_npv: risk.p50_npv,
    prob_loss: risk.prob_loss,
    capacity_mw: site.capacity_mw,
    expected_annual_spread: Math.round(expected_annual_spread * 100) / 100,
    profitable_hours_pct: Math.round(profitable_hours_pct * 1000) / 10,
  };
});

// Simple deterministic hash for seeding per-site forecast.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

export function generateForecast(siteId: string): ForecastPoint[] {
  const start = Date.UTC(2026, 3, 19, 0, 0, 0); // 2026-04-19 00:00 UTC
  const seed = hashSeed(siteId);
  const phase = seed * Math.PI * 2;
  const base = 50; // center
  const amp = 35; // P50 swings 15..85
  const points: ForecastPoint[] = [];
  for (let i = 0; i < 72; i++) {
    const t = new Date(start + i * 3600_000).toISOString();
    // Diurnal cycle (24h) + secondary 8h ripple, clipped to [15, 85]
    const diurnal = Math.sin(((i / 24) * 2 * Math.PI) + phase);
    const ripple = 0.25 * Math.sin(((i / 8) * 2 * Math.PI) + phase * 1.7);
    const noise = (hashSeed(`${siteId}-${i}`) - 0.5) * 6;
    let p50 = base + amp * (0.85 * diurnal + ripple) * 0.55 + noise;
    p50 = Math.max(15, Math.min(85, p50));
    const p10 = Math.max(0, p50 * 0.7);
    const p90 = p50 * 1.4;
    points.push({
      timestamp: t,
      p10: Math.round(p10 * 100) / 100,
      p50: Math.round(p50 * 100) / 100,
      p90: Math.round(p90 * 100) / 100,
    });
  }
  return points;
}
