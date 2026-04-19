import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SiteRisk } from "@/types";

interface NpvDistributionChartProps {
  risk: SiteRisk;
  /** Optional pre-sampled NPV paths from the backend (in $). If provided, we KDE these directly. */
  samples?: number[];
}

// Box-Muller transform with seeded PRNG (fallback when no real samples)
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

function randn(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Gaussian KDE evaluated on a grid
function kde(samples: number[], grid: number[], bandwidth: number) {
  const n = samples.length;
  const norm = 1 / (n * bandwidth * Math.sqrt(2 * Math.PI));
  return grid.map((x) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const z = (x - samples[i]) / bandwidth;
      s += Math.exp(-0.5 * z * z);
    }
    return s * norm;
  });
}

export function NpvDistributionChart({ risk, samples }: NpvDistributionChartProps) {
  const data = useMemo(() => {
    const M = 1_000_000;
    const p5 = risk.p5_npv / M;
    const p50 = risk.p50_npv / M;
    const p95 = risk.p95_npv / M;

    let scaled: number[];
    if (samples && samples.length > 1) {
      // Real Monte Carlo paths from the backend (assumed in $).
      scaled = samples.map((s) => s / M);
    } else {
      // Fallback: synthesize a mixture of normals consistent with P5/P50/P95.
      const sigmaLow = (p50 - p5) / 1.645;
      const sigmaHigh = (p95 - p50) / 1.645;
      const seed = Math.abs(Math.round((p50 + p5 + p95) * 1000)) + 17;
      const rng = mulberry32(seed);
      const N = 500;
      scaled = [];
      for (let i = 0; i < N; i++) {
        const useHigh = rng() > 0.5;
        const sig = useHigh ? sigmaHigh : sigmaLow;
        scaled.push(p50 + randn(rng) * sig);
      }
    }

    const sigmaLow = Math.max(1, (p50 - p5) / 1.645);
    const sigmaHigh = Math.max(1, (p95 - p50) / 1.645);

    const minV = Math.min(p5, ...scaled) - sigmaLow * 0.5;
    const maxV = Math.max(p95, ...scaled) + sigmaHigh * 0.5;
    const steps = 160;
    const grid = Array.from(
      { length: steps },
      (_, i) => minV + ((maxV - minV) * i) / (steps - 1),
    );
    const bandwidth = Math.max(((sigmaLow + sigmaHigh) / 2) * 0.45, 1);
    const density = kde(scaled, grid, bandwidth);

    return grid.map((x, i) => ({
      npv: x,
      density: density[i],
      lossDensity: x < 0 ? density[i] : 0,
      p5,
      p50,
      p95,
    }));
  }, [risk, samples]);

  const p5 = risk.p5_npv / 1_000_000;
  const p50 = risk.p50_npv / 1_000_000;
  const p95 = risk.p95_npv / 1_000_000;

  return (
    <div className="flex h-[360px] w-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <Legend color="hsl(var(--primary))" label="Density" />
        <Legend color="hsl(0 72% 55% / 0.55)" label="Loss region" />
        <Legend color="hsl(var(--muted-foreground))" label="P5 / P50 / P95" dashed />
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="npvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="npvLossFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(0 72% 55%)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="hsl(0 72% 55%)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="npv"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => `$${Math.round(v)}M`}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            stroke="hsl(var(--border))"
          />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v) => `NPV $${Number(v).toFixed(0)}M`}
            formatter={(value: number, name: string) => {
              if (name === "lossDensity") return [null, null];
              return [Number(value).toExponential(2), "Density"];
            }}
          />
          <Area
            type="monotone"
            dataKey="density"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#npvFill)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="lossDensity"
            stroke="hsl(0 72% 55%)"
            strokeWidth={0}
            fill="url(#npvLossFill)"
            isAnimationActive={false}
          />
          <ReferenceLine
            x={p5}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            label={{ value: "P5", fill: "hsl(var(--muted-foreground))", fontSize: 10, position: "top" }}
          />
          <ReferenceLine
            x={p50}
            stroke="hsl(var(--foreground))"
            strokeDasharray="3 3"
            label={{ value: "P50", fill: "hsl(var(--foreground))", fontSize: 10, position: "top" }}
          />
          <ReferenceLine
            x={p95}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            label={{ value: "P95", fill: "hsl(var(--muted-foreground))", fontSize: 10, position: "top" }}
          />
          <ReferenceLine x={0} stroke="hsl(0 72% 55%)" strokeWidth={1} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <span
          className="inline-block h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: color }}
        />
      ) : (
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
    </span>
  );
}
