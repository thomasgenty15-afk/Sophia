-- ============================================================================
-- GLOBAL MEMORIES
-- ============================================================================

create table if not exists public.user_global_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  theme text not null,
  subtheme_key text not null,
  full_key text not null,
  status text not null default 'active',
  canonical_summary text not null default '',
  facts jsonb not null default '[]'::jsonb,
  inferences jsonb not null default '[]'::jsonb,
  active_issues jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  supporting_topic_slugs jsonb not null default '[]'::jsonb,
  pending_updates jsonb not null default '[]'::jsonb,
  mention_count integer not null default 1,
  enrichment_count integer not null default 0,
  pending_count integer not null default 0,
  pending_chars integer not null default 0,
  confidence double precision not null default 0.5,
  summary_compacted_at timestamptz,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz,
  last_retrieved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, full_key)
);

create index if not exists idx_global_memories_user_status
  on public.user_global_memories (user_id, status);

create index if not exists idx_global_memories_user_theme
  on public.user_global_memories (user_id, theme);

create index if not exists idx_global_memories_user_last_observed
  on public.user_global_memories (user_id, last_observed_at desc nulls last);

alter table public.user_global_memories enable row level security;

do $$ begin
  execute 'create policy rls_global_memories_select on public.user_global_memories for select using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_global_memories_insert on public.user_global_memories for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_global_memories_update on public.user_global_memories for update using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;
