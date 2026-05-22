-- Refresh morning active-action nudges when action editing changes
-- motivational or scheduling-relevant metadata, not only title/day fields.

create or replace function public.handle_morning_active_action_checkins_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  should_refresh boolean := false;
  old_active boolean := false;
  new_active boolean := false;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
  else
    target_user_id := new.user_id;
  end if;

  if tg_table_name in ('user_actions', 'user_personal_actions', 'user_framework_tracking', 'user_vital_signs') then
    if tg_table_name = 'user_vital_signs' then
      old_active := tg_op <> 'INSERT' and coalesce(old.status, '') in ('active', 'monitoring');
      new_active := tg_op <> 'DELETE' and coalesce(new.status, '') in ('active', 'monitoring');
    else
      old_active := tg_op <> 'INSERT' and coalesce(old.status, '') = 'active';
      new_active := tg_op <> 'DELETE' and coalesce(new.status, '') = 'active';
    end if;

    if tg_op = 'INSERT' then
      should_refresh := new_active;
    elsif tg_op = 'DELETE' then
      should_refresh := old_active;
    else
      should_refresh := old_active <> new_active;

      if tg_table_name = 'user_framework_tracking' then
        should_refresh := should_refresh
          or (
            (old_active or new_active)
            and (
              coalesce(old.title, '') is distinct from coalesce(new.title, '')
              or coalesce(old.plan_id::text, '') is distinct from coalesce(new.plan_id::text, '')
            )
          );
      elsif tg_table_name = 'user_vital_signs' then
        should_refresh := should_refresh
          or (
            (old_active or new_active)
            and (
              coalesce(old.label, '') is distinct from coalesce(new.label, '')
              or coalesce(old.current_value, '') is distinct from coalesce(new.current_value, '')
              or coalesce(old.target_value, '') is distinct from coalesce(new.target_value, '')
              or coalesce(old.unit, '') is distinct from coalesce(new.unit, '')
              or coalesce(old.time_of_day, '') is distinct from coalesce(new.time_of_day, '')
              or coalesce(old.plan_id::text, '') is distinct from coalesce(new.plan_id::text, '')
            )
          );
      else
        should_refresh := should_refresh
          or (
            (old_active or new_active)
            and (
              coalesce(old.title, '') is distinct from coalesce(new.title, '')
              or coalesce(old.description, '') is distinct from coalesce(new.description, '')
              or coalesce(old.time_of_day, '') is distinct from coalesce(new.time_of_day, '')
              or coalesce(old.target_reps, 0) is distinct from coalesce(new.target_reps, 0)
              or coalesce(array_to_string(old.scheduled_days, ','), '') is distinct from coalesce(array_to_string(new.scheduled_days, ','), '')
            )
          );
        if tg_table_name = 'user_actions' then
          should_refresh := should_refresh
            or (
              (old_active or new_active)
              and coalesce(old.plan_id::text, '') is distinct from coalesce(new.plan_id::text, '')
            );
        elsif tg_table_name = 'user_personal_actions' then
          should_refresh := should_refresh
            or (
              (old_active or new_active)
              and (
                coalesce(old.quest_type, '') is distinct from coalesce(new.quest_type, '')
                or coalesce(old.rationale, '') is distinct from coalesce(new.rationale, '')
                or coalesce(old.tips, '') is distinct from coalesce(new.tips, '')
              )
            );
        end if;
      end if;
    end if;
  elsif tg_table_name = 'user_plans' then
    if tg_op = 'INSERT' then
      should_refresh := coalesce(new.status, '') in ('active', 'in_progress', 'pending');
    elsif tg_op = 'UPDATE' then
      should_refresh :=
        coalesce(new.status, '') in ('active', 'in_progress', 'pending')
        and (
          coalesce(old.deep_why, '') is distinct from coalesce(new.deep_why, '')
          or coalesce(old.inputs_why, '') is distinct from coalesce(new.inputs_why, '')
          or coalesce(old.inputs_blockers, '') is distinct from coalesce(new.inputs_blockers, '')
          or coalesce(old.inputs_low_motivation_message, '') is distinct from coalesce(new.inputs_low_motivation_message, '')
        );
    end if;
  end if;

  if should_refresh then
    perform public.request_morning_active_action_checkins_refresh(target_user_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_refresh_morning_active_action_checkins_user_vital_signs on public.user_vital_signs;
create trigger trg_refresh_morning_active_action_checkins_user_vital_signs
after insert or update or delete on public.user_vital_signs
for each row
execute function public.handle_morning_active_action_checkins_refresh();
