-- Schedule `trigger-watcher-batch` to run every 10 minutes.
--
-- Goal:
-- - Run the Watcher (context/memory analysis) on a time interval instead of
--   message-count threshold. This ensures insights, short_term_context and
--   profile candidates are always fresh regardless of conversation volume.
--
-- The Edge Function scans user_chat_states for rows with
-- unprocessed_msg_count > 0 and last_processed_at older than 10 minutes,
-- then calls runWatcher for each eligible user/scope pair.
--
-- Security:
-- - Always include `apikey` + `authorization` for Kong, and `x-internal-secret`
--   for ensureInternalRequest().
--
-- Requirements (set per environment):
-- - public.app_config('edge_functions_base_url')
-- - public.app_config('edge_functions_anon_key')
-- - vault secret 'INTERNAL_FUNCTION_SECRET' matches Edge secret

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid from cron.job where jobname = 'trigger-watcher-batch' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'trigger-watcher-batch',
  '*/10 * * * *',
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
      url := (select base_url from cfg) || '/functions/v1/trigger-watcher-batch',
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

