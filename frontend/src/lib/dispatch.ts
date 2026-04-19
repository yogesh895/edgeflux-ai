import type { Site, ForecastPoint } from "@/types";

export interface DispatchInterval {
  index: number;
  timestamp: string;
  hour_offset: number;
  lmp: number;
  gen_cost: number;
  spread: number;
  action: "generate" | "import";
  generate_mw: number;
  capacity_mw: number;
  savings: number;
}

const GAS_PRICE = 3.0;
const SPREAD_THRESHOLD = 5;

export function genCostFor(site: Site): number {
  return GAS_PRICE * site.heat_rate_mmbtu_mwh + site.vom_mwh;
}

export function buildDispatch(site: Site, forecast: ForecastPoint[]): DispatchInterval[] {
  const genCost = genCostFor(site);
  return forecast.map((p, i) => {
    const lmp = p.p50;
    const spread = lmp - genCost;
    const action: DispatchInterval["action"] = spread > SPREAD_THRESHOLD ? "generate" : "import";
    const generate_mw = action === "generate" ? site.capacity_mw : 0;
    const savings = action === "generate" && spread > 0 ? spread * site.capacity_mw : 0;
    return {
      index: i,
      timestamp: p.timestamp,
      hour_offset: i,
      lmp: Math.round(lmp * 100) / 100,
      gen_cost: Math.round(genCost * 100) / 100,
      spread: Math.round(spread * 100) / 100,
      action,
      generate_mw,
      capacity_mw: site.capacity_mw,
      savings: Math.round(savings * 100) / 100,
    };
  });
}
