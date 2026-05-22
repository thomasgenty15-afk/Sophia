-- Harden match_memories_for_user:
-- - explicit SECURITY DEFINER guard (service_role only)
-- - explicit REVOKE/GRANT contract
-- Keeps fallback behavior in app (web JWT path falls back to match_memories).

create or replace function public.match_memories_for_user(
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
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if caller_role <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.content,
    m.source_id,
    m.source_type,
    m.type,
    m.status,
    1 - (m.embedding <=> query_embedding) as similarity,
    m.metadata
  from public.memories m
  where 1 - (m.embedding <=> query_embedding) > match_threshold
    and (filter_source_type is null or m.source_type = filter_source_type)
    and (filter_type is null or m.type = filter_type)
    and (filter_status is null or m.status = any(filter_status))
    and m.user_id = target_user_id
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;

revoke all on function public.match_memories_for_user(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_source_type text,
  filter_type text,
  filter_status text[]
) from public;

grant execute on function public.match_memories_for_user(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_source_type text,
  filter_type text,
  filter_status text[]
) to service_role;
