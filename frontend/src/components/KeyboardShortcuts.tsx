import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

const NAV_KEYS: Record<string, "/map" | "/risk" | "/dispatch" | "/decisions" | "/site/$siteId"> = {
  "1": "/map",
  "2": "/site/$siteId",
  "3": "/risk",
  "4": "/dispatch",
  "5": "/decisions",
};

/**
 * Global keyboard shortcuts:
 * - 1/2/3/4/5 — navigate to sidebar items (when not typing in an input)
 * - Esc closes any open drawer/dialog (handled natively by Radix)
 * Cmd+K is handled inside GlobalSearch.
 */
export function KeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack while user types
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const route = NAV_KEYS[e.key];
      if (!route) return;
      e.preventDefault();
      if (route === "/site/$siteId") {
        navigate({ to: route, params: { siteId: "s06" } });
      } else {
        navigate({ to: route });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return null;
}
