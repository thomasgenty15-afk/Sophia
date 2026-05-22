create or replace function public.unlock_transformation_principle(
  p_user_id uuid,
  p_transformation_id uuid,
  p_principle text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_transformation_id is null then
    return;
  end if;

  if p_principle not in ('kaizen', 'ikigai', 'hara_hachi_bu', 'wabi_sabi', 'gambaru') then
    return;
  end if;

  update public.user_transformations
  set unlocked_principles =
        coalesce(unlocked_principles, '{"kaizen": true}'::jsonb) ||
        jsonb_build_object(p_principle, true),
      updated_at = now()
  where id = p_transformation_id
    and exists (
      select 1 from public.user_cycles c
      where c.id = user_transformations.cycle_id
        and c.user_id = p_user_id
    )
    and coalesce((unlocked_principles ->> p_principle)::boolean, false) is distinct from true;
end;
$$;

create or replace function public.handle_v2_principle_unlock_from_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entry_kind in ('skip', 'blocker') then
    perform public.unlock_transformation_principle(
      new.user_id,
      new.transformation_id,
      'wabi_sabi'
    );
  end if;

  return new;
end;
$$;

create or replace function public.handle_v2_principle_unlock_from_item_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    coalesce(old.status::text, '') <> 'in_maintenance' and new.status = 'in_maintenance'
  ) or (
    coalesce(old.current_habit_state::text, '') <> 'in_maintenance' and new.current_habit_state = 'in_maintenance'
  ) then
    perform public.unlock_transformation_principle(
      new.user_id,
      new.transformation_id,
      'hara_hachi_bu'
    );
  end if;

  if (
    coalesce(old.status::text, '') <> 'stalled' and new.status = 'stalled'
  ) or (
    coalesce(old.current_habit_state::text, '') <> 'stalled' and new.current_habit_state = 'stalled'
  ) then
    perform public.unlock_transformation_principle(
      new.user_id,
      new.transformation_id,
      'gambaru'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists unlock_v2_principles_from_entry on public.user_plan_item_entries;
create trigger unlock_v2_principles_from_entry
after insert on public.user_plan_item_entries
for each row
execute function public.handle_v2_principle_unlock_from_entry();

drop trigger if exists unlock_v2_principles_from_item_transition on public.user_plan_items;
create trigger unlock_v2_principles_from_item_transition
after update on public.user_plan_items
for each row
execute function public.handle_v2_principle_unlock_from_item_transition();
