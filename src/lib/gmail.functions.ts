import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildGoogleConsentUrl,
  pickRedirectBase,
  getValidAccessToken,
  sendGmailMessage,
  type MailboxTokens,
} from "./gmail.server";

const CALLBACK_PATH = "/api/public/oauth/google/callback";

/** Starts the Gmail OAuth dance; returns the Google consent URL the client should navigate to. */
export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: ws } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!ws) throw new Error("No workspace found for this account.");

    const host = getRequestHost();
    const base = pickRedirectBase(host);
    const redirectUri = base + CALLBACK_PATH;

    const state = crypto.randomBytes(24).toString("base64url");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("oauth_states").insert({
      state,
      user_id: userId,
      workspace_id: ws.workspace_id,
      provider: "gmail",
      redirect_to: "/integrations?connected=gmail",
    });
    if (error) throw new Error(error.message);

    const consentUrl = buildGoogleConsentUrl({ state, redirectUri });
    return { consentUrl, redirectBase: base };
  });

/** List connected mailboxes for the current workspace (with token presence flag, not the tokens themselves). */
export const listConnectedMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mailboxes")
      .select(
        "id, provider, email, display_name, status, token_expires_at, last_test_at, last_test_status, last_test_error, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const disconnectMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("mailboxes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        mailbox_id: z.string().uuid(),
        to: z.string().email(),
        subject: z.string().min(1).max(200).default("Test from Kinetic"),
        body: z
          .string()
          .min(1)
          .max(2000)
          .default(
            "Hi!\n\nThis is a test email sent from your connected Gmail account through Kinetic. If you received it, sending works correctly.",
          ),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: mb, error } = await supabase
      .from("mailboxes")
      .select(
        "id, email, display_name, access_token_ciphertext, access_token_iv, refresh_token_ciphertext, refresh_token_iv, token_expires_at",
      )
      .eq("id", data.mailbox_id)
      .single();
    if (error || !mb) return { ok: false as const, error: "Mailbox not found." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const accessToken = await getValidAccessToken(supabaseAdmin, mb as MailboxTokens);
      await sendGmailMessage({
        accessToken,
        from: mb.email,
        fromName: mb.display_name,
        to: data.to,
        subject: data.subject,
        body: data.body,
      });
      await supabaseAdmin
        .from("mailboxes")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: "ok",
          last_test_error: null,
          status: "ready",
        })
        .eq("id", mb.id);
      return { ok: true as const };
    } catch (e) {
      const msg = (e as Error).message;
      await supabaseAdmin
        .from("mailboxes")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: "error",
          last_test_error: msg.slice(0, 500),
          status: /reconnect|expired|invalid_grant/i.test(msg) ? "needs_reauth" : "error",
        })
        .eq("id", mb.id);
      return { ok: false as const, error: msg };
    }
  });

/** Send an approved campaign message through the workspace's first Gmail mailbox (or the campaign's). */
export const sendApprovedMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        message_id: z.string().uuid(),
        mailbox_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: msg, error: mErr } = await supabase
      .from("messages")
      .select(
        "id, workspace_id, campaign_id, channel, subject, body, status, campaign_leads!inner(leads(email, full_name))",
      )
      .eq("id", data.message_id)
      .single();
    if (mErr || !msg) return { ok: false as const, error: "Message not found." };
    if (msg.channel !== "email")
      return { ok: false as const, error: "Only email messages can be sent through Gmail." };
    if (msg.status !== "approved" && msg.status !== "scheduled")
      return { ok: false as const, error: "Message must be approved first." };

    const toEmail =
      ((msg.campaign_leads as { leads?: { email?: string | null } } | null)?.leads?.email) ?? null;
    if (!toEmail) return { ok: false as const, error: "Lead has no email address." };

    // Pick mailbox: explicit, or campaign's, or any 'ready' Gmail in workspace.
    let mailboxId = data.mailbox_id;
    if (!mailboxId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("mailbox_id")
        .eq("id", msg.campaign_id)
        .single();
      mailboxId = campaign?.mailbox_id ?? undefined;
    }
    if (!mailboxId) {
      const { data: anyMb } = await supabase
        .from("mailboxes")
        .select("id")
        .eq("workspace_id", msg.workspace_id)
        .eq("provider", "gmail")
        .eq("status", "ready")
        .limit(1)
        .maybeSingle();
      mailboxId = anyMb?.id;
    }
    if (!mailboxId)
      return {
        ok: false as const,
        error: "Connect a Gmail account in Integrations first.",
      };

    const { data: mb, error: mbErr } = await supabase
      .from("mailboxes")
      .select(
        "id, email, display_name, access_token_ciphertext, access_token_iv, refresh_token_ciphertext, refresh_token_iv, token_expires_at",
      )
      .eq("id", mailboxId)
      .single();
    if (mbErr || !mb) return { ok: false as const, error: "Mailbox not found." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const accessToken = await getValidAccessToken(supabaseAdmin, mb as MailboxTokens);
      const res = await sendGmailMessage({
        accessToken,
        from: mb.email,
        fromName: mb.display_name,
        to: toEmail,
        subject: msg.subject ?? "(no subject)",
        body: msg.body ?? "",
      });
      await supabase
        .from("messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);
      await supabase.from("message_events").insert({
        message_id: msg.id,
        workspace_id: msg.workspace_id,
        type: "sent",
        payload: { provider: "gmail", gmail_message_id: res.id, thread_id: res.threadId },
      });
      return { ok: true as const };
    } catch (e) {
      const errMsg = (e as Error).message;
      await supabase.from("messages").update({ status: "failed" }).eq("id", msg.id);
      await supabase.from("message_events").insert({
        message_id: msg.id,
        workspace_id: msg.workspace_id,
        type: "failed",
        payload: { provider: "gmail", error: errMsg.slice(0, 500) },
      });
      return { ok: false as const, error: errMsg };
    }
  });
