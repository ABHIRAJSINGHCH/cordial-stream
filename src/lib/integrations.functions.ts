import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PROVIDERS,
  type Provider,
  encryptJson,
  decryptJson,
  verifyProvider,
  type JsonMeta,
} from "./integrations.server";

const ProviderEnum = z.enum(PROVIDERS as [Provider, ...Provider[]]);

const CredentialsSchema = z.record(z.string(), z.string().min(1).max(2048));

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("user_integrations")
      .select("provider, status, metadata, last_verified_at, last_error");
    if (error) throw new Error(error.message);
    return { integrations: data ?? [] };
  });

export const connectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        provider: ProviderEnum,
        credentials: CredentialsSchema,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Need a workspace id for the insert.
    const { data: ws } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!ws) return { ok: false as const, error: "No workspace found for this account." };

    const result = await verifyProvider(data.provider, data.credentials);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }

    const { ciphertext, iv } = encryptJson(data.credentials);

    const { error } = await supabase
      .from("user_integrations")
      .upsert(
        {
          user_id: userId,
          workspace_id: ws.workspace_id,
          provider: data.provider,
          status: "connected",
          secret_ciphertext: ciphertext,
          secret_iv: iv,
          metadata: result.metadata as JsonMeta,
          last_verified_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "user_id,provider" },
      );

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, metadata: result.metadata };
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ provider: ProviderEnum }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_integrations")
      .delete()
      .eq("user_id", userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ provider: ProviderEnum }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_integrations")
      .select("secret_ciphertext, secret_iv")
      .eq("user_id", userId)
      .eq("provider", data.provider)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.secret_ciphertext || !row?.secret_iv) {
      return { ok: false as const, error: "No stored credentials for this provider." };
    }

    const creds = decryptJson<Record<string, string>>(row.secret_ciphertext, row.secret_iv);
    const result = await verifyProvider(data.provider, creds);

    await supabase
      .from("user_integrations")
      .update({
        status: result.ok ? "connected" : "error",
        last_verified_at: new Date().toISOString(),
        last_error: result.ok ? null : result.error,
        metadata: result.ok ? (result.metadata as JsonMeta) : undefined,
      })
      .eq("user_id", userId)
      .eq("provider", data.provider);

    return result.ok
      ? { ok: true as const, metadata: result.metadata }
      : { ok: false as const, error: result.error };
  });
