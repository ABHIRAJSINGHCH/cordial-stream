import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCampaign,
  upsertStep,
  deleteStep,
  generateMessage,
  listMessages,
  updateMessageStatus,
  addLeadsToCampaign,
  campaignAnalytics,
} from "@/lib/campaigns.functions";
import { sendApprovedMessage } from "@/lib/gmail.functions";
import { listLeads } from "@/lib/leads.functions";
import { ensureWorkspace } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Plus, Trash2, Mail, Linkedin, Hand, Check, X, ChevronLeft, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign — Kinetic OS" }] }),
  component: CampaignEditor,
});

const CHANNEL_ICON = { email: Mail, linkedin: Linkedin, manual: Hand } as const;

function CampaignEditor() {
  const { id } = Route.useParams();
  const get = useServerFn(getCampaign);
  const ensure = useServerFn(ensureWorkspace);
  const analytics = useServerFn(campaignAnalytics);
  const listMsgs = useServerFn(listMessages);

  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: () => ensure() });
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => get({ data: { id } }),
  });
  const { data: stats } = useQuery({
    queryKey: ["campaign-analytics", id],
    queryFn: () => analytics({ data: { campaign_id: id } }),
  });
  const { data: messages = [] } = useQuery({
    queryKey: ["campaign-messages", id],
    queryFn: () => listMsgs({ data: { campaign_id: id } }),
  });

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  const { campaign, steps, leads } = data;
  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? steps[0];

  return (
    <>
      <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/campaigns" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" />
          </Link>
          <h1 className="text-sm font-semibold tracking-tight truncate">{campaign.name}</h1>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground capitalize">{campaign.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <MetricsStrip stats={stats} />
          {ws && <AddLeadsDialog campaignId={id} workspaceId={ws.id} attachedIds={leads.map((l) => l.lead_id)} />}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sequence builder */}
        <section className="flex-1 overflow-y-auto p-6 md:p-8 bg-background">
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Sequence
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Define the cadence — every step generates a personalized message per lead.
              </p>
            </div>

            {steps.map((s, idx) => (
              <StepCard
                key={s.id}
                step={s}
                index={idx}
                campaignId={id}
                workspaceId={campaign.workspace_id}
                selected={s.id === selectedStep?.id}
                onSelect={() => setSelectedStepId(s.id)}
              />
            ))}

            <AddStepCard
              campaignId={id}
              workspaceId={campaign.workspace_id}
              position={(steps.at(-1)?.position ?? 0) + 1}
            />
          </div>
        </section>

        {/* Inspector */}
        <aside className="hidden lg:flex w-96 border-l border-border bg-muted/30 flex-col overflow-y-auto shrink-0">
          <AIInspector
            step={selectedStep}
            campaignLeads={leads}
            messages={messages}
            campaignId={id}
          />
        </aside>
      </div>
    </>
  );
}

function MetricsStrip({ stats }: { stats?: { total: number; sent: number; pending: number; replied: number } }) {
  const items = [
    ["Total", stats?.total ?? 0],
    ["Sent", stats?.sent ?? 0],
    ["Reply", stats?.replied ?? 0],
  ] as const;
  return (
    <div className="hidden md:flex items-center px-3 py-1.5 border border-border rounded-md gap-4">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Metrics</span>
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col leading-tight">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{k}</span>
          <span className="text-xs font-bold">{v}</span>
        </div>
      ))}
    </div>
  );
}

type Step = {
  id: string;
  position: number;
  channel: "email" | "linkedin" | "manual";
  wait_days: number;
  subject_template: string | null;
  body_template: string | null;
};

