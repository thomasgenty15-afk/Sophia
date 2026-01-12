-- User profile facts (structured “user model”) + audit events.
-- Goal: store small, high-signal preferences/constraints that should be injected into prompts.
-- This is intentionally V1: no candidates table, no confidence engine beyond simple fields.

create table if not exists public.user_profile_facts (
  user_id uuid references auth.users on delete cascade not null,
  scope text not null default 'global', -- e.g. 'global' | 'web' | 'whatsapp' (aligned with chat scope)
  key text not null, -- e.g. 'conversation.tone'
  value jsonb not null,
  status text not null default 'active', -- 'active' | 'deprecated' | 'disputed'
  confidence double precision not null default 1.0, -- 0..1
  source_type text not null default 'explicit_user', -- 'explicit_user' | 'ui' | 'watcher' | 'inferred'
  last_source_message_id uuid null, -- optional: chat_messages.id that triggered the last update
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz null,
  primary key (user_id, scope, key)
);

create index if not exists idx_user_profile_facts_user_scope on public.user_profile_facts (user_id, scope);
create index if not exists idx_user_profile_facts_user_key on public.user_profile_facts (user_id, key);

create table if not exists public.user_profile_fact_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  scope text not null default 'global',
  key text not null,
  old_value jsonb null,
  new_value jsonb not null,
  source_type text not null default 'explicit_user',
  source_message_id uuid null,
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_profile_fact_events_user_created on public.user_profile_fact_events (user_id, created_at desc);
create index if not exists idx_user_profile_fact_events_user_key on public.user_profile_fact_events (user_id, key);

-- RLS
alter table public.user_profile_facts enable row level security;
alter table public.user_profile_fact_events enable row level security;

-- Facts: user can read/write their own rows.
do $$
begin
  execute 'create policy rls_user_profile_facts_select_self on public.user_profile_facts for select using (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy rls_user_profile_facts_insert_self on public.user_profile_facts for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute '' ||
    'create policy rls_user_profile_facts_update_self on public.user_profile_facts ' ||
    'for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy rls_user_profile_facts_delete_self on public.user_profile_facts for delete using (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

-- Events: user can read their own events; writes happen from edge functions (user token) so allow insert.
do $$
begin
  execute 'create policy rls_user_profile_fact_events_select_self on public.user_profile_fact_events for select using (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy rls_user_profile_fact_events_insert_self on public.user_profile_fact_events for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;



