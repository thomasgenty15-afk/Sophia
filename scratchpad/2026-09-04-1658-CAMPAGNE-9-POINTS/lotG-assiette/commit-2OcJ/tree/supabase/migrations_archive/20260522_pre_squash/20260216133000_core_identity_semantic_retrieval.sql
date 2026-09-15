-- Core identity: semantic retrieval support for prompt-time relevance.

alter table public.user_core_identity
add column if not exists identity_embedding vector(768);

create index if not exists idx_user_core_identity_embedding
  on public.user_core_identity using hnsw (identity_embedding vector_cosine_ops);

create index if not exists idx_user_core_identity_user_updated
  on public.user_core_identity (user_id, last_updated_at desc);

create or replace function public.match_core_identity_by_embedding(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold double precision default 0.52,
  match_count integer default 2
)
returns table (
  id uuid,
  week_id text,
  content text,
  similarity double precision,
  last_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if caller_role <> 'service_role' and auth.uid() <> target_user_id then
    raise exception 'forbidden';
  end if;

  return query
  select
    uci.id,
    uci.week_id,
    uci.content,
    1 - (uci.identity_embedding <=> query_embedding) as similarity,
    uci.last_updated_at
  from public.user_core_identity uci
  where uci.user_id = target_user_id
    and uci.identity_embedding is not null
    and 1 - (uci.identity_embedding <=> query_embedding) > match_threshold
  order by uci.identity_embedding <=> query_embedding
  limit greatest(1, match_count);
end;
$$;

revoke all on function public.match_core_identity_by_embedding(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold double precision,
  match_count integer
) from public;

grant execute on function public.match_core_identity_by_embedding(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold double precision,
  match_count integer
) to authenticated, service_role;

