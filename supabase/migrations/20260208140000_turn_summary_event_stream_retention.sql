-- Turn summary event stream retention (30 days)
--
-- We persist per-turn structured summaries into `conversation_eval_events` via the
-- security-definer RPC `public.log_conversation_event()` with:
--   source = 'turn_summary'
--   event  = 'turn_summary'
--   eval_run_id = NULL
--
-- This migration:
-- - adds a partial index to speed up retention cleanup
-- - schedules a daily pg_cron job to delete old non-eval turn summaries after 30 days

create extension if not exists "pg_cron" with schema "extensions";

-- Speed up TTL deletes for non-eval turn summaries
create index if not exists conversation_eval_events_turn_summary_ttl_idx
  on public.conversation_eval_events (created_at desc)
  where eval_run_id is null and source = 'turn_summary';

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid from cron.job where jobname = 'cleanup-turn-summary-event-stream' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- Daily at 03:15: delete non-eval turn summary events older than 30 days
select cron.schedule(
  'cleanup-turn-summary-event-stream',
  '15 3 * * *',
  $$delete from public.conversation_eval_events
    where eval_run_id is null
      and source = 'turn_summary'
      and created_at < now() - interval '30 days';$$
);


