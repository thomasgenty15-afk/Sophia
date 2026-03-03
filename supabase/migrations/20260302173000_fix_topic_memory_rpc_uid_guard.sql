-- ============================================================================
-- TOPIC MEMORIES — Robust guard based on auth.uid()
-- ============================================================================
-- Why:
-- In some backend invocation paths, JWT role claims can differ while auth.uid()
-- is NULL. The previous guard could reject legitimate server calls with:
-- "Forbidden: target_user_id mismatch".
--
-- Rule:
-- - If auth.uid() is present, it must match target_user_id.
-- - If auth.uid() is NULL, allow (server/internal context).
-- ============================================================================

create or replace function public.match_topic_memories_by_keywords(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold double precision default 0.60,
  match_count integer default 5
)
returns table (
  topic_id uuid,
  slug text,
  title text,
  synthesis text,
  keyword_matched text,
  keyword_similarity double precision,
  mention_count integer,
  last_enriched_at timestamptz,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_uid uuid := auth.uid();
begin
  if caller_uid is not null and caller_uid is distinct from target_user_id then
    raise exception 'Forbidden: target_user_id mismatch'
      using errcode = '42501';
  end if;

  return query
  select distinct on (tm.id)
    tm.id as topic_id,
    tm.slug,
    tm.title,
    tm.synthesis,
    tk.keyword as keyword_matched,
    1 - (tk.keyword_embedding <=> query_embedding) as keyword_similarity,
    tm.mention_count,
    tm.last_enriched_at,
    tm.metadata
  from public.user_topic_keywords tk
  join public.user_topic_memories tm on tm.id = tk.topic_id
  where tk.user_id = target_user_id
    and tm.user_id = target_user_id
    and tm.status = 'active'
    and 1 - (tk.keyword_embedding <=> query_embedding) > match_threshold
  order by tm.id, 1 - (tk.keyword_embedding <=> query_embedding) desc
  limit match_count;
end;
$$;

create or replace function public.match_topic_memories_by_synthesis(
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
  synthesis_similarity double precision,
  mention_count integer,
  last_enriched_at timestamptz,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_uid uuid := auth.uid();
begin
  if caller_uid is not null and caller_uid is distinct from target_user_id then
    raise exception 'Forbidden: target_user_id mismatch'
      using errcode = '42501';
  end if;

  return query
  select
    tm.id as topic_id,
    tm.slug,
    tm.title,
    tm.synthesis,
    1 - (tm.synthesis_embedding <=> query_embedding) as synthesis_similarity,
    tm.mention_count,
    tm.last_enriched_at,
    tm.metadata
  from public.user_topic_memories tm
  where tm.user_id = target_user_id
    and tm.status = 'active'
    and tm.synthesis_embedding is not null
    and 1 - (tm.synthesis_embedding <=> query_embedding) > match_threshold
  order by tm.synthesis_embedding <=> query_embedding
  limit match_count;
end;
$$;

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
declare
  caller_uid uuid := auth.uid();
begin
  if caller_uid is not null and caller_uid is distinct from target_user_id then
    raise exception 'Forbidden: target_user_id mismatch'
      using errcode = '42501';
  end if;

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
