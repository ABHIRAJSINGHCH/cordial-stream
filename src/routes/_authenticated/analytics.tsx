import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getWorkspaceAnalytics } from "@/lib/analytics.functions";
import { useState } from "react";
import { BarChart3, Send, Reply, Users, Sparkles, Clock } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Kinetic OS" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [range, setRange] = useState<7 | 30>(30);
  const fn = useServerFn(getWorkspaceAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => fn({ data: { days: range } }),
  });

  return (
    <>
      <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 bg-card">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold tracking-tight text-sm">Analytics</h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            workspace-wide
          </span>
        </div>
        <div className="flex items-center gap-1 border border-border rounded-md p-0.5 bg-muted/30">
          {[7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setRange(d as 7 | 30)}
              className={`px-3 h-7 text-xs rounded ${
                range === d
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={<Send className="size-3.5" />}
              label="Messages sent"
              value={data?.kpis.sent ?? 0}
              loading={isLoading}
            />
            <Kpi
              icon={<Reply className="size-3.5" />}
              label="Reply rate"
              value={`${((data?.kpis.reply_rate ?? 0) * 100).toFixed(1)}%`}
              loading={isLoading}
            />
            <Kpi
              icon={<Users className="size-3.5" />}
              label="Leads added"
              value={data?.kpis.leads ?? 0}
              loading={isLoading}
            />
            <Kpi
              icon={<Sparkles className="size-3.5" />}
              label="Leads enriched"
              value={data?.kpis.enriched ?? 0}
              loading={isLoading}
            />
          </div>

          {/* Chart */}
          <div
            className="border border-border rounded-lg bg-card p-5"
            style={{ boxShadow: "var(--shadow-elevation-1)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium tracking-tight">Sends vs replies</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                  Last {range} days
                </div>
              </div>
              <BarChart3 className="size-4 text-muted-foreground" />
            </div>
            <div className="h-64">
              {isLoading || !data ? (
                <div className="h-full grid place-items-center text-xs text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.timeseries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.205 0 0 / 0.06)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sent"
                      stroke="oklch(0.205 0 0)"
                      strokeWidth={2}
                      dot={false}
                      name="Sent"
                    />
                    <Line
                      type="monotone"
                      dataKey="replied"
                      stroke="oklch(0.55 0.2 252)"
                      strokeWidth={2}
                      dot={false}
                      name="Replied"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top campaigns */}
          <div
            className="border border-border rounded-lg bg-card overflow-hidden"
            style={{ boxShadow: "var(--shadow-elevation-1)" }}
          >
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-medium">Top campaigns</div>
              <Clock className="size-3.5 text-muted-foreground" />
            </div>
            {(!data || data.topCampaigns.length === 0) && !isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No campaign activity in this range yet.
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-[1fr_auto_auto_auto] px-5 py-2 border-b border-border bg-muted/30 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <span>Campaign</span>
                  <span className="px-3 text-right">Sent</span>
                  <span className="px-3 text-right">Replied</span>
                  <span className="pl-3 text-right">Reply %</span>
                </div>
                {(data?.topCampaigns ?? []).map((c) => (
                  <div
                    key={c.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-3 border-b border-border last:border-0 text-sm"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="px-3 text-right font-mono text-xs">{c.sent}</span>
                    <span className="px-3 text-right font-mono text-xs">{c.replied}</span>
                    <span className="pl-3 text-right font-mono text-xs text-ai">
                      {(c.reply_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  loading?: boolean;
}) {
  return (
    <div
      className="border border-border rounded-lg bg-card p-4"
      style={{ boxShadow: "var(--shadow-elevation-1)" }}
    >
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span className="text-foreground">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {loading ? "—" : value}
      </div>
    </div>
  );
}
