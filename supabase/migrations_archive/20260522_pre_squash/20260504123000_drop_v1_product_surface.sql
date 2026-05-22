-- Final V2-only product cleanup.
-- The project has no users to preserve, so V1 product surfaces are removed
-- instead of kept for coexistence or backfill.

do $$
declare
  stale_job record;
begin
  for stale_job in
    select jobid
    from cron.job
    where jobname in (
      'trigger-daily-bilan',
      'trigger-weekly-bilan',
      'trigger-memory-echo',
      'schedule-recurring-checkins',
      'refresh-morning-active-action-checkins',
      'refresh-morning-active-action-checkins-weekly',
      'process-plan-topic-memory',
      'archive-plan'
    )
    or coalesce(command, '') ilike any (array[
      '%/functions/v1/trigger-daily-bilan%',
      '%/functions/v1/trigger-weekly-bilan%',
      '%/functions/v1/trigger-memory-echo%',
      '%/functions/v1/schedule-recurring-checkins%',
      '%/functions/v1/process-plan-topic-memory%',
      '%/functions/v1/archive-plan%'
    ])
  loop
    perform cron.unschedule(stale_job.jobid);
  end loop;
exception
  when undefined_table or invalid_schema_name then
    null;
end $$;

do $$
begin
  if to_regclass('public.user_actions') is not null then
    execute 'drop trigger if exists trg_refresh_morning_active_action_checkins_user_actions on public.user_actions';
  end if;

  if to_regclass('public.user_personal_actions') is not null then
    execute 'drop trigger if exists trg_refresh_morning_active_action_checkins_user_personal_actions on public.user_personal_actions';
  end if;

  if to_regclass('public.user_framework_tracking') is not null then
    execute 'drop trigger if exists trg_refresh_morning_active_action_checkins_user_framework_tracking on public.user_framework_tracking';
  end if;

  if to_regclass('public.user_vital_signs') is not null then
    execute 'drop trigger if exists trg_refresh_morning_active_action_checkins_user_vital_signs on public.user_vital_signs';
  end if;

  if to_regclass('public.user_plans') is not null then
    execute 'drop trigger if exists trg_refresh_morning_active_action_checkins_user_plans on public.user_plans';
    execute 'drop trigger if exists on_plan_completed_archive on public.user_plans';
  end if;
end $$;

drop function if exists public.handle_archive_plan_trigger() cascade;
drop function if exists public.handle_morning_active_action_checkins_refresh() cascade;
drop function if exists public.enqueue_user_scheduling_refresh_job(uuid, text, interval) cascade;
drop function if exists public.process_user_scheduling_refresh_jobs(integer) cascade;
drop function if exists public.process_signup_morning_active_action_refreshes() cascade;
drop function if exists public.claim_due_daily_bilan(integer, time without time zone) cascade;
drop function if exists public.claim_due_weekly_bilan(integer, time without time zone) cascade;
drop function if exists public.claim_due_memory_echo(integer, time without time zone, integer) cascade;
drop function if exists public.match_action_entries(public.vector, double precision, integer, uuid) cascade;
drop function if exists public.match_all_action_entries(public.vector, double precision, integer) cascade;
drop function if exists public.match_all_action_entries_for_user(uuid, public.vector, double precision, integer) cascade;

create or replace function public.request_recurring_reminder_checkins_refresh(
  p_user_id uuid,
  p_full_reset boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
  profile_access_tier text;
  profile_whatsapp_opted_in boolean;
begin
  if p_user_id is null then
    return;
  end if;

  if coalesce(p_full_reset, true) then
    update public.scheduled_checkins
    set
      status = 'cancelled',
      processed_at = now()
    where user_id = p_user_id
      and status::text in ('pending', 'retrying', 'awaiting_user')
      and scheduled_for >= now()
      and event_context like 'recurring_reminder:%';
  end if;

  select
    p.access_tier,
    p.whatsapp_opted_in
  into
    profile_access_tier,
    profile_whatsapp_opted_in
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  if coalesce(profile_whatsapp_opted_in, false) is not true then
    return;
  end if;

  if not public.whatsapp_scheduling_access_eligible(profile_access_tier) then
    return;
  end if;

  select value into base_url
  from public.app_config
  where key = 'edge_functions_base_url'
  limit 1;

  select value into anon_key
  from public.app_config
  where key = 'edge_functions_anon_key'
  limit 1;

  select decrypted_secret into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if coalesce(base_url, '') = '' or coalesce(anon_key, '') = '' or coalesce(internal_secret, '') = '' then
    raise notice '[request_recurring_reminder_checkins_refresh] missing edge config; skipped async refresh for user %', p_user_id;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/schedule-whatsapp-v2-checkins',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'full_reset', coalesce(p_full_reset, true),
      'include_today_if_future', true
    )
  );
