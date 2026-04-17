-- Watcher now handles future-event detection every 10 minutes.
-- Unschedule legacy detect-future-events cron to avoid duplicate scheduling.

create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid from cron.job where jobname = 'detect-future-events' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

