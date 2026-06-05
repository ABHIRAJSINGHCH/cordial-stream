## Goal

Make **Gmail** a real, working per-user connection (sign in with Google, send test email, send approved campaigns). Leave **Outlook** as "Coming soon" until Microsoft credentials are available.

## Before I start building

1. **Rotate the Google client secret** you pasted in chat (Google Cloud Console → Credentials → Reset Secret).
2. When I switch to build mode I'll open the secure secrets form and ask for:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET` (the new, rotated one)
3. The redirect URI in your Google client must be exactly:
   `https://project--a1011a39-4def-4a30-8e1d-c4182929c272.lovable.app/api/public/oauth/google/callback`
   (and the `-dev` variant for previews)

## What I'll build

### 1. Database (one migration)
Add columns to `mailboxes` for real OAuth:
- `provider_account_id`, `access_token_ciphertext`, `access_token_iv`
- `refresh_token_ciphertext`, `refresh_token_iv`, `token_expires_at`
- `scopes`, `last_test_at`, `last_test_status`, `last_test_error`
Add a short-lived `oauth_states` table (state, user_id, workspace_id, provider, expires_at) so the OAuth callback can verify the request came from this app.

### 2. Server: Gmail OAuth flow
- `startGmailConnect` server fn → generates a `state`, stores it, returns Google's consent URL (scopes: `openid email profile gmail.send`).
- Public route `GET /api/public/oauth/google/callback` → exchanges code for tokens, fetches the Gmail address, encrypts and stores tokens in `mailboxes`, marks status `ready`, redirects user back to `/integrations?connected=gmail`.
- `refreshGmailToken` helper (auto-runs when access token expires).
- `sendTestEmail({ mailboxId, to })` → sends a real test message via Gmail API; updates `last_test_*`.
- `sendCampaignMessage({ messageId, mailboxId })` → sends an approved campaign message via Gmail and writes a `message_event`.
- `disconnectMailbox({ id })`.

### 3. UI changes (frontend only beyond the server fns above)
- **Integrations page**: Gmail card becomes "Connect Gmail" (opens Google in a new tab). Outlook stays "Coming soon" with a short note.
- **Settings → Mailboxes**: list connected Gmail accounts with status badge (Ready / Needs sign-in again / Test failed), a "Send test email" button, and "Disconnect".
- **Campaign approval queue**: after approval, show "Send now" for email messages; picks the workspace's connected Gmail mailbox (or prompts to connect one). Status updates only after Gmail accepts the send.
- Replace technical wording ("OAuth", "pending_oauth", "credentials") with plain labels.

### 4. Verification pass I'll run after building
- Visit `/integrations`, click Connect Gmail, complete Google sign-in, confirm redirect lands back with the mailbox saved as "Ready".
- Click "Send test email" to your own address → confirm receipt.
- Approve a campaign message → click "Send now" → confirm Gmail accepts and message status flips to `sent`.
- Disconnect → reconnect cycle works.
- Refresh-token path: simulate expiry, confirm the next send refreshes silently.

## What I won't do
- Touch Outlook beyond keeping the "Coming soon" card.
- Bring back app passwords or SMTP.
- Mark anything as sent unless Gmail's API returns success.
- Store any secret in code or `.env` — only via the secure secrets form.

Ready for me to switch to build mode and start? I'll begin with the secrets form (after you've rotated the Google secret), then the migration, then the OAuth flow.
