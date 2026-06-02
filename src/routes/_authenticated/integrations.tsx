import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  MessageSquare,
  Brain,
  CreditCard,
  BarChart3,
  Database,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listIntegrations,
  connectIntegration,
  disconnectIntegration,
  testIntegration,
} from "@/lib/integrations.functions";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Kinetic" }] }),
  component: IntegrationsPage,
});

type Provider =
  | "resend"
  | "twilio"
  | "posthog"
  | "openai"
  | "smtp_gmail"
  | "smtp_outlook"
  | "stripe";

type Field = {
  name: string;
  label: string;
  type?: "text" | "password" | "email";
  placeholder?: string;
  help?: string;
  defaultValue?: string;
};

type ProviderDef = {
  id: Provider;
  name: string;
  description: string;
  category: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
  fields: Field[];
  docsUrl: string;
  docsLabel: string;
};

type Managed = {
  id: string;
  name: string;
  description: string;
  category: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
  note: string;
};

const MANAGED: Managed[] = [
  {
    id: "supabase",
    name: "Lovable Cloud (Database & Auth)",
    description: "Postgres, RLS, auth, file storage — already powering this app.",
    category: "Backend",
    Icon: Database,
    accent: "bg-emerald-500/10 text-emerald-600",
    note: "Built-in. No setup required.",
  },
  {
    id: "lovable-ai",
    name: "Lovable AI Gateway",
    description: "GPT-5, Gemini, and more — no API key needed for AI generations.",
    category: "AI",
    Icon: Brain,
    accent: "bg-violet-500/10 text-violet-600",
    note: "Built-in. Used for AI message generation by default.",
  },
];

