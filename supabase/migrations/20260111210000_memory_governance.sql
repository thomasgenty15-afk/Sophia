-- Governance fields for Memory (Point 3)
-- 1. Add governance columns to public.memories

alter table public.memories
add column if not exists status text not null default 'raw'; -- 'raw', 'consolidated', 'archived', 'disputed'

alter table public.memories
add column if not exists provenance_message_id uuid references public.chat_messages(id) on delete set null;

alter table public.memories
add column if not exists valid_until timestamptz;

alter table public.memories
add column if not exists consolidated_at timestamptz;

alter table public.memories
add column if not exists last_reinforced_at timestamptz;

-- Index on status for faster filtering
create index if not exists memories_status_idx on public.memories(status);

-- 2. Add versioning columns to public.user_profile_facts

alter table public.user_profile_facts
add column if not exists version integer not null default 1;

alter table public.user_profile_facts
add column if not exists previous_values jsonb default '[]'::jsonb;

-- 3. Update match_memories RPC to allow filtering by status
-- (Replaces existing function)

create or replace function match_memories (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_source_type text default null,
  filter_type text default null,
  filter_status text[] default null -- New parameter
)
returns table (
  id uuid,
  content text,
  source_id text,
  source_type text,
  type text,
  status text, -- New return field
  similarity float,
  metadata jsonb
)
language plpgsql
stable
as $$
begin
  return query
  select
    memories.id,
    memories.content,
    memories.source_id,
    memories.source_type,
    memories.type,
    memories.status,
    1 - (memories.embedding <=> query_embedding) as similarity,
    memories.metadata
  from public.memories
  where 1 - (memories.embedding <=> query_embedding) > match_threshold
  and (filter_source_type is null or memories.source_type = filter_source_type)
  and (filter_type is null or memories.type = filter_type)
  and (filter_status is null or memories.status = any(filter_status)) -- New filter
  and memories.user_id = auth.uid()
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Also update the service-role equivalent `match_memories_for_user` if it exists
-- Checking if it exists in previous context... yes "supabase/migrations/20260110120000_match_memories_for_user.sql"

create or replace function match_memories_for_user (
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_source_type text default null,
  filter_type text default null,
  filter_status text[] default null
)
returns table (
  id uuid,
  content text,
  source_id text,
  source_type text,
  type text,
  status text,
  similarity float,
  metadata jsonb
)
language plpgsql
stable
as $$
begin
  return query
  select
    memories.id,
    memories.content,
    memories.source_id,
    memories.source_type,
    memories.type,
    memories.status,
    1 - (memories.embedding <=> query_embedding) as similarity,
    memories.metadata
  from public.memories
  where 1 - (memories.embedding <=> query_embedding) > match_threshold
  and (filter_source_type is null or memories.source_type = filter_source_type)
  and (filter_type is null or memories.type = filter_type)
  and (filter_status is null or memories.status = any(filter_status))
  and memories.user_id = target_user_id
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;


