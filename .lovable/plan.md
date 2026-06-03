## Why "Couldn't connect" is happening right now

The Gmail / Outlook SMTP verifier in `src/lib/integrations.server.ts` opens a raw TCP socket using Node's `net.connect` + `tls.connect`. The app runs on a Cloudflare Worker SSR runtime — even with `nodejs_compat`, raw outbound TCP via `node:net` is **not supported** there. So the verifier throws immediately and the UI shows the generic "Couldn't connect" message regardless of whether your App Password is correct.

This is the real bug, not your password. We have to stop trying to do SMTP from the Worker and switch each email provider to an HTTPS-based path that actually works in this runtime.

## What I'll change

### 1. Replace SMTP with paths that work + are non-technical

| Provider | Old (broken / scary) | New (works + simple) |
|---|---|---|
| Gmail | App Password + SMTP socket | **One-click "Sign in with Google"** via the built-in Gmail connector — no passwords typed anywhere |
| Outlook | Account password + SMTP socket | Removed for now (no OAuth connector available); UI says "coming soon" instead of failing |
| Resend | API key + From email | Kept, but with a guided wizard (see below) |
| Stripe | Secret key paste | **One-click "Connect Stripe"** via the built-in Stripe connector |
| Twilio / OpenAI / PostHog | API keys | Kept, with the guided wizard |

Gmail OAuth uses the Lovable Gmail connector — the user just clicks "Connect Gmail", picks their Google account in a popup, and is done. No App Password, no 2FA setup, no SMTP terminology.

### 2. Guided, non-technical Connect wizard

Each "Connect" button opens a 3-step wizard instead of a flat form:

```text
Step 1 — What you'll need
   Plain-English checklist + a "Open <provider> dashboard" button
   that deep-links to the exact page where the value lives.

Step 2 — Paste the value
   One field at a time. Each field has:
     • Friendly label   ("Your sending email address")
     • Plain hint       ("This is the email people will see in their inbox")
     • "Where do I find this?" expandable with screenshot-style instructions
     • Paste button that auto-trims whitespace + hidden characters

Step 3 — We'll test it for you
   Live verification with a progress indicator, then either:
     ✓  "Connected. Sending a test message to <you>?" (optional)
     ✗  Specific, human error (see error mapping below)
```

### 3. Real error messages instead of "Couldn't connect"

The server already returns `{ ok: false, error }`, but the messages are generic. I'll map common upstream responses to actionable text:

| Upstream signal | Shown to user |
|---|---|
| Resend 401 / 403 | "Resend didn't accept that key. Double-check you copied the whole key starting with `re_`." |
| Resend 422 "domain not verified" | "Resend says `<domain>` isn't verified yet. Open Resend → Domains and finish DNS setup." |
| Twilio 401 | "Twilio rejected the SID/token pair. Make sure both come from the same project in Twilio Console." |
| Stripe 401 | "Stripe didn't accept that key. Use a Secret key (starts with `sk_`), not a Publishable key." |
| Network/timeout | "We couldn't reach <provider> from the server. Try again in a moment." |

### 4. Friendlier card UX

- Status pill becomes "Ready to send", "Needs attention", or "Not set up yet" instead of "Connected/Error/Not connected".
- Connected cards show a one-line summary in plain English: "Sending from `ops@acme.com` — last checked 2 min ago".
- "Send test" button on every connected card (sends a test email / SMS / event to the logged-in user) so users know it really works end-to-end.

## Files changed

1. **`src/lib/integrations.server.ts`** — delete the raw-socket SMTP code (`net`/`tls`/`smtpVerify`/`verifyGmailSmtp`/`verifyOutlookSmtp`); refine error mapping for Resend/Twilio/Stripe/OpenAI/PostHog.
2. **`src/lib/integrations.functions.ts`** — drop `smtp_gmail` / `smtp_outlook` from the provider enum; add `gmail_oauth` provider backed by the Gmail connector (status read from `list_connections` result, no credentials stored in `user_integrations`).
3. **New `src/lib/integrations-gmail.functions.ts`** — server fn that returns whether the Gmail connector is linked + the connected email address, and a "send test" server fn that uses the gateway.
4. **`src/routes/_authenticated/integrations.tsx`** — rewrite into the 3-step wizard, replace SMTP cards with a single "Gmail" card that triggers the connector flow, replace Stripe BYOK card with a "Connect Stripe" card, add "Send test" buttons, switch status copy to plain English.
5. **Migration** — no schema change; `smtp_gmail` / `smtp_outlook` rows (if any) are left in the DB but hidden from the UI.

## Connectors I'll wire up (one-click, no typing)

- **Gmail** (`google_mail`) — replaces Gmail SMTP entirely.
- **Stripe** (`stripe--enable_stripe`) — replaces Stripe BYOK.

Both are already available in this workspace; the user only sees a "Sign in with Google" / "Connect Stripe" popup.

## Out of scope (calling out)

- **Outlook**: there's no Outlook connector available, and SMTP doesn't work in this runtime. I'll show it as "Coming soon" rather than ship something broken. If you need Outlook urgently, the realistic path is to register an Azure OAuth app — bigger piece of work, separate request.
- **Actually sending campaign emails through Gmail**: this plan makes the connection real and testable. Wiring it into the campaign sender is the next step.

## Order of work

1. Rip out raw-socket SMTP from `integrations.server.ts`.
2. Link the Gmail + Stripe connectors and add the small server fns that read their status.
3. Rewrite the page into the 3-step wizard with the new copy + error mapping.
4. Smoke test Gmail OAuth, Stripe OAuth, and one API-key provider (Resend) end-to-end.