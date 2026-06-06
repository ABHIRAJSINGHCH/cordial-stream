
-- 1) Extend lead_status enum
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'prospect';

-- 2) Extend leads with discovery metadata
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS discovery_url TEXT,
  ADD COLUMN IF NOT EXISTS email_confidence TEXT,
  ADD COLUMN IF NOT EXISTS discovery_notes TEXT;

-- 3) prospect_runs
CREATE TABLE IF NOT EXISTS public.prospect_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | cancelled
  target_count INTEGER NOT NULL DEFAULT 10,
  seed_domains TEXT[] NOT NULL DEFAULT '{}',
  brief JSONB,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_runs TO authenticated;
GRANT ALL ON public.prospect_runs TO service_role;
ALTER TABLE public.prospect_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read prospect_runs" ON public.prospect_runs
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "members insert prospect_runs" ON public.prospect_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "members update prospect_runs" ON public.prospect_runs
  FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "members delete prospect_runs" ON public.prospect_runs
  FOR DELETE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX IF NOT EXISTS prospect_runs_campaign_idx ON public.prospect_runs(campaign_id, created_at DESC);

CREATE TRIGGER prospect_runs_touch BEFORE UPDATE ON public.prospect_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) prospect_run_events
CREATE TABLE IF NOT EXISTS public.prospect_run_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.prospect_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- info | search | scrape | person | email | message | error
  message TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.prospect_run_events TO authenticated;
GRANT ALL ON public.prospect_run_events TO service_role;
ALTER TABLE public.prospect_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read prospect_run_events" ON public.prospect_run_events
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "members insert prospect_run_events" ON public.prospect_run_events
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX IF NOT EXISTS prospect_run_events_run_idx ON public.prospect_run_events(run_id, created_at);
