import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiToolCall } from "@/lib/ai/gateway.server";
import type { LeadEnrichment } from "@/lib/types";

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const LeadInput = z.object({
  workspace_id: z.string().uuid(),
  full_name: z.string().min(1).max(200),
  first_name: z.string().max(100).optional().nullable(),
  last_name: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  title: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  linkedin_url: z.string().url().optional().nullable().or(z.literal("")),
  website: z.string().url().optional().nullable().or(z.literal("")),
  location: z.string().max(200).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LeadInput.parse(input))
  .handler(async ({ context, data }) => {
    const payload = {
      ...data,
      email: data.email || null,
      linkedin_url: data.linkedin_url || null,
      website: data.website || null,
    };
    const { data: row, error } = await context.supabase
      .from("leads")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const importLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        leads: z.array(LeadInput.omit({ workspace_id: true })).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const rows = data.leads.map((l) => ({
      ...l,
      workspace_id: data.workspace_id,
      email: l.email || null,
      linkedin_url: l.linkedin_url || null,
      website: l.website || null,
    }));
    const { data: out, error } = await context.supabase.from("leads").insert(rows).select();
    if (error) throw new Error(error.message);
    return { count: out?.length ?? 0 };
  });

export const enrichLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !lead) throw new Error(error?.message ?? "Lead not found");

    await supabase.from("leads").update({ status: "enriching" }).eq("id", lead.id);

    try {
      const enrichment = await aiToolCall<LeadEnrichment>({
        system:
          "You are a B2B sales research analyst. Given a prospect's name, title, company, and links, produce concise, plausible intelligence to inform outreach. Be specific. Avoid generic phrasing. If you don't have real data, infer reasonable signals from the role and company context — do not fabricate specific names of products or people.",
        user: JSON.stringify({
          name: lead.full_name,
          title: lead.title,
          company: lead.company,
          email: lead.email,
          linkedin: lead.linkedin_url,
          website: lead.website,
          location: lead.location,
        }),
        toolName: "record_lead_intelligence",
        toolDescription: "Record structured lead intelligence for outreach personalization.",
        parameters: {
          type: "object",
          properties: {
            company_summary: { type: "string" },
            industry: { type: "string" },
            company_size: { type: "string" },
            recent_activity: { type: "array", items: { type: "string" }, maxItems: 4 },
            hiring_signals: { type: "array", items: { type: "string" }, maxItems: 3 },
            tech_stack: { type: "array", items: { type: "string" }, maxItems: 6 },
            pain_points: { type: "array", items: { type: "string" }, maxItems: 4 },
            outreach_angles: { type: "array", items: { type: "string" }, maxItems: 3 },
            confidence: { type: "number" },
          },
          required: ["company_summary", "outreach_angles", "pain_points"],
          additionalProperties: false,
        },
      });

      const summary = enrichment.company_summary?.slice(0, 400);
      await supabase
        .from("leads")
        .update({
          status: "enriched",
          enrichment: enrichment as never,
          enrichment_summary: summary,
        })
        .eq("id", lead.id);

      return { ok: true, enrichment };
    } catch (e) {
      await supabase.from("leads").update({ status: "failed" }).eq("id", lead.id);
      throw e;
    }
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
