-- Invalidate and regenerate future morning active-action nudges
-- whenever the active action set or its motivational context changes.

create extension if not exists "pg_net" with schema "extensions";

create or replace function public.request_morning_active_action_checkins_refresh(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
begin
  if p_user_id is null then
    return;
  end if;

  delete from public.scheduled_checkins
  where user_id = p_user_id
    and event_context = 'morning_active_actions_nudge'
    and status in ('pending', 'awaiting_user')
    and scheduled_for >= now();

  select value into base_url
  from public.app_config
  where key = 'edge_functions_base_url'
  limit 1;

  select value into anon_key
  from public.app_config
  where key = 'edge_functions_anon_key'
  limit 1;

  select decrypted_secret into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if coalesce(base_url, '') = '' or coalesce(anon_key, '') = '' or coalesce(internal_secret, '') = '' then
    raise notice '[request_morning_active_action_checkins_refresh] missing edge config; skipped async refresh for user %', p_user_id;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/schedule-morning-active-action-checkins',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'full_reset', true
    )
  );
end;
$$;

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

  if tg_table_name in ('user_actions', 'user_personal_actions') then
    old_active := tg_op <> 'INSERT' and coalesce(old.status, '') = 'active';
    new_active := tg_op <> 'DELETE' and coalesce(new.status, '') = 'active';

    if tg_op = 'INSERT' then
      should_refresh := new_active;
    elsif tg_op = 'DELETE' then
      should_refresh := old_active;
    else
      should_refresh :=
        old_active <> new_active
        or (
          (old_active or new_active)
          and (
            coalesce(old.title, '') is distinct from coalesce(new.title, '')
            or coalesce(old.time_of_day, '') is distinct from coalesce(new.time_of_day, '')
            or coalesce(array_to_string(old.scheduled_days, ','), '') is distinct from coalesce(array_to_string(new.scheduled_days, ','), '')
          )
        );
      if tg_table_name = 'user_actions' then
        should_refresh := should_refresh
          or (
            (old_active or new_active)
            and coalesce(old.plan_id::text, '') is distinct from coalesce(new.plan_id::text, '')
          );
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

drop trigger if exists trg_refresh_morning_active_action_checkins_user_actions on public.user_actions;
create trigger trg_refresh_morning_active_action_checkins_user_actions
after insert or update or delete on public.user_actions
for each row
execute function public.handle_morning_active_action_checkins_refresh();

drop trigger if exists trg_refresh_morning_active_action_checkins_user_personal_actions on public.user_personal_actions;
create trigger trg_refresh_morning_active_action_checkins_user_personal_actions
after insert or update or delete on public.user_personal_actions
for each row
execute function public.handle_morning_active_action_checkins_refresh();

drop trigger if exists trg_refresh_morning_active_action_checkins_user_plans on public.user_plans;
create trigger trg_refresh_morning_active_action_checkins_user_plans
after insert or update on public.user_plans
for each row
execute function public.handle_morning_active_action_checkins_refresh();
