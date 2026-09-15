-- Run level review transitions hourly so auto-generation can happen close to
-- the user's local level deadline instead of waiting for the next UTC daily run.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname = 'trigger-level-review-transitions-v1'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'trigger-level-review-transitions-v1',
  '0 * * * *',
  $command$
  with cfg as (
    select
      coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
      coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
      coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
  )
  select
    net.http_post(
      url := rtrim((select base_url from cfg), '/') || '/functions/v1/trigger-level-review-transitions-v1',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := '{}'::jsonb
    ) as request_id
  from cfg
  where (select base_url from cfg) <> ''
    and (select anon_key from cfg) <> ''
    and (select internal_secret from cfg) <> '';
  $command$
);
