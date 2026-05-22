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

create or replace function public.guard_v2_plan_item_activation()
returns trigger
language plpgsql
as $$
declare
  cond jsonb;
  cond_type text;
  dep_ids uuid[];
  dep_id uuid;
  dep_row public.user_plan_items%rowtype;
  required_count int;
  positive_count int;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if old.status <> 'pending' or new.status <> 'active' then
    return new;
  end if;

  cond := coalesce(new.activation_condition, old.activation_condition);
  cond_type := coalesce(cond->>'type', '');

  if cond is null or cond_type = '' or cond_type = 'immediate' then
    return new;
  end if;

  dep_ids := array[]::uuid[];
  if jsonb_typeof(cond->'depends_on') = 'string' then
    dep_ids := array[(cond->>'depends_on')::uuid];
  elsif jsonb_typeof(cond->'depends_on') = 'array' then
    select coalesce(array_agg(value::uuid), array[]::uuid[])
      into dep_ids
    from jsonb_array_elements_text(cond->'depends_on');
  end if;

  if cond_type in ('after_item_completion', 'after_milestone') then
    if coalesce(array_length(dep_ids, 1), 0) = 0 then
      raise exception 'V2 activation blocked: missing prerequisite items'
        using errcode = 'P0001';
    end if;

    foreach dep_id in array dep_ids loop
      select *
        into dep_row
      from public.user_plan_items
      where id = dep_id
        and plan_id = new.plan_id
        and user_id = new.user_id;

      if not found then
        raise exception 'V2 activation blocked: prerequisite item % not found', dep_id
          using errcode = 'P0001';
      end if;

      if dep_row.status <> 'completed'
         and dep_row.status <> 'in_maintenance'
         and coalesce(dep_row.current_habit_state::text, '') <> 'in_maintenance' then
        raise exception 'V2 activation blocked: prerequisite item % not complete', dep_id
          using errcode = 'P0001';
      end if;
    end loop;

    return new;
  end if;

  if cond_type = 'after_habit_traction' then
    if coalesce(array_length(dep_ids, 1), 0) = 0 then
      raise exception 'V2 activation blocked: missing habit dependency'
        using errcode = 'P0001';
    end if;

    dep_id := dep_ids[1];
    select *
      into dep_row
    from public.user_plan_items
    where id = dep_id
      and plan_id = new.plan_id
      and user_id = new.user_id;

    if not found then
      raise exception 'V2 activation blocked: habit dependency % not found', dep_id
        using errcode = 'P0001';
    end if;

    required_count := greatest(coalesce((cond->>'min_completions')::int, 3), 1);

    select count(*)
      into positive_count
    from public.user_plan_item_entries
    where plan_item_id = dep_id
      and entry_kind in ('checkin', 'progress', 'partial');

    if greatest(coalesce(dep_row.current_reps, 0), coalesce(positive_count, 0)) < required_count then
      raise exception 'V2 activation blocked: habit traction not reached for %', dep_id
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  raise exception 'V2 activation blocked: unsupported activation_condition type %', cond_type
    using errcode = 'P0001';
end;
$$;

update public.user_plan_items
set
  dimension = 'clarifications',
  support_mode = null,
  support_function = null,
  updated_at = now()
where dimension = 'support';
