// Server-only prospecting worker. Runs the full discover -> scrape -> extract ->
// guess-email -> draft-message pipeline for a single prospect_run.
//
// Never import from client code.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  firecrawlSearch,
  firecrawlScrape,
  aiDiscoverCompanies,
  aiExtractPeople,
  guessEmail,
  pickCompanyPages,
  normalizeDomain,
  type ExtractedCompany,
} from "@/lib/prospecting.server";
import { aiToolCall } from "@/lib/ai/gateway.server";

type Brief = {
  industry?: string;
  company_size?: string;
  target_role?: string;
  geography?: string;
  pain_point?: string;
};

async function logEvent(
  runId: string,
  workspaceId: string,
  kind: string,
  message: string,
  payload?: unknown,
) {
  await supabaseAdmin.from("prospect_run_events").insert({
    run_id: runId,
    workspace_id: workspaceId,
    kind,
    message,
    payload: payload ?? null,
  });
}

async function setStatus(
  runId: string,
  patch: {
    status?: string;
    discovered_count?: number;
    error?: string | null;
    started_at?: string;
    finished_at?: string;
  },
) {
  await supabaseAdmin.from("prospect_runs").update(patch).eq("id", runId);
}

export async function runProspectingWorker(runId: string): Promise<void> {
  // Load the run
  const { data: run, error } = await supabaseAdmin
    .from("prospect_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (error || !run) {
    console.error("prospect_runs row missing", runId);
    return;
  }

  await setStatus(runId, { status: "running", started_at: new Date().toISOString() });
  const brief = (run.brief ?? {}) as Brief;
  const wantedTotal: number = run.target_count;
  const seedDomains: string[] = (run.seed_domains ?? []).map(normalizeDomain);
  const workspaceId: string = run.workspace_id;
  const campaignId: string = run.campaign_id;

  try {
    // Load campaign + sequence steps + sender info for message drafting
    const [{ data: campaign }, { data: steps }] = await Promise.all([
      supabaseAdmin
        .from("campaigns")
        .select("id, name, goal, default_tone, sender_name, sender_email, signature")
        .eq("id", campaignId)
        .single(),
      supabaseAdmin
        .from("sequence_steps")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("position", { ascending: true }),
    ]);
    if (!campaign) throw new Error("Campaign disappeared mid-run");

    // 1) Pick target companies
    let companies: ExtractedCompany[] = [];

    if (seedDomains.length > 0) {
      await logEvent(runId, workspaceId, "info", `Using ${seedDomains.length} seed domain(s)`);
      companies = seedDomains.slice(0, wantedTotal).map((d) => ({
        name: d.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        domain: d,
        why_fit: "Provided as seed",
      }));
    } else {
      const queryBits = [
        brief.industry,
        brief.company_size,
        brief.geography,
        "company website",
      ].filter(Boolean);
      const query = queryBits.join(" ") || "B2B SaaS company";
      await logEvent(runId, workspaceId, "search", `Searching web: "${query}"`);
      const hits = await firecrawlSearch(query, Math.min(20, wantedTotal * 4));
      await logEvent(runId, workspaceId, "search", `Found ${hits.length} candidate links`);
      if (hits.length === 0) {
        throw new Error("Web search returned no results. Try adding seed domains or refining the brief.");
      }
      companies = await aiDiscoverCompanies(brief, hits, wantedTotal);
      await logEvent(
        runId,
        workspaceId,
        "info",
        `AI selected ${companies.length} target companies`,
        { companies: companies.map((c) => c.domain) },
      );
    }

    if (companies.length === 0) {
      throw new Error("No matching companies found. Try a different brief or add seed domains.");
    }

    // 2) For each company: scrape, extract people, guess emails, draft messages
    let discoveredTotal = 0;

    for (const company of companies) {
      if (discoveredTotal >= wantedTotal) break;
      const domain = normalizeDomain(company.domain);
      await logEvent(runId, workspaceId, "scrape", `Researching ${company.name} (${domain})`);

      // Scrape homepage first to discover team/about links
      const home = await firecrawlScrape(`https://${domain}`);
      if (!home) {
        await logEvent(runId, workspaceId, "error", `Couldn't reach ${domain}`);
        continue;
      }
      const pages = pickCompanyPages(home);
      const scraped: { url: string; markdown: string }[] = [];
      // homepage already scraped
      scraped.push({ url: home.url, markdown: home.markdown });
      for (const p of pages.slice(1)) {
        const s = await firecrawlScrape(p);
        if (s) scraped.push({ url: s.url, markdown: s.markdown });
      }
      await logEvent(runId, workspaceId, "scrape", `Scraped ${scraped.length} page(s) for ${company.name}`);

      // Extract people
      const remaining = wantedTotal - discoveredTotal;
      const wantedFromCompany = Math.min(2, remaining); // up to 2 per company
      const people = await aiExtractPeople({
        companyName: company.name,
        domain,
        targetRole: brief.target_role,
        pages: scraped,
        wanted: wantedFromCompany,
      });
      await logEvent(
        runId,
        workspaceId,
        "person",
        `Found ${people.length} person(s) at ${company.name}`,
        { people: people.map((p) => `${p.full_name} (${p.title})`) },
      );

      for (const person of people) {
        if (discoveredTotal >= wantedTotal) break;

        // Email: prefer one the AI saw on-page, otherwise guess by pattern
        let email = person.email ?? "";
        let confidence: "guessed" | "pattern" | "verified" = "verified";
        if (!email) {
          const g = guessEmail(person.full_name, domain);
          email = g.email;
          confidence = g.confidence;
        }

        const firstName = person.full_name.trim().split(/\s+/)[0] ?? "";
        const lastName = person.full_name.trim().split(/\s+/).slice(1).join(" ") || null;

        // Insert lead in 'prospect' status
        const { data: lead, error: leadErr } = await supabaseAdmin
          .from("leads")
          .insert({
            workspace_id: workspaceId,
            full_name: person.full_name,
            first_name: firstName,
            last_name: lastName,
            email,
            title: person.title,
            company: company.name,
            website: `https://${domain}`,
            status: "prospect",
            source: "ai_prospect",
            discovery_url: person.signal_url ?? home.url,
            email_confidence: confidence,
            discovery_notes: person.rationale,
          })
          .select()
          .single();
        if (leadErr || !lead) {
          await logEvent(runId, workspaceId, "error", `Failed to save ${person.full_name}: ${leadErr?.message}`);
          continue;
        }

        // Attach to campaign as a draft campaign_lead (state='prospect' kept implicit via lead.status)
        await supabaseAdmin.from("campaign_leads").upsert(
          { campaign_id: campaignId, lead_id: lead.id, workspace_id: workspaceId },
          { onConflict: "campaign_id,lead_id", ignoreDuplicates: true },
        );

        // Draft message for the first email step (if exists)
        const firstEmailStep = (steps ?? []).find((s) => s.channel === "email");
        if (firstEmailStep) {
          try {
            const drafted = await aiToolCall<{ subject: string; body: string; reasoning: string[]; confidence: number }>({
              system:
                "You write concise, human, non-generic B2B outreach. NEVER use cliches like 'I hope this finds you well', 'just checking in', or 'circling back'. Reference the specific signal you saw. Keep emails under 80 words. Provide 2-3 reasoning bullets citing the SPECIFIC fact you used.",
              user: JSON.stringify({
                channel: "email",
                tone: campaign.default_tone,
                campaign_goal: campaign.goal,
                lead: {
                  name: person.full_name,
                  first_name: firstName,
                  title: person.title,
                  company: company.name,
                  discovery_notes: person.rationale,
                  signal_url: person.signal_url,
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
            // Look up the campaign_lead id
            const { data: cl } = await supabaseAdmin
              .from("campaign_leads")
              .select("id")
              .eq("campaign_id", campaignId)
              .eq("lead_id", lead.id)
              .single();
            if (cl) {
              await supabaseAdmin.from("messages").insert({
                workspace_id: workspaceId,
                campaign_id: campaignId,
                campaign_lead_id: cl.id,
                step_id: firstEmailStep.id,
                channel: "email",
                subject: drafted.subject,
                body: drafted.body,
                ai_reasoning: drafted.reasoning,
                ai_confidence: drafted.confidence,
                status: "pending_approval",
              });
              await logEvent(runId, workspaceId, "message", `Draft ready for ${person.full_name}`);
            }
          } catch (e) {
            await logEvent(
              runId,
              workspaceId,
              "error",
              `Couldn't draft for ${person.full_name}: ${(e as Error).message}`,
            );
          }
        }

        discoveredTotal++;
        await setStatus(runId, { discovered_count: discoveredTotal });
        await logEvent(
          runId,
          workspaceId,
          "person",
          `${person.full_name} added (${confidence} email)`,
        );
      }
    }

    await setStatus(runId, {
      status: "completed",
      discovered_count: discoveredTotal,
      finished_at: new Date().toISOString(),
    });
    await logEvent(runId, workspaceId, "info", `Done — ${discoveredTotal} prospect(s) ready for review`);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("prospect worker error", msg);
    await setStatus(runId, {
      status: "failed",
      error: msg,
      finished_at: new Date().toISOString(),
    });
    await logEvent(runId, workspaceId, "error", msg);
  }
}
