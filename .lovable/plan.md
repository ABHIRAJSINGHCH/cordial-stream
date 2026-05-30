## AI Outreach Operating System — Build Plan

A campaign-first workflow app (not an admin dashboard) for importing leads, building outreach sequences, generating AI-personalized messages, scheduling sends, and viewing replies. Linear/Notion feel with the "Structural monochrome" direction (Inter + JetBrains Mono, monochrome surfaces, blue AI accent, timeline-rail sequence builder, inspector side rail).

### Stack & Infra
- **TanStack Start** (existing template) + **Lovable Cloud** (Supabase) for auth, Postgres, and server functions
- **Auth**: email/password + Google (via Lovable broker) — workspace per user
- **AI**: Lovable AI Gateway (`google/gemini-3-flash-preview` default) for enrichment + message generation, called from `createServerFn` only
- **Email sending**: Lovable Emails (Resend-style integration) for outbound + a queued send job
- **No Next.js, Express, Prisma, Clerk** — the user agreed to the native stack

### Design Tokens (committed verbatim from the chosen prototype)
- BG `hsl(0 0% 98%)`, FG `hsl(0 0% 9%)`, muted `hsl(0 0% 45%)`, primary `hsl(212 100% 48%)`, border `hsl(0 0% 0% / 0.08)`
- Inter (sans) + JetBrains Mono (mono), `slideUp` keyframe with `cubic-bezier(0.16, 1, 0.3, 1)`
- Translated into `src/styles.css` oklch tokens; mono used for labels/meta and AI reasoning blocks

### App Shell
- Sidebar (Campaigns, Inbox, Lead Engine, Sequences, Analytics, Settings) — collapsible on mobile via Sheet
- Top header with campaign title, status pill, inline metrics chip (SENT / OPEN / REPLY), and primary action
- Right inspector rail with AI reasoning + activity feed on campaign editor pages
- Mobile: sidebar collapses to drawer, inspector rail collapses to bottom sheet

### Routes
- `/login` — email/password + Google
- `/onboarding` — workspace name, sender identity, default tone
- `/_authenticated/` — layout gate (synchronous `context.auth` + child `getUser()` hydration)
  - `/campaigns` (list) and `/campaigns/new` (first-screen creation wizard)
  - `/campaigns/$id` — **the hero page** — sequence builder + AI inspector
  - `/campaigns/$id/leads` — leads attached to campaign (table)
  - `/campaigns/$id/analytics` — sent/open/reply/booked + per-step funnel
  - `/leads` — global lead database, search, filter, tags, CSV import
  - `/leads/$id` — lead profile with AI enrichment summary + history
  - `/inbox` — replies grouped by thread, mark as booked / out-of-office / unsubscribe
  - `/sequences` — reusable sequence templates
  - `/templates` — reusable message templates
  - `/settings` — workspace, sender email domain, AI tone defaults
- `/api/public/webhooks/email` — Resend/Lovable Emails delivery + reply webhooks (HMAC verified)

### Database (Supabase migrations with GRANTs + RLS)
- `workspaces`, `workspace_members` (role: owner/member) + `has_role` security-definer fn
- `leads` (workspace_id, name, email, company, title, linkedin_url, website, tags[], status, enrichment_json, enrichment_status)
- `lead_notes`
- `campaigns` (workspace_id, name, status: draft/active/paused/completed, send_window, daily_cap, created_by)
- `campaign_leads` (join table with per-lead state: queued / in_step / replied / bounced / unsubscribed)
- `sequence_steps` (campaign_id, position, channel: email/linkedin/manual, wait_days, subject_template, body_template, tone)
- `messages` (campaign_lead_id, step_id, channel, subject, body, ai_reasoning, ai_confidence, status: pending_approval/scheduled/sent/failed/replied, scheduled_at, sent_at)
- `message_events` (message_id, type: open/click/reply/bounce/unsubscribe, payload, created_at)
- `ai_jobs` (workspace_id, kind: enrich/generate, status, input, output, error)
- All tables: RLS scoped to `workspace_id` via membership; explicit GRANTs to `authenticated` + `service_role`

### Server Functions (createServerFn)
- `auth.bootstrapWorkspace` — create workspace + membership on first login
- `leads.import` (CSV), `leads.create`, `leads.update`, `leads.enqueueEnrichment`
- `leads.enrich` — calls AI Gateway, fills `enrichment_json` (company size, recent activity, hiring signals, pain points, outreach angles)
- `campaigns.create/update/list/get`
- `sequence.upsertStep`, `sequence.reorderSteps`
- `messages.generate` — for a (lead, step) pair, builds prompt from enrichment + tone, returns `{subject, body, reasoning, confidence}` via tool-calling for structured output
- `messages.approve` / `messages.reject` / `messages.regenerate`
- `campaigns.launch` — materializes pending messages per lead with `scheduled_at` based on send window + jitter + daily cap
- `inbox.listThreads`, `inbox.markReplied`, `inbox.stopSequenceOnReply`
- `analytics.campaignSummary` — counts grouped by status & event type

### Server Routes
- `/api/public/webhooks/email` — verifies signature, writes `message_events`, auto-pauses sequence on reply
- `/api/public/cron/dispatch-outreach` — called every minute by pg_cron; sends due `scheduled` messages via Lovable Emails with jitter + per-workspace daily caps

### AI Personalization Engine
- Prompt assembles: lead enrichment JSON + workspace tone + step template + previous thread context
- Uses tool-calling (`generate_outreach`) for guaranteed JSON `{subject, body, reasoning_bullets[], confidence}`
- Reasoning bullets surface in the inspector rail under "why this message" with monospace styling
- Confidence ≥ 0.8 + workspace setting → auto-schedule; else queued for approval

### Automation Safety
- Per-workspace daily send cap (default 50)
- Send-window enforcement in lead's local time (fallback workspace tz)
- 30–180s randomized jitter between sends
- Auto-pause sequence for a lead on reply / bounce / unsubscribe
- All sends logged in `message_events`

### Modular Architecture
- `src/lib/ai/` — gateway client, prompt builders, tool schemas
- `src/lib/outreach/` — sequence engine, scheduler, dispatcher
- `src/lib/leads/` — CSV parsing, enrichment orchestration
- `src/components/app/` — shell (Sidebar, Header, InspectorRail)
- `src/components/campaigns/` — SequenceBuilder, StepCard, AIReasoningPanel
- `src/components/leads/` — LeadTable, LeadDrawer, CSVImporter, EnrichmentChip
- `src/components/inbox/` — ThreadList, ThreadView
- All UI uses shadcn primitives themed with the monochrome tokens

### What ships in this build
Auth + workspace bootstrap, full lead module (manual + CSV + AI enrichment), campaign editor with sequence builder, AI message generation + approval queue, scheduling + dispatch via Lovable Emails, inbox with reply detection, analytics strip, mobile-responsive shell, realistic seed data on first login.

### What is scaffolded but not wired
LinkedIn / WhatsApp browser-automation modules — interface + DB tables + UI states present, executors stubbed (out of scope for v1). Team collaboration tables exist; UI is single-user.

### Setup
README documents: enabling Lovable Cloud (auto), enabling Lovable Emails + domain, seeding demo data, environment variables (all auto-provisioned via Cloud + AI Gateway).
