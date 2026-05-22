create table if not exists public.conversation_scope_memories (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  summary_text text not null default '',
  pending_message_count integer not null default 0 check (pending_message_count >= 0),
  last_compaction_at timestamp with time zone null,
  last_compacted_message_at timestamp with time zone null,
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, scope)
);

create index if not exists conversation_scope_memories_user_updated_idx
  on public.conversation_scope_memories (user_id, updated_at desc);

alter table public.conversation_scope_memories enable row level security;

drop policy if exists rls_conversation_scope_memories_select_own on public.conversation_scope_memories;
create policy rls_conversation_scope_memories_select_own
  on public.conversation_scope_memories
  for select
  using (auth.uid() = user_id);

drop policy if exists rls_conversation_scope_memories_insert_own on public.conversation_scope_memories;
create policy rls_conversation_scope_memories_insert_own
  on public.conversation_scope_memories
  for insert
  with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()));

drop policy if exists rls_conversation_scope_memories_update_own on public.conversation_scope_memories;
create policy rls_conversation_scope_memories_update_own
  on public.conversation_scope_memories
  for update
  using (auth.uid() = user_id and public.has_app_write_access(auth.uid()))
  with check (auth.uid() = user_id and public.has_app_write_access(auth.uid()));

drop policy if exists rls_conversation_scope_memories_delete_own on public.conversation_scope_memories;
create policy rls_conversation_scope_memories_delete_own
  on public.conversation_scope_memories
  for delete
  using (auth.uid() = user_id and public.has_app_write_access(auth.uid()));

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

  if coalesce(new.role, '') not in ('user', 'assistant') then
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
    pending_message_count = public.conversation_scope_memories.pending_message_count + 1,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_chat_messages_scope_memory_insert on public.chat_messages;
create trigger trg_chat_messages_scope_memory_insert
after insert on public.chat_messages
for each row
execute function public.handle_conversation_scope_memory_message_insert();
