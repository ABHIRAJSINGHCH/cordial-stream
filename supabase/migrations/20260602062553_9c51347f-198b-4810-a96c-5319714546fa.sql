CREATE TABLE public.user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  secret_ciphertext bytea,
  secret_iv bytea,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO authenticated;
GRANT ALL ON public.user_integrations TO service_role;

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select user_integrations"
  ON public.user_integrations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "owners insert user_integrations"
  ON public.user_integrations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "owners update user_integrations"
  ON public.user_integrations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "owners delete user_integrations"
  ON public.user_integrations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER user_integrations_touch_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
