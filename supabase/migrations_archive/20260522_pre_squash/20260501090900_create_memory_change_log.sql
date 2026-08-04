create table if not exists public.memory_change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  operation_type text not null check (operation_type in (
    'invalidate',
    'supersede',
    'hide',
    'delete',
    'merge',
    'restore',
    'promote',
    'archive_expired',
    'redaction_propagated'
  )),

  target_type text not null check (target_type in (
    'memory_item',
    'entity',
    'topic'
  )),
  target_id uuid not null,

  replacement_id uuid,
  source_message_id uuid references public.chat_messages(id) on delete set null,
  extraction_run_id uuid,

  reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_memory_change_log_user_target
  on public.memory_change_log (user_id, target_type, target_id, created_at desc);

alter table public.memory_change_log enable row level security;

grant all on table public.memory_change_log to authenticated;

drop policy if exists rls_memory_change_log_select_own on public.memory_change_log;
create policy rls_memory_change_log_select_own
  on public.memory_change_log
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_change_log_insert_own on public.memory_change_log;
create policy rls_memory_change_log_insert_own
  on public.memory_change_log
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_change_log_update_own on public.memory_change_log;
create policy rls_memory_change_log_update_own
  on public.memory_change_log
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
