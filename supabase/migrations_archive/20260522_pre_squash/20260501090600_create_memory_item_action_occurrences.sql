create table if not exists public.memory_item_action_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_action_id uuid not null references public.memory_item_actions(id) on delete cascade,
  action_occurrence_id uuid not null,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (memory_item_action_id, action_occurrence_id)
);

create index if not exists idx_memory_item_action_occurrences_action
  on public.memory_item_action_occurrences (memory_item_action_id);

create index if not exists idx_memory_item_action_occurrences_occurrence
  on public.memory_item_action_occurrences (user_id, action_occurrence_id);

alter table public.memory_item_action_occurrences enable row level security;

grant all on table public.memory_item_action_occurrences to authenticated;

drop policy if exists rls_memory_item_action_occurrences_select_own on public.memory_item_action_occurrences;
create policy rls_memory_item_action_occurrences_select_own
  on public.memory_item_action_occurrences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_item_action_occurrences_insert_own on public.memory_item_action_occurrences;
create policy rls_memory_item_action_occurrences_insert_own
  on public.memory_item_action_occurrences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_item_action_occurrences_update_own on public.memory_item_action_occurrences;
create policy rls_memory_item_action_occurrences_update_own
  on public.memory_item_action_occurrences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
