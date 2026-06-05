import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Sparkles,
  Clock,
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
import { startGmailConnect } from "@/lib/gmail.functions";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Kinetic" }] }),
  component: IntegrationsPage,
});

type Provider = "resend" | "twilio" | "posthog" | "openai" | "stripe";

type Field = {
  name: string;
  label: string;
  type?: "text" | "password" | "email";
  placeholder?: string;
  hint?: string; // plain-English helper text under the input
  defaultValue?: string;
};

type Step = {
  title: string;
  body: string;
  link?: { label: string; url: string };
};

type ProviderDef = {
  id: Provider;
  name: string;
  blurb: string; // one-line, non-technical
  category: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
  recommended?: boolean;
  preflight: Step[]; // "before you start" checklist
  fields: Field[];
  dashboardUrl: string;
  dashboardLabel: string;
};

type ComingSoon = {
  id: string;
  name: string;
  blurb: string;
  category: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
  reason: string;
};

const MANAGED = [
  {
    id: "supabase",
    name: "Database & Sign-in",
    blurb: "Your app's database and user accounts — already running, nothing to set up.",
    category: "Built-in",
    Icon: Database,
    accent: "bg-emerald-500/10 text-emerald-600",
  },
  {
    id: "lovable-ai",
    name: "AI Writer",
    blurb: "Used to draft your outreach messages. Works out of the box, no key needed.",
    category: "Built-in",
    Icon: Sparkles,
    accent: "bg-violet-500/10 text-violet-600",
  },
];

