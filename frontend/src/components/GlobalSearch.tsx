import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { LOAD_ZONES, type LoadZone } from "@/lib/scoring";
import { getSites, queryKeys } from "@/lib/api";
import type { Site } from "@/types";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const sitesQuery = useQuery({ queryKey: queryKeys.sites, queryFn: getSites });
  const sites: Site[] = sitesQuery.data ?? [];

  // Cmd+K / Ctrl+K opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sitesByZone = useMemo(() => {
    const map = new Map<LoadZone, Site[]>();
    LOAD_ZONES.forEach((z) => map.set(z, []));
    sites.forEach((s) => {
      const list = map.get(s.load_zone);
      if (list) list.push(s);
    });
    return map;
  }, [sites]);

  const go = (siteId: string) => {
    setOpen(false);
    navigate({ to: "/site/$siteId", params: { siteId } });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open global search (Cmd+K)"
        className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring sm:flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search sites, zones…</span>
        <kbd className="hidden items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground md:inline-flex">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted/50 sm:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search by site name, ID, or load zone…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {LOAD_ZONES.map((zone) => {
            const zoneSites = sitesByZone.get(zone) ?? [];
            if (zoneSites.length === 0) return null;
            return (
              <CommandGroup key={zone} heading={`${zone} zone`}>
                {zoneSites.map((s) => (
                  <CommandItem
                    key={s.site_id}
                    value={`${s.display_name} ${s.site_id} ${s.load_zone} ${s.settlement_point}`}
                    onSelect={() => go(s.site_id)}
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{s.display_name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {s.site_id} · {s.settlement_point}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {s.capacity_mw} MW
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
