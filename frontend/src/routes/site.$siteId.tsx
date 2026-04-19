import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ShieldAlert, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { tierize, TIER_COLOR, indexBy, syntheticRiskFromScore } from "@/lib/scoring";
import { SummaryTile } from "@/components/site/SummaryTile";
import { ForecastChart } from "@/components/site/ForecastChart";
import { FeatureAttributionChart } from "@/components/site/FeatureAttributionChart";
import { EconomicsPanel } from "@/components/site/EconomicsPanel";
import { DataError } from "@/components/DataError";
import {
  getSites,
  getSiteScores,
  getSiteForecast,
  getSiteAttribution,
  getSiteRisk,
  queryKeys,
} from "@/lib/api";

const DEFAULT_SITE = "s06";
const GAS_PRICE = 3.0; // $/MMBtu baseline

export const Route = createFileRoute("/site/$siteId")({
  head: ({ params }) => ({
    meta: [
      { title: `Site ${params.siteId} — EdgeFlux AI` },
      {
        name: "description",
        content: "Forecast, economics, and feature attributions for this site.",
      },
    ],
  }),
  component: SiteByIdPage,
});

function SiteByIdPage() {
  const { siteId } = Route.useParams();
  const navigate = useNavigate();

  const sitesQuery = useQuery({ queryKey: queryKeys.sites, queryFn: getSites });
  const scoresQuery = useQuery({ queryKey: queryKeys.scores, queryFn: getSiteScores });
  const forecastQuery = useQuery({
    queryKey: queryKeys.forecast(siteId),
    queryFn: () => getSiteForecast(siteId),
  });
  const attributionQuery = useQuery({
    queryKey: queryKeys.attribution(siteId),
    queryFn: () => getSiteAttribution(siteId),
  });
  const riskQuery = useQuery({
    queryKey: queryKeys.risk(siteId),
    queryFn: () => getSiteRisk(siteId),
  });

  const sites = sitesQuery.data ?? [];
  const sitesById = useMemo(() => indexBy(sites), [sites]);
  const ranked = useMemo(
    () => (scoresQuery.data ? tierize(scoresQuery.data) : []),
    [scoresQuery.data],
  );

  // If sites loaded but the requested site isn't found, redirect to default
  if (sitesQuery.isSuccess && !sitesById[siteId] && siteId !== DEFAULT_SITE) {
    navigate({ to: "/site/$siteId", params: { siteId: DEFAULT_SITE }, replace: true });
  }

  const site = sitesById[siteId];
  const score = scoresQuery.data?.find((s) => s.site_id === siteId);
  const tier = ranked.find((s) => s.site_id === siteId);
  const compositeColor = tier ? TIER_COLOR[tier.tier] : TIER_COLOR.mid;

  const risk = riskQuery.data;
  const forecastPoints = forecastQuery.data?.points ?? [];

  const genCost = useMemo(
    () =>
      site
        ? Math.round((GAS_PRICE * site.heat_rate_mmbtu_mwh + site.vom_mwh) * 100) / 100
        : 0,
    [site],
  );

  const profitablePct = useMemo(() => {
    if (!forecastPoints.length || !genCost) return 0.45;
    const profitable = forecastPoints.filter((p) => p.p50 > genCost).length;
    return profitable / forecastPoints.length;
  }, [forecastPoints, genCost]);

  const sitesLoading = sitesQuery.isLoading;
  const sitesError = sitesQuery.isError || scoresQuery.isError;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to="/map" className="hover:text-foreground">
                Map
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span>Site Detail</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">{site?.display_name ?? siteId}</span>
            </nav>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                {sitesLoading ? (
                  <Skeleton className="h-8 w-64" />
                ) : (
                  (site?.display_name ?? siteId)
                )}
              </h1>
              {tier ? (
                <span
                  className="rounded-md px-2 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: `${compositeColor}20`, color: compositeColor }}
                >
                  Rank #{tier.rank}
                </span>
              ) : null}
            </div>
            {site ? (
              <p className="text-sm text-muted-foreground">
                {site.load_zone} · {site.settlement_point} · {site.capacity_mw} MW
              </p>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Switch site
            </span>
            <Select
              value={siteId}
              onValueChange={(value) =>
                navigate({ to: "/site/$siteId", params: { siteId: value } })
              }
              disabled={sitesLoading || !sites.length}
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

        {sitesError ? (
          <DataError message="Failed to load site catalog." onRetry={() => sitesQuery.refetch()} />
        ) : null}

        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryTile
            label="Composite score"
            value={tier ? `${tier.composite}` : "—"}
            accentColor={compositeColor}
            hint={tier ? `Tier · ${tier.tier}` : "Loading…"}
          />
          <SummaryTile
            label="P50 NPV"
            value={risk ? `$${(risk.p50_npv / 1_000_000).toFixed(0)}M` : "—"}
            hint={risk ? `Capex $${(risk.capex / 1_000_000).toFixed(0)}M` : "Loading…"}
          />
          <SummaryTile
            label="P(loss)"
            value={risk ? `${(risk.prob_loss * 100).toFixed(1)}%` : "—"}
            hint={risk ? `CVaR $${(risk.cvar_95_npv / 1_000_000).toFixed(0)}M` : "Loading…"}
          />
          <SummaryTile
            label="Annual spread"
            value={
              score
                ? `$${score.expected_annual_spread.toFixed(2)}/MWh`
                : site && riskQuery.data
                  ? `$${syntheticRiskFromScore({ site_id: siteId, display_name: site.display_name, load_zone: site.load_zone, composite_score: 50, rank: 0, p50_npv: 0, prob_loss: 0.35, capacity_mw: site.capacity_mw, expected_annual_spread: 25, profitable_hours_pct: 45 }, site.capacity_mw).p50_npv.toFixed(0)}`
                  : "—"
            }
            hint="Expected mean"
          />
          <SummaryTile
            label="Profitable hours"
            value={score ? `${score.profitable_hours_pct.toFixed(1)}%` : "—"}
            hint="Of annual hours"
          />
        </div>
      </div>

      {/* Forecast */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">LMP forecast</CardTitle>
          <CardDescription>
            P10 / P50 / P90 next 72h · gen cost ${genCost.toFixed(2)}/MWh @ $
            {GAS_PRICE.toFixed(2)} gas
            {forecastQuery.data?.model_version
              ? ` · ${forecastQuery.data.model_version}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forecastQuery.isError ? (
            <DataError
              message="Failed to load forecast."
              onRetry={() => forecastQuery.refetch()}
            />
          ) : forecastQuery.isLoading || !forecastPoints.length ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <ForecastChart forecast={forecastPoints} genCost={genCost} />
          )}
        </CardContent>
      </Card>

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Why this forecast</CardTitle>
            <CardDescription>
              Top feature contributions
              {attributionQuery.data?.explainer
                ? ` · ${attributionQuery.data.explainer}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {attributionQuery.isError ? (
              <DataError
                message="Failed to load attributions."
                onRetry={() => attributionQuery.refetch()}
              />
            ) : attributionQuery.isLoading || !attributionQuery.data ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <FeatureAttributionChart features={attributionQuery.data.features} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Site economics</CardTitle>
            <CardDescription>Plant specs and dispatch hour mix</CardDescription>
          </CardHeader>
          <CardContent>
            {!site ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <EconomicsPanel site={site} profitablePct={profitablePct} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer actions */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-muted-foreground">
            Drill into risk distributions or run the dispatch console for this site.
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/risk" search={{ site: siteId }}>
                <ShieldAlert className="h-4 w-4" />
                View risk analysis
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/dispatch" search={{ site: siteId }}>
                <Zap className="h-4 w-4" />
                Open dispatch console
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
