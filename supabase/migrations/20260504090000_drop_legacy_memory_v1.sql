-- Big bang Memory V2-only cleanup.
-- No legacy data is migrated: V1 summaries are intentionally not imported into
-- memory_items because they are interpreted, non-atomic, and may contain drift.

do $$
declare
  legacy_job record;
begin
  for legacy_job in
    select jobid
    from cron.job
    where jobname in (
      'trigger-memorizer-daily',
      'trigger-global-memory-compaction'
    )
  loop
    perform cron.unschedule(legacy_job.jobid);
  end loop;
exception
  when others then
    null;
end $$;

drop function if exists public.match_topic_memories_by_keywords(
  uuid,
  vector,
  double precision,
  integer
);
drop function if exists public.match_topic_memories_by_synthesis(
  uuid,
  vector,
  double precision,
  integer
);
drop function if exists public.match_topic_memories_by_title(
  uuid,
  vector,
  double precision,
  integer
);
drop function if exists public.match_global_memories(
  uuid,
  vector,
  double precision,
  integer
);
drop function if exists public.match_event_memories(
  uuid,
  vector,
  double precision,
  integer
);
drop function if exists public.match_memories_for_user(
  uuid,
  vector,
  double precision,
  integer,
  text,
  text
);
drop function if exists public.match_memories_for_user(
  uuid,
  vector,
  double precision,
  integer,
  text,
  text,
  text[]
);
drop function if exists public.match_memories(
  vector,
  double precision,
  integer,
  text,
  text
);
drop function if exists public.match_memories(
  vector,
  double precision,
  integer,
  text,
  text,
  text[]
);
drop table if exists public.user_topic_enrichment_log cascade;
drop table if exists public.user_global_memories cascade;
drop table if exists public.user_event_memories cascade;

drop index if exists public.idx_topic_memories_synthesis_embedding;
drop index if exists public.idx_topic_memories_last_enriched;
drop index if exists public.idx_topic_memories_title_embedding;

alter table public.user_topic_memories
  drop column if exists synthesis,
  drop column if exists synthesis_embedding,
  drop column if exists mention_count,
  drop column if exists enrichment_count,
  drop column if exists last_enriched_at,
  drop column if exists last_retrieved_at,
  drop column if exists summary_compacted_at,
  drop column if exists pending_enrichment_count,
  drop column if exists pending_enrichment_chars,
  drop column if exists title_embedding;

create index if not exists idx_memory_items_user_status_observed_at
  on public.memory_items (user_id, status, observed_at desc nulls last);

create index if not exists idx_memory_items_user_status_importance
  on public.memory_items (
    user_id,
    status,
    importance_score desc nulls last,
    observed_at desc nulls last
  );

-- Keep the conversation-scope trigger compatible with chat_role enum values.
-- The original trigger used coalesce(new.role, ''), which attempts to cast ''
-- to chat_role and breaks fixture seeding on valid chat inserts.
create or replace function public.handle_conversation_scope_memory_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_scope text;
begin
  if new.user_id is null then
    return new;
  end if;

  if coalesce(new.role::text, '') not in ('user', 'assistant') then
    return new;
  end if;

  safe_scope := coalesce(nullif(trim(new.scope), ''), 'web');

  if not (
    safe_scope = 'whatsapp' or
    safe_scope like 'module:%' or
    safe_scope like 'story:%' or
    safe_scope like 'reflection:%'
  ) then
    return new;
  end if;

  insert into public.conversation_scope_memories (
    user_id,
    scope,
    summary_text,
    pending_message_count,
    updated_at
  )
  values (
    new.user_id,
    safe_scope,
    '',
    1,
    now()
  )
  on conflict (user_id, scope)
  do update set
    pending_message_count =
      public.conversation_scope_memories.pending_message_count + 1,
    updated_at = now();

  return new;
end;
$$;
