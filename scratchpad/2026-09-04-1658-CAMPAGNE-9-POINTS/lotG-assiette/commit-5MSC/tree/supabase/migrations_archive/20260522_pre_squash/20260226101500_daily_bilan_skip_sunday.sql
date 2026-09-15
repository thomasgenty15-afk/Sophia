-- Daily bilan should not run on Sundays.
-- Sunday is reserved for weekly bilan.

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
    (now() at time zone coalesce(nullif(p.timezone, ''), 'Europe/Paris'))::time as local_time,
    extract(dow from (now() at time zone coalesce(nullif(p.timezone, ''), 'Europe/Paris')))::int as local_dow
  from public.profiles p
  where p.whatsapp_opted_in is true
    and p.phone_invalid is false
    and p.phone_number is not null
),
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
  where c.local_dow <> 0 -- Sunday excluded (Postgres dow: Sunday=0)
    and c.local_time >= cfg.target_time
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
  where (public.proactive_job_state.last_sent_local_date is null or public.proactive_job_state.last_sent_local_date < excluded.last_attempt_local_date)
    and (public.proactive_job_state.last_attempt_at is null or public.proactive_job_state.last_attempt_at < now() - (select attempt_cooldown from cfg))
  returning user_id, last_attempt_local_date as local_date
)
select * from claimed;
$$;
