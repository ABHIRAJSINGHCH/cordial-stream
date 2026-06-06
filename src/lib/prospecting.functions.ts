import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StartInput = z.object({
  campaign_id: z.string().uuid(),
  target_count: z.number().int().min(1).max(25).default(5),
  seed_domains: z.array(z.string().min(1).max(100)).max(20).optional(),
});

export const startProspectRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StartInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, workspace_id, audience_brief, name")
      .eq("id", data.campaign_id)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    const { data: run, error: rErr } = await supabase
      .from("prospect_runs")
      .insert({
        workspace_id: campaign.workspace_id,
        campaign_id: campaign.id,
        created_by: userId,
        status: "queued",
        target_count: data.target_count,
        seed_domains: data.seed_domains ?? [],
        brief: campaign.audience_brief ?? null,
      })
      .select()
      .single();
    if (rErr || !run) throw new Error(rErr?.message ?? "Failed to create run");

    // Run the worker synchronously. Small batches (≤10 prospects) finish well
    // inside Worker CPU/wall-time limits. The UI polls events for live progress.
    const { runProspectingWorker } = await import("@/lib/prospecting.worker.server");
    // Fire-and-forget so the response returns quickly. The worker writes events
    // and final status to the DB; the UI polls getProspectRun.
    runProspectingWorker(run.id).catch((e: unknown) => {
      console.error("prospect worker crashed", e);
    });

    return { id: run.id };
  });

export const getProspectRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [{ data: run }, { data: events }, { data: prospects }] = await Promise.all([
      supabase.from("prospect_runs").select("*").eq("id", data.id).single(),
      supabase
        .from("prospect_run_events")
        .select("id, kind, message, payload, created_at")
        .eq("run_id", data.id)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("leads")
        .select("id, full_name, title, company, email, email_confidence, discovery_url, discovery_notes, status")
        .eq("status", "prospect")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (!run) throw new Error("Run not found");
    return { run, events: events ?? [], prospects: prospects ?? [] };
  });

export const listProspectRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaign_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("prospect_runs")
      .select("id, status, target_count, discovered_count, approved_count, created_at, finished_at, error")
      .eq("campaign_id", data.campaign_id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const approveProspect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ lead_id: z.string().uuid(), campaign_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .update({ status: "new" })
      .eq("id", data.lead_id)
      .select("workspace_id")
      .single();
    if (lErr || !lead) throw new Error(lErr?.message ?? "Lead not found");

    const { error: clErr } = await supabase.from("campaign_leads").upsert(
      {
        campaign_id: data.campaign_id,
        lead_id: data.lead_id,
        workspace_id: lead.workspace_id,
      },
      { onConflict: "campaign_id,lead_id", ignoreDuplicates: true },
    );
    if (clErr) throw new Error(clErr.message);
    return { ok: true };
  });

export const discardProspect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.lead_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
