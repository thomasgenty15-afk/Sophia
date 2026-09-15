create table if not exists public.memory_message_processing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  extraction_run_id uuid not null references public.memory_extraction_runs(id) on delete cascade,

  processing_role text not null check (processing_role in (
    'primary',
    'context_only',
    'skipped_noise',
    'reprocessed_for_correction'
  )),
  processing_status text not null default 'completed' check (processing_status in (
    'completed',
    'skipped',
    'failed'
  )),

  prompt_version text not null,
  model_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (user_id, message_id, processing_role)
);

create index if not exists idx_memory_message_processing_user_message
  on public.memory_message_processing (user_id, message_id);

create index if not exists idx_memory_message_processing_run
  on public.memory_message_processing (extraction_run_id);

alter table public.memory_message_processing enable row level security;

grant all on table public.memory_message_processing to authenticated;

drop policy if exists rls_memory_message_processing_select_own on public.memory_message_processing;
create policy rls_memory_message_processing_select_own
  on public.memory_message_processing
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_message_processing_insert_own on public.memory_message_processing;
create policy rls_memory_message_processing_insert_own
  on public.memory_message_processing
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_message_processing_update_own on public.memory_message_processing;
create policy rls_memory_message_processing_update_own
  on public.memory_message_processing
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
