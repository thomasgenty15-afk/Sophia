-- Schedule timezone-aware proactive jobs runner (daily bilan + memory echo).
-- Replaces old fixed-time crons (trigger-daily-bilan / trigger-memory-echo) if present.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  -- Unschedule legacy jobs if they exist (safe no-op if not present).
  select jobid into existing_jobid from cron.job where jobname = 'trigger-daily-bilan' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  select jobid into existing_jobid from cron.job where jobname = 'trigger-memory-echo' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  -- Replace scheduler job if it exists.
  select jobid into existing_jobid from cron.job where jobname = 'trigger-proactive-scheduler' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'trigger-proactive-scheduler',
  '*/30 * * * *',
  $$
  with cfg as (
    select coalesce(
      (select value from public.app_config where key = 'edge_functions_base_url' limit 1),
      'https://iabxchanerdkczbxyjgg.supabase.co'
    ) as base_url
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/trigger-proactive-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);


