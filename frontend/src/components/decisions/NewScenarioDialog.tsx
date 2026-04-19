import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import type { SavedScenario } from "@/data/decisionsMock";

interface NewScenarioDialogProps {
  baseP50Npv: number;
  baseProbLoss: number;
  onSave: (scenario: SavedScenario) => void;
}

export function NewScenarioDialog({ baseP50Npv, baseProbLoss, onSave }: NewScenarioDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gasShift, setGasShift] = useState(0);
  const [lmpShift, setLmpShift] = useState(0);
  const [heatImprovement, setHeatImprovement] = useState(0);

  const newP50 =
    baseP50Npv *
    (1 + lmpShift * 0.15) *
    (1 - gasShift * 0.08) *
    (1 + heatImprovement * 0.06);
  const newProbLoss = Math.min(
    1,
    Math.max(0, baseProbLoss - lmpShift * 0.008 + gasShift * 0.004),
  );
  const deltaP50M = (newP50 - baseP50Npv) / 1_000_000;
  const deltaLoss = newProbLoss - baseProbLoss;

  const reset = () => {
    setName("");
    setDescription("");
    setGasShift(0);
    setLmpShift(0);
    setHeatImprovement(0);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: `sc-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      creatorInitials: "ME",
      savedAt: new Date().toISOString(),
      delta_p50_npv_m: Math.round(deltaP50M * 10) / 10,
      delta_prob_loss: Math.round(deltaLoss * 1000) / 1000,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New scenario
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New scenario</DialogTitle>
          <DialogDescription>
            Define a what-if scenario. Preview deltas update live.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="scenario-name">Name</Label>
            <Input
              id="scenario-name"
              value={name}
              placeholder="e.g. Permian oversupply Q3"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scenario-desc">Description</Label>
            <Textarea
              id="scenario-desc"
              value={description}
              placeholder="Optional notes about assumptions"
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
            <ScenarioSlider
              label="Gas price shift"
              value={gasShift}
              min={-0.3}
              max={0.3}
              step={0.01}
              format={(v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`}
              onChange={setGasShift}
            />
            <ScenarioSlider
              label="LMP baseline shift"
              value={lmpShift}
              min={-10}
              max={10}
              step={0.5}
              format={(v) => `${v > 0 ? "+" : ""}$${v.toFixed(1)}`}
              onChange={setLmpShift}
            />
            <ScenarioSlider
              label="Heat rate improvement"
              value={heatImprovement}
              min={0}
              max={0.15}
              step={0.005}
              format={(v) => `${(v * 100).toFixed(1)}%`}
              onChange={setHeatImprovement}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PreviewStat
              label="Δ P50 NPV"
              value={`${deltaP50M >= 0 ? "+" : ""}$${deltaP50M.toFixed(1)}M`}
              positive={deltaP50M >= 0}
            />
            <PreviewStat
              label="Δ P(loss)"
              value={`${deltaLoss >= 0 ? "+" : ""}${(deltaLoss * 100).toFixed(2)}pp`}
              positive={deltaLoss <= 0}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save scenario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-muted-foreground">{format(value)}</span>
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

function PreviewStat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="text-lg font-semibold tabular-nums"
        style={{ color: positive ? "hsl(150 55% 50%)" : "hsl(0 72% 60%)" }}
      >
        {value}
      </div>
    </div>
  );
}