const PROVIDERS: ProviderDef[] = [
  {
    id: "resend",
    name: "Resend",
    description: "Transactional email delivery with great deliverability.",
    category: "Email",
    Icon: Mail,
    accent: "bg-blue-500/10 text-blue-600",
    docsUrl: "https://resend.com/api-keys",
    docsLabel: "Get a Resend API key",
    fields: [
      { name: "apiKey", label: "API key", type: "password", placeholder: "re_xxxxxxxxxxxx" },
      { name: "fromEmail", label: "From address", type: "email", placeholder: "you@yourdomain.com", help: "Must be on a verified Resend domain." },
    ],
  },
  {
    id: "smtp_gmail",
    name: "Gmail (SMTP)",
    description: "Send through your Gmail using an App Password.",
    category: "Email",
    Icon: Mail,
    accent: "bg-red-500/10 text-red-600",
    docsUrl: "https://myaccount.google.com/apppasswords",
    docsLabel: "Create a Google App Password",
    fields: [
      { name: "email", label: "Gmail address", type: "email", placeholder: "you@gmail.com" },
      { name: "appPassword", label: "App Password", type: "password", placeholder: "16-character code", help: "Requires 2-Step Verification on your Google account." },
    ],
  },
  {
    id: "smtp_outlook",
    name: "Outlook (SMTP)",
    description: "Send through Outlook / Hotmail via SMTP.",
    category: "Email",
    Icon: Mail,
    accent: "bg-sky-500/10 text-sky-600",
    docsUrl: "https://support.microsoft.com/en-us/account-billing/how-to-get-and-use-app-passwords-5896ed9b-4263-e681-128a-a6f2979a7944",
    docsLabel: "Outlook app password help",
    fields: [
      { name: "email", label: "Outlook address", type: "email", placeholder: "you@outlook.com" },
      { name: "password", label: "Password", type: "password", help: "Use an app password if 2FA is on." },
    ],
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "SMS and WhatsApp messaging via Twilio.",
    category: "Messaging",
    Icon: MessageSquare,
    accent: "bg-rose-500/10 text-rose-600",
    docsUrl: "https://console.twilio.com/",
    docsLabel: "Twilio Console",
    fields: [
      { name: "accountSid", label: "Account SID", type: "text", placeholder: "ACxxxxxxxxxxxxxx" },
      { name: "authToken", label: "Auth Token", type: "password" },
      { name: "fromNumber", label: "From number", type: "text", placeholder: "+1XXXXXXXXXX", help: "A Twilio phone number you own." },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Bring your own OpenAI key for custom models.",
    category: "AI",
    Icon: Brain,
    accent: "bg-emerald-500/10 text-emerald-600",
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "OpenAI API keys",
    fields: [
      { name: "apiKey", label: "API key", type: "password", placeholder: "sk-..." },
    ],
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Product analytics and event tracking.",
    category: "Analytics",
    Icon: BarChart3,
    accent: "bg-amber-500/10 text-amber-600",
    docsUrl: "https://app.posthog.com/project/settings",
    docsLabel: "PostHog project settings",
    fields: [
      { name: "projectApiKey", label: "Project API key", type: "password", placeholder: "phc_..." },
      { name: "host", label: "Host", type: "text", defaultValue: "https://us.i.posthog.com", help: "Use https://eu.i.posthog.com for the EU cloud." },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Subscriptions and one-off payments via your Stripe account.",
    category: "Payments",
    Icon: CreditCard,
    accent: "bg-indigo-500/10 text-indigo-600",
    docsUrl: "https://dashboard.stripe.com/apikeys",
    docsLabel: "Stripe API keys",
    fields: [
      { name: "secretKey", label: "Secret key", type: "password", placeholder: "sk_test_... or sk_live_..." },
    ],
  },
];

type IntegrationRow = {
  provider: string;
  status: string;
  metadata: Record<string, unknown> | null;
  last_verified_at: string | null;
  last_error: string | null;
};

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ConnectDialog({
  provider,
  open,
  onOpenChange,
  onSuccess,
}: {
  provider: ProviderDef;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const connectFn = useServerFn(connectIntegration);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((f) => [f.name, f.defaultValue ?? ""])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await connectFn({ data: { provider: provider.id, credentials: values } });
      if (!result.ok) {
        setError(result.error);
        toast.error(`Couldn't connect ${provider.name}`);
      } else {
        toast.success(`${provider.name} connected`);
        onSuccess();
        onOpenChange(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <provider.Icon className="h-5 w-5" />
            Connect {provider.name}
          </DialogTitle>
          <DialogDescription>{provider.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {provider.fields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={`${provider.id}-${f.name}`}>{f.label}</Label>
              <Input
                id={`${provider.id}-${f.name}`}
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                autoComplete="off"
                required
              />
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
          ))}
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {provider.docsLabel} <ExternalLink className="h-3 w-3" />
          </a>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitting ? "Verifying..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProviderCard({
  provider,
  row,
  onChanged,
}: {
  provider: ProviderDef;
  row: IntegrationRow | undefined;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const disconnectFn = useServerFn(disconnectIntegration);
  const testFn = useServerFn(testIntegration);
  const [working, setWorking] = useState(false);

  const connected = row?.status === "connected";
  const errored = row?.status === "error";

  const handleDisconnect = async () => {
    setWorking(true);
    try {
      await disconnectFn({ data: { provider: provider.id } });
      toast.success(`${provider.name} disconnected`);
      onChanged();
    } finally {
      setWorking(false);
    }
  };

  const handleTest = async () => {
    setWorking(true);
    try {
      const r = await testFn({ data: { provider: provider.id } });
      if (r.ok) toast.success(`${provider.name} verified`);
      else toast.error(`${provider.name}: ${r.error}`);
      onChanged();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${provider.accent}`}>
            <provider.Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display font-semibold text-foreground">{provider.name}</div>
            <div className="text-xs text-muted-foreground">{provider.category}</div>
          </div>
        </div>
        {connected ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </Badge>
        ) : errored ? (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Error
          </Badge>
        ) : (
          <Badge variant="secondary">Not connected</Badge>
        )}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{provider.description}</p>

      {connected && row?.metadata && (
        <dl className="mt-3 space-y-1 text-xs">
          {Object.entries(row.metadata)
            .filter(([, v]) => v !== null && v !== "")
            .slice(0, 3)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono truncate max-w-[60%]">{String(v)}</dd>
              </div>
            ))}
          {row.last_verified_at && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">verified</dt>
              <dd>{timeAgo(row.last_verified_at)}</dd>
            </div>
          )}
        </dl>
      )}

      {errored && row?.last_error && (
        <p className="mt-3 text-xs text-destructive">{row.last_error}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {connected || errored ? (
          <>
            <Button size="sm" variant="outline" onClick={handleTest} disabled={working}>
              {working && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Test
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Update
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={working}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            Connect
          </Button>
        )}
      </div>

      <ConnectDialog
        provider={provider}
        open={open}
        onOpenChange={setOpen}
        onSuccess={onChanged}
      />
    </div>
  );
}

function ManagedCard({ m }: { m: Managed }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${m.accent}`}>
            <m.Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display font-semibold text-foreground">{m.name}</div>
            <div className="text-xs text-muted-foreground">{m.category}</div>
          </div>
        </div>
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Active
        </Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{m.description}</p>
      <p className="mt-3 text-xs text-muted-foreground">{m.note}</p>
    </div>
  );
}

function IntegrationsPage() {
  const fetchList = useServerFn(listIntegrations);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => fetchList(),
  });

  const rows = (data?.integrations ?? []) as IntegrationRow[];
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations"] });

  const grouped = PROVIDERS.reduce<Record<string, ProviderDef[]>>((acc, p) => {
    (acc[p.category] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect Kinetic directly to the services you use. Credentials are verified live and stored encrypted to your account.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Built-in</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {MANAGED.map((m) => (
            <ManagedCard key={m.id} m={m} />
          ))}
        </div>
      </section>

      {Object.entries(grouped).map(([cat, defs]) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {defs.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                row={byProvider.get(p.id)}
                onChanged={refresh}
              />
            ))}
          </div>
        </section>
      ))}

      {isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading integrations…
        </div>
      )}
    </div>
  );
}