const PROVIDERS: ProviderDef[] = [
  {
    id: "resend",
    name: "Resend",
    blurb: "The easiest way to send emails from your own domain. Recommended.",
    category: "Email",
    Icon: Mail,
    accent: "bg-blue-500/10 text-blue-600",
    recommended: true,
    dashboardUrl: "https://resend.com/api-keys",
    dashboardLabel: "Open Resend dashboard",
    preflight: [
      {
        title: "Create a free Resend account",
        body: "If you don't have one yet, sign up at resend.com — the free plan is enough to get started.",
        link: { label: "Sign up for Resend", url: "https://resend.com/signup" },
      },
      {
        title: "Verify the domain you want to send from",
        body: "In Resend → Domains, add your domain (e.g. yourcompany.com) and follow the DNS steps. If you just want to test, you can send from `onboarding@resend.dev` without verifying anything.",
        link: { label: "Open Resend → Domains", url: "https://resend.com/domains" },
      },
      {
        title: "Create an API key",
        body: "In Resend → API Keys, click 'Create API Key', give it any name, and copy the value that starts with `re_`. You'll only see it once.",
        link: { label: "Open Resend → API Keys", url: "https://resend.com/api-keys" },
      },
    ],
    fields: [
      {
        name: "apiKey",
        label: "Resend API key",
        type: "password",
        placeholder: "re_xxxxxxxxxxxxxxxx",
        hint: "Starts with `re_`. Copy it from Resend → API Keys.",
      },
      {
        name: "fromEmail",
        label: "Sending email address",
        type: "email",
        placeholder: "hello@yourcompany.com",
        hint: "The email people will see in their inbox. Must be on a domain you verified above (or `onboarding@resend.dev` for testing).",
      },
    ],
  },
  {
    id: "twilio",
    name: "Twilio",
    blurb: "Send text messages and WhatsApp from a real phone number.",
    category: "Messaging",
    Icon: MessageSquare,
    accent: "bg-rose-500/10 text-rose-600",
    dashboardUrl: "https://console.twilio.com/",
    dashboardLabel: "Open Twilio Console",
    preflight: [
      {
        title: "Sign in to the Twilio Console",
        body: "Don't have an account? Twilio gives you free trial credit when you sign up.",
        link: { label: "Open Twilio Console", url: "https://console.twilio.com/" },
      },
      {
        title: "Find your Account SID and Auth Token",
        body: "On the Twilio Console home page, look for the 'Account Info' card. Copy the Account SID (starts with `AC…`) and click 'Show' to reveal the Auth Token.",
      },
      {
        title: "Get your sending phone number",
        body: "In Phone Numbers → Manage → Active numbers, copy the number you want to send from. It must include the country code, e.g. `+15551234567`.",
        link: {
          label: "Open Twilio → Active numbers",
          url: "https://console.twilio.com/us1/develop/phone-numbers/manage/incoming",
        },
      },
    ],
    fields: [
      {
        name: "accountSid",
        label: "Account SID",
        type: "text",
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        hint: "Starts with `AC`. Found at the top of your Twilio Console.",
      },
      {
        name: "authToken",
        label: "Auth Token",
        type: "password",
        hint: "Click 'Show' next to the Auth Token in your Twilio Console to reveal it.",
      },
      {
        name: "fromNumber",
        label: "Sending phone number",
        type: "text",
        placeholder: "+15551234567",
        hint: "Include the country code with a `+` in front. No spaces or dashes.",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    blurb: "Optional — use your own OpenAI account for custom AI models.",
    category: "AI",
    Icon: Brain,
    accent: "bg-emerald-500/10 text-emerald-600",
    dashboardUrl: "https://platform.openai.com/api-keys",
    dashboardLabel: "Open OpenAI API keys",
    preflight: [
      {
        title: "Add billing to your OpenAI account",
        body: "OpenAI requires a credit card on file before any key will work. Add one in Billing → Payment methods.",
        link: { label: "Open OpenAI Billing", url: "https://platform.openai.com/account/billing" },
      },
      {
        title: "Create a new secret key",
        body: "In API keys, click 'Create new secret key', give it any name, and copy the value that starts with `sk-`. You won't be able to see it again.",
        link: { label: "Open OpenAI → API keys", url: "https://platform.openai.com/api-keys" },
      },
    ],
    fields: [
      {
        name: "apiKey",
        label: "OpenAI secret key",
        type: "password",
        placeholder: "sk-...",
        hint: "Starts with `sk-`. This is different from your account login password.",
      },
    ],
  },
  {
    id: "posthog",
    name: "PostHog",
    blurb: "Track which features people use, so you can improve them.",
    category: "Analytics",
    Icon: BarChart3,
    accent: "bg-amber-500/10 text-amber-600",
    dashboardUrl: "https://app.posthog.com/project/settings",
    dashboardLabel: "Open PostHog settings",
    preflight: [
      {
        title: "Create a PostHog project",
        body: "Sign up at posthog.com (free tier available) and create a project for this app.",
        link: { label: "Sign up for PostHog", url: "https://posthog.com/signup" },
      },
      {
        title: "Copy the Project API key",
        body: "In Project settings, scroll to 'Project API Key' and copy the value that starts with `phc_`. (This is the public key — safe to use in apps.)",
      },
    ],
    fields: [
      {
        name: "projectApiKey",
        label: "Project API key",
        type: "password",
        placeholder: "phc_xxxxxxxxxxxxxxxx",
        hint: "Starts with `phc_`. Found in PostHog → Project Settings.",
      },
      {
        name: "host",
        label: "PostHog region",
        type: "text",
        defaultValue: "https://us.i.posthog.com",
        hint: "Use the EU URL (`https://eu.i.posthog.com`) if your PostHog project lives in Europe.",
      },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    blurb: "Accept payments and run subscriptions.",
    category: "Payments",
    Icon: CreditCard,
    accent: "bg-indigo-500/10 text-indigo-600",
    dashboardUrl: "https://dashboard.stripe.com/apikeys",
    dashboardLabel: "Open Stripe API keys",
    preflight: [
      {
        title: "Open Stripe → Developers → API keys",
        body: "Make sure you're in the right account (top-left switcher) and the right mode (Test mode toggle, top-right).",
        link: { label: "Open Stripe API keys", url: "https://dashboard.stripe.com/apikeys" },
      },
      {
        title: "Reveal the Secret key",
        body: "Click 'Reveal test key' (or live key, if you're ready for production). The value starts with `sk_test_` or `sk_live_`. Do NOT use the Publishable key — that's the one starting with `pk_`.",
      },
    ],
    fields: [
      {
        name: "secretKey",
        label: "Stripe Secret key",
        type: "password",
        placeholder: "sk_test_... or sk_live_...",
        hint: "The Secret key, not the Publishable key (pk_). Use a test key first to make sure everything works.",
      },
    ],
  },
];

const COMING_SOON: ComingSoon[] = [
  {
    id: "outlook",
    name: "Outlook",
    blurb: "One-click sign-in to send through your Outlook account.",
    category: "Email",
    Icon: Mail,
    accent: "bg-sky-500/10 text-sky-600",
    reason:
      "Outlook sign-in needs Microsoft developer credentials, which require a paid Microsoft account. We'll enable this once those are available.",
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
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ConnectWizard({
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
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((f) => [f.name, f.defaultValue ?? ""])),
  );
  const [openHint, setOpenHint] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep(0);
    setValues(Object.fromEntries(provider.fields.map((f) => [f.name, f.defaultValue ?? ""])));
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // trim everything before sending
      const cleaned = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.trim()]),
      );
      const result = await connectFn({
        data: { provider: provider.id, credentials: cleaned },
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        toast.success(`${provider.name} is connected.`);
        onSuccess();
        onOpenChange(false);
        setTimeout(reset, 300);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const allFilled = provider.fields.every((f) => (values[f.name] ?? "").trim().length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTimeout(reset, 300);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <provider.Icon className="h-5 w-5" />
            Connect {provider.name}
          </DialogTitle>
          <DialogDescription>{provider.blurb}</DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {["Get ready", "Enter details", "Verify"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                  i <= step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <span className={i === step ? "text-foreground font-medium" : ""}>{label}</span>
              {i < 2 && <ChevronRight className="h-3 w-3" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Before we connect, you'll need a few things from your {provider.name} account.
              Don't worry — we'll walk through it.
            </p>
            <ol className="space-y-3">
              {provider.preflight.map((s, i) => (
                <li key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                      {i + 1}
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-sm font-medium text-foreground">{s.title}</div>
                      <p className="text-xs text-muted-foreground">{s.body}</p>
                      {s.link && (
                        <a
                          href={s.link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {s.link.label} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste the values you collected. We won't store anything until we've checked it works.
            </p>
            {provider.fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${provider.id}-${f.name}`}>{f.label}</Label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const txt = await navigator.clipboard.readText();
                        setValues((v) => ({ ...v, [f.name]: txt.trim() }));
                      } catch {
                        toast.error("Couldn't read clipboard. Paste manually instead.");
                      }
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <ClipboardPaste className="h-3 w-3" /> Paste
                  </button>
                </div>
                <Input
                  id={`${provider.id}-${f.name}`}
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                />
                {f.hint && (
                  <button
                    type="button"
                    onClick={() => setOpenHint((s) => ({ ...s, [f.name]: !s[f.name] }))}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {openHint[f.name] ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Where do I find this?
                  </button>
                )}
                {f.hint && openHint[f.name] && (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 border border-border">
                    {f.hint}
                  </p>
                )}
              </div>
            ))}
            <a
              href={provider.dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {provider.dashboardLabel} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {submitting ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-foreground font-medium">
                  Checking your {provider.name} credentials…
                </p>
                <p className="text-xs text-muted-foreground">
                  We're making a live test call. This usually takes a few seconds.
                </p>
              </div>
            ) : error ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">We couldn't connect.</div>
                    <p className="mt-1 text-destructive/90">{error}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Go back and double-check the values, or open the {provider.name} dashboard to copy
                  them again.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Click <strong className="text-foreground">Connect</strong> and we'll make a live
                  test call to {provider.name} using the values you entered. Nothing gets saved if
                  the test fails.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {provider.fields.map((f) => (
                    <li key={f.name} className="flex justify-between gap-2">
                      <span>{f.label}</span>
                      <span className="font-mono truncate max-w-[60%]">
                        {f.type === "password" && values[f.name]
                          ? "•".repeat(Math.min(values[f.name].length, 12))
                          : values[f.name] || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 0 && !submitting && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError(null);
                setStep((s) => Math.max(0, s - 1));
              }}
            >
              Back
            </Button>
          )}
          {step < 2 && (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !allFilled}
            >
              {step === 0 ? "I've got these — continue" : "Next"}
            </Button>
          )}
          {step === 2 && (
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {error ? "Try again" : "Connect"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ status }: { status: "connected" | "error" | "none" }) {
  if (status === "connected")
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Ready to use
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Needs attention
      </Badge>
    );
  return <Badge variant="secondary">Not set up yet</Badge>;
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

  const status: "connected" | "error" | "none" =
    row?.status === "connected" ? "connected" : row?.status === "error" ? "error" : "none";

  const handleDisconnect = async () => {
    setWorking(true);
    try {
      await disconnectFn({ data: { provider: provider.id } });
      toast.success(`${provider.name} disconnected.`);
      onChanged();
    } finally {
      setWorking(false);
    }
  };

  const handleTest = async () => {
    setWorking(true);
    try {
      const r = await testFn({ data: { provider: provider.id } });
      if (r.ok) toast.success(`${provider.name} is working.`);
      else toast.error(r.error);
      onChanged();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center ${provider.accent}`}
          >
            <provider.Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="font-display font-semibold text-foreground">{provider.name}</div>
              {provider.recommended && (
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0">
                  Recommended
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{provider.category}</div>
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{provider.blurb}</p>

      {status === "connected" && row?.metadata && (
        <div className="mt-3 rounded-md bg-muted/40 border border-border p-2.5 text-xs space-y-1">
          {Object.entries(row.metadata)
            .filter(([, v]) => v !== null && v !== "")
            .slice(0, 2)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-muted-foreground capitalize">
                  {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                </span>
                <span className="font-mono truncate max-w-[60%] text-foreground">{String(v)}</span>
              </div>
            ))}
          {row.last_verified_at && (
            <div className="flex items-center gap-1 text-muted-foreground pt-1 border-t border-border">
              <Clock className="h-3 w-3" /> Last checked {timeAgo(row.last_verified_at)}
            </div>
          )}
        </div>
      )}

      {status === "error" && row?.last_error && (
        <div className="mt-3 rounded-md bg-destructive/5 border border-destructive/30 p-2.5 text-xs text-destructive">
          {row.last_error}
        </div>
      )}

      <div className="mt-auto pt-4 flex flex-wrap gap-2">
        {status === "none" ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            Set up
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={handleTest} disabled={working}>
              {working && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Re-check
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Update
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={working}>
              Disconnect
            </Button>
          </>
        )}
      </div>

      <ConnectWizard
        provider={provider}
        open={open}
        onOpenChange={setOpen}
        onSuccess={onChanged}
      />
    </div>
  );
}

function ManagedCard({ m }: { m: (typeof MANAGED)[number] }) {
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
      <p className="mt-3 text-sm text-muted-foreground">{m.blurb}</p>
    </div>
  );
}

function ComingSoonCard({ c }: { c: ComingSoon }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center ${c.accent} opacity-70`}
          >
            <c.Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display font-semibold text-foreground">{c.name}</div>
            <div className="text-xs text-muted-foreground">{c.category}</div>
          </div>
        </div>
        <Badge variant="secondary">Coming soon</Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{c.blurb}</p>
      <p className="mt-2 text-xs text-muted-foreground">{c.reason}</p>
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
  const comingByCategory = COMING_SOON.reduce<Record<string, ComingSoon[]>>((acc, c) => {
    (acc[c.category] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-10 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Integrations</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Connect Kinetic to the tools you already use. Each setup is a 3-step guided wizard — we
          test the credentials live before saving anything, so you'll know straight away if
          something's wrong.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Built-in (nothing to set up)
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {MANAGED.map((m) => (
            <ManagedCard key={m.id} m={m} />
          ))}
        </div>
      </section>

      {Object.entries(grouped).map(([cat, defs]) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {cat}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {defs.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                row={byProvider.get(p.id)}
                onChanged={refresh}
              />
            ))}
            {(comingByCategory[cat] ?? []).map((c) => (
              <ComingSoonCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      ))}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your connections…
        </div>
      )}
    </div>
  );
}
