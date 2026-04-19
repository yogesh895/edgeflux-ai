import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { DataError } from "@/components/DataError";
import { getDecisionDetail, replayDecision, queryKeys } from "@/lib/api";
import type { DecisionDetail, ReplayResponse } from "@/types";
import type { DecisionLogEntry } from "@/data/decisionsMock";
import { cn } from "@/lib/utils";

interface ReplayDrawerProps {
  entry: DecisionLogEntry | null;
  onOpenChange: (open: boolean) => void;
}

export function ReplayDrawer({ entry, onOpenChange }: ReplayDrawerProps) {
  const open = !!entry;
  const decisionId = entry?.decisionId ?? "";

  const detailQuery = useQuery({
    queryKey: queryKeys.decisionDetail(decisionId),
    queryFn: () => getDecisionDetail(decisionId),
    enabled: open && !!decisionId,
  });

  const [replayResult, setReplayResult] = useState<ReplayResponse | null>(null);
  const replayMutation = useMutation({
    mutationFn: () => replayDecision(decisionId),
    onSuccess: (data) => setReplayResult(data),
  });

  // Reset replay state when switching decisions / closing
  useEffect(() => {
    setReplayResult(null);
    replayMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {entry ? (
          <>
            <SheetHeader className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {entry.type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <SheetTitle className="text-lg">{entry.action}</SheetTitle>
              <SheetDescription className="font-mono text-[11px]">
                {entry.decisionId}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 flex flex-col gap-5">
              {detailQuery.isError ? (
                <DataError
                  message="Failed to load decision detail."
                  onRetry={() => detailQuery.refetch()}
                />
              ) : (
                <DetailBody
                  loading={detailQuery.isLoading}
                  detail={detailQuery.data}
                  fallbackEntry={entry}
                />
              )}

              {replayResult ? (
                <ReplayBanner result={replayResult} />
              ) : replayMutation.isError ? (
                <div className="rounded-md border border-[hsl(0_72%_55%/0.4)] bg-[hsl(0_72%_55%/0.1)] px-3 py-2 text-xs text-[hsl(0_72%_70%)]">
                  Replay failed: {(replayMutation.error as Error).message}
                </div>
              ) : null}

              <Button
                variant="default"
                className="self-start"
                disabled={replayMutation.isPending || !decisionId}
                onClick={() => replayMutation.mutate()}
              >
                {replayMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Re-run this decision
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  loading,
  detail,
  fallbackEntry,
}: {
  loading: boolean;
  detail: DecisionDetail | undefined;
  fallbackEntry: DecisionLogEntry;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const features = detail?.features ?? fallbackEntry.features;
  const output = detail?.output ?? fallbackEntry.output;
  const featureHash = detail?.feature_hash ?? "—";
  const modelVersion = detail?.model_version ?? fallbackEntry.modelVersion;
  const featureVersion = detail?.feature_version ?? fallbackEntry.featureVersion;
  const confidence = detail?.confidence ?? fallbackEntry.confidence;

  return (
    <>
      <Section title="Site">
        <KV k="Name" v={fallbackEntry.site.display_name} />
        <KV k="Load zone" v={fallbackEntry.site.load_zone} />
        <KV k="Capacity" v={`${fallbackEntry.site.capacity_mw} MW`} />
        <KV
          k="Timestamp"
          v={new Date(detail?.timestamp ?? fallbackEntry.timestamp).toLocaleString()}
        />
      </Section>

      <Section title="Provenance">
        <KV k="Decision ID" v={detail?.decision_id ?? fallbackEntry.decisionId} mono />
        <KV k="Feature hash" v={featureHash} mono muted />
        <KV k="Model" v={modelVersion} mono />
        <KV k="Features" v={featureVersion} mono />
        <KV k="Confidence" v={`${(confidence * 100).toFixed(1)}%`} />
      </Section>

      <Section title="Input feature snapshot">
        <JsonBlock data={features} />
      </Section>

      <Section title="Output">
        <JsonBlock data={output} defaultOpen />
      </Section>
    </>
  );
}

function ReplayBanner({ result }: { result: ReplayResponse }) {
  if (result.byte_identical) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-[hsl(150_55%_45%/0.4)] bg-[hsl(150_55%_45%/0.12)] px-3 py-2.5 text-xs text-[hsl(150_55%_75%)]">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(150_55%_55%)]" />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">Replay matches original</span>
          <span>
            Byte-identical forecast at feature_hash{" "}
            <span className="font-mono">{result.feature_hash}</span>
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-[hsl(38_92%_55%/0.4)] bg-[hsl(38_92%_55%/0.12)] px-3 py-2.5 text-xs text-[hsl(38_92%_75%)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(38_92%_60%)]" />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">
          Replay produced different output
        </span>
        <span>
          Features may have changed since original run. feature_hash{" "}
          <span className="font-mono">{result.feature_hash}</span>
        </span>
      </div>
    </div>
  );
}

function JsonBlock({
  data,
  defaultOpen,
}: {
  data: unknown;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-md border bg-muted/20 open:bg-muted/30"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
        <span className="group-open:hidden">Show JSON</span>
        <span className="hidden group-open:inline">Hide JSON</span>
      </summary>
      <pre className="overflow-x-auto border-t bg-background/40 px-3 py-2 font-mono text-[11px] leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function KV({
  k,
  v,
  mono,
  muted,
}: {
  k: string;
  v: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border bg-muted/10 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={cn(
          "truncate text-right",
          mono ? "font-mono" : "font-medium",
          muted ? "text-muted-foreground" : "font-medium",
        )}
        title={v}
      >
        {v}
      </span>
    </div>
  );
}
