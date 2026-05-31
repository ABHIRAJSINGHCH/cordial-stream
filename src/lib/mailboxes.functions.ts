import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mailboxes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        provider: z.enum(["gmail", "outlook", "smtp"]),
        email: z.string().email(),
        display_name: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("mailboxes")
      .insert({ ...data, created_by: userId, status: "pending_oauth" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("mailboxes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
