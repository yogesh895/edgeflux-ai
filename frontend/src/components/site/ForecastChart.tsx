import { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastPoint } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ForecastChartProps {
  forecast: ForecastPoint[];
  genCost: number;
}

type ZoomWindow = 24 | 48 | 72;

export function ForecastChart({ forecast, genCost }: ForecastChartProps) {
  const [zoom, setZoom] = useState<ZoomWindow>(72);

  const data = useMemo(() => {
    return forecast.slice(0, zoom).map((p, i) => {
      const date = new Date(p.timestamp);
      const hh = String(date.getUTCHours()).padStart(2, "0");
      return {
        idx: i,
        hour: i,
        label: `${hh}:00`,
        p10: p.p10,
        p50: p.p50,
        p90: p.p90,
        // band starts at p10, height = p90 - p10
        bandBase: p.p10,
        bandHeight: Math.max(0, p.p90 - p.p10),
        genCost,
      };
    });
  }, [forecast, zoom, genCost]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <LegendDot color="hsl(var(--primary))" label="P50" />
          <LegendDot color="hsl(var(--primary) / 0.25)" label="P10–P90 band" square />
          <LegendDot color="hsl(var(--muted-foreground))" label="Gen cost" dashed />
        </div>
        <div className="inline-flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
          {([24, 48, 72] as ZoomWindow[]).map((z) => (
            <Button
              key={z}
              size="sm"
              variant={zoom === z ? "default" : "ghost"}
              className={cn("h-7 px-2.5 text-xs", zoom !== z && "text-muted-foreground")}
              onClick={() => setZoom(z)}
            >
              {z}h
            </Button>
          ))}
        </div>
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
            <defs>
              <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, zoom - 1]}
              ticks={Array.from({ length: Math.floor(zoom / 6) + 1 }, (_, i) => i * 6)}
              tickFormatter={(v) => `+${v}h`}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              tickFormatter={(v) => `$${v}`}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              stroke="hsl(var(--border))"
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => `Hour +${v}`}
              formatter={(value: number, name: string) => {
                if (name === "bandHeight" || name === "bandBase") return [null, null];
                return [`$${Number(value).toFixed(2)}`, name];
              }}
            />
            {/* Invisible base */}
            <Area
              type="monotone"
              dataKey="bandBase"
              stackId="band"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            {/* Visible band on top */}
            <Area
              type="monotone"
              dataKey="bandHeight"
              stackId="band"
              stroke="none"
              fill="url(#bandFill)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p10"
              stroke="hsl(var(--primary) / 0.5)"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
              name="P10"
            />
            <Line
              type="monotone"
              dataKey="p90"
              stroke="hsl(var(--primary) / 0.5)"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
              name="P90"
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              name="P50"
            />
            <ReferenceLine
              y={genCost}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{
                value: `Gen cost $${genCost.toFixed(2)}`,
                position: "insideTopRight",
                fill: "hsl(var(--muted-foreground))",
                fontSize: 11,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendDot({
  color,
  label,
  square,
  dashed,
}: {
  color: string;
  label: string;
  square?: boolean;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <span
          className="inline-block h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: color }}
        />
      ) : (
        <span
          className={cn("inline-block h-2.5 w-2.5", square ? "rounded-sm" : "rounded-full")}
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
    </span>
  );
}
