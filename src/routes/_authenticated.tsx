import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ensureWorkspace } from "@/lib/workspace.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  Inbox,
  Layers,
  Users,
  BarChart3,
  Settings,
  Menu,
  LogOut,
  Sparkles,
  LayoutDashboard,
  Plug,
  Sun,
  Moon,
  Search,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  component: () => (
    <ThemeProvider>
      <AuthenticatedLayout />
    </ThemeProvider>
  ),
});

const PRIMARY_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: Layers },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

const SECONDARY_NAV = [
  { to: "/ai-engine", label: "AI Engine", icon: Sparkles },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthenticatedLayout() {
  const ensure = useServerFn(ensureWorkspace);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: () => ensure(),
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/login" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 bg-sidebar border-r border-sidebar-border transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <SidebarBody
          workspaceName={workspace?.name ?? "Workspace"}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 border-r border-sidebar-border">
          <SidebarBody
            workspaceName={workspace?.name ?? "Workspace"}
            collapsed={false}
            onNav={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onOpenMobile={() => setMobileOpen(true)} workspaceName={workspace?.name ?? "Workspace"} />
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function TopBar({ onOpenMobile, workspaceName }: { onOpenMobile: () => void; workspaceName: string }) {
  const { resolved, setTheme } = useTheme();
  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center px-4 gap-3 shrink-0">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobile}>
        <Menu className="size-5" />
      </Button>
      <div className="hidden md:flex items-center gap-2 text-sm">
        <span className="font-display font-semibold tracking-tight">{workspaceName}</span>
      </div>
      <div className="flex-1 max-w-md mx-auto hidden sm:flex">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            placeholder="Search leads, campaigns, messages…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted text-sm placeholder:text-muted-foreground border border-transparent focus:border-ring focus:bg-background focus:outline-none transition"
          />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}

function NavItem({
  to,
  label,
  Icon,
  active,
  collapsed,
  onNav,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  onNav?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNav}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition relative",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
      title={collapsed ? label : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
      )}
      <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function SidebarBody({
  workspaceName,
  collapsed,
  onNav,
  onToggle,
}: {
  workspaceName: string;
  collapsed: boolean;
  onNav?: () => void;
  onToggle?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
  const signOut = async () => {
    await supabase.auth.signOut();
  };
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={cn("h-14 px-3 flex items-center border-b border-sidebar-border", collapsed && "justify-center")}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-lg bg-gradient-primary grid place-items-center shrink-0 shadow-elevation-2">
            <Sparkles className="size-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-display font-semibold text-sm leading-tight tracking-tight">Kinetic</span>
              <span className="text-[11px] text-muted-foreground truncate">{workspaceName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div className="space-y-0.5">
          {!collapsed && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace
            </div>
          )}
          {PRIMARY_NAV.map((n) => (
            <NavItem
              key={n.to}
              to={n.to}
              label={n.label}
              Icon={n.icon}
              active={isActive(n.to)}
              collapsed={collapsed}
              onNav={onNav}
            />
          ))}
        </div>

        <div className="space-y-0.5">
          {!collapsed && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              System
            </div>
          )}
          {SECONDARY_NAV.map((n) => (
            <NavItem
              key={n.to}
              to={n.to}
              label={n.label}
              Icon={n.icon}
              active={isActive(n.to)}
              collapsed={collapsed}
              onNav={onNav}
            />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        <button
          onClick={signOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition",
            collapsed && "justify-center",
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="size-[18px] shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              "hidden md:flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition",
              collapsed && "justify-center",
            )}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </div>
  );
}
