-- Move proactive memory echo cadence from 10 to 14 local days
-- and schedule sends in the afternoon for each user's local timezone.
create or replace function public.claim_due_memory_echo(
  p_batch int default 120,
  p_target time default '14:00',
  p_every_days int default 14
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
    greatest(1, least(coalesce(p_every_days, 14), 365))::int as every_days,
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
