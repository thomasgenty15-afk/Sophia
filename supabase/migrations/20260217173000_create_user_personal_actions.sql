-- Dedicated personal habits/actions table (separate from transformation plan actions).
-- Users can create recurring habits that live outside a specific transformation plan.

create table if not exists public.user_personal_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  quest_type text not null default 'side'
    check (quest_type in ('main', 'side')),
  rationale text null,
  tips text null,
  time_of_day text not null default 'any_time'
    check (time_of_day in ('morning', 'afternoon', 'evening', 'night', 'any_time')),
  target_reps integer not null default 1
    check (target_reps >= 1 and target_reps <= 7),
  current_reps integer not null default 0
    check (current_reps >= 0),
  scheduled_days text[] null,
  status text not null default 'active'
    check (status in ('pending', 'active', 'completed', 'cancelled', 'abandoned')),
  last_performed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_personal_actions_scheduled_days_valid check (
    scheduled_days is null
    or (
      cardinality(scheduled_days) >= 1
      and cardinality(scheduled_days) <= 7
      and scheduled_days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]
      and cardinality(scheduled_days) <= target_reps
    )
  )
);

create index if not exists user_personal_actions_user_status_idx
  on public.user_personal_actions (user_id, status, updated_at desc);

create index if not exists user_personal_actions_user_created_idx
  on public.user_personal_actions (user_id, created_at desc);

alter table public.user_personal_actions enable row level security;

drop policy if exists rls_user_personal_actions_select_own on public.user_personal_actions;
create policy rls_user_personal_actions_select_own
  on public.user_personal_actions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_personal_actions_insert_own on public.user_personal_actions;
create policy rls_user_personal_actions_insert_own
  on public.user_personal_actions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_personal_actions_update_own on public.user_personal_actions;
create policy rls_user_personal_actions_update_own
  on public.user_personal_actions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_personal_actions_delete_own on public.user_personal_actions;
create policy rls_user_personal_actions_delete_own
  on public.user_personal_actions
  for delete
  to authenticated
  using (auth.uid() = user_id);

