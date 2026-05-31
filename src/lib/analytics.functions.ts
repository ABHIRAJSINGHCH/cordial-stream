import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWorkspaceAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ days: z.number().int().min(1).max(90).default(30) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const [{ data: messages }, { data: leads }, { data: campaigns }] = await Promise.all([
      supabase
        .from("messages")
        .select("id, status, channel, created_at, sent_at, campaign_id")
        .gte("created_at", since),
      supabase.from("leads").select("id, status, created_at").gte("created_at", since),
      supabase.from("campaigns").select("id, name, status, created_at"),
    ]);

    const msgs = messages ?? [];
    const totalSent = msgs.filter((m) => m.status === "sent").length;
    const totalReplied = msgs.filter((m) => m.status === "replied").length;
    const totalPending = msgs.filter((m) => m.status === "pending_approval").length;
    const totalScheduled = msgs.filter(
      (m) => m.status === "scheduled" || m.status === "approved",
    ).length;
    const totalLeads = leads?.length ?? 0;
    const enrichedLeads = (leads ?? []).filter((l) => l.status === "enriched").length;

    // Build daily series for last N days
    const buckets = new Map<string, { date: string; sent: number; replied: number }>();
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      buckets.set(d, { date: d, sent: 0, replied: 0 });
    }
    for (const m of msgs) {
      const d = (m.sent_at ?? m.created_at).slice(0, 10);
      const b = buckets.get(d);
      if (!b) continue;
      if (m.status === "sent") b.sent++;
      if (m.status === "replied") b.replied++;
    }

    // Top campaigns by sent
    const byCampaign = new Map<string, { sent: number; replied: number }>();
    for (const m of msgs) {
      const k = m.campaign_id;
      const v = byCampaign.get(k) ?? { sent: 0, replied: 0 };
      if (m.status === "sent") v.sent++;
      if (m.status === "replied") v.replied++;
      byCampaign.set(k, v);
    }
    const topCampaigns =
      (campaigns ?? [])
        .map((c) => {
          const stats = byCampaign.get(c.id) ?? { sent: 0, replied: 0 };
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            sent: stats.sent,
            replied: stats.replied,
            reply_rate: stats.sent > 0 ? stats.replied / stats.sent : 0,
          };
        })
        .sort((a, b) => b.sent - a.sent)
        .slice(0, 5);

    return {
      kpis: {
        sent: totalSent,
        replied: totalReplied,
        pending: totalPending,
        scheduled: totalScheduled,
        leads: totalLeads,
        enriched: enrichedLeads,
        reply_rate: totalSent > 0 ? totalReplied / totalSent : 0,
      },
      timeseries: Array.from(buckets.values()),
      topCampaigns,
    };
  });

export const getAiJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_jobs")
      .select("id, kind, status, created_at, finished_at, error")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
