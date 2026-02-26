-- Add explicit provenance for scheduled check-ins.
-- This separates watcher-generated check-ins from initiative-generated ones.

alter table public.scheduled_checkins
  add column if not exists origin text;

-- Backfill existing rows with best-effort heuristics.
update public.scheduled_checkins
set origin = case
  when event_context like 'recurring_reminder:%' then 'initiative'
  when event_context = 'daily_bilan_reschedule' then 'initiative'
  when coalesce(message_payload->>'source', '') in ('trigger-watcher-batch', 'detect-future-events') then 'watcher'
  when coalesce(message_payload->>'source', '') like 'recurring_reminder%' then 'initiative'
  else 'unknown'
end
where origin is null or btrim(origin) = '';

alter table public.scheduled_checkins
  alter column origin set default 'unknown';

update public.scheduled_checkins
set origin = 'unknown'
where origin is null or btrim(origin) = '';

alter table public.scheduled_checkins
  alter column origin set not null;

alter table public.scheduled_checkins
  drop constraint if exists scheduled_checkins_origin_check;

alter table public.scheduled_checkins
  add constraint scheduled_checkins_origin_check
  check (origin in ('watcher', 'initiative', 'unknown'));
