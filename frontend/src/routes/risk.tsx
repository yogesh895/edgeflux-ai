import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { NpvDistributionChart } from "@/components/risk/NpvDistributionChart";
import { ScenarioSliders } from "@/components/risk/ScenarioSliders";
import { RiskFactorsTable } from "@/components/risk/RiskFactorsTable";
import { DataError } from "@/components/DataError";
import { getSites, getSiteRisk, queryKeys } from "@/lib/api";
import { indexBy } from "@/lib/scoring";

const DEFAULT_SITE = "s06";

export const Route = createFileRoute("/risk")({
  validateSearch: (search: Record<string, unknown>) => ({
    site: typeof search.site === "string" ? search.site : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Risk — EdgeFlux AI" },
      {
        name: "description",
        content: "NPV distributions, CVaR, and probability-of-loss across candidate sites.",
      },
    ],
  }),
  component: RiskPage,
});

function RiskPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const sitesQuery = useQuery({ queryKey: queryKeys.sites, queryFn: getSites });
  const sites = sitesQuery.data ?? [];
  const sitesById = indexBy(sites);

  const siteId =
    search.site && sitesById[search.site] ? search.site : (sites[0]?.site_id ?? DEFAULT_SITE);
  const site = sitesById[siteId];

  const riskQuery = useQuery({
    queryKey: queryKeys.risk(siteId),
    queryFn: () => getSiteRisk(siteId),
    enabled: !!siteId,
  });
  const risk = riskQuery.data;

  const M = 1_000_000;
  const expectedReturn = risk ? risk.p50_npv / risk.capex : 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header + selector */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Risk</h1>
          <p className="text-sm text-muted-foreground">
            NPV distributions, CVaR(95), and what-if scenario analysis.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Site
          </span>
          <Select
            value={siteId}
            onValueChange={(value) => navigate({ to: "/risk", search: { site: value } })}
            disabled={sitesQuery.isLoading || !sites.length}
          >
            <SelectTrigger className="w-[260px]">
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
        </div>
      </div>

      {site ? (
        <div className="text-xs text-muted-foreground">
          Showing risk for{" "}
          <span className="font-medium text-foreground">{site.display_name}</span> ·{" "}
          {site.capacity_mw} MW · {site.load_zone}
        </div>
      ) : null}

      {/* 3-column main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">10-year NPV distribution</CardTitle>
            <CardDescription>
              Based on Monte Carlo paths with t-copula joint LMP/gas dependence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {riskQuery.isError ? (
              <DataError
                message="Failed to load risk distribution."
                onRetry={() => riskQuery.refetch()}
              />
            ) : riskQuery.isLoading || !risk ? (
              <Skeleton className="h-[360px] w-full" />
            ) : (
              <NpvDistributionChart risk={risk} samples={risk.npv_paths_sample} />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Risk metrics</CardTitle>
            <CardDescription>Headline numbers for this site</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!risk ? (
              <>
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-[68px] w-full" />
                ))}
              </>
            ) : (
              <>
                <MetricCard
                  label="P5 NPV"
                  value={`$${(risk.p5_npv / M).toFixed(0)}M`}
                  hint="5th-percentile downside."
                  negative={risk.p5_npv < 0}
                />
                <MetricCard
                  label="P50 NPV"
                  value={`$${(risk.p50_npv / M).toFixed(0)}M`}
                  hint="Median outcome across paths."
                  negative={risk.p50_npv < 0}
                />
                <MetricCard
                  label="P95 NPV"
                  value={`$${(risk.p95_npv / M).toFixed(0)}M`}
                  hint="95th-percentile upside."
                />
                <MetricCard
                  label="CVaR-95"
                  value={`$${(risk.cvar_95_npv / M).toFixed(0)}M`}
                  hint="Expected loss in the worst 5% of paths."
                  negative={risk.cvar_95_npv < 0}
                />
                <MetricCard
                  label="Probability of loss"
                  value={`${(risk.prob_loss * 100).toFixed(1)}%`}
                  hint="Share of paths with NPV < 0."
                />
                <MetricCard
                  label="Capex"
                  value={`$${(risk.capex / M).toFixed(0)}M`}
                  hint="Up-front capital required."
                />
                <MetricCard
                  label="Expected return"
                  value={`${(expectedReturn * 100).toFixed(0)}%`}
                  hint="P50 NPV ÷ Capex."
                  negative={expectedReturn < 0}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scenario what-if</CardTitle>
            <CardDescription>Stress key drivers and watch P50 / P(loss).</CardDescription>
          </CardHeader>
          <CardContent>
            {!risk ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ScenarioSliders risk={risk} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Risk factors */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Risk factors</CardTitle>
          <CardDescription>Top NPV-shifting scenarios ranked by impact.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <RiskFactorsTable siteId={siteId} />
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  negative,
}: {
  label: string;
  value: string;
  hint: string;
  negative?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/20 p-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={
          negative
            ? "text-lg font-semibold tabular-nums text-[hsl(0_72%_60%)]"
            : "text-lg font-semibold tabular-nums"
        }
      >
        {value}
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
    </div>
  );
}
