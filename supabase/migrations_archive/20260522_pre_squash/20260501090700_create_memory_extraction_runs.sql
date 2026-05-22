create table if not exists public.memory_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  batch_hash text not null,
  prompt_version text not null,
  model_name text not null,
  embedding_model text,

  status text not null default 'running' check (status in (
    'running',
    'completed',
    'failed',
    'skipped'
  )),

  trigger_type text not null,
  input_message_ids uuid[] not null default '{}',

  proposed_item_count integer not null default 0,
  accepted_item_count integer not null default 0,
  rejected_item_count integer not null default 0,
  proposed_entity_count integer not null default 0,
  accepted_entity_count integer not null default 0,

  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),

  unique (user_id, batch_hash, prompt_version)
);

create index if not exists idx_memory_extraction_runs_user_status
  on public.memory_extraction_runs (user_id, status, started_at desc);

alter table public.memory_extraction_runs enable row level security;

grant all on table public.memory_extraction_runs to authenticated;

drop policy if exists rls_memory_extraction_runs_select_own on public.memory_extraction_runs;
create policy rls_memory_extraction_runs_select_own
  on public.memory_extraction_runs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_extraction_runs_insert_own on public.memory_extraction_runs;
create policy rls_memory_extraction_runs_insert_own
  on public.memory_extraction_runs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_extraction_runs_update_own on public.memory_extraction_runs;
create policy rls_memory_extraction_runs_update_own
  on public.memory_extraction_runs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
