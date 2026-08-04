-- ============================================================================
-- EVENT MEMORIES + TOPIC COMPACTION
-- ============================================================================

alter table public.user_topic_memories
  add column if not exists summary_compacted_at timestamptz,
  add column if not exists pending_enrichment_count integer not null default 0,
  add column if not exists pending_enrichment_chars integer not null default 0;

alter table public.user_topic_enrichment_log
  add column if not exists included_in_summary boolean not null default false;

-- Historical enrichments are already reflected in the stored synthesis.
update public.user_topic_enrichment_log
set included_in_summary = true
where included_in_summary = false;

update public.user_topic_memories
set summary_compacted_at = coalesce(summary_compacted_at, last_enriched_at, updated_at, created_at, now());

create table if not exists public.user_event_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  event_key text not null,
  title text not null,
  summary text not null default '',
  event_type text not null default 'generic',
  starts_at timestamptz,
  ends_at timestamptz,
  relevance_until timestamptz,
  time_precision text not null default 'unknown',
  status text not null default 'upcoming',
  confidence double precision not null default 0.5,
  mention_count integer not null default 1,
  last_confirmed_at timestamptz,
  last_retrieved_at timestamptz,
  event_embedding vector(768),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_memories_user_status
  on public.user_event_memories (user_id, status);
create index if not exists idx_event_memories_user_start
  on public.user_event_memories (user_id, starts_at desc nulls last);
create index if not exists idx_event_memories_user_event_key
  on public.user_event_memories (user_id, event_key);
create index if not exists idx_event_memories_embedding
  on public.user_event_memories using hnsw (event_embedding vector_cosine_ops);

alter table public.user_event_memories enable row level security;

do $$ begin
  execute 'create policy rls_event_memories_select on public.user_event_memories for select using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_event_memories_insert on public.user_event_memories for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_event_memories_update on public.user_event_memories for update using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

create or replace function public.match_event_memories(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold double precision default 0.45,
  match_count integer default 5
)
returns table (
  event_id uuid,
  event_key text,
  title text,
  summary text,
  event_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  relevance_until timestamptz,
  time_precision text,
  status text,
  confidence double precision,
  mention_count integer,
  last_confirmed_at timestamptz,
  metadata jsonb,
  event_similarity double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    em.id as event_id,
    em.event_key,
    em.title,
    em.summary,
    em.event_type,
    em.starts_at,
    em.ends_at,
    em.relevance_until,
    em.time_precision,
    em.status,
    em.confidence,
    em.mention_count,
    em.last_confirmed_at,
    em.metadata,
    1 - (em.event_embedding <=> query_embedding) as event_similarity
  from public.user_event_memories em
  where em.user_id = target_user_id
    and em.status in ('upcoming', 'active', 'recently_past')
    and em.event_embedding is not null
    and 1 - (em.event_embedding <=> query_embedding) > match_threshold
  order by em.event_embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function public.match_event_memories(uuid, vector, double precision, integer) to service_role;
grant execute on function public.match_event_memories(uuid, vector, double precision, integer) to authenticated;
