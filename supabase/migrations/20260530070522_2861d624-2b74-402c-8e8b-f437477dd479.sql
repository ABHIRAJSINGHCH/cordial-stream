
-- ============ ENUMS ============
create type public.app_role as enum ('owner', 'member');
create type public.lead_status as enum ('new', 'enriching', 'enriched', 'failed', 'unsubscribed');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'completed');
create type public.step_channel as enum ('email', 'linkedin', 'manual');
create type public.campaign_lead_state as enum ('queued', 'in_progress', 'replied', 'bounced', 'unsubscribed', 'completed');
create type public.message_status as enum ('pending_approval', 'approved', 'scheduled', 'sent', 'failed', 'replied', 'skipped');
create type public.message_tone as enum ('professional', 'founder', 'recruiter', 'casual', 'sales', 'enterprise');
create type public.event_type as enum ('open', 'click', 'reply', 'bounce', 'unsubscribe', 'sent');
create type public.ai_job_kind as enum ('enrich', 'generate');
create type public.ai_job_status as enum ('pending', 'running', 'done', 'failed');

-- ============ WORKSPACES ============
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sender_name text,
  sender_email text,
  default_tone public.message_tone not null default 'professional',
  daily_send_cap int not null default 50,
  send_window_start time not null default '09:00',
  send_window_end time not null default '17:00',
  auto_approve_threshold numeric(3,2) not null default 0.85,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on public.workspace_members(user_id);
create index on public.workspace_members(workspace_id);

-- ============ Helper: is_member / has_role (security definer) ============
create or replace function public.is_workspace_member(_user_id uuid, _workspace_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where user_id = _user_id and workspace_id = _workspace_id
  );
$$;

create or replace function public.has_workspace_role(_user_id uuid, _workspace_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where user_id = _user_id and workspace_id = _workspace_id and role = _role
  );
$$;

create or replace function public.current_user_workspace()
returns uuid
language sql stable security definer set search_path = public
as $$
  select workspace_id from public.workspace_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;
$$;

-- ============ LEADS ============
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null,
  first_name text,
  last_name text,
  email text,
  title text,
  company text,
  linkedin_url text,
  website text,
  location text,
  tags text[] not null default '{}',
  status public.lead_status not null default 'new',
  enrichment jsonb,
  enrichment_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.leads(workspace_id);
create index on public.leads(workspace_id, status);

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index on public.lead_notes(lead_id);

-- ============ CAMPAIGNS ============
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  goal text,
  status public.campaign_status not null default 'draft',
  default_tone public.message_tone not null default 'professional',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.campaigns(workspace_id);

create table public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  position int not null,
  channel public.step_channel not null default 'email',
  wait_days int not null default 0,
  subject_template text,
  body_template text,
  tone public.message_tone,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sequence_steps(campaign_id);
create unique index sequence_steps_campaign_position_key on public.sequence_steps(campaign_id, position);

create table public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  state public.campaign_lead_state not null default 'queued',
  current_step_position int not null default 0,
  added_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);
create index on public.campaign_leads(campaign_id);
create index on public.campaign_leads(lead_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_lead_id uuid not null references public.campaign_leads(id) on delete cascade,
  step_id uuid not null references public.sequence_steps(id) on delete cascade,
  channel public.step_channel not null,
  subject text,
  body text,
  ai_reasoning text[] not null default '{}',
  ai_confidence numeric(3,2),
  status public.message_status not null default 'pending_approval',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.messages(workspace_id);
create index on public.messages(campaign_id);
create index on public.messages(status, scheduled_at);

create table public.message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type public.event_type not null,
  payload jsonb,
  occurred_at timestamptz not null default now()
);
create index on public.message_events(message_id);
create index on public.message_events(workspace_id, occurred_at desc);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.ai_job_kind not null,
  status public.ai_job_status not null default 'pending',
  input jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on public.ai_jobs(workspace_id, created_at desc);

-- ============ GRANTS ============
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.lead_notes to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.sequence_steps to authenticated;
grant select, insert, update, delete on public.campaign_leads to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.message_events to authenticated;
grant select, insert, update, delete on public.ai_jobs to authenticated;
grant all on public.workspaces, public.workspace_members, public.leads, public.lead_notes,
  public.campaigns, public.sequence_steps, public.campaign_leads, public.messages,
  public.message_events, public.ai_jobs to service_role;

-- ============ RLS ============
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
alter table public.campaigns enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.campaign_leads enable row level security;
alter table public.messages enable row level security;
alter table public.message_events enable row level security;
alter table public.ai_jobs enable row level security;

-- workspaces: members can read; owners can update; any authed user can insert (own workspace creation)
create policy "members read workspaces" on public.workspaces for select to authenticated
  using (public.is_workspace_member(auth.uid(), id));
create policy "owners update workspaces" on public.workspaces for update to authenticated
  using (public.has_workspace_role(auth.uid(), id, 'owner'))
  with check (public.has_workspace_role(auth.uid(), id, 'owner'));
create policy "authed insert workspaces" on public.workspaces for insert to authenticated
  with check (true);

-- workspace_members: read own memberships
create policy "read own memberships" on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or public.is_workspace_member(auth.uid(), workspace_id));
create policy "insert own membership" on public.workspace_members for insert to authenticated
  with check (user_id = auth.uid());
create policy "owners manage members" on public.workspace_members for update to authenticated
  using (public.has_workspace_role(auth.uid(), workspace_id, 'owner'));
create policy "owners delete members" on public.workspace_members for delete to authenticated
  using (public.has_workspace_role(auth.uid(), workspace_id, 'owner'));

-- generic workspace-scoped policies
do $$
declare t text;
begin
  for t in select unnest(array[
    'leads','lead_notes','campaigns','sequence_steps','campaign_leads','messages','message_events','ai_jobs'
  ]) loop
    execute format($f$
      create policy "members read %1$s" on public.%1$s for select to authenticated
        using (public.is_workspace_member(auth.uid(), workspace_id));
      create policy "members insert %1$s" on public.%1$s for insert to authenticated
        with check (public.is_workspace_member(auth.uid(), workspace_id));
      create policy "members update %1$s" on public.%1$s for update to authenticated
        using (public.is_workspace_member(auth.uid(), workspace_id))
        with check (public.is_workspace_member(auth.uid(), workspace_id));
      create policy "members delete %1$s" on public.%1$s for delete to authenticated
        using (public.is_workspace_member(auth.uid(), workspace_id));
    $f$, t);
  end loop;
end$$;

-- ============ AUTO-CREATE WORKSPACE ON SIGNUP ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_ws_id uuid;
  display text;
begin
  display := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'My Workspace');
  insert into public.workspaces (name, sender_name, sender_email)
  values (display || $a$'s Workspace$a$, display, new.email)
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
do $$
declare t text;
begin
  for t in select unnest(array['workspaces','leads','campaigns','sequence_steps','messages']) loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end$$;
