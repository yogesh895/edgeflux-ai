import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Wraps a route's content in a subtle slide-in animation when the path changes.
 * Uses a key on the wrapper so React remounts and re-runs the CSS animation.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="ge-page-in flex flex-1 flex-col">
      {children}
    </div>
  );
}
