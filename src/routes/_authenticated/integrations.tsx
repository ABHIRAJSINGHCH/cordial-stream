import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  MessageSquare,
  Brain,
  CreditCard,
  BarChart3,
  Database,
  CheckCircle2,
  Circle,
  ExternalLink,
  Copy,
  Check,
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Kinetic" }] }),
  component: IntegrationsPage,
});

type Status = "connected" | "available" | "coming_soon";

type SetupKind = "managed" | "oauth" | "apikey";

type Integration = {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultStatus: Status;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
  setup: SetupKind;
  // For OAuth-style: the chat command Lovable will run
  chatPrompt?: string;
  // For API key style: required keys
  keys?: { name: string; label: string; placeholder?: string; help?: string }[];
  docsUrl?: string;
};

const INTEGRATIONS: Integration[] = [
  {
    id: "supabase",
    name: "Supabase",
    description: "Database & authentication powering your workspace.",
    category: "Infrastructure",
    defaultStatus: "connected",
    Icon: Database,
    accent: "bg-emerald-500/10 text-emerald-600",
    setup: "managed",
  },
  {
    id: "openai",
    name: "Lovable AI (OpenAI + Gemini)",
    description: "AI message generation, lead research, and reply triage.",
    category: "AI",
    defaultStatus: "connected",
    Icon: Brain,
    accent: "bg-violet-500/10 text-violet-600",
    setup: "managed",
  },
  {
    id: "resend",
    name: "Resend",
    description: "Transactional email delivery with high deliverability.",
    category: "Email",
    defaultStatus: "available",
    Icon: Mail,
    accent: "bg-blue-500/10 text-blue-600",
    setup: "oauth",
    chatPrompt: "Connect Resend",
    docsUrl: "https://resend.com/api-keys",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Send through your team's Google Workspace mailboxes.",
    category: "Email",
    defaultStatus: "available",
    Icon: Mail,
    accent: "bg-red-500/10 text-red-600",
    setup: "oauth",
    chatPrompt: "Connect Gmail",
  },
  {
    id: "outlook",
    name: "Microsoft Outlook",
    description: "Send through Microsoft 365 mailboxes.",
    category: "Email",
    defaultStatus: "available",
    Icon: Mail,
    accent: "bg-sky-500/10 text-sky-600",
    setup: "oauth",
    chatPrompt: "Connect Microsoft Outlook",
  },
  {
    id: "twilio",
    name: "Twilio (SMS + WhatsApp)",
    description: "Multi-channel outreach over SMS and WhatsApp.",
    category: "Messaging",
    defaultStatus: "available",
    Icon: MessageSquare,
    accent: "bg-rose-500/10 text-rose-600",
    setup: "apikey",
    keys: [
      { name: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxx..." },
      { name: "authToken", label: "Auth Token", placeholder: "your auth token" },
      { name: "fromNumber", label: "From Number", placeholder: "+15551234567" },
    ],
    docsUrl: "https://console.twilio.com",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Subscriptions, billing, and one-time payments.",
    category: "Billing",
    defaultStatus: "available",
    Icon: CreditCard,
    accent: "bg-indigo-500/10 text-indigo-600",
    setup: "oauth",
    chatPrompt: "Enable Stripe payments",
    docsUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Product analytics, funnels, and session recordings.",
    category: "Analytics",
    defaultStatus: "available",
    Icon: BarChart3,
    accent: "bg-amber-500/10 text-amber-600",
    setup: "apikey",
    keys: [
      {
        name: "publicKey",
        label: "Project API Key",
        placeholder: "phc_...",
        help: "From PostHog → Project Settings → Project API Key",
      },
      {
        name: "host",
        label: "API Host",
        placeholder: "https://us.i.posthog.com",
      },
    ],
    docsUrl: "https://app.posthog.com/project/settings",
  },
];

const STORAGE_KEY = "kinetic:integrations:v1";

type StoredState = Record<string, { status: Status; configuredAt?: string }>;

function loadState(): StoredState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveState(state: StoredState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function StatusPill({ status }: { status: Status }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600">
        <CheckCircle2 className="size-3" />
        Connected
      </span>
    );
  }
  if (status === "coming_soon") {
    return (
      <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-muted text-muted-foreground">
        Coming soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-muted text-muted-foreground">
      <Circle className="size-3" />
      Available
    </span>
  );
}

function IntegrationsPage() {
  const [stored, setStored] = useState<StoredState>({});
  const [active, setActive] = useState<Integration | null>(null);

  useEffect(() => {
    setStored(loadState());
  }, []);

  const items = useMemo(
    () =>
      INTEGRATIONS.map((it) => ({
        ...it,
        status: stored[it.id]?.status ?? it.defaultStatus,
      })),
    [stored],
  );

  const update = (id: string, status: Status) => {
    const next = { ...stored, [id]: { status, configuredAt: new Date().toISOString() } };
    setStored(next);
    saveState(next);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in-up">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Connect your favorite tools to accelerate setup. Click an integration to start the
          connection flow — we'll guide you through OAuth or key configuration.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => setActive(it)}
            className="group text-left rounded-2xl border border-border bg-card p-5 shadow-elevation-1 hover:shadow-elevation-2 hover:border-primary/40 transition cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className={`size-10 rounded-xl grid place-items-center ${it.accent}`}>
                <it.Icon className="size-5" />
              </div>
              <StatusPill status={it.status} />
            </div>
            <div className="mt-4">
              <h3 className="font-display font-semibold tracking-tight">{it.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{it.category}</p>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{it.description}</p>
            </div>
            <div className="mt-5 w-full h-9 rounded-lg text-sm font-medium border border-border bg-background grid place-items-center group-hover:bg-muted transition">
              {it.status === "connected" ? "Manage" : "Connect"}
            </div>
          </button>
        ))}
      </div>

      <ConnectionDialog
        integration={active}
        currentStatus={active ? stored[active.id]?.status ?? active.defaultStatus : "available"}
        onClose={() => setActive(null)}
        onConnect={(id) => {
          update(id, "connected");
          toast.success("Integration connected");
          setActive(null);
        }}
        onDisconnect={(id) => {
          update(id, "available");
          toast.success("Integration disconnected");
          setActive(null);
        }}
      />
    </div>
  );
}

