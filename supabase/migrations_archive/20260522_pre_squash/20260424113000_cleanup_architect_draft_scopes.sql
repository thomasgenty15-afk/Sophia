create extension if not exists "pg_cron" with schema "extensions";

create index if not exists conversation_scope_memories_architect_draft_ttl_idx
  on public.conversation_scope_memories (updated_at asc)
  where scope like 'story:draft:%' or scope like 'reflection:draft:%';

create or replace function public.cleanup_expired_architect_draft_scopes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  with expired_scopes as (
    select user_id, scope
    from public.conversation_scope_memories
    where updated_at < now() - interval '7 days'
      and (
        scope like 'story:draft:%' or
        scope like 'reflection:draft:%'
      )
  ), deleted_messages as (
    delete from public.chat_messages cm
    using expired_scopes es
    where cm.user_id = es.user_id
      and cm.scope = es.scope
    returning cm.user_id, cm.scope
  ), deleted_memories as (
    delete from public.conversation_scope_memories csm
    using expired_scopes es
    where csm.user_id = es.user_id
      and csm.scope = es.scope
    returning csm.user_id, csm.scope
  )
  select count(*)::integer into deleted_count
  from deleted_memories;

  return coalesce(deleted_count, 0);
end;
$$;

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'cleanup-architect-draft-scopes'
  limit 1;

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'cleanup-architect-draft-scopes',
  '25 3 * * *',
  $$select public.cleanup_expired_architect_draft_scopes();$$
);
