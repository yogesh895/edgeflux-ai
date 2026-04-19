import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { SiteRisk } from "@/types";
import { cn } from "@/lib/utils";

interface ScenarioSlidersProps {
  risk: SiteRisk;
}

interface Scenario {
  gasShift: number; // -0.3 .. +0.3
  lmpShift: number; // -10 .. +10  $/MWh
  heatImprovement: number; // 0 .. 0.15
}

const DEFAULT: Scenario = { gasShift: 0, lmpShift: 0, heatImprovement: 0 };

export function ScenarioSliders({ risk }: ScenarioSlidersProps) {
  const [draft, setDraft] = useState<Scenario>(DEFAULT);
  const [applied, setApplied] = useState<Scenario>(DEFAULT);

  // 100ms debounce
  useEffect(() => {
    const t = setTimeout(() => setApplied(draft), 100);
    return () => clearTimeout(t);
  }, [draft]);

  const { newP50, newProbLoss } = useMemo(() => {
    const baseP50 = risk.p50_npv;
    const p50 =
      baseP50 *
      (1 + applied.lmpShift * 0.15) *
      (1 - applied.gasShift * 0.08) *
      (1 + applied.heatImprovement * 0.06);
    const probLoss = Math.min(
      1,
      Math.max(0, risk.prob_loss - applied.lmpShift * 0.008 + applied.gasShift * 0.004),
    );
    return { newP50: p50, newProbLoss: probLoss };
  }, [applied, risk]);

  const p50Delta = newP50 - risk.p50_npv;
  const lossDelta = newProbLoss - risk.prob_loss;

  return (
    <div className="flex flex-col gap-5">
      <SliderRow
        label="Gas price shift"
        value={draft.gasShift}
        min={-0.3}
        max={0.3}
        step={0.01}
        format={(v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`}
        onChange={(v) => setDraft((d) => ({ ...d, gasShift: v }))}
        onReset={() => setDraft((d) => ({ ...d, gasShift: 0 }))}
      />
      <SliderRow
        label="LMP baseline shift"
        value={draft.lmpShift}
        min={-10}
        max={10}
        step={0.5}
        format={(v) => `${v > 0 ? "+" : ""}$${v.toFixed(1)}/MWh`}
        onChange={(v) => setDraft((d) => ({ ...d, lmpShift: v }))}
        onReset={() => setDraft((d) => ({ ...d, lmpShift: 0 }))}
      />
      <SliderRow
        label="Heat rate improvement"
        value={draft.heatImprovement}
        min={0}
        max={0.15}
        step={0.005}
        format={(v) => `${(v * 100).toFixed(1)}%`}
        onChange={(v) => setDraft((d) => ({ ...d, heatImprovement: v }))}
        onReset={() => setDraft((d) => ({ ...d, heatImprovement: 0 }))}
      />

      <div className="mt-2 grid grid-cols-2 gap-3 border-t pt-4">
        <ScenarioStat
          label="New P50 NPV"
          value={`$${(newP50 / 1_000_000).toFixed(0)}M`}
          deltaLabel={`${p50Delta >= 0 ? "+" : ""}$${(p50Delta / 1_000_000).toFixed(1)}M`}
          positive={p50Delta > 0}
          neutral={Math.abs(p50Delta) < 1e5}
        />
        <ScenarioStat
          label="New P(loss)"
          value={`${(newProbLoss * 100).toFixed(1)}%`}
          deltaLabel={`${lossDelta >= 0 ? "+" : ""}${(lossDelta * 100).toFixed(2)}pp`}
          positive={lossDelta < 0}
          neutral={Math.abs(lossDelta) < 1e-4}
        />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:text-foreground"
        >
          {format(value)}
        </button>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

function ScenarioStat({
  label,
  value,
  deltaLabel,
  positive,
  neutral,
}: {
  label: string;
  value: string;
  deltaLabel: string;
  positive: boolean;
  neutral: boolean;
}) {
  const Icon = neutral ? ArrowRight : positive ? ArrowUp : ArrowDown;
  const tone = neutral
    ? "text-muted-foreground"
    : positive
      ? "text-[hsl(150_55%_50%)]"
      : "text-[hsl(0_72%_60%)]";
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/20 p-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className={cn("inline-flex items-center gap-1 text-xs font-medium", tone)}>
        <Icon className="h-3 w-3" />
        {deltaLabel}
      </span>
    </div>
  );
}
