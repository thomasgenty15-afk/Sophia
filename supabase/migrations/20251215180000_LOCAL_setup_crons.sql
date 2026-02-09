-- LOCAL ONLY: pg_cron schedules for local development (ignored by git via *LOCAL*.sql).
--
-- Schedules:
-- - detect-future-events: every day at 04:00
-- - process-checkins: every 3 minutes
-- - trigger-watcher-batch: every 10 minutes
-- - trigger-daily-bilan: every day at 21:01
-- - trigger-memory-echo: every other Sunday at 10:00 (based on week number parity)
--
-- Security:
-- - Uses Vault at runtime to fetch INTERNAL_FUNCTION_SECRET and sends it in X-Internal-Secret header.
-- - No secret value is stored in this file.

create extension if not exists "pg_cron" with schema "extensions";
create extension if not exists "pg_net" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  -- Helper: unschedule by name if exists
  select jobid into existing_jobid from cron.job where jobname = 'detect-future-events' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  select jobid into existing_jobid from cron.job where jobname = 'process-checkins' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  select jobid into existing_jobid from cron.job where jobname = 'trigger-memory-echo' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  select jobid into existing_jobid from cron.job where jobname = 'trigger-daily-bilan' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  select jobid into existing_jobid from cron.job where jobname = 'trigger-watcher-batch' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- Local Edge Functions URL (from inside Postgres container)
-- Note: host.docker.internal works on Mac/Windows; if you run on Linux you may need to adjust.

-- 1) Detect future events: daily 04:00
select cron.schedule(
  'detect-future-events',
  '0 4 * * *',
  $$
  select
    net.http_post(
      url := 'http://host.docker.internal:54321/functions/v1/detect-future-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- 2) Process checkins: every 3 minutes
select cron.schedule(
  'process-checkins',
  '*/3 * * * *',
  $$
  select
    net.http_post(
      url := 'http://host.docker.internal:54321/functions/v1/process-checkins',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- 3) Memory echo: every other Sunday 10:00
-- We schedule every Sunday 10:00, but only execute on even ISO week numbers.
select cron.schedule(
  'trigger-memory-echo',
  '0 10 * * 0',
  $$
  select
    case
      when (extract(week from now())::int % 2) = 0 then
        net.http_post(
          url := 'http://host.docker.internal:54321/functions/v1/trigger-memory-echo',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
          ),
          body := '{}'::jsonb
        )
      else
        null
    end as request_id;
  $$
);

-- 4) Daily bilan: every day 21:01
select cron.schedule(
  'trigger-daily-bilan',
  '1 21 * * *',
  $$
  select
    net.http_post(
      url := 'http://host.docker.internal:54321/functions/v1/trigger-daily-bilan',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- 5) Watcher batch: every 10 minutes
-- Runs the Veilleur (context/memory analysis) for users with unprocessed messages.
select cron.schedule(
  'trigger-watcher-batch',
  '*/10 * * * *',
  $$
  select
    net.http_post(
      url := 'http://host.docker.internal:54321/functions/v1/trigger-watcher-batch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);


