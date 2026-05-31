import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCampaigns, createCampaign } from "@/lib/campaigns.functions";
import { ensureWorkspace } from "@/lib/workspace.functions";
import { listMailboxes } from "@/lib/mailboxes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Layers, Mail, Sparkles, Target, User } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Kinetic OS" }] }),
  component: CampaignsPage,
});

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "founder", label: "Founder-led" },
  { value: "sales", label: "Sales" },
  { value: "recruiter", label: "Recruiter" },
  { value: "casual", label: "Casual" },
  { value: "enterprise", label: "Enterprise" },
] as const;

function CampaignsPage() {
  const list = useServerFn(listCampaigns);
  const create = useServerFn(createCampaign);
  const ensure = useServerFn(ensureWorkspace);
  const listBoxes = useServerFn(listMailboxes);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: workspace } = useQuery({ queryKey: ["workspace"], queryFn: () => ensure() });
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => list(),
  });
  const { data: mailboxes = [] } = useQuery({
    queryKey: ["mailboxes"],
    queryFn: () => listBoxes(),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    goal: "",
    default_tone: "professional" as (typeof TONES)[number]["value"],
    sender_name: "",
    sender_email: "",
    signature: "",
    cta_url: "",
    mailbox_id: "",
    industry: "",
    company_size: "",
    target_role: "",
    geography: "",
    pain_point: "",
  });

  const reset = () =>
    setForm({
      name: "",
      goal: "",
      default_tone: "professional",
      sender_name: "",
      sender_email: "",
      signature: "",
      cta_url: "",
      mailbox_id: "",
      industry: "",
      company_size: "",
      target_role: "",
      geography: "",
      pain_point: "",
    });

  const mut = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("No workspace");
      return create({
        data: {
          workspace_id: workspace.id,
          name: form.name,
          goal: form.goal || undefined,
          default_tone: form.default_tone,
          sender_name: form.sender_name || undefined,
          sender_email: form.sender_email || undefined,
          signature: form.signature || undefined,
          cta_url: form.cta_url || undefined,
          mailbox_id: form.mailbox_id || undefined,
          audience_brief: {
            industry: form.industry || undefined,
            company_size: form.company_size || undefined,
            target_role: form.target_role || undefined,
            geography: form.geography || undefined,
            pain_point: form.pain_point || undefined,
          },
        },
      });
    },
    onSuccess: (c) => {
      toast.success("Campaign created");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
      reset();
      navigate({ to: "/campaigns/$id", params: { id: c.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 bg-card">
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
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create a new campaign</DialogTitle>
              <DialogDescription>
                Define the audience, sender identity, and AI tone. The engine uses every field
                below to research leads and personalize messages.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {/* Section: Basics */}
              <Section icon={<Target className="size-3.5" />} title="Basics">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Q1 Enterprise Growth"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal">Objective</Label>
                  <Textarea
                    id="goal"
                    value={form.goal}
                    onChange={(e) => setForm({ ...form, goal: e.target.value })}
                    placeholder="Book intro calls with VPs of Engineering at Series B+ SaaS companies"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Default tone</Label>
                  <Select
                    value={form.default_tone}
                    onValueChange={(v) =>
                      setForm({ ...form, default_tone: v as typeof form.default_tone })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Section>

              {/* Section: Audience */}
              <Section icon={<Sparkles className="size-3.5" />} title="Audience research brief">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Industry" value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} placeholder="B2B SaaS" />
                  <Field label="Company size" value={form.company_size} onChange={(v) => setForm({ ...form, company_size: v })} placeholder="50–500" />
                  <Field label="Target role" value={form.target_role} onChange={(v) => setForm({ ...form, target_role: v })} placeholder="VP of Engineering" />
                  <Field label="Geography" value={form.geography} onChange={(v) => setForm({ ...form, geography: v })} placeholder="North America" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pain">Pain point you solve</Label>
                  <Textarea
                    id="pain"
                    value={form.pain_point}
                    onChange={(e) => setForm({ ...form, pain_point: e.target.value })}
                    placeholder="Engineering teams losing 8+ hrs/week to manual incident triage"
                    rows={2}
                  />
                </div>
              </Section>

              {/* Section: Sender */}
              <Section icon={<User className="size-3.5" />} title="Sender identity">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="From name" value={form.sender_name} onChange={(v) => setForm({ ...form, sender_name: v })} placeholder="Alex Chen" />
                  <Field label="From email" type="email" value={form.sender_email} onChange={(v) => setForm({ ...form, sender_email: v })} placeholder="alex@yourco.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sig">Signature</Label>
                  <Textarea
                    id="sig"
                    value={form.signature}
                    onChange={(e) => setForm({ ...form, signature: e.target.value })}
                    placeholder={"— Alex\nFounder, YourCo"}
                    rows={2}
                  />
                </div>
                <Field
                  label="CTA / booking link (optional)"
                  value={form.cta_url}
                  onChange={(v) => setForm({ ...form, cta_url: v })}
                  placeholder="https://cal.com/alex/intro"
                />
              </Section>

              {/* Section: Mailbox */}
              <Section icon={<Mail className="size-3.5" />} title="Sending mailbox">
                {mailboxes.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No mailboxes connected yet. You can create the campaign now and connect a
                    Gmail or Outlook account from{" "}
                    <Link to="/settings" className="underline underline-offset-4 text-foreground">
                      Settings → Mailboxes
                    </Link>{" "}
                    before sending.
                  </div>
                ) : (
                  <Select
                    value={form.mailbox_id}
                    onValueChange={(v) => setForm({ ...form, mailbox_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a connected mailbox" />
                    </SelectTrigger>
                    <SelectContent>
                      {mailboxes.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.provider.toUpperCase()} · {m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Section>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={mut.isPending}>
                Cancel
              </Button>
              <Button onClick={() => mut.mutate()} disabled={!form.name.trim() || mut.isPending}>
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
            <div
              className="border border-border rounded-lg overflow-hidden bg-card"
              style={{ boxShadow: "var(--shadow-elevation-1)" }}
            >
              <div className="grid grid-cols-[1fr_auto_auto_auto] px-4 py-2 border-b border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/30">
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

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span className="text-foreground">{icon}</span>
        {title}
      </div>
      <div className="space-y-3 pl-1">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
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
    <div
      className="border border-dashed border-border rounded-lg p-12 text-center bg-card"
      style={{ boxShadow: "var(--shadow-elevation-1)" }}
    >
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
