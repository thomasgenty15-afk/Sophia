alter table public.user_habit_week_plans
  drop constraint if exists user_habit_week_plans_status_check;

alter table public.user_habit_week_plans
  add constraint user_habit_week_plans_status_check
  check (
    status = any (
      array[
        'pending_confirmation'::text,
        'confirmed'::text,
        'auto_applied'::text,
        'archived'::text
      ]
    )
  );

create or replace function public.archive_pending_week_plans_when_parent_plan_archived()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'archived'
    and old.status is distinct from 'archived'
  then
    update public.user_habit_week_plans
    set
      status = 'archived',
      updated_at = coalesce(new.archived_at, new.updated_at, now())
    where plan_id = new.id
      and status = 'pending_confirmation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_archive_pending_week_plans_on_plan_archive
  on public.user_plans_v2;

create trigger trg_archive_pending_week_plans_on_plan_archive
after update of status on public.user_plans_v2
for each row
execute function public.archive_pending_week_plans_when_parent_plan_archived();

update public.user_habit_week_plans week_plan
set
  status = 'archived',
  updated_at = coalesce(parent_plan.archived_at, parent_plan.updated_at, now())
from public.user_plans_v2 parent_plan
where week_plan.plan_id = parent_plan.id
  and week_plan.status = 'pending_confirmation'
  and parent_plan.status = 'archived';
