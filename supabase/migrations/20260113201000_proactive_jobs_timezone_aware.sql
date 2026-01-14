-- Timezone-aware proactive jobs (daily bilan + memory echo) with idempotence and retries.
--
-- Goals:
-- - Trigger daily bilan when local time >= 20:00 (per profiles.timezone) and not already sent today (local date).
-- - Trigger memory echo in the morning when local time >= 09:00, only once every 10 local days.
-- - Support retries on transient failures: we "claim" users with a cooldown between attempts, and only mark as sent on success.
--
-- Notes:
-- - All timestamps are stored in UTC; "local date" is computed as (now() at time zone tz)::date.
-- - We use profiles.timezone as the reference timezone for backend scheduling (no device timezone on server).

create table if not exists public.proactive_job_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  job text not null,
  last_sent_local_date date,
  last_sent_at timestamptz,
  last_attempt_local_date date,
  last_attempt_at timestamptz,
  attempt_count int not null default 0,
  primary key (user_id, job)
);

-- Internal use only (service role bypasses RLS anyway), but keep it consistent.
alter table public.proactive_job_state enable row level security;

-- Marker RPC: called by scheduler after a successful send (or "skipped due to proactive throttle").
create or replace function public.mark_proactive_job_sent(
  p_job text,
  p_user_id uuid,
  p_local_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.proactive_job_state (user_id, job, last_sent_local_date, last_sent_at)
  values (p_user_id, p_job, p_local_date, now())
  on conflict (user_id, job) do update
  set
    last_sent_local_date = excluded.last_sent_local_date,
    last_sent_at = excluded.last_sent_at;
end;
$$;

-- Batch marker to reduce round-trips from Edge functions.
create or replace function public.mark_proactive_job_sent_batch(
  p_job text,
  p_user_ids uuid[],
  p_local_dates date[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_ids is null or p_local_dates is null then
    return;
  end if;
  if array_length(p_user_ids, 1) is distinct from array_length(p_local_dates, 1) then
    raise exception 'mark_proactive_job_sent_batch: arrays must have same length';
  end if;

  insert into public.proactive_job_state (user_id, job, last_sent_local_date, last_sent_at)
  select
    u as user_id,
    p_job as job,
    d as last_sent_local_date,
    now() as last_sent_at
  from unnest(p_user_ids, p_local_dates) as t(u, d)
  on conflict (user_id, job) do update
  set
    last_sent_local_date = excluded.last_sent_local_date,
    last_sent_at = excluded.last_sent_at;
end;
$$;

-- Claim users due for the daily bilan. Returns user_id + local_date (for marking).
create or replace function public.claim_due_daily_bilan(
  p_batch int default 200,
  p_target time default '20:00'
)
returns table(user_id uuid, local_date date)
language sql
security definer
set search_path = public
as $$
with cfg as (
  select
    greatest(1, least(coalesce(p_batch, 200), 500))::int as batch,
    p_target as target_time,
    interval '25 minutes' as attempt_cooldown
),
candidates as (
  select
    p.id as user_id,
    coalesce(nullif(p.timezone, ''), 'Europe/Paris') as tz,
    (now() at time zone coalesce(nullif(p.timezone, ''), 'Europe/Paris'))::date as local_date,
    (now() at time zone coalesce(nullif(p.timezone, ''), 'Europe/Paris'))::time as local_time
  from public.profiles p
  where p.whatsapp_opted_in is true
    and p.phone_invalid is false
    and p.phone_number is not null
),
-- Restrict to users with an active-ish plan (same semantics as trigger-daily-bilan).
plan_ok as (
  select distinct up.user_id
  from public.user_plans up
  where up.status in ('active','in_progress','pending')
),
due as (
  select
    c.user_id,
    c.local_date
  from candidates c
  join plan_ok ok on ok.user_id = c.user_id
  left join public.proactive_job_state s
    on s.user_id = c.user_id and s.job = 'daily_bilan'
  cross join cfg
  where c.local_time >= cfg.target_time
    and (s.last_sent_local_date is null or s.last_sent_local_date < c.local_date)
    and (s.last_attempt_at is null or s.last_attempt_at < now() - cfg.attempt_cooldown)
  order by c.user_id
  limit (select batch from cfg)
),
claimed as (
  insert into public.proactive_job_state (user_id, job, last_attempt_local_date, last_attempt_at, attempt_count)
  select d.user_id, 'daily_bilan', d.local_date, now(), 1
  from due d
  on conflict (user_id, job) do update
  set
    last_attempt_local_date = excluded.last_attempt_local_date,
    last_attempt_at = excluded.last_attempt_at,
    attempt_count = public.proactive_job_state.attempt_count + 1
  -- Only claim if still due and not recently attempted (re-check under conflict)
  where (public.proactive_job_state.last_sent_local_date is null or public.proactive_job_state.last_sent_local_date < excluded.last_attempt_local_date)
    and (public.proactive_job_state.last_attempt_at is null or public.proactive_job_state.last_attempt_at < now() - (select attempt_cooldown from cfg))
  returning user_id, last_attempt_local_date as local_date
)
select * from claimed;
$$;

-- Claim users due for memory echo: morning + every N local days + active recently.
create or replace function public.claim_due_memory_echo(
  p_batch int default 120,
  p_target time default '09:00',
  p_every_days int default 10
)
returns table(user_id uuid, local_date date)
language sql
security definer
set search_path = public
as $$
with cfg as (
  select
    greatest(1, least(coalesce(p_batch, 120), 400))::int as batch,
    p_target as target_time,
    greatest(1, least(coalesce(p_every_days, 10), 365))::int as every_days,
    interval '25 minutes' as attempt_cooldown
),
candidates as (
  select
    p.id as user_id,
    coalesce(nullif(p.timezone, ''), 'Europe/Paris') as tz,
    (now() at time zone coalesce(nullif(p.timezone, ''), 'Europe/Paris'))::date as local_date,
    (now() at time zone coalesce(nullif(p.timezone, ''), 'Europe/Paris'))::time as local_time
  from public.profiles p
  where p.whatsapp_opted_in is true
    and p.phone_invalid is false
    and p.phone_number is not null
),
active_users as (
  select distinct m.user_id
  from public.chat_messages m
  where m.role = 'user'
    and m.created_at > now() - interval '7 days'
),
due as (
  select
    c.user_id,
    c.local_date
  from candidates c
  join active_users a on a.user_id = c.user_id
  left join public.proactive_job_state s
    on s.user_id = c.user_id and s.job = 'memory_echo'
  cross join cfg
  where c.local_time >= cfg.target_time
    and (s.last_sent_local_date is null or (c.local_date - s.last_sent_local_date) >= cfg.every_days)
    and (s.last_attempt_at is null or s.last_attempt_at < now() - cfg.attempt_cooldown)
  order by c.user_id
  limit (select batch from cfg)
),
claimed as (
  insert into public.proactive_job_state (user_id, job, last_attempt_local_date, last_attempt_at, attempt_count)
  select d.user_id, 'memory_echo', d.local_date, now(), 1
  from due d
  on conflict (user_id, job) do update
  set
    last_attempt_local_date = excluded.last_attempt_local_date,
    last_attempt_at = excluded.last_attempt_at,
    attempt_count = public.proactive_job_state.attempt_count + 1
  where (public.proactive_job_state.last_sent_local_date is null or (excluded.last_attempt_local_date - public.proactive_job_state.last_sent_local_date) >= (select every_days from cfg))
    and (public.proactive_job_state.last_attempt_at is null or public.proactive_job_state.last_attempt_at < now() - (select attempt_cooldown from cfg))
  returning user_id, last_attempt_local_date as local_date
)
select * from claimed;
$$;


