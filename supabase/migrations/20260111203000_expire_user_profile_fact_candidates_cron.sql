-- Expire stale user_profile_fact_candidates to avoid resurfacing old/irrelevant candidates.
-- This runs entirely inside Postgres (pg_cron), no edge-function call needed.

create extension if not exists "pg_cron" with schema "extensions";

create or replace function public.expire_user_profile_fact_candidates()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
begin
  -- 1) Expire candidates not seen for a while (general staleness).
  update public.user_profile_fact_candidates
  set
    status = 'expired',
    resolved_at = now_ts,
    updated_at = now_ts
  where status in ('pending', 'asked')
    and last_seen_at < (now_ts - interval '14 days');

  -- 2) Expire candidates that have been asked but not resolved for a long time (avoid nagging).
  update public.user_profile_fact_candidates
  set
    status = 'expired',
    resolved_at = now_ts,
    updated_at = now_ts
  where status = 'asked'
    and last_asked_at is not null
    and last_asked_at < (now_ts - interval '7 days');

  -- 3) Safety: if we've asked too many times, expire even if it's still being re-proposed.
  update public.user_profile_fact_candidates
  set
    status = 'expired',
    resolved_at = now_ts,
    updated_at = now_ts
  where status in ('pending', 'asked')
    and asked_count >= 3;
end;
$$;

do $$
declare
  existing_jobid int;
begin
  -- Unschedule by name if exists
  select jobid into existing_jobid from cron.job where jobname = 'expire-user-profile-fact-candidates' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- Daily at 03:20 server time (keep it off peak).
select cron.schedule(
  'expire-user-profile-fact-candidates',
  '20 3 * * *',
  $$
  select public.expire_user_profile_fact_candidates();
  $$
);



