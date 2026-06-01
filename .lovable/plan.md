## Goal

Replace the current UI with a clean, modern SaaS dashboard (Cloud White palette, Space Grotesk + DM Sans, dashboard layout) that fixes every overlay/visibility issue, and wire in integrations to speed up onboarding. All existing functionality is preserved — only the shell, surfaces, and pages are rebuilt.

## Design system (locked)

Rewrite `src/styles.css` from scratch with a single, opinionated token set:

- Background `#FAFBFC`, surface `#FFFFFF`, border `#E8ECF1`, muted `#94A3B8`, foreground `#0F172A`, primary `#3B82F6` (with `--primary-hover`, `--primary-soft`).
- Dark mode mirror (deep slate bg, white-on-dark surfaces, same blue primary).
- Sidebar tokens: opaque white surface, hard 1px border, no transparency.
- Overlay token: `--overlay: rgb(15 23 42 / 0.6)` + `backdrop-blur(8px)`.
- Surface tokens for popovers/dialogs/sheets: forced opaque white in light, opaque slate-900 in dark — no token references that resolve to translucent colors.
- Elevation scale (`--shadow-sm/md/lg/xl`) used consistently.
- Typography: import Space Grotesk (600/700) for headings, DM Sans (400/500) for body via `@import` in `styles.css`; set `font-family` on `html`, headings get `font-display`.
- Radius scale 8/12/16; spacing rhythm on 4px.

## Overlay & sheet rebuild (root cause fix)

Rewrite `dialog.tsx`, `sheet.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `select.tsx`, `command.tsx`:
- Overlay: `bg-[var(--overlay)] backdrop-blur-md`, fixed inset-0, z-50.
- Content: `bg-card text-card-foreground border border-border shadow-xl rounded-2xl` — no `bg-popover/95`, no opacity modifiers, no `!important` hacks. Add explicit `isolate` + `z-50`.
- Add a portal `<div id="overlay-root">` in `__root.tsx` so Radix portals always mount above app content.
- Audit `sidebar.tsx` for any `bg-sidebar/X` opacity — replace with solid token.

## App shell rewrite

New `src/components/app-shell/`:
- `AppSidebar.tsx` — collapsible icon sidebar with grouped nav (Dashboard, Leads, Campaigns, Inbox, Analytics, AI Engine, Integrations, Settings), active state via `useRouterState`, workspace switcher at top, user menu at bottom.
- `AppHeader.tsx` — breadcrumb, global command-K search, theme toggle, notifications, quick-create button.
- `PageHeader.tsx`, `EmptyState.tsx`, `StatCard.tsx`, `DataTable.tsx`, `Section.tsx` primitives so every page looks consistent.
- `ThemeProvider.tsx` — class-based dark/light with localStorage + system default.

Wire shell in `src/routes/_authenticated.tsx`. Public routes (`/login`) keep their own minimal shell.

## Page redesigns (functionality unchanged)

All pages move to: `PageHeader` → KPI strip → main `Card` content. No business-logic changes; just markup + tokens.

1. **Dashboard (`/`)** — KPI tiles (active campaigns, leads, messages sent, reply rate), recent activity, AI engine status, integration health.
2. **Leads** — `DataTable` with column filters, bulk select, side-`Sheet` for lead detail, CSV import button.
3. **Campaigns** — card grid + table toggle; create wizard rebuilt inside a proper `Dialog` (now fully opaque) with stepper.
4. **Campaign detail** — tabs (Overview / Sequence / Audience / Messages / Settings).
5. **Inbox** — three-pane layout (threads / message / lead context).
6. **Analytics** — recharts re-themed to tokens, time-range tabs, integrates PostHog event counts when configured.
7. **AI Engine** — job stream, model selector, reasoning trace viewer.
8. **Integrations** (new) — connection cards for Gmail, Outlook, Resend, Twilio (SMS/WhatsApp), OpenAI, Stripe, PostHog with status chip + connect/disconnect.
9. **Settings** — workspace, sender identity, team, billing tab.
10. **Login/Signup** — generous spacing, two-column hero, Google + email/password, password strength.

## Integrations wiring

All implemented as `createServerFn` (or `/api/public/*` for webhooks):

- **Resend** — connect via `standard_connectors--connect("resend")`; `src/lib/email-send.functions.ts` sends through the connector gateway when the campaign mailbox provider is `resend`. Adds a "Resend" option in the mailbox connect dialog.
- **Twilio** — `standard_connectors--connect("twilio")`; new `channel` extension on `sequence_steps` (`sms`, `whatsapp`); `src/lib/twilio.functions.ts` for send; mailbox UI gains SMS/WhatsApp sender rows.
- **OpenAI** — already covered by Lovable AI Gateway; expose model picker (gpt-5, gpt-5-mini, gemini-2.5-pro) on AI Engine page and per-campaign override stored in `campaigns.ai_model` (new column).
- **Stripe** — call `payments--recommend_payment_provider` then `enable_stripe_payments`; add Billing tab in Settings with plan + usage; gate seat count > N behind paid plan.
- **PostHog** — request `POSTHOG_API_KEY` + `POSTHOG_HOST` via `add_secret`; `src/lib/analytics-posthog.functions.ts` proxies event capture; client snippet in `__root.tsx` initialises `posthog-js` when public key env is set; surface top events on Analytics page.
- **Supabase** — already the backend; no change. Confirm `attachSupabaseAuth` is registered in `src/start.ts`.

## Database migration

Single migration:
- `ALTER TABLE campaigns ADD COLUMN ai_model TEXT DEFAULT 'google/gemini-2.5-flash';`
- `ALTER TABLE sequence_steps`: extend `step_channel` enum to include `sms`, `whatsapp`.
- `ALTER TABLE mailboxes`: allow `provider` values `resend`, `twilio_sms`, `twilio_whatsapp` (no enum, already text).
- New `integrations` table (workspace_id, kind, status, metadata jsonb) + RLS + GRANTs to track which connectors are linked per workspace.

## File map

- Rewrite: `src/styles.css`, `src/components/ui/{dialog,sheet,popover,dropdown-menu,select,command,sidebar}.tsx`, `src/routes/__root.tsx`, `src/routes/_authenticated.tsx`, `src/routes/login.tsx`, all `_authenticated/*.tsx` pages.
- Create: `src/components/app-shell/*`, `src/components/theme-provider.tsx`, `src/lib/{email-send,twilio,analytics-posthog,integrations}.functions.ts`, `src/routes/_authenticated/integrations.tsx`.
- Touch: `src/start.ts` (verify auth attacher), `index.html` (font preconnect).

## Order of execution

1. Migration (ai_model, channels, integrations table).
2. Design tokens + font wiring.
3. Overlay/sheet/sidebar primitives rewrite.
4. App shell + theme provider.
5. Page redesigns (Dashboard → Leads → Campaigns → Inbox → Analytics → AI Engine → Settings → Login).
6. Integrations page + connector wiring (Resend, Twilio, PostHog).
7. Stripe enable flow.
8. Smoke test every route at 677px and desktop, verify dialogs/sheets are fully opaque.

## Out of scope

- Multi-tenant inbox threading beyond current schema.
- Custom OAuth apps for Gmail/Outlook (still uses existing per-user flow already wired).
- Real send worker / cron (already planned separately).

## Secrets needed

I'll request via `add_secret` when we reach step 6: `POSTHOG_API_KEY`, `POSTHOG_PUBLIC_KEY`, `POSTHOG_HOST`. Resend/Twilio come from connector linking (no manual secret entry). Stripe via the enable tool.
