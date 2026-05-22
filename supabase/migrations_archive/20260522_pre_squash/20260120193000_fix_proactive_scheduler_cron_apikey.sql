-- Fix: pg_cron job trigger-proactive-scheduler must include `apikey` header for Kong.
-- Without it, local/prod can spam 401s (pg_net/0.19.5) which adds noise and load during evals.
--
-- This migration re-schedules the job with:
-- - apikey from public.app_config (edge_functions_anon_key)
-- - X-Internal-Secret from vault.decrypted_secrets (INTERNAL_FUNCTION_SECRET)

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
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
    select
      coalesce(
        (select value from public.app_config where key = 'edge_functions_base_url' limit 1),
        'https://iabxchanerdkczbxyjgg.supabase.co'
      ) as base_url,
      coalesce(
        (select value from public.app_config where key = 'edge_functions_anon_key' limit 1),
        ''
      ) as anon_key,
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1),
        ''
      ) as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/trigger-proactive-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select anon_key from cfg),
        'X-Internal-Secret', (select internal_secret from cfg)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);


