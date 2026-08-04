-- Recreate active pg_cron jobs after the schema squash.
--
-- The squashed schema keeps the pg_cron extension and application schema, but
-- not the runtime rows in cron.job. This migration restores the active jobs and
-- leaves legacy V1 jobs unscheduled.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in (
      -- Active jobs recreated below.
      'process-checkins',
      'schedule-whatsapp-v2-checkins',
      'process-whatsapp-outbound-retries',
      'process-llm-retry-jobs',
      'trigger-level-review-transitions-v1',
      'trigger-watcher-batch',
      'trigger-synthesizer-batch',
      'trigger-memorizer-daily',
      'memory-v2-topic-compaction-corrections',
      'memory-v2-topic-compaction-nightly',
      'trigger-retention-emails',
      'recompute-time-based-access-tiers',
      'cleanup-architect-draft-scopes',
      'cleanup-turn-summary-event-stream',

      -- Stale/legacy jobs that must not survive in a V2 environment.
      'schedule-morning-active-action-checkins',
      'refresh-morning-active-action-checkins',
      'refresh-morning-active-action-checkins-weekly',
      'trigger-proactive-scheduler',
      'trigger-daily-bilan',
      'trigger-weekly-bilan',
      'trigger-memory-echo',
      'schedule-recurring-checkins',
      'process-user-scheduling-refresh-jobs',
      'detect-future-events',
      'trigger-global-memory-compaction',
      'expire-user-profile-fact-candidates',
      'cleanup-turn-summary-logs'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

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

-- WhatsApp scheduling and delivery.
select pg_temp.schedule_internal_edge_job(
  'schedule-whatsapp-v2-checkins',
  '5 0 * * *',
  'schedule-whatsapp-v2-checkins'
);

select pg_temp.schedule_internal_edge_job(
  'process-checkins',
  '*/3 * * * *',
  'process-checkins'
);

select pg_temp.schedule_internal_edge_job(
  'process-whatsapp-outbound-retries',
  '* * * * *',
  'process-whatsapp-outbound-retries',
  '{"limit":20}'::jsonb
);

select pg_temp.schedule_internal_edge_job(
  'process-llm-retry-jobs',
  '*/2 * * * *',
  'process-llm-retry-jobs',
  '{"limit":20}'::jsonb
);

-- Product lifecycle jobs.
select pg_temp.schedule_internal_edge_job(
  'trigger-level-review-transitions-v1',
  '15 0 * * *',
  'trigger-level-review-transitions-v1'
);

select cron.schedule(
  'recompute-time-based-access-tiers',
  '15 3 * * *',
  $$select public.recompute_time_based_access_tiers();$$
);

-- Memory/runtime jobs.
select pg_temp.schedule_internal_edge_job(
  'trigger-watcher-batch',
  '0 */4 * * *',
  'trigger-watcher-batch'
);

select pg_temp.schedule_internal_edge_job(
  'trigger-synthesizer-batch',
  '*/10 * * * *',
  'trigger-synthesizer-batch'
);

select pg_temp.schedule_internal_edge_job(
  'trigger-memorizer-daily',
  '0 0 * * *',
  'trigger-memorizer-daily'
);

select pg_temp.schedule_internal_edge_job(
  'memory-v2-topic-compaction-corrections',
  '* * * * *',
  'trigger-topic-compaction',
  '{"trigger_type":"correction","limit":25}'::jsonb
);

select pg_temp.schedule_internal_edge_job(
  'memory-v2-topic-compaction-nightly',
  '17 3 * * *',
  'trigger-topic-compaction',
  '{"trigger_type":"scheduled","threshold":5,"limit":50}'::jsonb
);

-- Commercial lifecycle.
select pg_temp.schedule_internal_edge_job(
  'trigger-retention-emails',
  '0 9 * * *',
  'trigger-retention-emails'
);

-- Maintenance.
select cron.schedule(
  'cleanup-architect-draft-scopes',
  '25 3 * * *',
  $$select public.cleanup_expired_architect_draft_scopes();$$
);

select cron.schedule(
  'cleanup-turn-summary-event-stream',
  '15 3 * * *',
  $$delete from public.conversation_eval_events
    where eval_run_id is null
      and source = 'turn_summary'
      and created_at < now() - interval '30 days';$$
);
