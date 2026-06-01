import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageSquare, Brain, CreditCard, BarChart3, Database, CheckCircle2, Circle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Kinetic" }] }),
  component: IntegrationsPage,
});

type Integration = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: "connected" | "available" | "coming_soon";
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

const INTEGRATIONS: Integration[] = [
  {
    id: "supabase",
    name: "Supabase",
    description: "Database & authentication powering your workspace.",
    category: "Infrastructure",
    status: "connected",
    Icon: Database,
    accent: "bg-emerald-500/10 text-emerald-600",
  },
  {
    id: "openai",
    name: "Lovable AI (OpenAI + Gemini)",
    description: "AI message generation, lead research, and reply triage.",
    category: "AI",
    status: "connected",
    Icon: Brain,
    accent: "bg-violet-500/10 text-violet-600",
  },
  {
    id: "resend",
    name: "Resend",
    description: "Transactional email delivery with high deliverability.",
    category: "Email",
    status: "available",
    Icon: Mail,
    accent: "bg-blue-500/10 text-blue-600",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Send through your team's Google Workspace mailboxes.",
    category: "Email",
    status: "available",
    Icon: Mail,
    accent: "bg-red-500/10 text-red-600",
  },
  {
    id: "outlook",
    name: "Microsoft Outlook",
    description: "Send through Microsoft 365 mailboxes.",
    category: "Email",
    status: "available",
    Icon: Mail,
    accent: "bg-sky-500/10 text-sky-600",
  },
  {
    id: "twilio",
    name: "Twilio (SMS + WhatsApp)",
    description: "Multi-channel outreach over SMS and WhatsApp.",
    category: "Messaging",
    status: "available",
    Icon: MessageSquare,
    accent: "bg-rose-500/10 text-rose-600",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Subscriptions, billing, and one-time payments.",
    category: "Billing",
    status: "available",
    Icon: CreditCard,
    accent: "bg-indigo-500/10 text-indigo-600",
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Product analytics, funnels, and session recordings.",
    category: "Analytics",
    status: "available",
    Icon: BarChart3,
    accent: "bg-amber-500/10 text-amber-600",
  },
];

function StatusPill({ status }: { status: Integration["status"] }) {
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
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in-up">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Connect your favorite tools to accelerate setup. Click an integration to start the
          connection flow — we'll handle OAuth and key management for you.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATIONS.map((it) => (
          <div
            key={it.id}
            className="group rounded-2xl border border-border bg-card p-5 shadow-elevation-1 hover:shadow-elevation-2 hover:border-primary/40 transition cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className={`size-10 rounded-xl grid place-items-center ${it.accent}`}>
                <it.Icon className="size-5" />
              </div>
              <StatusPill status={it.status} />
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <h3 className="font-display font-semibold tracking-tight">{it.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{it.category}</p>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{it.description}</p>
            </div>
            <button
              type="button"
              disabled={it.status !== "available"}
              className="mt-5 w-full h-9 rounded-lg text-sm font-medium border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {it.status === "connected" ? "Manage" : it.status === "coming_soon" ? "Notify me" : "Connect"}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground bg-card/50">
        Need another integration? Ask in chat and we'll wire it up. Connection flows for Gmail,
        Outlook, Twilio, Stripe, and PostHog are queued for the next iteration.
      </div>
    </div>
  );
}
