import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startProspectRun,
  getProspectRun,
  approveProspect,
  discardProspect,
} from "@/lib/prospecting.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Check, X, ExternalLink, Bot } from "lucide-react";
import { toast } from "sonner";

type Prospect = {
  id: string;
  full_name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  email_confidence: string | null;
  discovery_url: string | null;
  discovery_notes: string | null;
  status: string;
};

type RunEvent = {
  id: string;
  kind: string;
  message: string;
  created_at: string;
};

const KIND_COLOR: Record<string, string> = {
  search: "text-blue-500",
  scrape: "text-amber-500",
  person: "text-emerald-500",
  message: "text-violet-500",
  error: "text-destructive",
  info: "text-muted-foreground",
};

export function ProspectAgentButton({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [targetCount, setTargetCount] = useState(5);
  const [seedInput, setSeedInput] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const qc = useQueryClient();

  const start = useServerFn(startProspectRun);
  const fetchRun = useServerFn(getProspectRun);
  const approveFn = useServerFn(approveProspect);
  const discardFn = useServerFn(discardProspect);

  const { data: runData } = useQuery({
    queryKey: ["prospect-run", activeRunId],
    queryFn: () => fetchRun({ data: { id: activeRunId! } }),
    enabled: !!activeRunId,
    refetchInterval: (q) => {
      const r = q.state.data?.run;
      if (!r) return 2000;
      return r.status === "running" || r.status === "queued" ? 2000 : false;
    },
  });

  const startMut = useMutation({
    mutationFn: () => {
      const seeds = seedInput
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return start({
        data: {
          campaign_id: campaignId,
          target_count: targetCount,
          seed_domains: seeds.length ? seeds : undefined,
        },
      });
    },
    onSuccess: (r) => {
      setActiveRunId(r.id);
      toast.success("Prospecting started");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to start"),
  });

  const approveMut = useMutation({
    mutationFn: (leadId: string) =>
      approveFn({ data: { lead_id: leadId, campaign_id: campaignId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect-run", activeRunId] });
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-messages", campaignId] });
      toast.success("Added to campaign");
    },
  });

  const discardMut = useMutation({
    mutationFn: (leadId: string) => discardFn({ data: { lead_id: leadId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect-run", activeRunId] });
    },
  });

  const run = runData?.run;
  const events = (runData?.events ?? []) as RunEvent[];
  const prospects = (runData?.prospects ?? []) as Prospect[];
  const isRunning = run?.status === "running" || run?.status === "queued";

  // Auto-invalidate campaign data when run completes so newly drafted messages show in the inspector
  useEffect(() => {
    if (run?.status === "completed") {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-messages", campaignId] });
    }
  }, [run?.status, campaignId, qc]);

  const resetForm = () => {
    setActiveRunId(null);
    setSeedInput("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setTimeout(resetForm, 300);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5">
          <Bot className="size-3.5" />
          Find prospects with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Autonomous Prospecting Agent
          </DialogTitle>
          <DialogDescription>
            The AI will search the web, research target companies, identify real people, guess
            their work emails, and draft personalized outreach — all without sending anything.
            You review and approve.
          </DialogDescription>
        </DialogHeader>

        {!activeRunId && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>How many prospects?</Label>
              <div className="flex gap-2">
                {[3, 5, 10].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={targetCount === n ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTargetCount(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Start small. A run of 5 takes about 1–3 minutes.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Seed company domains (optional)</Label>
              <Input
                placeholder="stripe.com, linear.app, vercel.com"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty and the agent will discover companies itself, based on the campaign's
                audience brief.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={startMut.isPending}
              onClick={() => startMut.mutate()}
            >
              {startMut.isPending ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="size-4 mr-2" />
              )}
              Start prospecting
            </Button>
          </div>
        )}

        {activeRunId && run && (
          <div className="space-y-4">
            {/* Status header */}
            <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/30">
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : run.status === "completed" ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <X className="size-4 text-destructive" />
                )}
                <span className="text-sm font-medium capitalize">{run.status}</span>
                <span className="text-xs text-muted-foreground">
                  · {run.discovered_count} of {run.target_count} found
                </span>
              </div>
              {!isRunning && (
                <Button size="sm" variant="ghost" onClick={resetForm}>
                  New run
                </Button>
              )}
            </div>

            {run.error && (
              <div className="p-3 text-xs border border-destructive/30 bg-destructive/5 text-destructive rounded-md">
                {run.error}
              </div>
            )}

            {/* Live event log */}
            <div className="border border-border rounded-md p-2 max-h-40 overflow-y-auto bg-card font-mono text-[11px] space-y-0.5">
              {events.length === 0 && (
                <div className="text-muted-foreground p-2">Waiting for activity…</div>
              )}
              {events.map((e) => (
                <div key={e.id} className="flex gap-2 px-1">
                  <span className={`shrink-0 uppercase ${KIND_COLOR[e.kind] ?? "text-muted-foreground"}`}>
                    {e.kind}
                  </span>
                  <span className="truncate">{e.message}</span>
                </div>
              ))}
            </div>

            {/* Prospect review */}
            {prospects.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Review prospects ({prospects.length})
                </h3>
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {prospects.map((p) => (
                    <div key={p.id} className="p-3 border border-border rounded-md bg-card space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{p.full_name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {p.title}
                            {p.company ? ` · ${p.company}` : ""}
                          </div>
                        </div>
                        {p.email_confidence && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] uppercase ${
                              p.email_confidence === "verified"
                                ? "border-emerald-500/40 text-emerald-600"
                                : p.email_confidence === "pattern"
                                ? "border-amber-500/40 text-amber-600"
                                : "border-muted-foreground/40 text-muted-foreground"
                            }`}
                          >
                            {p.email_confidence}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground truncate">
                        {p.email}
                      </div>
                      {p.discovery_notes && (
                        <div className="text-xs text-muted-foreground italic line-clamp-2">
                          "{p.discovery_notes}"
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        {p.discovery_url && (
                          <a
                            href={p.discovery_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          >
                            source <ExternalLink className="size-3" />
                          </a>
                        )}
                        <div className="ml-auto flex gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => discardMut.mutate(p.id)}
                            disabled={discardMut.isPending}
                          >
                            <X className="size-3 mr-1" /> Discard
                          </Button>
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={() => approveMut.mutate(p.id)}
                            disabled={approveMut.isPending}
                          >
                            <Check className="size-3 mr-1" /> Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
