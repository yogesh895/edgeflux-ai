import { Dot } from "lucide-react";

export function AppFooter() {
  return (
    <footer
      className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 border-t px-4 py-3 text-[11px] text-muted-foreground"
      role="contentinfo"
    >
      <span className="font-medium text-foreground">EdgeFlux AI</span>
      <Dot className="h-3 w-3" aria-hidden />
      <span>ERCOT day-ahead hourly LMP forecasting</span>
      <Dot className="h-3 w-3" aria-hidden />
      <span className="font-mono">v0.1.0</span>
      <Dot className="h-3 w-3" aria-hidden />
      <span>Built for Collide 2026</span>
    </footer>
  );
}