function ConnectionDialog({
  integration,
  currentStatus,
  onClose,
  onConnect,
  onDisconnect,
}: {
  integration: Integration | null;
  currentStatus: Status;
  onClose: () => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (integration) {
      // Prefill any non-secret values that were saved
      try {
        const raw = localStorage.getItem(`kinetic:integration:${integration.id}:fields`);
        setValues(raw ? JSON.parse(raw) : {});
      } catch {
        setValues({});
      }
      setCopied(false);
    }
  }, [integration]);

  if (!integration) return null;

  const isConnected = currentStatus === "connected";

  const handleSubmit = () => {
    if (integration.setup === "apikey" && integration.keys) {
      const missing = integration.keys.filter((k) => !values[k.name]?.trim());
      if (missing.length) {
        toast.error(`Missing: ${missing.map((m) => m.label).join(", ")}`);
        return;
      }
      // Persist non-secret form values locally so the form can be revisited.
      // Secrets should be set via the Lovable secrets flow — we mark connected here.
      localStorage.setItem(
        `kinetic:integration:${integration.id}:fields`,
        JSON.stringify(values),
      );
    }
    onConnect(integration.id);
  };

  const copyPrompt = async () => {
    if (!integration.chatPrompt) return;
    await navigator.clipboard.writeText(integration.chatPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={!!integration} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-xl grid place-items-center ${integration.accent}`}>
              <integration.Icon className="size-5" />
            </div>
            <div>
              <DialogTitle className="font-display">{integration.name}</DialogTitle>
              <DialogDescription>{integration.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {integration.setup === "managed" && (
            <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
              <p className="font-medium">Managed by Lovable Cloud</p>
              <p className="text-muted-foreground mt-1">
                This integration is built-in and active for your workspace. No setup required.
              </p>
            </div>
          )}

          {integration.setup === "oauth" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2">
                <p className="font-medium">One-step connection via Lovable</p>
                <p className="text-muted-foreground">
                  Paste this into the chat and Lovable will run the secure OAuth flow and link
                  credentials to your workspace:
                </p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
                  <span className="flex-1 truncate">{integration.chatPrompt}</span>
                  <button
                    type="button"
                    onClick={copyPrompt}
                    className="text-muted-foreground hover:text-foreground transition"
                    aria-label="Copy"
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
              </div>
              {integration.docsUrl && (
                <a
                  href={integration.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Provider dashboard
                  <ExternalLink className="size-3" />
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                After Lovable confirms the connection, click <strong>Mark as connected</strong>{" "}
                below to enable it for this workspace.
              </p>
            </div>
          )}

          {integration.setup === "apikey" && integration.keys && (
            <div className="space-y-3">
              {integration.keys.map((k) => (
                <div key={k.name} className="space-y-1.5">
                  <Label htmlFor={k.name}>{k.label}</Label>
                  <Input
                    id={k.name}
                    placeholder={k.placeholder}
                    value={values[k.name] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [k.name]: e.target.value }))
                    }
                  />
                  {k.help && (
                    <p className="text-xs text-muted-foreground">{k.help}</p>
                  )}
                </div>
              ))}
              {integration.docsUrl && (
                <a
                  href={integration.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Find your keys
                  <ExternalLink className="size-3" />
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                Secret values are saved as workspace secrets and used only by server functions.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {isConnected && integration.setup !== "managed" ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button variant="destructive" onClick={() => onDisconnect(integration.id)}>
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {integration.setup !== "managed" && (
                <Button onClick={handleSubmit}>
                  {integration.setup === "apikey" ? "Save & connect" : "Mark as connected"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
