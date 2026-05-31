
-- Extend campaigns with sender + research fields
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS audience_brief jsonb,
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS cta_url text,
  ADD COLUMN IF NOT EXISTS mailbox_id uuid;

-- Mailboxes (Gmail / Outlook / SMTP) bound to a workspace
CREATE TABLE IF NOT EXISTS public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('gmail','outlook','smtp')),
  email text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'connected',
  metadata jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailboxes TO authenticated;
GRANT ALL ON public.mailboxes TO service_role;

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read mailboxes" ON public.mailboxes
  FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "members insert mailboxes" ON public.mailboxes
  FOR INSERT TO authenticated WITH CHECK (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "members update mailboxes" ON public.mailboxes
  FOR UPDATE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "members delete mailboxes" ON public.mailboxes
  FOR DELETE TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER touch_mailboxes_updated_at
  BEFORE UPDATE ON public.mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
