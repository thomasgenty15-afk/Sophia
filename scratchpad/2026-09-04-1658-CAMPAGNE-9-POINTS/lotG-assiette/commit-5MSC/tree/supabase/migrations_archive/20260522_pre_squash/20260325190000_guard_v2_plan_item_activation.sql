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
         and coalesce(dep_row.current_habit_state, '') <> 'in_maintenance' then
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

drop trigger if exists guard_v2_plan_item_activation on public.user_plan_items;
create trigger guard_v2_plan_item_activation
before update on public.user_plan_items
for each row
execute function public.guard_v2_plan_item_activation();
