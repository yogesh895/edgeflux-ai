import { useMemo } from "react";
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
import type { DispatchInterval } from "@/lib/dispatch";

interface DispatchScheduleChartProps {
  intervals: DispatchInterval[];
}

export function DispatchScheduleChart({ intervals }: DispatchScheduleChartProps) {
  const data = useMemo(
    () =>
      intervals.map((d) => ({
        hour: d.hour_offset,
        generate_mw: d.generate_mw,
        idle_mw: d.action === "import" ? d.capacity_mw : 0,
        capacity_mw: d.capacity_mw,
        lmp: d.lmp,
        gen_cost: d.gen_cost,
        spread: d.spread,
        action: d.action,
        savings: d.savings,
      })),
    [intervals],
  );

  const capacity = intervals[0]?.capacity_mw ?? 0;
  const genCost = intervals[0]?.gen_cost ?? 0;

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 50, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="dispatchGen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, 71]}
            ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 71]}
            tickFormatter={(v) => `+${v}h`}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            yAxisId="mw"
            domain={[0, Math.ceil(capacity * 1.1)]}
            tickFormatter={(v) => `${v}MW`}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            stroke="hsl(var(--border))"
            width={56}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            tickFormatter={(v) => `$${v}`}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            stroke="hsl(var(--border))"
            width={50}
          />
          <Tooltip content={<DispatchTooltip />} />

          {/* Idle hours background — shows capacity outline */}
          <Area
            yAxisId="mw"
            type="stepAfter"
            dataKey="idle_mw"
            stroke="hsl(var(--border))"
            strokeDasharray="3 3"
            strokeWidth={1}
            fill="hsl(var(--muted))"
            fillOpacity={0.18}
            isAnimationActive={false}
          />
          {/* Generate hours — solid teal */}
          <Area
            yAxisId="mw"
            type="stepAfter"
            dataKey="generate_mw"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#dispatchGen)"
            isAnimationActive={false}
          />
          {/* LMP line on right axis */}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="lmp"
            stroke="hsl(38 92% 55%)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {/* Gen cost dashed reference */}
          <ReferenceLine
            yAxisId="price"
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
  );
}

interface TooltipPayloadEntry {
  payload: {
    hour: number;
    lmp: number;
    gen_cost: number;
    spread: number;
    action: "generate" | "import";
    savings: number;
  };
}

function DispatchTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const isGen = p.action === "generate";
  return (
    <div className="rounded-md border bg-popover p-3 text-xs shadow-md">
      <div className="mb-1.5 flex items-center justify-between gap-4">
        <span className="font-medium">Hour +{p.hour}</span>
        <span
          className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase"
          style={{
            backgroundColor: isGen ? "hsl(var(--primary) / 0.2)" : "hsl(var(--muted))",
            color: isGen ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
          }}
        >
          {p.action}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
        <span className="text-muted-foreground">LMP</span>
        <span className="text-right font-medium">${p.lmp.toFixed(2)}</span>
        <span className="text-muted-foreground">Gen cost</span>
        <span className="text-right font-medium">${p.gen_cost.toFixed(2)}</span>
        <span className="text-muted-foreground">Spread</span>
        <span
          className="text-right font-medium"
          style={{ color: p.spread > 0 ? "hsl(150 55% 50%)" : "hsl(0 72% 60%)" }}
        >
          {p.spread > 0 ? "+" : ""}${p.spread.toFixed(2)}
        </span>
        <span className="text-muted-foreground">$ saved</span>
        <span className="text-right font-medium">${Math.round(p.savings).toLocaleString()}</span>
      </div>
    </div>
  );
}
