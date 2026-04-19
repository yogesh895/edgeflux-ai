import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FeatureAttribution } from "@/types";

interface FeatureAttributionChartProps {
  features: FeatureAttribution[];
}

const FAMILY_COLOR: Record<FeatureAttribution["family"], string> = {
  market: "hsl(217 91% 60%)",
  weather: "hsl(var(--primary))",
  grid: "hsl(38 92% 55%)",
  calendar: "hsl(var(--muted-foreground))",
};

const FAMILY_LABEL: Record<FeatureAttribution["family"], string> = {
  market: "Market",
  weather: "Weather",
  grid: "Grid",
  calendar: "Calendar",
};

export function FeatureAttributionChart({ features }: FeatureAttributionChartProps) {
  const data = useMemo(
    () =>
      [...features]
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 10)
        .reverse(),
    [features],
  );

  const max = Math.max(...data.map((d) => Math.abs(d.contribution)));
  const domain = [-max * 1.1, max * 1.1];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(FAMILY_LABEL) as Array<keyof typeof FAMILY_LABEL>).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: FAMILY_COLOR[k] }}
            />
            {FAMILY_LABEL[k]}
          </span>
        ))}
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <XAxis
              type="number"
              domain={domain}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              stroke="hsl(var(--border))"
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`}
            />
            <YAxis
              type="category"
              dataKey="feature"
              width={140}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              stroke="hsl(var(--border))"
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [
                `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}`,
                "Contribution",
              ]}
            />
            <ReferenceLine x={0} stroke="hsl(var(--border))" />
            <Bar dataKey="contribution" radius={[3, 3, 3, 3]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.feature} fill={FAMILY_COLOR[d.family]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
