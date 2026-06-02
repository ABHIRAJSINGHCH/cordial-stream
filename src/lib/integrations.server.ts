// Server-only helpers for third-party integrations.
// Provider credential verification + AES-256-GCM encryption.
import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";

export type Provider =
  | "resend"
  | "twilio"
  | "posthog"
  | "openai"
  | "smtp_gmail"
  | "smtp_outlook"
  | "stripe";

export const PROVIDERS: Provider[] = [
  "resend",
  "twilio",
  "posthog",
  "openai",
  "smtp_gmail",
  "smtp_outlook",
  "stripe",
];

// ---------- Encryption ----------
function getKey(): Buffer {
  const raw = process.env.INTEGRATION_ENC_KEY;
  if (!raw) throw new Error("INTEGRATION_ENC_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    // Allow fallback: hash the input to 32 bytes if not a 32-byte base64
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
  const ciphertext = Buffer.concat([enc, tag]).toString("base64");
  return { ciphertext, iv: iv.toString("base64") };
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

// pg `bytea` returns hex strings like `\x...`. Convert to base64 for storage too,
// but for compatibility we'll store text-base64 columns. We'll cast at the SQL layer.

// ---------- Verifiers ----------
export type VerifyResult = { ok: true; metadata: Record<string, unknown> } | { ok: false; error: string };

const TIMEOUT_MS = 8000;
function timeoutSignal() {
  return AbortSignal.timeout(TIMEOUT_MS);
}

export async function verifyResend(creds: { apiKey: string; fromEmail: string }): Promise<VerifyResult> {
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      signal: timeoutSignal(),
    });
    if (!res.ok) return { ok: false, error: `Resend rejected the API key (HTTP ${res.status}).` };
    return { ok: true, metadata: { fromEmail: creds.fromEmail } };
  } catch (e) {
    return { ok: false, error: `Could not reach Resend: ${(e as Error).message}` };
  }
}

export async function verifyTwilio(creds: {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}): Promise<VerifyResult> {
  try {
    const basic = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}.json`,
      { headers: { Authorization: `Basic ${basic}` }, signal: timeoutSignal() },
    );
    if (!res.ok) return { ok: false, error: `Twilio rejected the credentials (HTTP ${res.status}).` };
    const j = (await res.json()) as { friendly_name?: string };
    return { ok: true, metadata: { fromNumber: creds.fromNumber, accountName: j.friendly_name ?? null } };
  } catch (e) {
    return { ok: false, error: `Could not reach Twilio: ${(e as Error).message}` };
  }
}

export async function verifyPostHog(creds: { projectApiKey: string; host?: string }): Promise<VerifyResult> {
  const host = (creds.host || "https://us.i.posthog.com").replace(/\/$/, "");
  try {
    const res = await fetch(`${host}/decide?v=3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: creds.projectApiKey, distinct_id: "lovable-verify" }),
      signal: timeoutSignal(),
    });
    if (!res.ok) return { ok: false, error: `PostHog rejected the project key (HTTP ${res.status}).` };
    return { ok: true, metadata: { host } };
  } catch (e) {
    return { ok: false, error: `Could not reach PostHog: ${(e as Error).message}` };
  }
}

export async function verifyOpenAI(creds: { apiKey: string }): Promise<VerifyResult> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      signal: timeoutSignal(),
    });
    if (!res.ok) return { ok: false, error: `OpenAI rejected the API key (HTTP ${res.status}).` };
    return { ok: true, metadata: {} };
  } catch (e) {
    return { ok: false, error: `Could not reach OpenAI: ${(e as Error).message}` };
  }
}

