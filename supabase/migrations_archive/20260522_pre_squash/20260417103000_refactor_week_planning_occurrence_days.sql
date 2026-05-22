alter table public.user_habit_week_occurrences
  add column if not exists default_day text;

update public.user_habit_week_occurrences as occ
set default_day = coalesce(plan.default_days[occ.ordinal], occ.planned_day)
from public.user_habit_week_plans as plan
where plan.user_id = occ.user_id
  and plan.plan_item_id = occ.plan_item_id
  and plan.week_start_date = occ.week_start_date
  and occ.default_day is null;

update public.user_habit_week_occurrences
set default_day = planned_day
where default_day is null;

alter table public.user_habit_week_occurrences
  alter column default_day set not null;

alter table public.user_habit_week_occurrences
  drop constraint if exists user_habit_week_occurrences_default_day_check;

alter table public.user_habit_week_occurrences
  add constraint user_habit_week_occurrences_default_day_check
  check (default_day = any(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]));

alter table public.user_habit_week_plans
  drop constraint if exists user_habit_week_plans_default_days_check;

alter table public.user_habit_week_plans
  drop constraint if exists user_habit_week_plans_planned_days_check;

alter table public.user_habit_week_plans
  drop column if exists default_days;

alter table public.user_habit_week_plans
  drop column if exists planned_days;
