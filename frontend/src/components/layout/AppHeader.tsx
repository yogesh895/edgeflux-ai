import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ModelHealthPopover } from "@/components/ModelHealthPopover";
import { LiveBadge } from "@/components/LiveBadge";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="-ml-1" aria-label="Toggle sidebar" />
      <div className="flex flex-col leading-tight">
        <h1 className="text-base font-semibold tracking-tight">EdgeFlux AI</h1>
        <p className="hidden text-xs text-muted-foreground sm:block">
          ERCOT BTM Siting &amp; Dispatch
        </p>
      </div>
      <div className="ml-4 flex flex-1 justify-center">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-2">
        <LiveBadge />
        <ModelHealthPopover />
        <ThemeToggle />
      </div>
    </header>
  );
}
