-- Schedule Memory V2 topic compaction.
-- The Edge Function remains gated by memory_v2_topic_compaction_enabled.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  for existing_jobid in
    select jobid
    from cron.job
    where jobname in (
      'memory-v2-topic-compaction-corrections',
      'memory-v2-topic-compaction-nightly'
    )
  loop
    perform cron.unschedule(existing_jobid);
  end loop;
end $$;

select cron.schedule(
  'memory-v2-topic-compaction-corrections',
  '* * * * *',
  $$
  with cfg as (
    select
      coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
      coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/trigger-topic-compaction',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := jsonb_build_object(
        'trigger_type', 'correction',
        'limit', 25
      )
    ) as request_id
  from cfg
  where (select base_url from cfg) <> ''
    and (select anon_key from cfg) <> ''
    and (select internal_secret from cfg) <> '';
  $$
);

select cron.schedule(
  'memory-v2-topic-compaction-nightly',
  '17 3 * * *',
  $$
  with cfg as (
    select
      coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
      coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
      coalesce((select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/trigger-topic-compaction',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := jsonb_build_object(
        'trigger_type', 'scheduled',
        'threshold', 5,
        'limit', 50
      )
    ) as request_id
  from cfg
  where (select base_url from cfg) <> ''
    and (select anon_key from cfg) <> ''
    and (select internal_secret from cfg) <> '';
  $$
);
