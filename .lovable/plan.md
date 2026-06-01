# Plan — Overlay polish + email sending pipeline

## 1. Fix remaining overlay / surface visibility

Symptom: dialog and sheet content still feels washed-out and bleeds into the page; sidebar edge is unclear on the 677px viewport.

- `src/components/ui/dialog.tsx`
  - Bump overlay to `bg-black/70` and add explicit `supports-[backdrop-filter]:bg-black/55` fallback.
  - Force the content surface opaque: `bg-popover` → add `!bg-popover` + `border-2 border-border/80` and keep `shadow-elevation-3`.
  - Wrap children in `<div className="relative isolate">` so internal cards don't inherit transparency.
- `src/components/ui/sheet.tsx`
  - Same overlay treatment.
  - Sheet content: add `bg-popover` (already there) but switch to `shadow-[var(--shadow-elevation-3)]` and `border-l-2 border-border`.
- `src/styles.css`
  - Add `--overlay: oklch(0 0 0 / 0.7);` token and reference from dialog/sheet.
  - Raise `--sidebar-border` to `oklch(0.205 0 0 / 0.16)` and add a 1px right border + `shadow-elevation-1` on the sidebar in `_authenticated.tsx` so it floats clearly above the page on narrow viewports.
- `src/routes/_authenticated.tsx`
  - Sidebar container: `bg-sidebar border-r border-sidebar-border shadow-[var(--shadow-elevation-1)]`.
  - Main content wrapper: `bg-background` (explicit) so nothing inherits sidebar color.

## 2. Real Gmail + Outlook connection (per-user OAuth)

- Use Lovable standard connectors (`gmail`, `microsoft-outlook`) instead of hand-rolled OAuth.
- `src/routes/_authenticated/settings.tsx`
  - Replace the placeholder "Connect Gmail / Outlook" buttons with calls to a new server fn `startMailboxOAuth({ provider })` that returns the connector authorize URL, then opens it in a popup. On callback we persist a row in `mailboxes` (provider, email, status=`connected`, metadata={connection_id}).
- New server fn file `src/lib/mailbox-oauth.functions.ts` — wraps `authorizeAppUserOAuth` for `gmail` / `microsoft-outlook`.
- Update `src/lib/mailboxes.functions.ts` `deleteMailbox` to also revoke the connector connection.

## 3. Scheduled send worker

- New public API route `src/routes/api/public/send-due-messages.ts`
  - HMAC-verified (`SEND_WORKER_SECRET`). Picks up `messages` where `status='approved' AND scheduled_at <= now()`, groups by `campaign_id → mailbox_id`, and dispatches through the connector gateway (Gmail `users/me/messages/send` or Outlook `me/sendMail`) using `callAsAppUser` with the mailbox's stored `connection_id`.
  - On success: `status='sent'`, `sent_at=now()`, insert `message_events(type='sent')`. On failure: `status='failed'` + event with error.
- pg_cron entry (migration) hitting the stable `project--<id>.lovable.app/api/public/send-due-messages` URL every minute.

## 4. Inbox webhook (reply capture)

- Public route `src/routes/api/public/mailbox-webhook.ts` — receives Gmail push / Outlook subscription notifications, looks up mailbox by external id, fetches the new message via connector, matches `In-Reply-To` against `messages.id`, inserts a `message_events(type='reply')` row and flips lead status to `replied`.
- Settings page gains a "Listening for replies" indicator per mailbox.

## 5. Wire-up + secrets

- `secrets--add_secret` for `SEND_WORKER_SECRET` and `MAILBOX_WEBHOOK_SECRET`.
- `standard_connectors--connect` for `gmail` and `microsoft-outlook` (asked once at first use).
- Update `.lovable/plan.md` to reflect new architecture.

## Out of scope (still)

- Multi-tenant inbox UI threading (current Inbox page keeps showing latest reply per lead).
- Bounce/spam classification beyond the raw event row.

## Order of execution

1. Overlay + sidebar surface fixes (CSS + dialog/sheet/_authenticated).
2. Mailbox OAuth via connectors + settings UI.
3. Send worker route + cron migration + secret.
4. Inbox webhook + secret.
5. Smoke test: create campaign → connect Gmail → approve a draft → cron sends → reply event lands in Inbox.