end;
$$;

drop table if exists public.plan_feedbacks cascade;
drop table if exists public.user_action_entries cascade;
drop table if exists public.user_vital_sign_entries cascade;
drop table if exists public.user_framework_entries cascade;
drop table if exists public.user_feedback_entries cascade;
drop table if exists public.user_north_stars cascade;
drop table if exists public.user_personal_actions cascade;
drop table if exists public.weekly_bilan_recaps cascade;
drop table if exists public.user_checkup_logs cascade;
drop table if exists public.user_scheduling_refresh_jobs cascade;
drop table if exists public.user_actions cascade;
drop table if exists public.user_framework_tracking cascade;
drop table if exists public.user_vital_signs cascade;
drop table if exists public.user_plans cascade;
drop table if exists public.user_goals cascade;
drop table if exists public.user_answers cascade;

drop function if exists public.get_admin_user_stats(timestamptz);
create or replace function public.get_admin_user_stats(period_start timestamptz)
returns table (
  user_id uuid,
  full_name text,
  email text,
  plans_count bigint,
  messages_count bigint,
  total_cost_usd numeric,
  total_revenue_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.internal_admins where user_id = auth.uid()) then
    raise exception 'Access denied';
  end if;

  return query
  select
    p.id as user_id,
    coalesce(p.full_name, 'Unknown') as full_name,
    coalesce(u.email, 'No Email') as email,
    count(distinct pl.id) as plans_count,
    count(distinct m.id) as messages_count,
    coalesce(sum(ue.cost_usd), 0) as total_cost_usd,
    0::numeric as total_revenue_usd
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_plans_v2 pl on pl.user_id = p.id and pl.created_at >= period_start
  left join public.chat_messages m on m.user_id = p.id and m.created_at >= period_start
  left join public.llm_usage_events ue on ue.user_id = p.id and ue.created_at >= period_start
  group by p.id, p.full_name, u.email
  order by total_cost_usd desc, messages_count desc;
end;
$$;

create or replace function public.normalize_cost_operation_family(
  p_operation_family text,
  p_source text
)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_operation_family, ''))) not in ('', 'other') then lower(trim(p_operation_family))
    when lower(coalesce(p_source, '')) like '%embed%' then 'embedding'
    when lower(coalesce(p_source, '')) like '%generate-plan%' or lower(coalesce(p_source, '')) like '%plan%' then 'plan_generation'
    when lower(coalesce(p_source, '')) like '%dispatcher%' then 'dispatcher'
    when lower(coalesce(p_source, '')) like '%summary%' then 'summarize_context'
    when lower(coalesce(p_source, '')) like '%ethical%' then 'ethics_check'
    when lower(coalesce(p_source, '')) like '%companion%' or lower(coalesce(p_source, '')) like '%firefighter%' or lower(coalesce(p_source, '')) like '%sentry%' then 'message_generation'
    when lower(coalesce(p_source, '')) like '%memorizer%' or lower(coalesce(p_source, '')) like '%topic_memory%' or lower(coalesce(p_source, '')) like '%topic_%' or lower(coalesce(p_source, '')) like '%synthesizer%' then 'memorizer'
    when lower(coalesce(p_source, '')) like '%watcher%' then 'watcher'
    when lower(coalesce(p_source, '')) like '%schedule%' or lower(coalesce(p_source, '')) like '%checkin%' or lower(coalesce(p_source, '')) like '%reminder%' then 'scheduling'
    when lower(coalesce(p_source, '')) like '%duplicate%' then 'duplicate_check'
    else 'other'
  end
$$;
