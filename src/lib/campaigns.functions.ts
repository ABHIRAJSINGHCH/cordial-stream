import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiToolCall } from "@/lib/ai/gateway.server";
import type { GeneratedMessage } from "@/lib/types";

const ToneEnum = z.enum(["professional", "founder", "recruiter", "casual", "sales", "enterprise"]);

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [{ data: campaign, error: cErr }, { data: steps, error: sErr }, { data: cl }] =
      await Promise.all([
        supabase.from("campaigns").select("*").eq("id", data.id).single(),
        supabase
          .from("sequence_steps")
          .select("*")
          .eq("campaign_id", data.id)
          .order("position", { ascending: true }),
        supabase
          .from("campaign_leads")
          .select("id, state, lead_id, leads(id, full_name, title, company, email, status)")
          .eq("campaign_id", data.id),
      ]);
    if (cErr) throw new Error(cErr.message);
    if (sErr) throw new Error(sErr.message);
    return { campaign, steps: steps ?? [], leads: cl ?? [] };
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        name: z.string().min(1).max(120),
        goal: z.string().max(500).optional(),
        default_tone: ToneEnum.default("professional"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({ ...data, created_by: userId })
      .select()
      .single();
    if (error || !campaign) throw new Error(error?.message ?? "Failed to create campaign");

    // seed default 3-step sequence
    const defaults = [
      {
        campaign_id: campaign.id,
        workspace_id: data.workspace_id,
        position: 1,
        channel: "email" as const,
        wait_days: 0,
        subject_template: "Quick thought on {{company}}",
        body_template:
          "Hi {{first_name}},\n\nI was reading about {{company}} and had a quick thought I wanted to share.",
        tone: data.default_tone,
      },
      {
        campaign_id: campaign.id,
        workspace_id: data.workspace_id,
        position: 2,
        channel: "email" as const,
        wait_days: 3,
        subject_template: "Re: Quick thought on {{company}}",
        body_template:
          "Hi {{first_name}},\n\nFollowing up in case the last note got buried — would love to hear your take.",
        tone: data.default_tone,
      },
      {
        campaign_id: campaign.id,
        workspace_id: data.workspace_id,
        position: 3,
        channel: "linkedin" as const,
        wait_days: 5,
        subject_template: null,
        body_template:
          "Hi {{first_name}}, sent you a quick email earlier — happy to share more here if useful.",
        tone: data.default_tone,
      },
    ];
    await supabase.from("sequence_steps").insert(defaults);
    return campaign;
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        goal: z.string().max(500).optional(),
        status: z.enum(["draft", "active", "paused", "completed"]).optional(),
        default_tone: ToneEnum.optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("campaigns")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        campaign_id: z.string().uuid(),
        workspace_id: z.string().uuid(),
        position: z.number().int().min(1).max(20),
        channel: z.enum(["email", "linkedin", "manual"]),
        wait_days: z.number().int().min(0).max(60),
        subject_template: z.string().max(200).nullable().optional(),
        body_template: z.string().max(4000).nullable().optional(),
        tone: ToneEnum.optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (data.id) {
      const { id, ...patch } = data;
      const { data: row, error } = await supabase
        .from("sequence_steps")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("sequence_steps")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sequence_steps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addLeadsToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        workspace_id: z.string().uuid(),
        lead_ids: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const rows = data.lead_ids.map((id) => ({
      campaign_id: data.campaign_id,
      lead_id: id,
      workspace_id: data.workspace_id,
    }));
    const { error } = await context.supabase
      .from("campaign_leads")
      .upsert(rows, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ AI MESSAGE GENERATION ============
function fillTemplate(tpl: string | null | undefined, vars: Record<string, string>): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export const generateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaign_lead_id: z.string().uuid(),
        step_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const [{ data: cl }, { data: step }] = await Promise.all([
      supabase
        .from("campaign_leads")
        .select("id, workspace_id, campaign_id, lead_id, leads(*), campaigns(name, goal, default_tone)")
        .eq("id", data.campaign_lead_id)
        .single(),
      supabase.from("sequence_steps").select("*").eq("id", data.step_id).single(),
    ]);

    if (!cl || !step) throw new Error("Campaign lead or step not found");
    const lead = (cl as { leads: Record<string, unknown> }).leads as Record<string, unknown>;
    const campaign = (cl as { campaigns: Record<string, unknown> }).campaigns;
    const vars: Record<string, string> = {
      first_name: String(lead.first_name ?? lead.full_name ?? "there").split(" ")[0],
      full_name: String(lead.full_name ?? ""),
      company: String(lead.company ?? "your company"),
      title: String(lead.title ?? ""),
    };
    const baseSubject = fillTemplate(step.subject_template, vars);
    const baseBody = fillTemplate(step.body_template, vars);

    const generated = await aiToolCall<GeneratedMessage>({
      system:
        "You write concise, human, non-generic B2B outreach. NEVER use cliches like 'I hope this finds you well', 'just checking in', or 'circling back'. Reference the lead's specific context. Keep emails under 80 words. Always provide 2-4 reasoning bullets that cite the SPECIFIC signal you used.",
      user: JSON.stringify({
        channel: step.channel,
        step_position: step.position,
        tone: step.tone ?? (campaign as { default_tone?: string }).default_tone ?? "professional",
        campaign_goal: (campaign as { goal?: string }).goal ?? "",
        base_subject: baseSubject,
        base_body: baseBody,
        lead: {
          name: lead.full_name,
          first_name: vars.first_name,
          title: lead.title,
          company: lead.company,
          enrichment: lead.enrichment,
        },
      }),
      toolName: "draft_outreach_message",
      toolDescription: "Produce a personalized outreach message with reasoning.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", maxLength: 120 },
          body: { type: "string", maxLength: 2000 },
          reasoning: {
            type: "array",
            items: { type: "string", maxLength: 200 },
            minItems: 2,
            maxItems: 4,
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["subject", "body", "reasoning", "confidence"],
        additionalProperties: false,
      },
    });

    const { data: msg, error } = await supabase
      .from("messages")
      .insert({
        workspace_id: cl.workspace_id,
        campaign_id: cl.campaign_id,
        campaign_lead_id: cl.id,
        step_id: step.id,
        channel: step.channel,
        subject: generated.subject,
        body: generated.body,
        ai_reasoning: generated.reasoning,
        ai_confidence: generated.confidence,
        status: "pending_approval",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return msg;
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaign_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select(
        "*, campaign_leads!inner(id, leads(id, full_name, company, title, email))",
      )
      .eq("campaign_id", data.campaign_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateMessageStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "scheduled", "sent", "skipped"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const patch: {
      status: "approved" | "scheduled" | "sent" | "skipped";
      scheduled_at?: string;
      sent_at?: string;
    } = { status: data.status };
    if (data.status === "scheduled") patch.scheduled_at = new Date(Date.now() + 60_000).toISOString();
    if (data.status === "sent") patch.sent_at = new Date().toISOString();
    const { error } = await context.supabase.from("messages").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const campaignAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaign_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("status")
      .eq("campaign_id", data.campaign_id);
    if (error) throw new Error(error.message);
    const counts = { total: rows?.length ?? 0, sent: 0, pending: 0, replied: 0, scheduled: 0 };
    for (const r of rows ?? []) {
      if (r.status === "sent") counts.sent++;
      else if (r.status === "pending_approval") counts.pending++;
      else if (r.status === "replied") counts.replied++;
      else if (r.status === "scheduled" || r.status === "approved") counts.scheduled++;
    }
    return counts;
  });
