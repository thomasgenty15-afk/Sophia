-- Remove legacy candidate staging table and its cleanup cron.

do $$
declare
  existing_jobid bigint;
begin
  select jobid
    into existing_jobid
  from cron.job
  where jobname = 'expire-user-profile-fact-candidates'
  limit 1;

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

drop table if exists public.user_profile_fact_candidates cascade;

