-- Cleanup legacy user_profile_facts model and ensure dashboard is the single
-- source of truth for coach preferences.

-- 1) Stop and remove legacy candidate-expiry cron/function (table already dropped).
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'expire-user-profile-fact-candidates'
  limit 1;

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

drop function if exists public.expire_user_profile_fact_candidates();

-- 2) Remove legacy watcher-era facts (old schema keys).
delete from public.user_profile_facts
where key in (
  'schedule.work_schedule',
  'schedule.energy_peaks',
  'schedule.wake_time',
  'schedule.sleep_time',
  'personal.job',
  'personal.hobbies',
  'personal.family',
  'conversation.tone',
  'conversation.use_emojis',
  'conversation.verbosity'
);

-- 3) Remove deprecated preference key no longer used by dashboard.
delete from public.user_profile_facts
where key = 'coach.reminder_style';

-- 4) Keep audit stream clean for removed keys as well.
delete from public.user_profile_fact_events
where key in (
  'schedule.work_schedule',
  'schedule.energy_peaks',
  'schedule.wake_time',
  'schedule.sleep_time',
  'personal.job',
  'personal.hobbies',
  'personal.family',
  'conversation.tone',
  'conversation.use_emojis',
  'conversation.verbosity',
  'coach.reminder_style'
);


