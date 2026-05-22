-- User-created recurring and one-shot reminders must keep the exact local time
-- confirmed by the user. The generic 1h anti-spam spacing can still protect
-- system nudges, but it must not silently move explicit reminders shown in
-- Initiatives.

create or replace function public.scheduled_checkins_enforce_min_gap_1h()
returns trigger
language plpgsql
as $$
declare
  conflicting_scheduled_for timestamptz;
  attempts int := 0;
begin
  -- Explicit user reminders are commitments. Do not rewrite the time after
  -- Sophia confirmed it.
  if new.recurring_reminder_id is not null
    or new.event_context like 'recurring_reminder:%'
    or new.event_context like 'one_shot_reminder:%'
    or new.message_payload->>'reminder_kind' = 'one_shot' then
    return new;
  end if;

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
