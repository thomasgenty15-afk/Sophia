-- Remove the retired Round Table feature from active schema and unlock logic.

do $$
begin
  if to_regclass('public.user_round_table_entries') is not null then
    execute 'drop trigger if exists on_round_table_saved on public.user_round_table_entries';
  end if;
end $$;

drop function if exists public.handle_round_table_trigger();
drop function if exists public.check_post_week_12_unlock();

delete from public.user_week_states
where module_id like 'round_table_%';

delete from public.user_module_state_entries
where module_id like 'round_table_%';

drop table if exists public.user_round_table_entries cascade;

create or replace function public.handle_week12_manual_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.module_id = 'week_12'
     and new.status = 'available'
     and new.available_at <= now()
  then
    insert into public.user_week_states (user_id, module_id, status, available_at)
    values (
      new.user_id,
      'forge_access',
      'available',
      now() + interval '7 days'
    )
    on conflict (user_id, module_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.handle_module_activity_unlock()
returns trigger
language plpgsql
security definer
as $$
declare
  week_num integer;
  current_week_id text;
  next_week_id text;
  current_state_id uuid;
  is_first_update boolean;
  total_questions integer;
  answered_questions integer;
  week_start_date timestamptz;
begin
  week_num := substring(new.module_id from '^a(\d+)')::integer;

  if week_num is not null then
    current_week_id := 'week_' || week_num;
    next_week_id := 'week_' || (week_num + 1);

    select id, first_updated_at is null, first_updated_at
    into current_state_id, is_first_update, week_start_date
    from public.user_week_states
    where user_id = new.user_id and module_id = current_week_id;

    if current_state_id is not null then
      update public.user_week_states
      set updated_at = now()
      where id = current_state_id;

      if is_first_update then
        update public.user_week_states
        set first_updated_at = now()
        where id = current_state_id;

        week_start_date := now();

        if week_num < 12 then
          insert into public.user_week_states (user_id, module_id, status, available_at)
          values (
            new.user_id,
            next_week_id,
            'available',
            now() + interval '7 days'
          )
          on conflict (user_id, module_id) do nothing;
        elsif week_num = 12 then
          insert into public.user_week_states (user_id, module_id, status, available_at)
          values (
            new.user_id,
            'forge_access',
            'available',
            now() + interval '7 days'
          )
          on conflict (user_id, module_id) do nothing;
        end if;
      end if;

      if week_num = 1 then
        total_questions := 4;
      else
        total_questions := 3;
      end if;

      select count(distinct module_id) into answered_questions
      from public.user_module_state_entries
      where user_id = new.user_id
      and module_id like 'a' || week_num || '_c%_m1';

      if answered_questions >= total_questions then
        update public.user_week_states
        set status = 'completed',
            completed_at = now()
        where id = current_state_id
        and status != 'completed';
      end if;
    end if;
  end if;

  return new;
end;
$$;
