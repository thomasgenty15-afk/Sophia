create table if not exists public.user_habit_week_reschedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.user_cycles(id) on delete cascade,
  transformation_id uuid not null references public.user_transformations(id) on delete cascade,
  plan_id uuid not null,
  plan_item_id uuid not null,
  week_start_date date not null,
  occurrence_id uuid not null references public.user_habit_week_occurrences(id) on delete cascade,
  from_day text not null,
  to_day text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint user_habit_week_reschedule_events_plan_item_fk
    foreign key (plan_item_id, plan_id, cycle_id, transformation_id)
    references public.user_plan_items(id, plan_id, cycle_id, transformation_id)
    on delete cascade,
  constraint user_habit_week_reschedule_events_from_day_check
    check (from_day = any(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[])),
  constraint user_habit_week_reschedule_events_to_day_check
    check (to_day = any(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[])),
  constraint user_habit_week_reschedule_events_reason_check
    check (reason in ('auto_missed', 'manual_reschedule'))
);

create index if not exists user_habit_week_reschedule_events_user_week_idx
  on public.user_habit_week_reschedule_events (user_id, week_start_date desc, plan_item_id, created_at);

create index if not exists user_habit_week_reschedule_events_occurrence_idx
  on public.user_habit_week_reschedule_events (occurrence_id, created_at);

alter table public.user_habit_week_reschedule_events enable row level security;

grant all on table public.user_habit_week_reschedule_events to authenticated;

drop policy if exists rls_user_habit_week_reschedule_events_select_own on public.user_habit_week_reschedule_events;
create policy rls_user_habit_week_reschedule_events_select_own
  on public.user_habit_week_reschedule_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_reschedule_events_insert_own on public.user_habit_week_reschedule_events;
create policy rls_user_habit_week_reschedule_events_insert_own
  on public.user_habit_week_reschedule_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_reschedule_events_update_own on public.user_habit_week_reschedule_events;
create policy rls_user_habit_week_reschedule_events_update_own
  on public.user_habit_week_reschedule_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists rls_user_habit_week_reschedule_events_delete_own on public.user_habit_week_reschedule_events;
create policy rls_user_habit_week_reschedule_events_delete_own
  on public.user_habit_week_reschedule_events
  for delete
  to authenticated
  using (auth.uid() = user_id);

insert into public.user_habit_week_reschedule_events (
  user_id,
  cycle_id,
  transformation_id,
  plan_id,
  plan_item_id,
  week_start_date,
  occurrence_id,
  from_day,
  to_day,
  reason,
  created_at
)
select
  occ.user_id,
  occ.cycle_id,
  occ.transformation_id,
  occ.plan_id,
  occ.plan_item_id,
  occ.week_start_date,
  occ.id,
  occ.original_planned_day,
  occ.planned_day,
  case
    when occ.source = 'auto_rescheduled' then 'auto_missed'
    else 'manual_reschedule'
  end,
  coalesce(occ.validated_at, occ.updated_at, occ.created_at, now())
from public.user_habit_week_occurrences as occ
where occ.original_planned_day is not null
  and occ.original_planned_day <> occ.planned_day;
