import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SummaryTileProps {
  label: string;
  value: string;
  accentColor?: string;
  hint?: string;
  className?: string;
}

export function SummaryTile({ label, value, accentColor, hint, className }: SummaryTileProps) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {accentColor ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: accentColor }}
        />
      ) : null}
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className="text-2xl font-semibold tabular-nums"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {value}
        </span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}
