import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";

const KEY = "edgeflux-onboarding-map-v1";

export function MapOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        setShow(true);
      }
    } catch {
      // localStorage unavailable — silently skip
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Map onboarding tip"
      className="fixed bottom-6 right-6 z-40 flex max-w-xs items-start gap-3 rounded-md border bg-popover p-3 text-xs shadow-md ge-page-in"
    >
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground">Tip</span>
        <p className="text-muted-foreground">
          Click any site to see its forecast and economics. Filter by load zone above.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="self-start text-[11px] font-medium text-primary transition-colors hover:underline"
        >
          Got it
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
