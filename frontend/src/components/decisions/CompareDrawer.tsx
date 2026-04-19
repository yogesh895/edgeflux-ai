import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { DecisionLogEntry } from "@/data/decisionsMock";

interface CompareDrawerProps {
  entries: [DecisionLogEntry, DecisionLogEntry] | null;
  onOpenChange: (open: boolean) => void;
}

export function CompareDrawer({ entries, onOpenChange }: CompareDrawerProps) {
  return (
    <Sheet open={!!entries} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        {entries ? (
          <>
            <SheetHeader>
              <SheetTitle className="text-lg">Compare decisions</SheetTitle>
              <SheetDescription>Side-by-side diff of inputs and outputs.</SheetDescription>
            </SheetHeader>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {entries.map((e, idx) => (
                <div key={e.id} className="flex flex-col gap-3 rounded-md border bg-muted/10 p-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      {idx === 0 ? "A" : "B"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(e.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{e.type}</div>
                    <div className="text-sm font-semibold">{e.action}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{e.decisionId}</div>
                  </div>
                  <Field label="Site" value={e.site.display_name} />
                  <Field label="Confidence" value={`${(e.confidence * 100).toFixed(1)}%`} />
                  <Field label="Model" value={e.modelVersion} mono />
                  <Field label="Features" value={e.featureVersion} mono />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Inputs
                    </span>
                    <pre className="overflow-x-auto rounded border bg-background/40 p-2 font-mono text-[10px] leading-relaxed">
                      {JSON.stringify(e.features, null, 2)}
                    </pre>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Output
                    </span>
                    <pre className="overflow-x-auto rounded border bg-background/40 p-2 font-mono text-[10px] leading-relaxed">
                      {JSON.stringify(e.output, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded border bg-background/30 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono font-medium" : "font-medium"}>{value}</span>
    </div>
  );
}
