-- Repair proactive scheduler cron headers.
--
-- Why:
-- - Production logs show `trigger-weekly-bilan failed (401): Missing authorization header`.
-- - Previous migrations re-scheduled `trigger-proactive-scheduler`, but only unscheduled
--   a single matching job with `limit 1`.
-- - If an older cron row survived, it can keep firing without the required auth headers.
--
-- Goal:
-- - Remove every existing `trigger-proactive-scheduler` cron row.
-- - Recreate exactly one job with `apikey`, `authorization`, and `x-internal-secret`.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  jid int;
begin
  for jid in
    select jobid
    from cron.job
    where jobname = 'trigger-proactive-scheduler'
  loop
    perform cron.unschedule(jid);
  end loop;
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
        (select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1),
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
