import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCampaigns, createCampaign } from "@/lib/campaigns.functions";
import { ensureWorkspace } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Layers } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Kinetic OS" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const list = useServerFn(listCampaigns);
  const create = useServerFn(createCampaign);
  const ensure = useServerFn(ensureWorkspace);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: workspace } = useQuery({ queryKey: ["workspace"], queryFn: () => ensure() });
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => list(),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("No workspace");
      return create({ data: { workspace_id: workspace.id, name, goal: goal || undefined } });
    },
    onSuccess: (c) => {
      toast.success("Campaign created");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
      setName("");
      setGoal("");
      navigate({ to: "/campaigns/$id", params: { id: c.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold tracking-tight text-sm">Campaigns</h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {campaigns.length} total
          </span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8">
              <Plus className="size-3.5 mr-1.5" /> New campaign
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q1 Enterprise Growth"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal">Goal (optional)</Label>
                <Textarea
                  id="goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Book intro calls with VPs of Engineering at Series B+ SaaS companies"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => mut.mutate()}
                disabled={!name.trim() || mut.isPending}
              >
                {mut.isPending ? "Creating..." : "Create campaign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg border border-border animate-pulse bg-muted/30" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <EmptyState onCreate={() => setOpen(true)} />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="grid grid-cols-[1fr_auto_auto_auto] px-4 py-2 border-b border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>Campaign</span>
                <span className="px-4">Status</span>
                <span className="px-4">Tone</span>
                <span className="pl-4">Created</span>
              </div>
              {campaigns.map((c) => (
                <Link
                  key={c.id}
                  to="/campaigns/$id"
                  params={{ id: c.id }}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center px-4 py-3 border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    {c.goal && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{c.goal}</div>
                    )}
                  </div>
                  <StatusPill status={c.status} />
                  <span className="px-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {c.default_tone}
                  </span>
                  <span className="pl-4 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "active"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
      : status === "paused"
        ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
        : status === "completed"
          ? "bg-muted text-muted-foreground border-border"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`mx-4 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border ${color}`}
    >
      {status}
    </span>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border border-dashed border-border rounded-lg p-12 text-center">
      <div className="mx-auto size-10 rounded-md bg-muted grid place-items-center mb-4">
        <Layers className="size-5 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No campaigns yet</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        Create your first outreach sequence. Add leads, define steps, and let the AI personalize
        every message with full transparency.
      </p>
      <Button onClick={onCreate} className="mt-6">
        <Plus className="size-3.5 mr-1.5" />
        Create your first campaign
      </Button>
    </div>
  );
}