function StepCard({
  step,
  index,
  campaignId,
  workspaceId,
  selected,
  onSelect,
}: {
  step: Step;
  index: number;
  campaignId: string;
  workspaceId: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const upsert = useServerFn(upsertStep);
  const del = useServerFn(deleteStep);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(step.subject_template ?? "");
  const [body, setBody] = useState(step.body_template ?? "");
  const [wait, setWait] = useState(step.wait_days);
  const Icon = CHANNEL_ICON[step.channel];

  const save = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: step.id,
          campaign_id: campaignId,
          workspace_id: workspaceId,
          position: step.position,
          channel: step.channel,
          wait_days: wait,
          subject_template: subject || null,
          body_template: body || null,
        },
      }),
    onSuccess: () => {
      toast.success("Step saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });

  const remove = useMutation({
    mutationFn: () => del({ data: { id: step.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });

  return (
    <div className="relative pl-8 animate-in-up" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
      <div
        className={`absolute left-[-4px] top-3 size-2 rounded-full ${
          selected ? "bg-foreground" : "border-2 border-border bg-background"
        }`}
      />
      <div
        onClick={onSelect}
        className={`p-4 border rounded-lg cursor-pointer transition-all bg-card ${
          selected ? "border-foreground/20 ring-1 ring-foreground/5" : "border-border hover:border-foreground/10"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Step {String(step.position).padStart(2, "0")} / Day {step.wait_days}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-muted text-[10px] font-medium uppercase tracking-wider rounded inline-flex items-center gap-1">
              <Icon className="size-3" />
              {step.channel}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                remove.mutate();
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
        {editing ? (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            {step.channel === "email" && (
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="text-sm"
              />
            )}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Hi {{first_name}}..."
              className="text-sm font-mono"
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs">Wait days:</Label>
              <Input
                type="number"
                min={0}
                max={60}
                value={wait}
                onChange={(e) => setWait(Number(e.target.value))}
                className="w-20 h-8"
              />
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => save.mutate()}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {step.subject_template && (
              <h3 className="text-sm font-semibold mb-1">{step.subject_template}</h3>
            )}
            <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
              {step.body_template || "Click to add message"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddStepCard({
  campaignId,
  workspaceId,
  position,
}: {
  campaignId: string;
  workspaceId: string;
  position: number;
}) {
  const upsert = useServerFn(upsertStep);
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          campaign_id: campaignId,
          workspace_id: workspaceId,
          position,
          channel: "email",
          wait_days: 2,
          subject_template: "Following up",
          body_template: "Hi {{first_name}}, wanted to circle back...",
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });
  return (
    <div className="relative pl-8">
      <div className="absolute left-0 top-0 bottom-0 w-px border-l border-dashed border-border" />
      <div className="absolute left-[-4px] top-3 size-2 rounded-full border-2 border-border bg-background" />
      <button
        onClick={() => add.mutate()}
        className="w-full p-6 border border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 hover:bg-muted/40 transition-colors group"
      >
        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
          + Add step to sequence
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Wait 2 days
        </span>
      </button>
    </div>
  );
}

type CampaignLead = {
  id: string;
  state: string;
  lead_id: string;
  leads: { id: string; full_name: string; title: string | null; company: string | null; email: string | null; status: string } | null;
};

type Message = {
  id: string;
  subject: string | null;
  body: string | null;
  ai_reasoning: string[];
  ai_confidence: number | null;
  status: string;
  campaign_leads?: { leads?: { full_name: string; company: string | null } | null } | null;
};

function AIInspector({
  step,
  campaignLeads,
  messages,
  campaignId,
}: {
  step?: Step;
  campaignLeads: CampaignLead[];
  messages: Message[];
  campaignId: string;
}) {
  const gen = useServerFn(generateMessage);
  const update = useServerFn(updateMessageStatus);
  const qc = useQueryClient();
  const firstLead = campaignLeads[0];

  const generate = useMutation({
    mutationFn: () => {
      if (!step || !firstLead) throw new Error("Add a lead and a step first");
      return gen({ data: { campaign_lead_id: firstLead.id, step_id: step.id } });
    },
    onSuccess: () => {
      toast.success("AI message generated");
      qc.invalidateQueries({ queryKey: ["campaign-messages", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-analytics", campaignId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const decide = useMutation({
    mutationFn: (vars: { id: string; status: "approved" | "skipped" }) =>
      update({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-messages", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-analytics", campaignId] });
    },
  });

  const send = useServerFn(sendApprovedMessage);
  const sendNow = useMutation({
    mutationFn: (id: string) => send({ data: { message_id: id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Sent.");
      else toast.error(r.error);
      qc.invalidateQueries({ queryKey: ["campaign-messages", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-analytics", campaignId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  return (
    <div className="flex flex-col">
      <div className="p-5 border-b border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-4 bg-ai rounded-sm" />
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest">AI Reasoning Engine</h2>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={generate.isPending || !firstLead || !step}
            onClick={() => generate.mutate()}
          >
            <Sparkles className="size-3 mr-1" />
            {generate.isPending ? "Generating..." : "Generate"}
          </Button>
        </div>
        {!firstLead && (
          <div className="text-xs text-muted-foreground p-3 border border-dashed border-border rounded-md">
            Add leads to this campaign to generate personalized messages.
          </div>
        )}
      </div>

      <div className="p-5 space-y-3 flex-1">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest">Approval Queue</h3>
        {messages.filter((m) => m.status === "pending_approval").length === 0 && (
          <div className="text-xs text-muted-foreground">No messages awaiting approval.</div>
        )}
        {messages
          .filter((m) => m.status === "pending_approval")
          .slice(0, 6)
          .map((m) => (
            <div key={m.id} className="p-3 bg-card border border-border rounded-md space-y-2 animate-in-up">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate">
                  {m.campaign_leads?.leads?.full_name ?? "Lead"}
                </span>
                {typeof m.ai_confidence === "number" && (
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {Math.round(m.ai_confidence * 100)}% conf
                  </span>
                )}
              </div>
              {m.subject && <div className="text-xs font-semibold truncate">{m.subject}</div>}
              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{m.body}</p>
              {m.ai_reasoning?.length > 0 && (
                <div className="bg-ai-soft border-l-2 border-ai p-2 rounded-r">
                  <div className="font-mono text-[9px] text-ai uppercase tracking-widest mb-1">
                    why_this_message
                  </div>
                  <ul className="space-y-0.5">
                    {m.ai_reasoning.slice(0, 3).map((r, i) => (
                      <li key={i} className="text-[11px] leading-relaxed">
                        — {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs"
                  onClick={() => decide.mutate({ id: m.id, status: "skipped" })}
                >
                  <X className="size-3 mr-1" /> Skip
                </Button>
                <Button
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={() => decide.mutate({ id: m.id, status: "approved" })}
                >
                  <Check className="size-3 mr-1" /> Approve
                </Button>
              </div>
            </div>
          ))}

        {messages.filter((m) => m.status === "approved" && m.channel === "email").length > 0 && (
          <>
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest pt-2">
              Ready to send
            </h3>
            {messages
              .filter((m) => m.status === "approved" && m.channel === "email")
              .slice(0, 6)
              .map((m) => (
                <div
                  key={m.id}
                  className="p-3 bg-card border border-border rounded-md space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate">
                      {m.campaign_leads?.leads?.full_name ?? "Lead"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {m.campaign_leads?.leads?.email ?? "no email"}
                    </span>
                  </div>
                  {m.subject && (
                    <div className="text-xs font-semibold truncate">{m.subject}</div>
                  )}
                  <Button
                    size="sm"
                    className="h-7 w-full text-xs"
                    disabled={sendNow.isPending}
                    onClick={() => sendNow.mutate(m.id)}
                  >
                    <Send className="size-3 mr-1" /> Send now via Gmail
                  </Button>
                </div>
              ))}
            <p className="text-[10px] text-muted-foreground">
              Sending uses the Gmail account you connected in{" "}
              <Link to="/settings" className="underline">
                Settings
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function AddLeadsDialog({
  campaignId,
  workspaceId,
  attachedIds,
}: {
  campaignId: string;
  workspaceId: string;
  attachedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = useServerFn(listLeads);
  const add = useServerFn(addLeadsToCampaign);
  const qc = useQueryClient();
  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: () => list(),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () =>
      add({
        data: {
          campaign_id: campaignId,
          workspace_id: workspaceId,
          lead_ids: Array.from(selected),
        },
      }),
    onSuccess: () => {
      toast.success(`Added ${selected.size} leads`);
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      setSelected(new Set());
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus className="size-3.5 mr-1.5" /> Add leads
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add leads to campaign</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {leads.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No leads yet. <Link to="/leads" className="underline">Create some →</Link>
            </div>
          )}
          {leads.map((l) => {
            const attached = attachedIds.includes(l.id);
            const checked = selected.has(l.id) || attached;
            return (
              <label key={l.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40">
                <Checkbox
                  checked={checked}
                  disabled={attached}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v) next.add(l.id);
                    else next.delete(l.id);
                    setSelected(next);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{l.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {l.title}{l.title && l.company ? " · " : ""}{l.company}
                  </div>
                </div>
                {attached && (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    Added
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button disabled={selected.size === 0 || save.isPending} onClick={() => save.mutate()}>
            Add {selected.size} {selected.size === 1 ? "lead" : "leads"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
