// Server-only helpers for third-party integrations.
// Provider credential verification + AES-256-GCM encryption.
// NOTE: Raw-socket SMTP is intentionally NOT used here — the Cloudflare
// Worker runtime does not support outbound TCP via node:net even with
// nodejs_compat. Email providers are HTTPS-based (Resend) or OAuth-based.
import crypto from "node:crypto";

export type Provider = "resend" | "twilio" | "posthog" | "openai" | "stripe";

export const PROVIDERS: Provider[] = [
  "resend",
  "twilio",
  "posthog",
  "openai",
  "stripe",
];

// ---------- Encryption ----------
function getKey(): Buffer {
  const raw = process.env.INTEGRATION_ENC_KEY;
  if (!raw) throw new Error("INTEGRATION_ENC_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    return crypto.createHash("sha256").update(raw).digest();
  }
  return key;
}

export function encryptJson(obj: unknown): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptJson<T = unknown>(ciphertextB64: string, ivB64: string): T {
  const buf = Buffer.from(ciphertextB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}

// ---------- Verifiers ----------
export type JsonMeta = Record<string, string | number | boolean | null>;
export type VerifyResult = { ok: true; metadata: JsonMeta } | { ok: false; error: string };

const TIMEOUT_MS = 10_000;
const ts = () => AbortSignal.timeout(TIMEOUT_MS);

async function readBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

function networkError(provider: string, e: unknown): string {
  const msg = (e as Error).message ?? String(e);
  if (/abort|timeout/i.test(msg)) return `${provider} didn't respond in time. Please try again.`;
  return `Couldn't reach ${provider} from our servers. Please try again in a moment.`;
}

// --- Resend ---
export async function verifyResend(creds: {
  apiKey: string;
  fromEmail: string;
}): Promise<VerifyResult> {
  const apiKey = creds.apiKey.trim();
  const fromEmail = creds.fromEmail.trim();
  if (!apiKey.startsWith("re_"))
    return { ok: false, error: "That doesn't look like a Resend key — they start with `re_`." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail))
    return { ok: false, error: "Please enter a valid email address for the sender." };

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ts(),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error:
          "Resend didn't accept that key. Make sure you copied the entire key from the Resend dashboard (it starts with `re_`).",
      };
    }
    if (!res.ok) {
      const body = await readBody(res);
      return { ok: false, error: `Resend returned an error (${res.status}). ${body}`.trim() };
    }

    // Optional: warn if domain isn't verified
    try {
      const j = (await res.json()) as { data?: Array<{ name?: string; status?: string }> };
      const fromDomain = fromEmail.split("@")[1]?.toLowerCase();
      const domains = j.data ?? [];
      const match = domains.find((d) => d.name?.toLowerCase() === fromDomain);
      if (fromDomain && fromDomain !== "resend.dev" && !match) {
        return {
          ok: false,
          error: `Resend doesn't have \`${fromDomain}\` set up yet. Add and verify the domain in Resend → Domains, or use an address on a verified domain.`,
        };
      }
      if (match && match.status && match.status !== "verified") {
        return {
          ok: false,
          error: `Resend says \`${fromDomain}\` isn't fully verified yet (status: ${match.status}). Finish DNS verification in Resend → Domains.`,
        };
      }
    } catch {
      /* non-fatal — key worked, that's enough */
    }

    return { ok: true, metadata: { fromEmail } };
  } catch (e) {
    return { ok: false, error: networkError("Resend", e) };
  }
}

// --- Twilio ---
export async function verifyTwilio(creds: {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}): Promise<VerifyResult> {
  const sid = creds.accountSid.trim();
  const token = creds.authToken.trim();
  const fromNumber = creds.fromNumber.trim();
  if (!sid.startsWith("AC"))
    return { ok: false, error: "Twilio Account SIDs start with `AC`. Double-check the value from your Twilio Console." };
  if (!/^\+\d{6,15}$/.test(fromNumber))
    return { ok: false, error: "The phone number must be in E.164 format, e.g. `+15551234567`." };

  try {
    const basic = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
      { headers: { Authorization: `Basic ${basic}` }, signal: ts() },
    );
    if (res.status === 401)
      return {
        ok: false,
        error: "Twilio rejected the SID and Auth Token. Make sure both come from the same project in the Twilio Console.",
      };
    if (!res.ok) {
      const body = await readBody(res);
      return { ok: false, error: `Twilio returned an error (${res.status}). ${body}`.trim() };
    }
    const j = (await res.json()) as { friendly_name?: string };
    return { ok: true, metadata: { fromNumber, accountName: j.friendly_name ?? null } };
  } catch (e) {
    return { ok: false, error: networkError("Twilio", e) };
  }
}

