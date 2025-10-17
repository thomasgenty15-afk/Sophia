create or replace function public.user_objective_entry_upsert(
  _user_id uuid,
  _user_objective_id uuid,
  _day date,
  _status public.checkin_status,
  _note text,
  _source text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _entry_id uuid;
begin
  if _source not in ('whatsapp_optin', 'manual') then
    raise exception 'invalid objective entry source: %', _source
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.user_objectives uo
    where uo.id = _user_objective_id
      and uo.user_id = _user_id
  ) then
    raise exception 'objective % not owned by user %', _user_objective_id, _user_id
      using errcode = '42501';
  end if;

  insert into public.user_objective_entries as uoe (
    user_objective_id,
    day,
    status,
    note,
    source
  ) values (
    _user_objective_id,
    _day,
    _status,
    _note,
    _source
  )
  on conflict (user_objective_id, day) do update
    set status = excluded.status,
        note = excluded.note,
        source = excluded.source
  returning uoe.id into _entry_id;

  return _entry_id;
end;
$$;

