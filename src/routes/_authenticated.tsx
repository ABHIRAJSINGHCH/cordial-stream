import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ensureWorkspace } from "@/lib/workspace.functions";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Layers, Users, BarChart3, Settings, Menu, LogOut, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  component: AuthenticatedLayout,
});

const NAV = [
  { to: "/campaigns", label: "Campaigns", icon: Layers },
  { to: "/leads", label: "Lead Engine", icon: Users },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthenticatedLayout() {
  const ensure = useServerFn(ensureWorkspace);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

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
      <aside className="hidden md:flex w-60 border-r border-border flex-col bg-sidebar shrink-0">
        <SidebarBody workspaceName={workspace?.name ?? "Workspace"} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SidebarBody workspaceName={workspace?.name ?? "Workspace"} onNav={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="md:hidden h-12 border-b border-border flex items-center px-3 gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="size-4" />
          </Button>
          <span className="font-semibold text-sm tracking-tight">KINETIC OS</span>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

function SidebarBody({ workspaceName, onNav }: { workspaceName: string; onNav?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signOut = async () => {
    await supabase.auth.signOut();
  };
  return (
    <>
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <div className="size-6 bg-foreground rounded grid place-items-center shrink-0">
          <div className="size-2 rounded-full bg-background" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold tracking-tight text-sm">KINETIC OS</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">
            {workspaceName}
          </span>
        </div>
      </div>

      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        <div className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          Operational
        </div>
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              onClick={onNav}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors",
                active
                  ? "bg-sidebar-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        <div className="px-3 pt-4 pb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          AI Engine
        </div>
        <div className="px-3 py-2 flex items-center gap-2.5 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-ai" />
          Personalization
          <span className="ml-auto font-mono text-[10px] text-emerald-600">live</span>
        </div>
      </nav>

      <div className="p-3 border-t border-border">
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-sidebar-accent"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </>
  );
}
