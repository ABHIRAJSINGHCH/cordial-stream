import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ensureWorkspace, updateWorkspace } from "@/lib/workspace.functions";
import { listMailboxes, createMailbox, deleteMailbox } from "@/lib/mailboxes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Kinetic OS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const ensure = useServerFn(ensureWorkspace);
  const update = useServerFn(updateWorkspace);
  const listBoxes = useServerFn(listMailboxes);
  const addBox = useServerFn(createMailbox);
  const removeBox = useServerFn(deleteMailbox);
  const qc = useQueryClient();
  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: () => ensure() });
  const { data: mailboxes = [] } = useQuery({
    queryKey: ["mailboxes"],
    queryFn: () => listBoxes(),
  });

  const [form, setForm] = useState({
    name: "",
    sender_name: "",
    sender_email: "",
    daily_send_cap: 50,
  });
  const [mbox, setMbox] = useState<{ provider: "gmail" | "outlook" | "smtp"; email: string; display_name: string }>(
    { provider: "gmail", email: "", display_name: "" },
  );

  useEffect(() => {
    if (ws) {
      setForm({
        name: ws.name,
        sender_name: ws.sender_name ?? "",
        sender_email: ws.sender_email ?? "",
        daily_send_cap: ws.daily_send_cap ?? 50,
      });
    }
  }, [ws]);

  const save = useMutation({
    mutationFn: () => {
      if (!ws) throw new Error("No workspace");
      return update({
        data: {
          id: ws.id,
          name: form.name,
          sender_name: form.sender_name || undefined,
          sender_email: form.sender_email || undefined,
          daily_send_cap: form.daily_send_cap,
        },
      });
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const addMbox = useMutation({
    mutationFn: async () => {
      if (!ws) throw new Error("No workspace");
      return addBox({ data: { workspace_id: ws.id, ...mbox } });
    },
    onSuccess: () => {
      toast.success("Mailbox added — connect via OAuth from the mailbox row.");
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
      setMbox({ provider: "gmail", email: "", display_name: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const delMbox = useMutation({
    mutationFn: (id: string) => removeBox({ data: { id } }),
    onSuccess: () => {
      toast.success("Mailbox removed");
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  return (
    <>
      <header className="h-14 border-b border-border flex items-center px-4 md:px-6 shrink-0 bg-card">
        <h1 className="font-semibold text-sm tracking-tight">Settings</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-2xl mx-auto space-y-10">
          {/* Workspace */}
          <Card title="Workspace">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sender_name">Default sender name</Label>
                <Input
                  id="sender_name"
                  value={form.sender_name}
                  onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sender_email">Default sender email</Label>
                <Input
                  id="sender_email"
                  type="email"
                  value={form.sender_email}
                  onChange={(e) => setForm({ ...form, sender_email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap">Daily send cap (per workspace)</Label>
              <Input
                id="cap"
                type="number"
                min={1}
                max={1000}
                value={form.daily_send_cap}
                onChange={(e) => setForm({ ...form, daily_send_cap: Number(e.target.value) })}
              />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save changes
            </Button>
          </Card>

          {/* Mailboxes */}
          <Card title="Mailboxes" description="Connect Gmail, Outlook, or SMTP accounts to send outreach from. OAuth verification runs the first time you send.">
            {mailboxes.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <Mail className="mx-auto size-5 text-muted-foreground mb-2" />
                <div className="text-sm font-medium">No mailboxes connected</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Add one below to start sending campaigns from your domain.
                </p>
              </div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden bg-card">
                {mailboxes.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-7 rounded-md bg-muted grid place-items-center shrink-0">
                        <Mail className="size-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{m.email}</div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          {m.provider} · {m.status}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => delMbox.mutate(m.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Add new mailbox
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    value={mbox.provider}
                    onValueChange={(v) =>
                      setMbox({ ...mbox, provider: v as typeof mbox.provider })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gmail">Gmail</SelectItem>
                      <SelectItem value="outlook">Outlook</SelectItem>
                      <SelectItem value="smtp">SMTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Email address</Label>
                  <Input
                    type="email"
                    value={mbox.email}
                    onChange={(e) => setMbox({ ...mbox, email: e.target.value })}
                    placeholder="alex@yourco.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Display name (optional)</Label>
                <Input
                  value={mbox.display_name}
                  onChange={(e) => setMbox({ ...mbox, display_name: e.target.value })}
                  placeholder="Alex Chen"
                />
              </div>
              <Button
                size="sm"
                onClick={() => addMbox.mutate()}
                disabled={!mbox.email || addMbox.isPending}
              >
                <Plus className="size-3.5 mr-1.5" />
                Add mailbox
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                After adding, you'll be prompted to authorize the account the first time you send.
                Until then, mailboxes show as <span className="font-mono">pending_oauth</span>.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {title}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div
        className="space-y-4 border border-border rounded-lg bg-card p-5"
        style={{ boxShadow: "var(--shadow-elevation-1)" }}
      >
        {children}
      </div>
    </div>
  );
}
