create table if not exists public.user_habit_week_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null,
  plan_item_id uuid not null,
  week_start_date date not null,
  status text not null default 'pending_confirmation',
  default_days text[] not null default '{}'::text[],
  planned_days text[] not null default '{}'::text[],
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_habit_week_plans_plan_item_fk
    foreign key (plan_item_id, plan_id, cycle_id, transformation_id)
    references public.user_plan_items(id, plan_id, cycle_id, transformation_id)
    on delete cascade,
  constraint user_habit_week_plans_status_check
    check (status in ('pending_confirmation', 'confirmed', 'auto_applied')),
  constraint user_habit_week_plans_default_days_check
    check (
      cardinality(default_days) <= 7
      and default_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]
    ),
  constraint user_habit_week_plans_planned_days_check
    check (
      cardinality(planned_days) <= 7
      and planned_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]
    ),
  constraint user_habit_week_plans_unique
    unique (user_id, plan_item_id, week_start_date)
);

create index if not exists user_habit_week_plans_user_week_idx
  on public.user_habit_week_plans (user_id, week_start_date desc);

create table if not exists public.user_habit_week_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null,
  plan_item_id uuid not null,
  week_start_date date not null,
  ordinal integer not null,
  planned_day text not null,
  original_planned_day text null,
  actual_day text null,
  status text not null default 'planned',
  source text not null default 'default_generated',
  validated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_habit_week_occurrences_plan_item_fk
    foreign key (plan_item_id, plan_id, cycle_id, transformation_id)
    references public.user_plan_items(id, plan_id, cycle_id, transformation_id)
    on delete cascade,
  constraint user_habit_week_occurrences_ordinal_check
    check (ordinal between 1 and 7),
  constraint user_habit_week_occurrences_status_check
    check (status in ('planned', 'done', 'missed', 'rescheduled')),
  constraint user_habit_week_occurrences_source_check
    check (
      source in ('default_generated', 'weekly_confirmed', 'auto_rescheduled', 'manual_change')
    ),
  constraint user_habit_week_occurrences_planned_day_check
    check (planned_day = any(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[])),
  constraint user_habit_week_occurrences_original_planned_day_check
    check (
      original_planned_day is null
      or original_planned_day = any(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[])
    ),
  constraint user_habit_week_occurrences_actual_day_check
    check (
      actual_day is null
      or actual_day = any(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[])
    ),
  constraint user_habit_week_occurrences_unique
    unique (user_id, plan_item_id, week_start_date, ordinal)
);

create index if not exists user_habit_week_occurrences_user_week_idx
  on public.user_habit_week_occurrences (user_id, week_start_date desc, plan_item_id, ordinal);

alter table public.user_habit_week_plans enable row level security;
alter table public.user_habit_week_occurrences enable row level security;

grant all on table public.user_habit_week_plans to authenticated;
grant all on table public.user_habit_week_occurrences to authenticated;

drop policy if exists rls_user_habit_week_plans_select_own on public.user_habit_week_plans;
create policy rls_user_habit_week_plans_select_own
  on public.user_habit_week_plans
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_plans_insert_own on public.user_habit_week_plans;
create policy rls_user_habit_week_plans_insert_own
  on public.user_habit_week_plans
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_plans_update_own on public.user_habit_week_plans;
create policy rls_user_habit_week_plans_update_own
  on public.user_habit_week_plans
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_plans_delete_own on public.user_habit_week_plans;
create policy rls_user_habit_week_plans_delete_own
  on public.user_habit_week_plans
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_occurrences_select_own on public.user_habit_week_occurrences;
create policy rls_user_habit_week_occurrences_select_own
  on public.user_habit_week_occurrences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_occurrences_insert_own on public.user_habit_week_occurrences;
create policy rls_user_habit_week_occurrences_insert_own
  on public.user_habit_week_occurrences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_occurrences_update_own on public.user_habit_week_occurrences;
create policy rls_user_habit_week_occurrences_update_own
  on public.user_habit_week_occurrences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_occurrences_delete_own on public.user_habit_week_occurrences;
create policy rls_user_habit_week_occurrences_delete_own
  on public.user_habit_week_occurrences
  for delete
  to authenticated
  using (auth.uid() = user_id);
