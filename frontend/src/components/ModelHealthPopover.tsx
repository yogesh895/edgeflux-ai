import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getHealth, queryKeys } from "@/lib/api";

function relativeMinutes(iso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60_000));
  return `${diffMin} min`;
}

export function ModelHealthPopover() {
  const { data, isError } = useQuery({
    queryKey: queryKeys.health,
    queryFn: getHealth,
    refetchInterval: 30_000,
    retry: false,
  });

  const healthy = !isError && data?.status === "ok";
  const versionLine = data
    ? `${data.model_name} v${data.model_version} · ercot-da-hourly`
    : "Loading…";
  const lastSync = relativeMinutes(data?.timestamp);
  const lastPrecompute = relativeMinutes(data?.last_precompute);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open model health diagnostics"
          className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring sm:flex"
        >
          <span className="relative flex h-2 w-2" aria-hidden>
            {healthy ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </>
            ) : (
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(38_92%_55%)]" />
            )}
          </span>
          <span className="font-medium text-foreground">{healthy ? "Live" : "Offline"}</span>
          <span className="text-muted-foreground">· Last sync {lastSync} ago</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-start justify-between gap-3 border-b p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Model health</span>
            <span className="text-[11px] text-muted-foreground">{versionLine}</span>
          </div>
          {healthy ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" />
              Healthy
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(38_92%_55%/0.3)] bg-[hsl(38_92%_55%/0.1)] px-2 py-0.5 text-[10px] font-medium text-[hsl(38_92%_65%)]">
              <AlertTriangle className="h-3 w-3" />
              Offline
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 text-xs">
          <Stat
            label="Model latency"
            value={data ? `${data.p50_latency_ms} ms` : "…"}
            sub="P50"
          />
          <Stat label="Forecast freshness" value={lastSync} sub="ago" />
          <Stat
            label="Backtest MAE"
            value={data ? `$${data.backtest_mae_usd.toFixed(2)}` : "…"}
            sub={
              data
                ? `${data.backtest_improvement_over_naive_pct.toFixed(0)}% over naive`
                : undefined
            }
          />
          <Stat label="Last precompute" value={lastPrecompute} sub="ago" />
        </dl>
        <div className="border-t p-2">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="inline-flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-muted/50"
          >
            View diagnostics
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/20 p-2">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="flex items-baseline gap-1">
        <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
        {sub ? <span className="text-[10px] text-muted-foreground">{sub}</span> : null}
      </dd>
    </div>
  );
}
