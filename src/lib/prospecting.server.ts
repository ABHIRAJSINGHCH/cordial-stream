// Server-only prospecting orchestrator. Imports Firecrawl + Lovable AI gateway.
// Never import from client code.

import { aiToolCall } from "@/lib/ai/gateway.server";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

function fcKey(): string {
  const k = process.env.FIRECRAWL_API_KEY;
  if (!k) throw new Error("Firecrawl is not connected. Link the Firecrawl connector in Integrations.");
  return k;
}

async function fcFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${fcKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 402) throw new Error("Firecrawl credits exhausted. Top up at firecrawl.dev.");
    if (res.status === 429) throw new Error("Firecrawl rate limit reached. Try again in a minute.");
    throw new Error(`Firecrawl error (${res.status}): ${txt.slice(0, 250)}`);
  }
  return (await res.json()) as T;
}

// ---------- Firecrawl helpers ----------

export type FcSearchResult = { url: string; title?: string; description?: string };

export async function firecrawlSearch(query: string, limit = 10): Promise<FcSearchResult[]> {
  const data = await fcFetch<{ success: boolean; data?: { web?: FcSearchResult[] } | FcSearchResult[] }>(
    "/search",
    { query, limit },
  );
  const arr = Array.isArray(data.data) ? data.data : (data.data?.web ?? []);
  return arr.filter((r) => r?.url);
}

export type FcScrapeResult = {
  url: string;
  markdown: string;
  links: string[];
  title?: string;
};

export async function firecrawlScrape(url: string): Promise<FcScrapeResult | null> {
  try {
    const data = await fcFetch<{
      success: boolean;
      data?: {
        markdown?: string;
        links?: string[];
        metadata?: { title?: string; sourceURL?: string };
      };
    }>("/scrape", {
      url,
      formats: ["markdown", "links"],
      onlyMainContent: true,
      waitFor: 1000,
    });
    if (!data?.data?.markdown) return null;
    return {
      url: data.data.metadata?.sourceURL ?? url,
      markdown: data.data.markdown.slice(0, 12000),
      links: (data.data.links ?? []).slice(0, 200),
      title: data.data.metadata?.title,
    };
  } catch {
    return null;
  }
}

// ---------- AI extraction ----------

export type ExtractedCompany = {
  name: string;
  domain: string;
  why_fit: string;
};

export type ExtractedPerson = {
  full_name: string;
  title: string;
  email?: string | null;
  rationale: string;
  signal_url?: string | null;
};

export async function aiDiscoverCompanies(brief: {
  industry?: string;
  company_size?: string;
  geography?: string;
  pain_point?: string;
}, searchHits: FcSearchResult[], wanted: number): Promise<ExtractedCompany[]> {
  const hits = searchHits.slice(0, 20).map((h) => ({
    url: h.url,
    title: h.title,
    description: h.description,
  }));
  const result = await aiToolCall<{ companies: ExtractedCompany[] }>({
    system:
      "You filter web search results into a clean list of real target companies that match the brief. Skip aggregator/directory/news sites (e.g. crunchbase, linkedin, wikipedia, builtin, g2, capterra). Prefer actual company homepages. Return at most the requested count.",
    user: JSON.stringify({ brief, wanted, search_hits: hits }),
    toolName: "select_target_companies",
    toolDescription: "Pick real target companies from search results.",
    parameters: {
      type: "object",
      properties: {
        companies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              domain: { type: "string", description: "bare domain like stripe.com" },
              why_fit: { type: "string", description: "1-sentence reason this company matches the brief" },
            },
            required: ["name", "domain", "why_fit"],
            additionalProperties: false,
          },
        },
      },
      required: ["companies"],
      additionalProperties: false,
    },
  });
  return (result.companies ?? []).slice(0, wanted);
}

export async function aiExtractPeople(opts: {
  companyName: string;
  domain: string;
  targetRole?: string;
  pages: { url: string; markdown: string }[];
  wanted: number;
}): Promise<ExtractedPerson[]> {
  const result = await aiToolCall<{ people: ExtractedPerson[] }>({
    system:
      "You extract real named people from scraped company web pages. Only include people who plausibly match the target role. Never invent people. Prefer leadership/team/about pages. If an email is visible, capture it; otherwise leave it null. Always cite the URL where you saw the person in signal_url. Include a one-line rationale that references a SPECIFIC fact from the pages.",
    user: JSON.stringify({
      company: opts.companyName,
      domain: opts.domain,
      target_role: opts.targetRole,
      wanted: opts.wanted,
      pages: opts.pages.map((p) => ({ url: p.url, content: p.markdown.slice(0, 6000) })),
    }),
    toolName: "extract_prospects",
    toolDescription: "Extract real target people from company pages.",
    parameters: {
      type: "object",
      properties: {
        people: {
          type: "array",
          items: {
            type: "object",
            properties: {
              full_name: { type: "string" },
              title: { type: "string" },
              email: { type: ["string", "null"] },
              rationale: { type: "string" },
              signal_url: { type: ["string", "null"] },
            },
            required: ["full_name", "title", "rationale"],
            additionalProperties: false,
          },
        },
      },
      required: ["people"],
      additionalProperties: false,
    },
  });
  return result.people ?? [];
}

// ---------- Email guessing ----------

export function guessEmail(fullName: string, domain: string): { email: string; confidence: "pattern" | "guessed" } {
  const cleaned = fullName.trim().toLowerCase().replace(/[^a-z\s-]/g, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { email: `info@${domain}`, confidence: "guessed" };
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  if (last) return { email: `${first}.${last}@${domain}`, confidence: "pattern" };
  return { email: `${first}@${domain}`, confidence: "guessed" };
}

// ---------- High-level orchestrator ----------

const MAX_PAGES_PER_COMPANY = 4;
const PAGE_CANDIDATES = [
  "/team", "/about", "/about-us", "/leadership", "/people", "/company", "/our-team",
];

export function pickCompanyPages(homepageScrape: FcScrapeResult): string[] {
  const out = new Set<string>([homepageScrape.url]);
  const host = (() => {
    try { return new URL(homepageScrape.url).host; } catch { return ""; }
  })();
  for (const link of homepageScrape.links) {
    try {
      const u = new URL(link);
      if (u.host !== host) continue;
      const p = u.pathname.toLowerCase();
      if (PAGE_CANDIDATES.some((c) => p === c || p.startsWith(c + "/"))) {
        out.add(u.toString());
      }
    } catch {
      // skip malformed
    }
    if (out.size >= MAX_PAGES_PER_COMPANY) break;
  }
  return Array.from(out).slice(0, MAX_PAGES_PER_COMPANY);
}

export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}
