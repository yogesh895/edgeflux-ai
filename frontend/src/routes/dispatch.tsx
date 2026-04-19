import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { buildDispatch } from "@/lib/dispatch";
import { DispatchScheduleChart } from "@/components/dispatch/DispatchScheduleChart";
import { DataError } from "@/components/DataError";
import { getSites, getSiteForecast, queryKeys } from "@/lib/api";
import { indexBy } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const DEFAULT_SITE = "s06";

export const Route = createFileRoute("/dispatch")({
  validateSearch: (search: Record<string, unknown>) => ({
    site: typeof search.site === "string" ? search.site : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dispatch — EdgeFlux AI" },
      {
        name: "description",
        content: "Hour-by-hour generate vs. import dispatch recommendations.",
      },
    ],
  }),
  component: DispatchPage,
});

function DispatchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const sitesQuery = useQuery({ queryKey: queryKeys.sites, queryFn: getSites });
  const sites = sitesQuery.data ?? [];
  const sitesById = indexBy(sites);

  const siteId =
    search.site && sitesById[search.site] ? search.site : (sites[0]?.site_id ?? DEFAULT_SITE);
  const site = sitesById[siteId];

  const forecastQuery = useQuery({
    queryKey: queryKeys.forecast(siteId),
    queryFn: () => getSiteForecast(siteId),
    enabled: !!siteId,
  });

  const [forecastDate, setForecastDate] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const intervals = useMemo(() => {
    if (!site || !forecastQuery.data) return [];
    return buildDispatch(site, forecastQuery.data.points);
  }, [site, forecastQuery.data]);

  const next24 = intervals.slice(0, 24);
  const expectedSavings = next24.reduce(
    (s, i) => s + (i.spread > 0 ? i.spread * i.generate_mw : 0),
    0,
  );
  const profitableHours = next24.filter((i) => i.action === "generate").length;
  const idleHours = 24 - profitableHours;

  const current = intervals[0];

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: queryKeys.forecast(siteId) });
    setTimeout(() => setRefreshing(false), 600);
  };

  const ready = !!site && !!current;

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      {/* Top bar: title + selectors */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dispatch console</h1>
          <p className="text-sm text-muted-foreground">
            Hour-by-hour generate vs import recommendations
            {site ? ` · ${site.display_name} · ${site.capacity_mw} MW` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SelectorBlock label="Site">
            <Select
              value={siteId}
              onValueChange={(v) => navigate({ to: "/dispatch", search: { site: v } })}
              disabled={sitesQuery.isLoading || !sites.length}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.site_id} value={s.site_id}>
                    {s.display_name} · {s.load_zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectorBlock>
          <SelectorBlock label="Forecast date">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-start font-normal">
                  <CalendarIcon className="h-4 w-4" />
                  {format(forecastDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={forecastDate}
                  onSelect={(d) => d && setForecastDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </SelectorBlock>
          <Button onClick={handleRefresh} variant="default" disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <Card className="bg-muted/20">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 text-xs">
          <StatusItem
            icon={
              <span className="inline-block h-2 w-2 rounded-full bg-[hsl(150_55%_50%)] shadow-[0_0_6px_hsl(150_55%_50%/0.6)]" />
            }
            label="Model health"
            value="Healthy"
          />
          <StatusDivider />
          <StatusItem
            icon={<Timer className="h-3.5 w-3.5 text-muted-foreground" />}
            label="Last forecast"
            value={
              forecastQuery.data?.generated_at
                ? new Date(forecastQuery.data.generated_at).toLocaleTimeString()
                : "—"
            }
          />
          <StatusDivider />
          <StatusItem
            icon={<ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />}
            label="Constraint violations (24h)"
            value="0"
          />
          <StatusDivider />
          <StatusItem
            icon={<ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />}
            label="Approval queue"
            value="3"
          />
        </CardContent>
      </Card>

      {/* Main grid: schedule + decision sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">72-hour dispatch schedule</CardTitle>
                  <CardDescription>
                    Generate vs import (MW) with LMP and gen cost overlay.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <Legend color="hsl(var(--primary))" label="Generate" />
                  <Legend color="hsl(var(--muted))" label="Import" square dashed />
                  <Legend color="hsl(38 92% 55%)" label="LMP" line />
                  <Legend
                    color="hsl(var(--muted-foreground))"
                    label="Gen cost"
                    line
                    dashed
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {forecastQuery.isError ? (
                <DataError
                  message="Failed to load 72-hour forecast."
                  onRetry={() => forecastQuery.refetch()}
                />
              ) : !ready ? (
                <Skeleton className="h-[360px] w-full" />
              ) : (
                <DispatchScheduleChart intervals={intervals} />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SmallStat
              label="Expected savings (next 24h)"
              value={ready ? `$${Math.round(expectedSavings).toLocaleString()}` : "—"}
              hint="Σ spread × generate MW"
              positive
              loading={!ready}
            />
            <SmallStat
              label="Profitable hours (next 24h)"
              value={ready ? `${profitableHours} / 24` : "—"}
              hint={ready ? `${Math.round((profitableHours / 24) * 100)}% of hours` : ""}
              loading={!ready}
            />
            <SmallStat
              label="Idle hours (next 24h)"
              value={ready ? `${idleHours} / 24` : "—"}
              hint="Below dispatch threshold"
              muted
              loading={!ready}
            />
          </div>
        </div>

        {/* Right sidebar — Current decision */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current decision</CardTitle>
            <CardDescription>Hour 0 recommendation</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!ready ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <span
                    className="text-3xl font-bold tracking-tight"
                    style={{
                      color:
                        current!.action === "generate"
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {current!.action.toUpperCase()}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-[hsl(150_55%_50%)]" />
                    Confidence{" "}
                    {site?.confidence != null
                      ? `${(site.confidence * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">LMP</span>
                  <span className="text-right font-semibold tabular-nums">
                    ${current!.lmp.toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">Gen cost</span>
                  <span className="text-right font-semibold tabular-nums">
                    ${current!.gen_cost.toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">Spread</span>
                  <span
                    className="text-right font-semibold tabular-nums"
                    style={{
                      color: current!.spread > 0 ? "hsl(150 55% 50%)" : "hsl(0 72% 60%)",
                    }}
                  >
                    {current!.spread > 0 ? "+" : ""}${current!.spread.toFixed(2)}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Constraints applied
                  </span>
                  <div className="overflow-hidden rounded-md border text-xs">
                    <ConstraintRow
                      k="Min up time"
                      v={site?.min_up_time_h != null ? `${site.min_up_time_h} h` : "—"}
                    />
                    <ConstraintRow
                      k="Ramp limit"
                      v={
                        site?.ramp_limit_mw_per_h != null
                          ? `${site.ramp_limit_mw_per_h} MW/h`
                          : "—"
                      }
                      alt
                    />
                    <ConstraintRow
                      k="Min down time"
                      v={site?.min_down_time_h != null ? `${site.min_down_time_h} h` : "—"}
                    />
                    <ConstraintRow k="Status flag" v="Clear" alt good />
                  </div>
                </div>

                <Button variant="secondary" className="mt-1">
                  Submit override
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SelectorBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function StatusItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function StatusDivider() {
  return <span className="hidden h-3 w-px bg-border sm:inline-block" />;
}

function SmallStat({
  label,
  value,
  hint,
  positive,
  muted,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  positive?: boolean;
  muted?: boolean;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums",
              positive && "text-[hsl(150_55%_50%)]",
              muted && "text-muted-foreground",
            )}
          >
            {value}
          </span>
        )}
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

function ConstraintRow({
  k,
  v,
  alt,
  good,
}: {
  k: string;
  v: string;
  alt?: boolean;
  good?: boolean;
}) {
  return (
    <div
      className={cn("flex items-center justify-between px-3 py-1.5", alt && "bg-muted/20")}
    >
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("font-medium tabular-nums", good && "text-[hsl(150_55%_50%)]")}>
        {v}
      </span>
    </div>
  );
}

function Legend({
  color,
  label,
  square,
  line,
  dashed,
}: {
  color: string;
  label: string;
  square?: boolean;
  line?: boolean;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {line ? (
        <span
          className={cn("inline-block h-0 w-4", dashed ? "border-t-2 border-dashed" : "border-t-2")}
          style={{ borderColor: color }}
        />
      ) : (
        <span
          className={cn("inline-block h-2.5 w-2.5", square ? "rounded-sm" : "rounded-full")}
          style={{ backgroundColor: color, opacity: square ? 0.5 : 1 }}
        />
      )}
      <span>{label}</span>
    </span>
  );
}
