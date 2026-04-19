import type { Site } from "@/types";
import { SITES } from "@/data/mockData";

export type DecisionType =
  | "Forecast commit"
  | "Dispatch commit"
  | "Scenario run"
  | "Manual override";

export interface DecisionLogEntry {
  id: string;
  timestamp: string; // ISO
  site: Site;
  type: DecisionType;
  action: string;
  confidence: number; // 0..1
  decisionId: string; // UUID-ish
  modelVersion: string;
  featureVersion: string;
  features: Record<string, number | string>;
  output: Record<string, number | string | boolean>;
}

// Deterministic pseudo-random
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number) {
  return n.toString(16).padStart(4, "0");
}

function uuid(rng: () => number): string {
  const a = Math.floor(rng() * 0xffff);
  const b = Math.floor(rng() * 0xffff);
  const c = Math.floor(rng() * 0xffff);
  const d = Math.floor(rng() * 0xffff);
  const e = Math.floor(rng() * 0xffff);
  const f = Math.floor(rng() * 0xffff);
  const g = Math.floor(rng() * 0xffff);
  const h = Math.floor(rng() * 0xffff);
  return `${pad(a)}${pad(b)}-${pad(c)}-${pad(d)}-${pad(e)}-${pad(f)}${pad(g)}${pad(h)}`;
}

const TYPES: DecisionType[] = [
  "Forecast commit",
  "Dispatch commit",
  "Scenario run",
  "Manual override",
];

const ACTIONS: Record<DecisionType, string[]> = {
  "Forecast commit": ["72h LMP forecast published", "Re-forecast triggered", "Hourly refresh"],
  "Dispatch commit": ["Generate", "Import", "Generate (ramping)", "Curtail"],
  "Scenario run": ["Gas +25% stress", "Heat wave 2026 analog", "ORDC reform sensitivity"],
  "Manual override": ["Operator: hold import", "Operator: force generate", "Operator: pause"],
};

export const DECISION_LOG: DecisionLogEntry[] = (() => {
  const rng = mulberry32(20260419);
  const now = Date.UTC(2026, 3, 19, 12, 0, 0);
  const out: DecisionLogEntry[] = [];
  for (let i = 0; i < 20; i++) {
    const offsetMin = Math.floor(rng() * 48 * 60); // last 48h
    const ts = new Date(now - offsetMin * 60_000).toISOString();
    const site = SITES[Math.floor(rng() * SITES.length)];
    const type = TYPES[Math.floor(rng() * TYPES.length)];
    const actionList = ACTIONS[type];
    const action = actionList[Math.floor(rng() * actionList.length)];
    const confidence = 0.7 + rng() * 0.29;
    out.push({
      id: `dec-${i + 1}`,
      timestamp: ts,
      site,
      type,
      action,
      confidence,
      decisionId: uuid(rng),
      modelVersion: `lmp-fcst v${1 + Math.floor(rng() * 4)}.${Math.floor(rng() * 10)}.${Math.floor(rng() * 10)}`,
      featureVersion: `feat-${Math.floor(rng() * 9000 + 1000)}`,
      features: {
        lmp_lag_1h: Math.round((30 + rng() * 50) * 100) / 100,
        gas_waha: Math.round((2.5 + rng() * 2) * 100) / 100,
        temperature_c: Math.round((20 + rng() * 18) * 10) / 10,
        renewable_share: Math.round(rng() * 0.6 * 100) / 100,
        hour_of_day: new Date(ts).getUTCHours(),
        load_zone: site.load_zone,
      },
      output:
        type === "Dispatch commit"
          ? { action, generate_mw: site.capacity_mw, expected_savings_usd: Math.round(rng() * 50000) }
          : type === "Forecast commit"
            ? { p10: 22, p50: Math.round((40 + rng() * 30) * 10) / 10, p90: 78 }
            : type === "Scenario run"
              ? { delta_p50_npv_m: Math.round((rng() * 60 - 30) * 10) / 10, delta_prob_loss: Math.round((rng() * 0.1 - 0.05) * 1000) / 1000 }
              : { override: action, accepted: true },
    });
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
})();

export interface SavedScenario {
  id: string;
  name: string;
  creatorInitials: string;
  savedAt: string; // ISO
  delta_p50_npv_m: number;
  delta_prob_loss: number;
  description?: string;
}

export const SEED_SCENARIOS: SavedScenario[] = [
  { id: "sc1", name: "Gas price spike 25%", creatorInitials: "MR", savedAt: "2026-04-17T14:22:00Z", delta_p50_npv_m: -42.8, delta_prob_loss: 0.072 },
  { id: "sc2", name: "Heat wave stress 2026", creatorInitials: "JL", savedAt: "2026-04-15T09:11:00Z", delta_p50_npv_m: 38.5, delta_prob_loss: -0.041 },
  { id: "sc3", name: "Winter Uri analog", creatorInitials: "AK", savedAt: "2026-04-12T18:03:00Z", delta_p50_npv_m: 91.2, delta_prob_loss: -0.118 },
  { id: "sc4", name: "Permian oversupply", creatorInitials: "TS", savedAt: "2026-04-10T11:47:00Z", delta_p50_npv_m: -27.4, delta_prob_loss: 0.054 },
  { id: "sc5", name: "Load growth 5% annual", creatorInitials: "RP", savedAt: "2026-04-08T16:30:00Z", delta_p50_npv_m: 24.1, delta_prob_loss: -0.023 },
  { id: "sc6", name: "Baseline reforecast Q2", creatorInitials: "MR", savedAt: "2026-04-05T08:15:00Z", delta_p50_npv_m: 5.6, delta_prob_loss: -0.008 },
];