export async function verifyStripe(creds: { secretKey: string }): Promise<VerifyResult> {
  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${creds.secretKey}` },
      signal: timeoutSignal(),
    });
    if (!res.ok) return { ok: false, error: `Stripe rejected the secret key (HTTP ${res.status}).` };
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
        mode: creds.secretKey.startsWith("sk_live_") ? "live" : "test",
      },
    };
  } catch (e) {
    return { ok: false, error: `Could not reach Stripe: ${(e as Error).message}` };
  }
}

// ---------- SMTP verification (raw socket, no nodemailer) ----------
async function smtpVerify(host: string, port: number, user: string, pass: string): Promise<VerifyResult> {
  return new Promise<VerifyResult>((resolve) => {
    let done = false;
    const finish = (r: VerifyResult) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, error: `SMTP timeout connecting to ${host}:${port}` }), TIMEOUT_MS);

    let socket: net.Socket | tls.TLSSocket = net.connect(port, host);
    let buffer = "";
    let step: "greet" | "ehlo1" | "starttls" | "ehlo2" | "authuser" | "authpass" | "quit" = "greet";

    const send = (line: string) => socket.write(line + "\r\n");

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // SMTP responses end with "<code> <text>\r\n" (space after code, not dash).
      const lines = buffer.split(/\r\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^(\d{3})([ -])(.*)$/.exec(line);
        if (!m) continue;
        const code = m[1];
        const isFinal = m[2] === " ";
        if (!isFinal) continue;

        if (step === "greet") {
          if (!code.startsWith("2")) return finish({ ok: false, error: `SMTP greet failed: ${line}` });
          step = "ehlo1"; send("EHLO lovable.app");
        } else if (step === "ehlo1") {
          if (!code.startsWith("2")) return finish({ ok: false, error: `EHLO failed: ${line}` });
          step = "starttls"; send("STARTTLS");
        } else if (step === "starttls") {
          if (!code.startsWith("2")) return finish({ ok: false, error: `STARTTLS failed: ${line}` });
          socket.removeListener("data", onData);
          const plain = socket as net.Socket;
          const tlsSocket = tls.connect({ socket: plain, host, servername: host });
          socket = tlsSocket;
          tlsSocket.on("data", onData);
          tlsSocket.on("error", (err) => finish({ ok: false, error: `TLS error: ${err.message}` }));
          tlsSocket.once("secureConnect", () => {
            step = "ehlo2"; tlsSocket.write("EHLO lovable.app\r\n");
          });
        } else if (step === "ehlo2") {
          if (!code.startsWith("2")) return finish({ ok: false, error: `EHLO (TLS) failed: ${line}` });
          step = "authuser"; send("AUTH LOGIN");
        } else if (step === "authuser") {
          if (code !== "334") return finish({ ok: false, error: `AUTH LOGIN refused: ${line}` });
          send(Buffer.from(user, "utf8").toString("base64"));
          step = "authpass";
        } else if (step === "authpass") {
          if (code !== "334") return finish({ ok: false, error: `Username refused: ${line}` });
          send(Buffer.from(pass, "utf8").toString("base64"));
          step = "quit";
        } else if (step === "quit") {
          if (!code.startsWith("2")) {
            return finish({ ok: false, error: `Authentication failed: ${line}` });
          }
          clearTimeout(timer);
          send("QUIT");
          finish({ ok: true, metadata: { host, port, user } });
        }
      }
    };

    socket.on("data", onData);
    socket.on("error", (err) => finish({ ok: false, error: `Socket error: ${err.message}` }));
    socket.on("end", () => finish({ ok: false, error: "Connection closed before authentication." }));
  });
}

export async function verifyGmailSmtp(creds: { email: string; appPassword: string }): Promise<VerifyResult> {
  const r = await smtpVerify("smtp.gmail.com", 587, creds.email, creds.appPassword);
  if (r.ok) return { ok: true, metadata: { ...r.metadata, fromEmail: creds.email } };
  return r;
}

export async function verifyOutlookSmtp(creds: { email: string; password: string }): Promise<VerifyResult> {
  const r = await smtpVerify("smtp-mail.outlook.com", 587, creds.email, creds.password);
  if (r.ok) return { ok: true, metadata: { ...r.metadata, fromEmail: creds.email } };
  return r;
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
    case "smtp_gmail":
      return verifyGmailSmtp({ email: credentials.email, appPassword: credentials.appPassword });
    case "smtp_outlook":
      return verifyOutlookSmtp({ email: credentials.email, password: credentials.password });
    case "stripe":
      return verifyStripe({ secretKey: credentials.secretKey });
  }
}
