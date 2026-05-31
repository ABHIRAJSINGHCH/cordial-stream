## Problems found

1. **Sidebar bleeds into content** — `--sidebar` and `--background` are both near-white (`oklch(1)` vs `oklch(0.985)`), so the right border is the only separator. Same issue in dark mode is subtle.
2. **Dialog overlay washes out** — popover/dialog uses pure white on a near-white page with a weak backdrop; the modal looks merged with the page.
3. **Campaign creation is too thin** — only `name` + `goal`. Cannot actually drive research or sending (no audience definition, no sender identity, no channel choice, no value prop / CTA).
4. **No email-sending integration** — nothing connects to Gmail or Outlook, so "send" can't really run.
5. **Analytics route is a placeholder** — no charts, no metrics.
6. **AI Engine sidebar item is dead** — it's a static `<div>`, not a link, with no destination route.
7. **Login spacing/polish** — cramped, no visible hierarchy on small screens, no link separation.

## Plan

### 1. Design tokens — fix contrast (`src/styles.css`)
- Page background → a touch warmer/darker (`oklch(0.97 0 0)`) so white sidebar/cards visibly float.
- Sidebar stays pure white in light, slightly lifted in dark.
- Strengthen dialog overlay (darker, blurred) by overriding overlay class in `dialog.tsx`.
- Add `--elevation-1` shadow token for cards/dialogs.

### 2. Dialog + Sheet overlays (`src/components/ui/dialog.tsx`, `sheet.tsx`)
- Increase backdrop opacity to ~60% with `backdrop-blur-sm`.
- Add real shadow + ring on `DialogContent` / `SheetContent` so they read as elevated.

### 3. Authenticated layout (`src/routes/_authenticated.tsx`)
- Add `AI Engine` to NAV pointing to `/ai-engine` (new route).
- Apply new sidebar background, add subtle right shadow, ensure mobile sheet uses fixed dark overlay.

### 4. Expanded campaign creation (`src/routes/_authenticated/campaigns.tsx` + `campaigns.functions.ts`)
Replace minimal dialog with a 2-step or scrollable form capturing:
- **Basics**: name, objective/goal, default tone (Select).
- **Audience research brief**: target industry, company size, target role/title, geography, pain point (used by AI enrichment + message generation).
- **Sender identity**: sender name, sender email, signature, calendar/CTA link.
- **Channel**: email / linkedin (default email).
- **Sending channel binding**: pick a connected mailbox (Gmail / Outlook / SMTP fallback) — list connections from a new `email_accounts` table; show "Connect Gmail" / "Connect Outlook" buttons if none.

Persist new fields on `campaigns` via migration (audience_brief jsonb, sender_name, sender_email, signature, cta_url, email_account_id).

### 5. Email connector wiring
- New `email_accounts` table (id, workspace_id, provider [`gmail`|`outlook`|`smtp`], email, display_name, oauth_tokens jsonb, status).
- Settings page gains "Mailboxes" section with **Connect Gmail** / **Connect Outlook** buttons that kick off OAuth via the Lovable connector flow (Google Mail / Microsoft Outlook connectors).
- Server fn `sendCampaignMessage` routes through the matching connector gateway (Gmail `users/me/messages/send` or Outlook `me/sendMail`).
- Campaign create dialog references one of these accounts.

### 6. Analytics page (`src/routes/_authenticated/analytics.tsx`)
Build a real dashboard:
- KPI tiles: messages sent, open rate, reply rate, positive reply rate, leads enriched (7d / 30d toggle).
- Time-series line chart (sent vs replied) using `recharts` (already in deps via shadcn chart).
- Top campaigns table with sent / reply%.
- Server fn `getAnalytics({ workspace_id, range })` aggregating from `messages` + `message_events`.

### 7. AI Engine route (`src/routes/_authenticated/ai-engine.tsx`)
New page exposing:
- Active model (Lovable AI Gateway), default prompt persona.
- Recent `ai_jobs` table with status, kind, duration, output preview.
- Toggle: auto-approve threshold (already on `workspaces`).
- "Test prompt" panel that runs a small generation against a sample lead.

Make sidebar entry a `<Link>` so it actually navigates.

### 8. Login polish (`src/routes/login.tsx`)
- Increase vertical rhythm (`space-y-10`, larger headline, looser leading on supporting copy).
- Better divider, larger inputs (`h-11`), focus ring on `--ai`.
- Inline error state under inputs instead of toast-only.
- Mobile: stronger brand mark, centered card with soft shadow.
- Wire real Google sign-in via `lovable.auth.signInWithOAuth("google", ...)` (and call `configure_social_auth` for Google).

### 9. DB migration
- `alter table campaigns add audience_brief jsonb, sender_name text, sender_email text, signature text, cta_url text, email_account_id uuid`.
- `create table email_accounts (...)` with RLS scoped to workspace + GRANTs.

## Technical notes

- Email connectors: use `standard_connectors--connect` with `google_mail` and `microsoft_outlook`. Both route through `connector-gateway.lovable.dev`. These connect the **builder's** account — flag this in UI ("connects your Gmail to send from"). For per-user sender accounts later, we'd need full OAuth; out of scope here.
- All new server fns use `requireSupabaseAuth` middleware; chart data fetched via `useSuspenseQuery` in loader pattern.
- New dialog form: keep it as a single scrollable `DialogContent` with `max-h-[85vh] overflow-y-auto` rather than a wizard, to stay Linear-like.
- Sidebar fix is purely token-level — no component rewrite.

## Out of scope (call out to user)
- Per-end-user OAuth (each teammate connecting their own mailbox) — needs custom Google/MS OAuth app.
- Actual cron-based send scheduler — current "Send" remains manual approve → send-now until queue worker is built.

## Order of execution
1. Tokens + overlay polish (sidebar, dialogs, sheet, login spacing) — visible immediately.
2. Migration for `email_accounts` + extra campaign columns.
3. Expanded campaign form + sender/audience fields.
4. Connector wiring (Gmail/Outlook) + Settings mailbox section.
5. AI Engine route + sidebar link.
6. Analytics dashboard with real aggregations.
7. Google sign-in on login.