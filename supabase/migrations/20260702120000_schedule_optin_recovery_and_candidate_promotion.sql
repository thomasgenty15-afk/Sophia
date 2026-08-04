-- Activate two dormant internal edge jobs by scheduling them in pg_cron:
--   * process-whatsapp-optin-recovery : daily recovery email to users who never
--     completed WhatsApp opt-in past the grace window.
--   * promote-candidate-memory-items  : daily promotion/archival of memory_items
--     stuck in `candidate` status (>= 7 days), per the deterministic write/promotion policy.
--
-- Uses the same internal-secret invocation pattern as
-- 20260615133000_recreate_active_pg_cron_jobs.sql. The pg_temp helper is
-- session-scoped, so it must be re-declared here.

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

-- Idempotency: drop any prior scheduling of these jobs before re-creating.
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'process-whatsapp-optin-recovery',
    'promote-candidate-memory-items'
  );
end $$;

-- Daily at 10:00 UTC: send opt-in recovery emails (mirrors retention-emails cadence).
select pg_temp.schedule_internal_edge_job(
  'process-whatsapp-optin-recovery',
  '0 10 * * *',
  'process-whatsapp-optin-recovery'
);

-- Daily at 03:40 UTC: promote/archive candidate memory items (after nightly
-- memorizer 00:00 and topic-compaction 03:17 have run).
select pg_temp.schedule_internal_edge_job(
  'promote-candidate-memory-items',
  '40 3 * * *',
  'promote-candidate-memory-items'
);
