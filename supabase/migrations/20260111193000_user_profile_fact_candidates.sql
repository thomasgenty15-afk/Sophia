-- User profile fact candidates (proposed by Watcher / other sources).
-- These are NOT facts. They must be confirmed by the user (via Companion) before becoming user_profile_facts.

create table if not exists public.user_profile_fact_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  scope text not null default 'global', -- 'global' | 'web' | 'whatsapp'
  key text not null, -- e.g. conversation.verbosity
  proposed_value jsonb not null,
  -- Stable hash of the proposed value to allow unique constraint per (user, scope, key, value).
  value_hash text generated always as (md5(proposed_value::text)) stored,

  status text not null default 'pending', -- pending | asked | confirmed | rejected | expired
  confidence double precision not null default 0.5, -- 0..1 from Watcher
  hits integer not null default 1, -- number of times this candidate was proposed

  reason text null,
  evidence text null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_asked_at timestamptz null,
  asked_count integer not null default 0,
  resolved_at timestamptz null,
  resolved_value jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, scope, key, value_hash)
);

create index if not exists idx_upfc_user_scope_status on public.user_profile_fact_candidates (user_id, scope, status);
create index if not exists idx_upfc_user_key_status on public.user_profile_fact_candidates (user_id, key, status);
create index if not exists idx_upfc_user_last_seen on public.user_profile_fact_candidates (user_id, last_seen_at desc);

alter table public.user_profile_fact_candidates enable row level security;

do $$
begin
  execute 'create policy rls_user_profile_fact_candidates_select_self on public.user_profile_fact_candidates for select using (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy rls_user_profile_fact_candidates_insert_self on public.user_profile_fact_candidates for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute '' ||
    'create policy rls_user_profile_fact_candidates_update_self on public.user_profile_fact_candidates ' ||
    'for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy rls_user_profile_fact_candidates_delete_self on public.user_profile_fact_candidates for delete using (auth.uid() = user_id)';
exception when duplicate_object then null;
end $$;




