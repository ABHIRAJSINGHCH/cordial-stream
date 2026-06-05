// Server-only Gmail OAuth + send helpers.
import { encryptJson, decryptJson } from "./integrations.server";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

const PROJECT_ID = "a1011a39-4def-4a30-8e1d-c4182929c272";
const PROD_BASE = `https://project--${PROJECT_ID}.lovable.app`;
const DEV_BASE = `https://project--${PROJECT_ID}-dev.lovable.app`;

/** Pick the base URL whose callback is registered in Google. */
export function pickRedirectBase(host: string | null | undefined): string {
  const h = (host ?? "").toLowerCase();
  if (h === new URL(PROD_BASE).host) return PROD_BASE;
  // Any other host (preview, id-preview, custom) falls back to the dev URL,
  // which is what we tell users to test on.
  return DEV_BASE;
}

export function buildGoogleConsentUrl(opts: {
  state: string;
  redirectUri: string;
  loginHint?: string;
}) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent", // force refresh_token issuance every time
    state: opts.state,
  });
  if (opts.loginHint) p.set("login_hint", opts.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(opts: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials missing");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials missing");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Refresh failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

export async function fetchUserInfo(accessToken: string): Promise<{
  sub: string;
  email: string;
  name?: string;
}> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch user info (${res.status})`);
  return (await res.json()) as { sub: string; email: string; name?: string };
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendGmailMessage(opts: {
  accessToken: string;
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string; threadId: string }> {
  const fromHeader = opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from;
  const rfc2822 = [
    `From: ${fromHeader}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    opts.body,
  ].join("\r\n");
  const raw = base64UrlEncode(rfc2822);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${txt.slice(0, 500)}`);
  }
  return (await res.json()) as { id: string; threadId: string };
}

// ---------- Token storage helpers ----------
export function encryptToken(token: string): { ciphertext: string; iv: string } {
  return encryptJson({ t: token });
}
export function decryptToken(ciphertext: string, iv: string): string {
  const v = decryptJson<{ t: string }>(ciphertext, iv);
  return v.t;
}

export type MailboxTokens = {
  id: string;
  email: string;
  display_name: string | null;
  access_token_ciphertext: string | null;
  access_token_iv: string | null;
  refresh_token_ciphertext: string | null;
  refresh_token_iv: string | null;
  token_expires_at: string | null;
};

/** Returns a valid access token, refreshing if needed; updates the mailbox row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getValidAccessToken(
  supabaseAdmin: any,
  mailbox: MailboxTokens,
): Promise<string> {
  if (!mailbox.access_token_ciphertext || !mailbox.access_token_iv) {
    throw new Error("Mailbox is not connected — please reconnect Gmail.");
  }
  const expiresAt = mailbox.token_expires_at ? new Date(mailbox.token_expires_at).getTime() : 0;
  const skewMs = 60_000;
  if (expiresAt - skewMs > Date.now()) {
    return decryptToken(mailbox.access_token_ciphertext, mailbox.access_token_iv);
  }
  if (!mailbox.refresh_token_ciphertext || !mailbox.refresh_token_iv) {
    throw new Error("Gmail access expired and no refresh token — please reconnect.");
  }
  const refresh = decryptToken(mailbox.refresh_token_ciphertext, mailbox.refresh_token_iv);
  const refreshed = await refreshAccessToken(refresh);
  const enc = encryptToken(refreshed.access_token);
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("mailboxes")
    .update({
      access_token_ciphertext: enc.ciphertext,
      access_token_iv: enc.iv,
      token_expires_at: newExpiry,
      status: "ready",
    })
    .eq("id", mailbox.id);
  return refreshed.access_token;
}
