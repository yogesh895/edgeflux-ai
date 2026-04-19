import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Site } from "@/types";

interface EconomicsPanelProps {
  site: Site;
  profitablePct: number; // 0..1
}

export function EconomicsPanel({ site, profitablePct }: EconomicsPanelProps) {
  const pct = Math.round(profitablePct * 100);
  const data = [
    { name: "Profitable hours", value: pct, color: "hsl(var(--primary))" },
    { name: "Idle hours", value: 100 - pct, color: "hsl(var(--muted))" },
  ];

  const rows: Array<[string, string]> = [
    ["Capacity", `${site.capacity_mw} MW`],
    ["Heat rate", `${site.heat_rate_mmbtu_mwh} MMBtu/MWh`],
    ["VOM", `$${site.vom_mwh.toFixed(2)}/MWh`],
    ["Settlement point", site.settlement_point],
    ["Load zone", site.load_zone],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={k} className={i % 2 === 0 ? "bg-muted/20" : undefined}>
                <td className="px-3 py-2 text-muted-foreground">{k}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Annual hour mix (P50)
          </span>
          <span className="text-xs text-muted-foreground">~{pct}% profitable</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-[140px] w-[140px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  innerRadius={36}
                  outerRadius={60}
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [`${value}%`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: d.color }}
                />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="font-medium tabular-nums">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
