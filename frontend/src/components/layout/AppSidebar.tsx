import { Link, useLocation } from "@tanstack/react-router";
import { Map, Building2, ShieldAlert, Zap, ClipboardCheck, Activity } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { key: "1", title: "Map", icon: Map, to: "/map" as const },
  { key: "2", title: "Site Detail", icon: Building2, to: "/site/$siteId" as const, params: { siteId: "s06" } },
  { key: "3", title: "Risk", icon: ShieldAlert, to: "/risk" as const },
  { key: "4", title: "Dispatch", icon: Zap, to: "/dispatch" as const },
  { key: "5", title: "Decisions", icon: ClipboardCheck, to: "/decisions" as const },
];

export function AppSidebar() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">EdgeFlux AI</span>
            <span className="text-[11px] text-muted-foreground">ERCOT BTM Platform</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  (item.to === "/map" && (path === "/" || path === "/map")) ||
                  (item.to === "/site/$siteId" && path.startsWith("/site/")) ||
                  (item.to !== "/map" && item.to !== "/site/$siteId" && path === item.to);
                const tooltip = `${item.title} (press ${item.key})`;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active} tooltip={tooltip}>
                      {item.to === "/site/$siteId" ? (
                        <Link to="/site/$siteId" params={item.params!} aria-label={item.title}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          <kbd className="ml-auto hidden rounded border bg-muted px-1 text-[9px] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden md:inline">
                            {item.key}
                          </kbd>
                        </Link>
                      ) : (
                        <Link to={item.to} aria-label={item.title}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          <kbd className="ml-auto hidden rounded border bg-muted px-1 text-[9px] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden md:inline">
                            {item.key}
                          </kbd>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
