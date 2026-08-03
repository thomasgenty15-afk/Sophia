-- KEEL W1.3 — cron side of the latent bugs 3 and 4.
--
-- BUG 3: `schedule-whatsapp-v2-checkins` ran on '5 0 * * *' (00:05 UTC) and
--   provisioned the whole fleet in one pass. At 00:05 UTC the local date in
--   America/New_York is still J-1 and the morning slot is already in the past,
--   so no US user ever received a morning nudge. The function is now
--   idempotent per timezone (see schedule-whatsapp-v2-checkins/timezone_gate.ts):
--   it provisions only the timezones whose local wall clock sits in
--   [00:00, 01:00). The job therefore has to tick EVERY HOUR.
--   Idempotence on a double pass (DST, cron retry, manual replay) is carried
--   by the existing unique index
--   `scheduled_checkins_user_event_time_unique` (user_id, event_context,
--   scheduled_for) — a second pass conflicts instead of duplicating a nudge.
--
-- BUG 4: `seedReminderUntilNextSunday()` only seeds `scheduled_checkins` up to
--   the next Sunday and its only caller was the frontend
--   (RemindersSection.tsx). No cron ever re-seeded, so every recurring
--   reminder went silent the Sunday after creation. A weekly job now calls the
--   internal action `reseed_all` of `classify-recurring-reminder`.
--   Sunday 18:00 UTC: after the last Sunday nudges of the western timezones.
--   NOTE, verified: no weekly UTC tick is Sunday in every timezone (the
--   -11..+14 span is 25 hours) — at 18:00 UTC Sunday it is already Monday
--   from UTC+6 eastwards. The seeding horizon therefore had to be fixed
--   rather than the cron expression: seedReminderUntilNextSunday() now covers
--   through the next Sunday INCLUSIVE (reseed_selection.ts::reseedHorizon),
--   so the coming week is fully covered whatever the local weekday is when
--   this job fires.
--
-- Job commands follow the app_config + vault pattern of
-- 20260615133000_recreate_active_pg_cron_jobs.sql: the base url and anon key
-- come from public.app_config, the internal secret from vault; the post is
-- skipped entirely when any of the three is missing.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in (
      'schedule-whatsapp-v2-checkins',
      'reseed-recurring-reminders'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

create or replace function pg_temp.schedule_internal_edge_job(
  p_jobname text,
  p_schedule text,
  p_function_name text,
  p_body jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  perform cron.schedule(
    p_jobname,
    p_schedule,
    format(
      $command$
      with cfg as (
        select
          coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
          coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
          coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
      )
      select
        net.http_post(
          url := rtrim((select base_url from cfg), '/') || '/functions/v1/' || %L,
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'apikey', (select anon_key from cfg),
            'authorization', 'Bearer ' || (select anon_key from cfg),
            'x-internal-secret', (select internal_secret from cfg)
          ),
          body := %L::jsonb
        ) as request_id
      from cfg
      where (select base_url from cfg) <> ''
        and (select anon_key from cfg) <> ''
        and (select internal_secret from cfg) <> '';
      $command$,
      p_function_name,
      p_body::text
    )
  );
end;
$$;

-- BUG 3: hourly, so every timezone gets its own local-midnight pass.
select pg_temp.schedule_internal_edge_job(
  'schedule-whatsapp-v2-checkins',
  '0 * * * *',
  'schedule-whatsapp-v2-checkins'
);

-- BUG 4: weekly fleet re-seed of the recurring reminders.
--
-- W1.4 R1, scale: one reminder costs one LLM generation, so the pass CANNOT
-- finish the fleet inside one edge invocation. This job only fires the FIRST
-- link: `classify-recurring-reminder` walks a keyset cursor (`after_id`), stops
-- at its wall-clock budget, and re-invokes itself with the cursor through the
-- same internal-secret route until the fleet is exhausted (bounded by
-- RESEED_MAX_CHAIN_DEPTH). Nothing else has to be scheduled for the tail.
-- `batch_size` is stated here rather than left to the default so the cron shows
-- what it actually asks for.
select pg_temp.schedule_internal_edge_job(
  'reseed-recurring-reminders',
  '0 18 * * 0',
  'classify-recurring-reminder',
  '{"action":"reseed_all","batch_size":25}'::jsonb
);

-- Fail loud (R7): a silent no-op here means a fleet with no nudges.
do $$
declare
  whatsapp_schedule text;
  reseed_schedule text;
begin
  select schedule into whatsapp_schedule
  from cron.job where jobname = 'schedule-whatsapp-v2-checkins';
  select schedule into reseed_schedule
  from cron.job where jobname = 'reseed-recurring-reminders';

  if whatsapp_schedule is distinct from '0 * * * *' then
    raise exception
      'W1.3 bug 3: schedule-whatsapp-v2-checkins must tick hourly, got %',
      coalesce(whatsapp_schedule, '<not scheduled>');
  end if;

  if reseed_schedule is distinct from '0 18 * * 0' then
    raise exception
      'W1.3 bug 4: reseed-recurring-reminders must tick Sunday 18:00 UTC, got %',
      coalesce(reseed_schedule, '<not scheduled>');
  end if;
end $$;
