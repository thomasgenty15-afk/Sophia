-- ============================================================================
-- TOPIC MEMORIES — Title embedding for hybrid retrieval
-- ============================================================================
-- Adds title_embedding column and match_topic_memories_by_title RPC for
-- hybrid topic retrieval (keywords + synthesis + title).
--
-- Backfill: Existing rows will have null title_embedding. Runtime backfill
-- required (e.g. watcher or one-off script) to populate via generateEmbedding
-- for each topic title. SQL cannot call the embedding model.
-- ============================================================================

-- 1. Add title_embedding column if not exists
alter table public.user_topic_memories
  add column if not exists title_embedding vector(768);

-- 2. HNSW index for title similarity search
create index if not exists idx_topic_memories_title_embedding
  on public.user_topic_memories using hnsw (title_embedding vector_cosine_ops);

-- 3. RPC: match by title embedding similarity
create or replace function public.match_topic_memories_by_title(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold double precision default 0.55,
  match_count integer default 3
)
returns table (
  topic_id uuid,
  slug text,
  title text,
  synthesis text,
  title_similarity double precision,
  mention_count integer,
  last_enriched_at timestamptz,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    tm.id as topic_id,
    tm.slug,
    tm.title,
    tm.synthesis,
    1 - (tm.title_embedding <=> query_embedding) as title_similarity,
    tm.mention_count,
    tm.last_enriched_at,
    tm.metadata
  from public.user_topic_memories tm
  where tm.user_id = target_user_id
    and tm.status = 'active'
    and tm.title_embedding is not null
    and 1 - (tm.title_embedding <=> query_embedding) > match_threshold
  order by tm.title_embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 4. Permissions
grant execute on function public.match_topic_memories_by_title(uuid, vector, double precision, integer) to service_role;
grant execute on function public.match_topic_memories_by_title(uuid, vector, double precision, integer) to authenticated;
