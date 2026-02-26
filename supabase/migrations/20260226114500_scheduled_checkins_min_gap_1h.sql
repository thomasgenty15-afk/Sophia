-- Enforce a hard minimum spacing of 1 hour between check-ins for the same user.
-- Applied at DB write time (insert/update), regardless of origin.

create or replace function public.scheduled_checkins_enforce_min_gap_1h()
returns trigger
language plpgsql
as $$
declare
  conflicting_scheduled_for timestamptz;
  attempts int := 0;
begin
  -- Only enforce on active/sent checkins.
  if new.status::text not in ('pending', 'awaiting_user', 'sent') then
    return new;
  end if;

  -- Ensure deterministic convergence in pathological cases.
  while attempts < 48 loop
    select max(sc.scheduled_for)
      into conflicting_scheduled_for
    from public.scheduled_checkins sc
    where sc.user_id = new.user_id
      and sc.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and sc.status::text in ('pending', 'awaiting_user', 'sent')
      and abs(extract(epoch from (sc.scheduled_for - new.scheduled_for))) < 3600;

    exit when conflicting_scheduled_for is null;

    -- Move after the latest conflicting checkin to guarantee >= 1h spacing.
    new.scheduled_for := conflicting_scheduled_for + interval '1 hour';
    attempts := attempts + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_scheduled_checkins_enforce_min_gap_1h on public.scheduled_checkins;

create trigger trg_scheduled_checkins_enforce_min_gap_1h
before insert or update of user_id, scheduled_for, status
on public.scheduled_checkins
for each row
execute function public.scheduled_checkins_enforce_min_gap_1h();
