import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAiJobs } from "@/lib/analytics.functions";
import { Sparkles, Cpu, Activity, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/ai-engine")({
  head: () => ({ meta: [{ title: "AI Engine — Kinetic OS" }] }),
  component: AiEnginePage,
});

function AiEnginePage() {
  const fn = useServerFn(getAiJobs);
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["ai-jobs"],
    queryFn: () => fn(),
  });

  const success = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const running = jobs.filter((j) => j.status === "running" || j.status === "pending").length;

  return (
    <>
      <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 bg-card">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold tracking-tight text-sm">AI Engine</h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Gemini 2.5 · Lovable AI Gateway
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            live
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Engine cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <EngineCard
              icon={<Cpu className="size-4 text-ai" />}
              title="Reasoning model"
              value="google/gemini-2.5-pro"
              sub="Complex enrichment + long-context drafting"
            />
            <EngineCard
              icon={<Sparkles className="size-4 text-ai" />}
              title="Drafting model"
              value="google/gemini-2.5-flash"
              sub="Per-message personalization at scale"
            />
            <EngineCard
              icon={<Activity className="size-4 text-ai" />}
              title="Auto-approve threshold"
              value="0.85"
              sub="Messages above this confidence ship without review"
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={<CheckCircle2 className="size-3.5 text-emerald-600" />} label="Completed" value={success} />
            <Stat icon={<Clock className="size-3.5 text-amber-600" />} label="Running" value={running} />
            <Stat icon={<AlertCircle className="size-3.5 text-destructive" />} label="Failed" value={failed} />
          </div>

          {/* Recent jobs */}
          <div
            className="border border-border rounded-lg bg-card overflow-hidden"
            style={{ boxShadow: "var(--shadow-elevation-1)" }}
          >
            <div className="px-5 py-3 border-b border-border">
              <div className="text-sm font-medium">Recent jobs</div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                Last 25 — enrichment, drafting, classification
              </div>
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : jobs.length === 0 ? (
              <div className="p-12 text-center">
                <Sparkles className="mx-auto size-6 text-muted-foreground/40 mb-3" />
                <div className="text-sm font-medium">No AI activity yet</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Trigger lead enrichment or generate a message to see jobs here.
                </p>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-[1fr_auto_auto_auto] px-5 py-2 border-b border-border bg-muted/30 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <span>Kind</span>
                  <span className="px-3">Status</span>
                  <span className="px-3">Duration</span>
                  <span className="pl-3">When</span>
                </div>
                {jobs.map((j) => {
                  const dur =
                    j.finished_at && j.created_at
                      ? `${Math.max(0, Math.round((new Date(j.finished_at).getTime() - new Date(j.created_at).getTime()) / 100) / 10)}s`
                      : "—";
                  return (
                    <div
                      key={j.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-2.5 border-b border-border last:border-0 text-sm"
                    >
                      <span className="font-mono text-xs">{j.kind}</span>
                      <JobStatus status={j.status} />
                      <span className="px-3 font-mono text-xs text-muted-foreground">{dur}</span>
                      <span className="pl-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EngineCard({
  icon,
  title,
  value,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="border border-border rounded-lg bg-card p-4 space-y-2"
      style={{ boxShadow: "var(--shadow-elevation-1)" }}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="font-mono text-sm text-foreground truncate">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div
      className="border border-border rounded-lg bg-card p-4 flex items-center gap-3"
      style={{ boxShadow: "var(--shadow-elevation-1)" }}
    >
      <div className="size-8 rounded-md bg-muted grid place-items-center">{icon}</div>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function JobStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    done: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
    running: "bg-ai-soft text-ai border-ai/20",
    pending: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  };
  return (
    <span
      className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border ${
        map[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {status}
    </span>
  );
}
