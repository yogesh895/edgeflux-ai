import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  GitCompareArrows,
  PlayCircle,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SEED_SCENARIOS, type SavedScenario, type DecisionLogEntry } from "@/data/decisionsMock";
import { ReplayDrawer } from "@/components/decisions/ReplayDrawer";
import { CompareDrawer } from "@/components/decisions/CompareDrawer";
import { NewScenarioDialog } from "@/components/decisions/NewScenarioDialog";
import { DataError } from "@/components/DataError";
import { getDecisions, getSites, getSiteRisk, queryKeys } from "@/lib/api";
import { indexBy } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import type { DecisionRecord, Site } from "@/types";

export const Route = createFileRoute("/decisions")({
  head: () => ({
    meta: [
      { title: "Decisions — EdgeFlux AI" },
      {
        name: "description",
        content: "Decision audit trail and saved scenario library.",
      },
    ],
  }),
  component: DecisionsPage,
});

const TYPE_TONE: Record<string, string> = {
  "Forecast commit": "bg-[hsl(217_91%_60%/0.15)] text-[hsl(217_91%_70%)] border-[hsl(217_91%_60%/0.3)]",
  "Dispatch commit": "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.3)]",
  "Scenario run": "bg-[hsl(38_92%_55%/0.15)] text-[hsl(38_92%_65%)] border-[hsl(38_92%_55%/0.3)]",
  "Manual override": "bg-[hsl(0_72%_55%/0.15)] text-[hsl(0_72%_65%)] border-[hsl(0_72%_55%/0.3)]",
};

/** Promote backend record to a richer entry usable by Replay/Compare drawers. */
function toLogEntry(rec: DecisionRecord, sitesById: Record<string, Site>): DecisionLogEntry {
  const fallbackSite: Site = sitesById[rec.site_id] ?? {
    site_id: rec.site_id,
    display_name: rec.site_id,
    load_zone: "WEST",
    settlement_point: "—",
    latitude: 0,
    longitude: 0,
    capacity_mw: 0,
    heat_rate_mmbtu_mwh: 0,
    vom_mwh: 0,
  };
  return {
    id: rec.decision_id,
    timestamp: rec.timestamp,
    site: fallbackSite,
    type: rec.type as DecisionLogEntry["type"],
    action: rec.action,
    confidence: rec.confidence,
    decisionId: rec.decision_id,
    modelVersion: rec.model_version,
    featureVersion: rec.feature_version,
    features: { feature_hash: rec.feature_hash, site_id: rec.site_id },
    output: { action: rec.action },
  };
}

