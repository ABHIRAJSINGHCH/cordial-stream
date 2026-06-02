## Goal

Replace the "copy this into Lovable chat" flow with real, self-serve in-app integrations. Each Connect button collects credentials in a dialog, a server function verifies them live against the provider, and on success stores them encrypted per-user in the database.

## Storage model

New table `public.user_integrations`:

```text
id              uuid pk
user_id         uuid  (auth.uid())
workspace_id    uuid  (current workspace)
provider        text  ('resend' | 'twilio' | 'posthog' | 'openai' | 'smtp_gmail' | 'smtp_outlook' | 'stripe')
status          text  ('connected' | 'error')
secret_ciphertext bytea   -- AES-256-GCM(JSON credentials)
secret_iv       bytea
metadata        jsonb     -- non-secret display fields (from address, smtp host, posthog host, twilio from-number, stripe account name)
last_verified_at timestamptz
last_error      text
created_at / updated_at
unique (user_id, provider)
```

RLS: row owner only (`user_id = auth.uid()`), plus workspace member read for visibility on shared integration list. No grant to anon.

Encryption: AES-256-GCM with a server-only `INTEGRATION_ENC_KEY` (32-byte base64). I'll request that secret once via add_secret — it's the master key, not a per-provider key, so it's a one-time setup and never asked again.

## Server functions (`src/lib/integrations.functions.ts` + `integrations.server.ts`)

All `createServerFn` + `requireSupabaseAuth`. Plain helpers in `.server.ts`.

- `listIntegrations()` → array of `{ provider, status, metadata, last_verified_at, last_error }` for the current user. Never returns secrets.
- `connectIntegration({ provider, credentials, metadata })` → verifies live, then upserts. Returns `{ ok, error?, metadata? }`.
- `disconnectIntegration({ provider })` → deletes row.
- `testIntegration({ provider })` → re-runs verification using stored credentials.

### Per-provider verification (lives in `integrations.server.ts`)

| Provider | Inputs | Live check |
|---|---|---|
| Resend | `apiKey`, `fromEmail` | `GET https://api.resend.com/domains` with Bearer key → 200 |
| Twilio | `accountSid`, `authToken`, `fromNumber` | `GET https://api.twilio.com/2010-04-01/Accounts/{sid}.json` with Basic auth → 200 |
| PostHog | `projectApiKey`, `host` (default `https://us.i.posthog.com`) | `POST {host}/decide?v=3` with `{ api_key, distinct_id: "lovable-verify" }` → 200 |
| OpenAI | `apiKey` | `GET https://api.openai.com/v1/models` with Bearer key → 200 |
| Gmail SMTP | `email`, `appPassword` | TCP connect + STARTTLS + AUTH LOGIN to `smtp.gmail.com:587` using `nodemailer.createTransport(...).verify()` |
| Outlook SMTP | `email`, `password` | Same against `smtp-mail.outlook.com:587` |
| Stripe | `secretKey` (sk_live_ / sk_test_) | `GET https://api.stripe.com/v1/account` with Bearer key → 200, store `account.id` + `business_profile.name` in metadata |

nodemailer is Worker-compat-friendly with `nodejs_compat` enabled (uses `net`/`tls`, both supported). If it trips the runtime, I'll fall back to a raw `tls.connect` + SMTP handshake in `.server.ts`.

All verification calls use `AbortSignal.timeout(8000)`. On failure, the function returns `{ ok: false, error: "<short reason>" }` and does NOT persist the row (existing connected row left untouched).

## Frontend rewrite of `src/routes/_authenticated/integrations.tsx`

- Load real status via `useSuspenseQuery` against `listIntegrations`. Status pill comes from DB, not localStorage.
- One dialog component per setup-kind: `apikey` (one field), `apikey+from` (Resend / SMTP), `twilio` (three fields), `posthog` (key + host), `stripe` (one field).
- Drop "managed" copy for Supabase / Lovable AI — leave them as informational cards with no Connect button.
- Drop Gmail OAuth / Outlook OAuth / "paste in chat" copy entirely. Replace with SMTP forms (Gmail = App Password, Outlook = account password) with inline links to provider docs.
- Submit handler calls `connectIntegration`, shows toast, on success closes dialog and invalidates the query. On failure shows the `error` string inline.
- Connected card shows masked metadata (e.g. `from: ops@acme.com`, `account: acct_123…`, `last verified 2 min ago`) plus `Test` and `Disconnect` buttons.
- Remove all localStorage code and the chat-prompt copy block.

## Secret required

I'll request exactly one secret via `add_secret`:

- `INTEGRATION_ENC_KEY` — 32-byte base64, used by the server to AES-GCM encrypt every provider credential blob. This is the only "Lovable prompt" the user will ever see, and it's a one-time workspace setup — not per-integration.

## Out of scope (call out)

- No background send worker — these integrations make credentials reachable; wiring them into campaign execution is the next step.
- Stripe uses a raw secret key (BYOK) as you chose; this is intentionally NOT the recommended Lovable payments flow. Subscription/checkout UX comes later.
- No Gmail/Outlook OAuth (would require registering OAuth apps in Google Cloud / Azure). SMTP-only as agreed.

## Order of work

1. Migration: create `user_integrations` + RLS + GRANTs.
2. Request `INTEGRATION_ENC_KEY` secret.
3. `integrations.server.ts` — encryption helpers + per-provider verifiers.
4. `integrations.functions.ts` — list / connect / disconnect / test.
5. Rewrite `integrations.tsx` page with real dialogs + live verification.
6. Smoke test each provider end-to-end via `invoke-server-function`.
