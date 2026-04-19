import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  LOAD_ZONES,
  TIER_COLOR,
  tierize,
  indexBy,
  type LoadZone,
  type ScoredSite,
} from "@/lib/scoring";
import { TexasMap } from "@/components/map/TexasMap";
import { MapOnboarding } from "@/components/MapOnboarding";
import { DataError } from "@/components/DataError";
import { getSites, getSiteScores, queryKeys } from "@/lib/api";
import type { Site } from "@/types";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Map — EdgeFlux AI" },
      {
        name: "description",
        content:
          "Geographic view of candidate BTM sites across ERCOT load zones, ranked by composite score.",
      },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  const navigate = useNavigate();
  const [activeZones, setActiveZones] = useState<Set<LoadZone>>(new Set(LOAD_ZONES));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sitesQuery = useQuery({ queryKey: queryKeys.sites, queryFn: getSites });
  const scoresQuery = useQuery({ queryKey: queryKeys.scores, queryFn: getSiteScores });

  const isLoading = sitesQuery.isLoading || scoresQuery.isLoading;
  const isError = sitesQuery.isError || scoresQuery.isError;
  const sites: Site[] = sitesQuery.data ?? [];
  const sitesById = useMemo(() => indexBy(sites), [sites]);

  const ranked: ScoredSite[] = useMemo(
    () => (scoresQuery.data ? tierize(scoresQuery.data) : []),
    [scoresQuery.data],
  );
  const scoresById = useMemo(
    () => Object.fromEntries(ranked.map((s) => [s.site_id, s])) as Record<string, ScoredSite>,
    [ranked],
  );
  const scoreRecordById = useMemo(
    () => Object.fromEntries((scoresQuery.data ?? []).map((s) => [s.site_id, s])),
    [scoresQuery.data],
  );

  const filteredSites = useMemo(
    () => sites.filter((s) => activeZones.has(s.load_zone)),
    [sites, activeZones],
  );

  const filteredRanked = useMemo(
    () => ranked.filter((s) => sitesById[s.site_id] && activeZones.has(sitesById[s.site_id]!.load_zone)),
    [ranked, sitesById, activeZones],
  );

  const summary = useMemo(() => {
    const valid = filteredRanked
      .map((s) => scoreRecordById[s.site_id])
      .filter((sc): sc is NonNullable<typeof sc> => !!sc);
    const sumNpv = valid.reduce((a, sc) => a + sc.p50_npv, 0);
    const meanLoss = valid.length ? valid.reduce((a, sc) => a + sc.prob_loss, 0) / valid.length : 0;
    return {
      count: filteredRanked.length,
      sumNpvM: sumNpv / 1_000_000,
      meanLossPct: meanLoss * 100,
    };
  }, [filteredRanked, scoreRecordById]);

  const toggleZone = (z: LoadZone) => {
    setActiveZones((prev) => {
      const next = new Set(prev);
      if (next.has(z)) next.delete(z);
      else next.add(z);
      if (next.size === 0) return prev;
      return next;
    });
  };

  const retry = () => {
    sitesQuery.refetch();
    scoresQuery.refetch();
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
        <p className="text-sm text-muted-foreground">
          Geographic view of candidate BTM sites across ERCOT load zones.
        </p>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="flex h-full min-h-[520px] flex-col p-3">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                ERCOT — Texas
              </p>
              <Legend />
            </div>
            <div className="flex-1 overflow-hidden rounded-md bg-background">
              {isError ? (
                <div className="flex h-full items-center justify-center p-6">
                  <DataError message="Failed to load site map data." onRetry={retry} />
                </div>
              ) : isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <TexasMap
                  sites={filteredSites}
                  scoresById={scoresById}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="grid grid-cols-3 gap-4 p-4">
              <SummaryStat label="Sites" value={`${summary.count}`} loading={isLoading} />
              <SummaryStat
                label="Σ P50 NPV"
                value={`$${summary.sumNpvM.toFixed(0)}M`}
                loading={isLoading}
              />
              <SummaryStat
                label="Mean P(loss)"
                value={`${summary.meanLossPct.toFixed(1)}%`}
                loading={isLoading}
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {LOAD_ZONES.map((z) => {
              const active = activeZones.has(z);
              return (
                <button
                  key={z}
                  onClick={() => toggleZone(z)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {z}
                </button>
              );
            })}
          </div>

          <Card className="flex-1">
            <CardContent className="p-2">
              {isError ? (
                <div className="p-6">
                  <DataError message="Failed to load ranked sites." onRetry={retry} />
                </div>
              ) : isLoading ? (
                <ul className="flex flex-col gap-2 p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i}>
                      <Skeleton className="h-[78px] w-full" />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col gap-1 max-h-[560px] overflow-y-auto pr-1">
                  {filteredRanked.map((s) => {
                    const site = sitesById[s.site_id];
                    const sc = scoreRecordById[s.site_id];
                    if (!site || !sc) return null;
                    const isSelected = selectedId === s.site_id;
                    const color = TIER_COLOR[s.tier];
                    return (
                      <li key={s.site_id}>
                        <button
                          onClick={() =>
                            navigate({ to: "/site/$siteId", params: { siteId: s.site_id } })
                          }
                          onMouseEnter={() => setSelectedId(s.site_id)}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-md border border-transparent p-3 text-left transition-colors hover:border-border hover:bg-muted/40",
                            isSelected && "border-border bg-muted/60",
                          )}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-foreground">
                            {s.rank}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-sm font-medium text-foreground">
                                {site.display_name}
                              </p>
                              <span
                                className="shrink-0 text-2xl font-semibold leading-none tabular-nums"
                                style={{ color }}
                              >
                                {s.composite}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                                {site.load_zone}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {site.settlement_point}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                              <RowStat
                                label="P50 NPV"
                                value={`$${(sc.p50_npv / 1_000_000).toFixed(0)}M`}
                              />
                              <RowStat
                                label="P(loss)"
                                value={`${(sc.prob_loss * 100).toFixed(1)}%`}
                              />
                              <RowStat label="Capacity" value={`${site.capacity_mw} MW`} />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  {filteredRanked.length === 0 && (
                    <li className="p-6 text-center text-sm text-muted-foreground">
                      No sites match the selected zones.
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <MapOnboarding />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      )}
    </div>
  );
}

function RowStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
      <LegendDot color={TIER_COLOR.top} label="Top" />
      <LegendDot color={TIER_COLOR.mid} label="Mid" />
      <LegendDot color={TIER_COLOR.bottom} label="Bottom" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}
