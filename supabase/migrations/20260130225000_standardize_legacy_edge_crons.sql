-- Standardize legacy Edge crons (pg_cron + pg_net) to always send:
-- - apikey
-- - authorization: Bearer <anon_key>
-- - x-internal-secret
--
-- Context:
-- - We saw 401s when `authorization` is missing (Kong "missing auth header").
-- - Some legacy cron jobs may still exist in a given environment (Dashboard-created or old migrations).
--
-- Important:
-- - `trigger-daily-bilan` and `trigger-memory-echo` were replaced by `trigger-proactive-scheduler`
--   (see 20260113202000_schedule_proactive_scheduler_cron.sql). If they still exist, we UNSCHEDULE them
--   to avoid double-sends.
-- - `detect-future-events` and `process-checkins` may be desired depending on your deployment; if they
--   exist, we reschedule them with correct headers.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

-- Helper: unschedule by jobname if exists
do $$
declare
  jid int;
begin
  for jid in
    select jobid
    from cron.job
    where jobname in ('trigger-daily-bilan', 'trigger-memory-echo', 'detect-future-events', 'process-checkins')
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

-- Do NOT re-create these (they are replaced by trigger-proactive-scheduler).
-- - trigger-daily-bilan
-- - trigger-memory-echo

-- Re-create detect-future-events (daily 04:00) with correct headers
select cron.schedule(
  'detect-future-events',
  '0 4 * * *',
  $$
  with cfg as (
    select
      coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), 'https://ybyqxwnwjvuxckolsddn.supabase.co') as base_url,
      coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/detect-future-events',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := '{}'::jsonb
    ) as request_id
  from cfg
  where (select anon_key from cfg) <> '' and (select internal_secret from cfg) <> '';
  $$
);

-- Re-create process-checkins (daily 21:00) with correct headers
select cron.schedule(
  'process-checkins',
  '0 21 * * *',
  $$
  with cfg as (
    select
      coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), 'https://ybyqxwnwjvuxckolsddn.supabase.co') as base_url,
      coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/process-checkins',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := '{}'::jsonb
    ) as request_id
  from cfg
  where (select anon_key from cfg) <> '' and (select internal_secret from cfg) <> '';
  $$
);


