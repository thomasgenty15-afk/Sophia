-- ============================================================================
-- TOPIC MEMORIES — Fix service-role detection for RPC guards
-- ============================================================================
-- Why:
-- Some server-side calls use API keys where request.jwt.claim.role can be empty.
-- Existing guards only trusted JWT role="service_role", causing false
-- "Forbidden: target_user_id mismatch" on legitimate backend calls.
--
-- Fix:
-- Consider both:
-- - JWT claim role == service_role
-- - session_user == service_role
-- while still enforcing auth.uid()==target_user_id for non-service callers.
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
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  caller_uid uuid := auth.uid();
  is_service boolean := caller_role = 'service_role' or session_user = 'service_role';
begin
  if not is_service and caller_uid is distinct from target_user_id then
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
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  caller_uid uuid := auth.uid();
  is_service boolean := caller_role = 'service_role' or session_user = 'service_role';
begin
  if not is_service and caller_uid is distinct from target_user_id then
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
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  caller_uid uuid := auth.uid();
  is_service boolean := caller_role = 'service_role' or session_user = 'service_role';
begin
  if not is_service and caller_uid is distinct from target_user_id then
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