// --- PostHog ---
export async function verifyPostHog(creds: {
  projectApiKey: string;
  host?: string;
}): Promise<VerifyResult> {
  const key = creds.projectApiKey.trim();
  const host = (creds.host?.trim() || "https://us.i.posthog.com").replace(/\/$/, "");
  if (!key.startsWith("phc_"))
    return { ok: false, error: "PostHog project keys start with `phc_`. Copy it from PostHog → Project Settings." };
  try {
    const res = await fetch(`${host}/decide?v=3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, distinct_id: "lovable-verify" }),
      signal: ts(),
    });
    if (!res.ok) {
      if (res.status === 401)
        return { ok: false, error: "PostHog rejected that project key. Check the key and the host (US vs EU)." };
      const body = await readBody(res);
      return { ok: false, error: `PostHog returned an error (${res.status}). ${body}`.trim() };
    }
    return { ok: true, metadata: { host } };
  } catch (e) {
    return { ok: false, error: networkError("PostHog", e) };
  }
}

// --- OpenAI ---
export async function verifyOpenAI(creds: { apiKey: string }): Promise<VerifyResult> {
  const key = creds.apiKey.trim();
  if (!key.startsWith("sk-"))
    return { ok: false, error: "OpenAI keys start with `sk-`. Make sure you copied the secret key, not the project ID." };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: ts(),
    });
    if (res.status === 401)
      return { ok: false, error: "OpenAI rejected that key. Create a new key at platform.openai.com → API keys and try again." };
    if (res.status === 429)
      return { ok: false, error: "OpenAI says this key has hit its rate limit or has no billing set up. Add billing in your OpenAI account." };
    if (!res.ok) {
      const body = await readBody(res);
      return { ok: false, error: `OpenAI returned an error (${res.status}). ${body}`.trim() };
    }
    return { ok: true, metadata: {} };
  } catch (e) {
    return { ok: false, error: networkError("OpenAI", e) };
  }
}

// --- Stripe ---
export async function verifyStripe(creds: { secretKey: string }): Promise<VerifyResult> {
  const key = creds.secretKey.trim();
  if (key.startsWith("pk_"))
    return {
      ok: false,
      error: "That's a Publishable key. We need the Secret key (it starts with `sk_test_` or `sk_live_`).",
    };
  if (!key.startsWith("sk_"))
    return { ok: false, error: "Stripe secret keys start with `sk_test_` or `sk_live_`." };
  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
      signal: ts(),
    });
    if (res.status === 401)
      return { ok: false, error: "Stripe didn't accept that key. Copy the Secret key from Stripe → Developers → API keys." };
    if (!res.ok) {
      const body = await readBody(res);
      return { ok: false, error: `Stripe returned an error (${res.status}). ${body}`.trim() };
    }
    const j = (await res.json()) as {
      id?: string;
      business_profile?: { name?: string };
      email?: string;
    };
    return {
      ok: true,
      metadata: {
        accountId: j.id ?? null,
        businessName: j.business_profile?.name ?? null,
        email: j.email ?? null,
        mode: key.startsWith("sk_live_") ? "live" : "test",
      },
    };
  } catch (e) {
    return { ok: false, error: networkError("Stripe", e) };
  }
}

export async function verifyProvider(
  provider: Provider,
  credentials: Record<string, string>,
): Promise<VerifyResult> {
  switch (provider) {
    case "resend":
      return verifyResend({ apiKey: credentials.apiKey, fromEmail: credentials.fromEmail });
    case "twilio":
      return verifyTwilio({
        accountSid: credentials.accountSid,
        authToken: credentials.authToken,
        fromNumber: credentials.fromNumber,
      });
    case "posthog":
      return verifyPostHog({ projectApiKey: credentials.projectApiKey, host: credentials.host });
    case "openai":
      return verifyOpenAI({ apiKey: credentials.apiKey });
    case "stripe":
      return verifyStripe({ secretKey: credentials.secretKey });
  }
}