function DecisionsPage() {
  const [tab, setTab] = useState<"log" | "library">("log");
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [replay, setReplay] = useState<DecisionLogEntry | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [scenarios, setScenarios] = useState<SavedScenario[]>(SEED_SCENARIOS);

  const sitesQuery = useQuery({ queryKey: queryKeys.sites, queryFn: getSites });
  const decisionsQuery = useQuery({ queryKey: queryKeys.decisions, queryFn: getDecisions });
  const sitesById = useMemo(() => indexBy(sitesQuery.data ?? []), [sitesQuery.data]);

  const entries: DecisionLogEntry[] = useMemo(() => {
    if (!decisionsQuery.data) return [];
    return decisionsQuery.data.decisions.map((d) => toLogEntry(d, sitesById));
  }, [decisionsQuery.data, sitesById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.site.display_name.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q),
    );
  }, [search, entries]);

  const toggleCheck = (id: string) => {
    setChecked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 2) return [cur[1], id];
      return [...cur, id];
    });
  };

  const compareEntries = useMemo(() => {
    if (checked.length !== 2) return null;
    const a = entries.find((e) => e.id === checked[0]);
    const b = entries.find((e) => e.id === checked[1]);
    if (!a || !b) return null;
    return [a, b] as [DecisionLogEntry, DecisionLogEntry];
  }, [checked, entries]);

  // Use first available site (or s06 fallback) as the baseline for new scenarios
  const baseSiteId = sitesQuery.data?.[0]?.site_id ?? "s06";
  const baseRiskQuery = useQuery({
    queryKey: queryKeys.risk(baseSiteId),
    queryFn: () => getSiteRisk(baseSiteId),
    enabled: !!baseSiteId,
  });
  const baseP50 = baseRiskQuery.data?.p50_npv ?? 100_000_000;
  const baseLoss = baseRiskQuery.data?.prob_loss ?? 0.35;

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Decisions</h1>
        <p className="text-sm text-muted-foreground">
          Audit trail of forecasts, dispatch commits, overrides, and saved what-ifs.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "log" | "library")} className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="log">Decision log</TabsTrigger>
            <TabsTrigger value="library">Scenario library</TabsTrigger>
          </TabsList>
          {tab === "log" ? (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by site, action, type…"
                className="h-9 pl-8 text-sm"
              />
            </div>
          ) : (
            <NewScenarioDialog
              baseP50Npv={baseP50}
              baseProbLoss={baseLoss}
              onSave={(s) => setScenarios((cur) => [s, ...cur])}
            />
          )}
        </div>

        {/* Audit strip */}
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-[hsl(150_55%_50%)]" />
          <span>
            Audit log: all decisions logged with{" "}
            <span className="font-mono text-foreground">feature_hash</span> for byte-identical
            replay. Retention: <span className="text-foreground">90 days</span>.
          </span>
        </div>

        <TabsContent value="log" className="mt-4 flex flex-col gap-3">
          <Card>
            <CardContent className="p-0">
              {decisionsQuery.isError ? (
                <div className="p-6">
                  <DataError
                    message="Failed to load decision log."
                    onRetry={() => decisionsQuery.refetch()}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Timestamp</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Decision type</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Confidence</TableHead>
                      <TableHead className="w-[70px] text-center">Replay</TableHead>
                      <TableHead className="w-[70px] text-center">Compare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {decisionsQuery.isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={7}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <>
                        {filtered.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {formatTs(e.timestamp)}
                            </TableCell>
                            <TableCell className="font-medium">{e.site.display_name}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn("text-[10px]", TYPE_TONE[e.type])}
                              >
                                {e.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{e.action}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {(e.confidence * 100).toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-center">
                              <button
                                type="button"
                                onClick={() => setReplay(e)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                aria-label="Replay decision"
                              >
                                <PlayCircle className="h-4 w-4" />
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={checked.includes(e.id)}
                                onCheckedChange={() => toggleCheck(e.id)}
                                aria-label="Select for compare"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                        {filtered.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="py-10 text-center text-sm text-muted-foreground"
                            >
                              No matching decisions.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {checked.length === 2 ? (
            <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-md border bg-popover/95 px-4 py-3 shadow-md backdrop-blur">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">2</span> decisions selected
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setChecked([])}>
                  Clear
                </Button>
                <Button size="sm" onClick={() => setCompareOpen(true)}>
                  <GitCompareArrows className="h-4 w-4" />
                  Compare
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="library" className="mt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((s) => (
              <ScenarioCard key={s.id} scenario={s} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
        Every forecast call is logged with{" "}
        <span className="font-mono text-foreground">feature_hash</span> for SHA-256
        byte-identical replay. This enables model-risk audit and regulatory
        reproducibility.
      </p>

      <ReplayDrawer entry={replay} onOpenChange={(o) => !o && setReplay(null)} />
      <CompareDrawer
        entries={compareOpen ? compareEntries : null}
        onOpenChange={(o) => setCompareOpen(o)}
      />
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: SavedScenario }) {
  const npvPositive = scenario.delta_p50_npv_m >= 0;
  const lossPositive = scenario.delta_prob_loss <= 0;
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold leading-tight">{scenario.name}</span>
            <span className="text-[11px] text-muted-foreground">
              Saved {new Date(scenario.savedAt).toLocaleDateString()}
            </span>
          </div>
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground"
            title={`Created by ${scenario.creatorInitials}`}
          >
            {scenario.creatorInitials}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <DeltaStat
            label="Δ P50 NPV"
            value={`${npvPositive ? "+" : ""}$${scenario.delta_p50_npv_m.toFixed(1)}M`}
            positive={npvPositive}
          />
          <DeltaStat
            label="Δ P(loss)"
            value={`${scenario.delta_prob_loss >= 0 ? "+" : ""}${(scenario.delta_prob_loss * 100).toFixed(1)}pp`}
            positive={lossPositive}
          />
        </div>

        {scenario.description ? (
          <p className="text-[11px] text-muted-foreground">{scenario.description}</p>
        ) : null}

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <User className="h-3 w-3" />
          {scenario.creatorInitials}
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaStat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="text-base font-semibold tabular-nums"
        style={{ color: positive ? "hsl(150 55% 50%)" : "hsl(0 72% 60%)" }}
      >
        {value}
      </div>
    </div>
  );
}

function formatTs(ts: string) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}
