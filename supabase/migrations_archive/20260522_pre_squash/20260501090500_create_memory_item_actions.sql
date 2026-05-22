create table if not exists public.memory_item_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,

  plan_item_id uuid,

  observation_window_start timestamptz,
  observation_window_end timestamptz,

  aggregation_kind text not null default 'single_occurrence' check (aggregation_kind in (
    'single_occurrence',
    'week_summary',
    'streak_summary',
    'possible_pattern'
  )),

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  extraction_run_id uuid,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_memory_item_actions_window
    check (
      observation_window_end is null
      or observation_window_start is null
      or observation_window_end >= observation_window_start
    )
);

create index if not exists idx_memory_item_actions_plan
  on public.memory_item_actions (user_id, plan_item_id)
  where plan_item_id is not null;

create index if not exists idx_memory_item_actions_item
  on public.memory_item_actions (memory_item_id);

create index if not exists idx_memory_item_actions_window
  on public.memory_item_actions (
    user_id,
    observation_window_start,
    observation_window_end
  );

alter table public.memory_item_actions enable row level security;

grant all on table public.memory_item_actions to authenticated;

drop policy if exists rls_memory_item_actions_select_own on public.memory_item_actions;
create policy rls_memory_item_actions_select_own
  on public.memory_item_actions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_memory_item_actions_insert_own on public.memory_item_actions;
create policy rls_memory_item_actions_insert_own
  on public.memory_item_actions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_memory_item_actions_update_own on public.memory_item_actions;
create policy rls_memory_item_actions_update_own
  on public.memory_item_actions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
