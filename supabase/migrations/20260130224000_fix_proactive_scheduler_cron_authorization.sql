-- Fix: pg_cron job `trigger-proactive-scheduler` must include `authorization: Bearer <anon_key>`.
--
-- Symptom:
-- - Edge Logs show 401 with "missing auth header" and request metadata includes `authorization: []`.
--
-- Requirements:
-- - public.app_config('edge_functions_base_url') is set for the environment
-- - public.app_config('edge_functions_anon_key') is set (project anon key)
-- - vault secret 'INTERNAL_FUNCTION_SECRET' matches Edge secret value

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
        'https://ybyqxwnwjvuxckolsddn.supabase.co'
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





