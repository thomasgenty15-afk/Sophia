-- ============================================================================
-- GLOBAL MEMORIES V2 — async compaction + semantic embeddings (1536 dims)
-- ============================================================================

alter table public.user_global_memories
  add column if not exists semantic_snapshot text not null default '',
  add column if not exists semantic_embedding vector(1536),
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists needs_compaction boolean not null default false,
  add column if not exists needs_embedding_refresh boolean not null default true;

update public.user_global_memories
set
  semantic_snapshot = coalesce(nullif(semantic_snapshot, ''), canonical_summary, full_key),
  needs_compaction = needs_compaction
    or pending_count >= 5
    or pending_chars >= 1200
    or char_length(coalesce(canonical_summary, '')) >= 1800,
  needs_embedding_refresh = true
where semantic_snapshot = ''
   or needs_embedding_refresh = false
   or semantic_embedding is null;

create index if not exists idx_global_memories_embedding
  on public.user_global_memories using hnsw (semantic_embedding vector_cosine_ops);

create index if not exists idx_global_memories_maintenance_queue
  on public.user_global_memories (
    status,
    needs_compaction,
    needs_embedding_refresh,
    updated_at desc
  );

create or replace function public.match_global_memories(
  target_user_id uuid,
  query_embedding vector(1536),
  match_threshold double precision default 0.42,
  match_count integer default 6
)
returns table (
  memory_id uuid,
  full_key text,
  theme text,
  subtheme_key text,
  semantic_similarity double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  caller_uid uuid := auth.uid();
begin
  if caller_role <> 'service_role' and caller_uid is distinct from target_user_id then
    raise exception 'Forbidden: target_user_id mismatch'
      using errcode = '42501';
  end if;

  return query
  select
    gm.id as memory_id,
    gm.full_key,
    gm.theme,
    gm.subtheme_key,
    1 - (gm.semantic_embedding <=> query_embedding) as semantic_similarity
  from public.user_global_memories gm
  where gm.user_id = target_user_id
    and gm.status = 'active'
    and gm.semantic_embedding is not null
    and 1 - (gm.semantic_embedding <=> query_embedding) > match_threshold
  order by gm.semantic_embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function public.match_global_memories(uuid, vector, double precision, integer) to service_role;
grant execute on function public.match_global_memories(uuid, vector, double precision, integer) to authenticated;
