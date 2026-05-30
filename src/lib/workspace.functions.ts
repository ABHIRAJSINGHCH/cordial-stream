import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Ensures the current user has a workspace (created by trigger on signup, but
// also self-healing for legacy users). Returns the workspace id.
export const ensureWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("workspace_members")
      .select("workspace_id, workspaces(id, name, sender_name, sender_email, default_tone, daily_send_cap)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (existing?.workspaces) {
      return existing.workspaces;
    }

    // Fallback: create one
    const { data: ws, error } = await supabase
      .from("workspaces")
      .insert({ name: "My Workspace" })
      .select()
      .single();
    if (error || !ws) throw new Error(error?.message ?? "Failed to create workspace");

    const { error: memErr } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
    if (memErr) throw new Error(memErr.message);

    return ws;
  });

export const updateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        sender_name: z.string().max(120).optional(),
        sender_email: z.string().email().optional(),
        default_tone: z
          .enum(["professional", "founder", "recruiter", "casual", "sales", "enterprise"])
          .optional(),
        daily_send_cap: z.number().int().min(1).max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("workspaces")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
