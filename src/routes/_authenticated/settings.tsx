import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ensureWorkspace, updateWorkspace } from "@/lib/workspace.functions";
import {
  listConnectedMailboxes,
  disconnectMailbox,
  sendTestEmail,
  startGmailConnect,
} from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Mail, Trash2, Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Kinetic OS" }] }),
  component: SettingsPage,
});

type Mailbox = {
  id: string;
  provider: string;
  email: string;
  display_name: string | null;
  status: string;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ready" || status === "connected")
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Ready to send
      </Badge>
    );
  if (status === "needs_reauth")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Needs sign-in again
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Last send failed
      </Badge>
    );
  return <Badge variant="secondary">Not connected yet</Badge>;
}

function MailboxRow({ m, defaultTo }: { m: Mailbox; defaultTo: string }) {
  const test = useServerFn(sendTestEmail);
  const remove = useServerFn(disconnectMailbox);
  const start = useServerFn(startGmailConnect);
  const qc = useQueryClient();
  const [showTest, setShowTest] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);

  const onTest = async () => {
    if (!to) return;
    setBusy(true);
    try {
      const r = await test({ data: { mailbox_id: m.id, to } });
      if (r.ok) toast.success(`Test email sent to ${to}.`);
      else toast.error(r.error);
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
      setShowTest(false);
    } finally {
      setBusy(false);
    }
  };

  const onReconnect = async () => {
    try {
      const { consentUrl } = await start();
      window.location.href = consentUrl;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onRemove = async () => {
    await remove({ data: { id: m.id } });
    toast.success("Mailbox disconnected.");
    qc.invalidateQueries({ queryKey: ["mailboxes"] });
  };

  return (
    <div className="border-b border-border last:border-0 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-md bg-muted grid place-items-center shrink-0">
            <Mail className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {m.email}
              {m.display_name && (
                <span className="text-muted-foreground font-normal"> · {m.display_name}</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
              {m.provider}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={m.status} />
        </div>
      </div>

      {m.last_test_status === "error" && m.last_test_error && (
        <div className="mt-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
          Last test failed: {m.last_test_error}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 items-center">
        {m.status === "needs_reauth" ? (
          <Button size="sm" onClick={onReconnect}>
            Sign in again
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowTest((v) => !v)}>
            <Send className="size-3 mr-1.5" />
            Send test email
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3 mr-1.5" />
          Disconnect
        </Button>
      </div>

      {showTest && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs">Send a test to</Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button size="sm" onClick={onTest} disabled={busy || !to}>
            {busy && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            Send test
          </Button>
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const ensure = useServerFn(ensureWorkspace);
  const update = useServerFn(updateWorkspace);
  const listBoxes = useServerFn(listConnectedMailboxes);
  const startConnect = useServerFn(startGmailConnect);
  const qc = useQueryClient();
  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: () => ensure() });
  const { data: mailboxes = [] } = useQuery({
    queryKey: ["mailboxes"],
    queryFn: () => listBoxes() as Promise<Mailbox[]>,
  });

  const [form, setForm] = useState({
    name: "",
    sender_name: "",
    sender_email: "",
    daily_send_cap: 50,
  });

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

  const onConnectGmail = async () => {
    try {
      const { consentUrl } = await startConnect();
      window.location.href = consentUrl;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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
          <Card
            title="Mailboxes"
            description="Connect a Gmail account to send campaign emails from your own address. Sign in once with Google — we use the secure Gmail API, no passwords."
          >
            {mailboxes.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <Mail className="mx-auto size-5 text-muted-foreground mb-2" />
                <div className="text-sm font-medium">No mailboxes connected yet</div>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Connect a Gmail account to start sending campaigns from your own address.
                </p>
                <Button size="sm" onClick={onConnectGmail}>
                  Connect Gmail
                </Button>
              </div>
            ) : (
              <>
                <div className="border border-border rounded-md overflow-hidden bg-card">
                  {mailboxes.map((m) => (
                    <MailboxRow key={m.id} m={m} defaultTo={form.sender_email || m.email} />
                  ))}
                </div>
                <div>
                  <Button size="sm" variant="outline" onClick={onConnectGmail}>
                    <Mail className="size-3.5 mr-1.5" />
                    Connect another Gmail
                  </Button>
                </div>
              </>
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Outlook is on the way. Looking for something else? See{" "}
              <Link to="/integrations" className="underline">
                Integrations
              </Link>{" "}
              for all email providers.
            </p>
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
