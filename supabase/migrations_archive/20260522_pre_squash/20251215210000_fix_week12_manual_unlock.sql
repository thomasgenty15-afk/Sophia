-- Ensure week_12 manual availability creates forge_access and round_table_1
-- Why: current unlock logic for week 12 is driven by activity on user_module_state_entries
-- (trigger: on_module_activity_unlock). If someone sets week_12 manually in user_week_states,
-- that trigger won't fire, so the dependent states won't be created.

create or replace function public.handle_week12_manual_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  days_until_sunday int;
begin
  -- Only react to week_12 becoming available "now"
  if new.module_id = 'week_12'
     and new.status = 'available'
     and new.available_at <= now()
  then
    -- 1) Unlock ROUND TABLE 1 (next Sunday at 09:00)
    days_until_sunday := 7 - extract(dow from now())::int;
    if days_until_sunday = 0 then
      days_until_sunday := 7;
    end if;

    insert into public.user_week_states (user_id, module_id, status, available_at)
    values (
      new.user_id,
      'round_table_1',
      'available',
      current_date + (days_until_sunday || ' days')::interval + time '09:00:00'
    )
    on conflict (user_id, module_id) do nothing;

    -- 2) Unlock FORGE ACCESS (7 days after start of week 12)
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

drop trigger if exists on_week12_manual_unlock on public.user_week_states;

create trigger on_week12_manual_unlock
after insert or update on public.user_week_states
for each row
when (
  new.module_id = 'week_12'
  and new.status = 'available'
  and new.available_at <= now()
)
execute function public.handle_week12_manual_unlock();


