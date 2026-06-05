import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  pickRedirectBase,
  encryptToken,
} from "@/lib/gmail.server";

function htmlError(title: string, body: string) {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;max-width:560px;margin:80px auto;padding:24px;color:#111">
      <h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
      <p style="color:#555;line-height:1.5">${body}</p>
      <p><a href="/integrations" style="color:#2563eb">Back to Integrations</a></p>
    </body></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/oauth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        if (oauthError) {
          return htmlError(
            "Google sign-in was cancelled",
            `Google reported: <code>${oauthError}</code>. You can close this tab and try again.`,
          );
        }
        if (!code || !state) {
          return htmlError("Missing code or state", "The sign-in link was incomplete. Please try connecting again.");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Validate + consume state
        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("oauth_states")
          .select("user_id, workspace_id, provider, redirect_to, expires_at")
          .eq("state", state)
          .maybeSingle();

        if (stateErr || !stateRow) {
          return htmlError(
            "This sign-in link is no longer valid",
            "It may have already been used or it expired. Please start the connection again from the Integrations page.",
          );
        }
        if (new Date(stateRow.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("oauth_states").delete().eq("state", state);
          return htmlError(
            "This sign-in link expired",
            "Please start the connection again from the Integrations page.",
          );
        }

        const redirectBase = pickRedirectBase(url.host);
        const redirectUri = `${redirectBase}/api/public/oauth/google/callback`;

        try {
          const tokens = await exchangeCodeForTokens({ code, redirectUri });
          const info = await fetchUserInfo(tokens.access_token);

          const accessEnc = encryptToken(tokens.access_token);
          const refreshEnc = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          // Upsert mailbox keyed on (workspace_id, email)
          const { data: existing } = await supabaseAdmin
            .from("mailboxes")
            .select("id, refresh_token_ciphertext, refresh_token_iv")
            .eq("workspace_id", stateRow.workspace_id)
            .eq("email", info.email)
            .maybeSingle();

          const row = {
            workspace_id: stateRow.workspace_id,
            provider: "gmail" as const,
            email: info.email,
            display_name: info.name ?? null,
            status: "ready",
            provider_account_id: info.sub,
            scopes: tokens.scope,
            access_token_ciphertext: accessEnc.ciphertext,
            access_token_iv: accessEnc.iv,
            // Keep existing refresh token if Google didn't send a new one
            refresh_token_ciphertext:
              refreshEnc?.ciphertext ?? existing?.refresh_token_ciphertext ?? null,
            refresh_token_iv: refreshEnc?.iv ?? existing?.refresh_token_iv ?? null,
            token_expires_at: expiresAt,
            created_by: stateRow.user_id,
          };

          if (existing) {
            const { error: upErr } = await supabaseAdmin
              .from("mailboxes")
              .update(row)
              .eq("id", existing.id);
            if (upErr) throw new Error(upErr.message);
          } else {
            const { error: insErr } = await supabaseAdmin.from("mailboxes").insert(row);
            if (insErr) throw new Error(insErr.message);
          }

          await supabaseAdmin.from("oauth_states").delete().eq("state", state);

          const dest = stateRow.redirect_to ?? "/integrations?connected=gmail";
          return new Response(null, {
            status: 302,
            headers: { Location: dest },
          });
        } catch (e) {
          const msg = (e as Error).message;
          return htmlError(
            "We couldn't finish connecting Gmail",
            `${msg}<br><br>Please go back to Integrations and try again.`,
          );
        }
      },
    },
  },
});
