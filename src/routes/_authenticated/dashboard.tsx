import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCampaigns } from "@/lib/campaigns.functions";
import { listLeads } from "@/lib/leads.functions";
import { getWorkspaceAnalytics } from "@/lib/analytics.functions";
import { Layers, Users, Send, MessageSquare, ArrowUpRight, Sparkles, Plug } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Kinetic" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchCampaigns = useServerFn(listCampaigns);
  const fetchLeads = useServerFn(listLeads);
  const fetchAnalytics = useServerFn(getWorkspaceAnalytics);

  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns() });
  const leads = useQuery({ queryKey: ["leads"], queryFn: () => fetchLeads() });
  const analytics = useQuery({
    queryKey: ["analytics", "overview", 30],
    queryFn: () => fetchAnalytics({ data: { days: 30 } }),
  });

  const campaignCount = campaigns.data?.length ?? 0;
  const activeCampaignCount = campaigns.data?.filter((c) => c.status === "active").length ?? 0;
  const leadCount = leads.data?.length ?? 0;
  const sent = analytics.data?.kpis?.sent ?? 0;
  const replies = analytics.data?.kpis?.replied ?? 0;
  const replyRate = sent > 0 ? ((replies / sent) * 100).toFixed(1) : "0.0";

  const stats = [
    { label: "Active campaigns", value: activeCampaignCount, hint: `${campaignCount} total`, Icon: Layers, color: "text-primary" },
    { label: "Leads", value: leadCount.toLocaleString(), hint: "in workspace", Icon: Users, color: "text-violet-500" },
    { label: "Messages sent", value: sent.toLocaleString(), hint: "last 30 days", Icon: Send, color: "text-emerald-500" },
    { label: "Reply rate", value: `${replyRate}%`, hint: `${replies} replies`, Icon: MessageSquare, color: "text-amber-500" },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in-up">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your outreach operation, updated live.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/integrations"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition"
          >
            <Plug className="size-4" />
            Connect tools
          </Link>
          <Link
            to="/campaigns"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-[var(--primary-hover)] transition"
          >
            New campaign
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, hint, Icon, color }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-5 shadow-elevation-1 hover:shadow-elevation-2 transition"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
              <Icon className={`size-4 ${color}`} />
            </div>
            <div className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">Recent campaigns</h2>
            <Link to="/campaigns" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 divide-y divide-border">
            {(campaigns.data ?? []).slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to="/campaigns/$id"
                params={{ id: c.id }}
                className="flex items-center justify-between py-3 group"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate group-hover:text-primary transition">
                    {c.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{c.goal ?? "No goal set"}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md bg-muted text-muted-foreground">
                  {c.status}
                </span>
              </Link>
            ))}
            {(campaigns.data ?? []).length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No campaigns yet — <Link to="/campaigns" className="text-primary font-medium hover:underline">create your first</Link>.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-elevation-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-display text-lg font-semibold tracking-tight">AI Engine</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Personalization, research, and reply triage are running on Lovable AI Gateway.
          </p>
          <Link
            to="/ai-engine"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Open AI Engine
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
