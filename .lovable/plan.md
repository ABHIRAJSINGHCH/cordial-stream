
## Part 1 — Gmail 403 fix

The 403 page comes from Google's consent screen, not from our code. Now that you've added your Gmail address as a Test User:

1. Wait ~1 minute for Google to propagate the change.
2. In Integrations, click **Connect Gmail** again.
3. On the Google "choose account" screen, pick the **exact same** email you added as a Test User.

If it still 403s, the most common second cause is that the `gmail.send` scope isn't added to the consent screen. I'll add a small **diagnostic banner** on the Integrations page that shows the exact redirect URI and scopes we're requesting, so you can paste them into Google Console verbatim.

No code change is needed for the OAuth flow itself — it's already correct.

---

## Part 2 — Autonomous Prospecting Agent

### What it does (user-facing)

On any campaign you open a new **"Find prospects with AI"** panel. You give it:
- Who you're targeting (industry, role, company size, geography) — already on the campaign as `audience_brief`
- How many prospects you want (10 / 25 / 50)
- Optional seed list of company domains, or "find them for me"

The agent then runs **autonomously in the background**:

1. **Discover companies** — if you didn't give seeds, it searches the web (Firecrawl Search) for companies matching your brief.
2. **Research each company** — scrapes the company website (about, team, careers, blog, news) via Firecrawl.
3. **Identify people** — extracts names + titles that match your target role from team/leadership/about pages.
4. **Guess work emails** — uses standard patterns (`first.last@domain`, `first@domain`, etc.) and marks confidence.
5. **Write the angle** — for each prospect, AI produces a 1-line "why them" rationale citing the specific signal it found (e.g. "Just raised Series B per their blog post on May 12").
6. **Generate draft messages** — fills the campaign's sequence steps with personalized drafts using the same approval queue you already have.
7. **Nothing sends.** Every prospect lands in **Leads** (status: `prospect`) and every message lands in the existing approval queue as `pending_approval`. You review and click Send.

Later, when you flip the app to production, we add an "auto-send" toggle per campaign — same pipeline, just skips the manual approval gate based on rules (confidence > X, daily cap, etc.). The architecture below already supports it.

### Why Firecrawl

It's the lightest, fastest path to "Web + company sites only" — exactly what you picked. It handles JS rendering, gives clean markdown, and supports both search + scrape + structured JSON extraction in one API. We'll link the **Firecrawl connector** so you don't need to paste an API key.

### Technical design

**New tables (migration):**
- `prospect_runs` — one row per autonomous run: campaign_id, status (`queued`/`running`/`completed`/`failed`), parameters, counts, error, timestamps.
- `prospect_run_events` — per-step audit log (company discovered, page scraped, person found, message drafted) — drives the live progress UI.
- Extend `leads` with `source` (`manual` | `ai_prospect`), `discovery_url`, `email_confidence` (`guessed` | `pattern` | `verified`), `discovery_notes` (the AI's rationale).

**New server functions (`src/lib/prospecting.functions.ts`):**
- `startProspectRun({ campaign_id, target_count, seed_domains? })` — creates the run row, enqueues background work, returns run id.
- `getProspectRun({ id })` — status + recent events (polled by the UI).
- `approveProspectLead({ lead_id })` — flips status `prospect` → `new`, adds to the campaign.
- `discardProspectLead({ lead_id })`.

**Background worker (`src/lib/prospecting.server.ts`):**
- A single orchestrator function the server route calls after `startProspectRun` returns.
- Steps: search → scrape → extract entities (via `aiToolCall` to Lovable AI, model `google/gemini-3-flash-preview`) → email-guess → write rationale → insert leads + draft messages.
- Hard caps: max 50 prospects per run, max 200 Firecrawl calls per run, 60-second per-page scrape timeout. Prevents runaway spend.
- Writes every step to `prospect_run_events` so the UI shows live progress.

**Server route (`src/routes/api/public/prospecting/tick.ts`):**
- Internal-only endpoint hit by the server fn to actually run the worker without blocking the response. Signed with `INTERNAL_TICK_SECRET` (new secret I'll request).

**UI changes:**
- `campaigns.$id.tsx`: new **"Find prospects with AI"** card at the top of the leads section. Opens a sheet with target count + optional seed domains + a live progress feed (event log + counters). When run completes, shows a review table of discovered prospects with their rationale, confidence, and **Approve / Discard** buttons.
- Approved prospects flow into the existing campaign-leads pipeline and the existing message generation/approval queue you already use today — no new send path.
- Settings → Integrations: add a small **Firecrawl** card showing connection status.

**Connectors / secrets needed:**
- **Firecrawl connector** — I'll link it (one-click, no key to paste).
- `INTERNAL_TICK_SECRET` — auto-generated, never shown to you.
- Lovable AI is already wired (`LOVABLE_API_KEY`).

### Limits & honesty about what it can/can't do

- **Email accuracy:** "Web only" means we *guess* emails using public patterns. Typical accuracy ~60–75%. Anything we can't pattern-match we mark `low confidence` so you can skip or verify manually. To get real verified emails you'd later add the LinkedIn connector + an enrichment API — that path is already in the design.
- **Speed:** A 25-prospect run typically takes 2–5 minutes depending on how many pages it scrapes.
- **Cost:** Each run uses Firecrawl credits (scraping) + Lovable AI credits (extraction + drafting). I'll surface counts after each run so you can watch the burn.

### Verification before I call it done

1. Connect Firecrawl, open a campaign, click **Find prospects with AI** with target count = 5, seed domain = `stripe.com`. Verify it returns at least 1 prospect with rationale + draft message.
2. Run again with no seeds, brief = "Series B SaaS companies in fintech, target role: VP Engineering". Verify it discovers companies on its own.
3. Approve one prospect → confirm it appears in the campaign leads list and a draft message is in the approval queue with status `pending_approval`.
4. Discard one prospect → confirm it's removed.
5. Hit the per-run cap (set to 3 temporarily) → confirm run stops gracefully.

### What I'll need from you mid-build

- **One click** to approve linking the Firecrawl connector when the prompt appears.
- **Retry Gmail connect** once after I deploy, so we confirm the 403 is gone.

Nothing else — no API keys, no Google Console edits beyond the Test User you already added.
