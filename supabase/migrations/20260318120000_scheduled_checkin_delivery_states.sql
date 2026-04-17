-- Tighten scheduled_checkins delivery semantics for WhatsApp.
--
-- `sent` must mean "actually sent to WhatsApp".
-- Transient delivery failures should remain retryable without creating fake
-- assistant messages in chat history.

do $$
begin
  begin
    alter type public.checkin_status add value if not exists 'retrying';
  exception when duplicate_object then
    null;
  end;
  begin
    alter type public.checkin_status add value if not exists 'failed';
  exception when duplicate_object then
    null;
  end;
end $$;

alter table public.scheduled_checkins
  add column if not exists delivery_attempt_count integer not null default 0;

alter table public.scheduled_checkins
  add column if not exists delivery_last_error text;

alter table public.scheduled_checkins
  add column if not exists delivery_last_error_at timestamptz;

alter table public.scheduled_checkins
  add column if not exists delivery_last_request_id text;

create or replace function public.scheduled_checkins_enforce_min_gap_1h()
returns trigger
language plpgsql
as $$
declare
  conflicting_scheduled_for timestamptz;
  attempts int := 0;
begin
  if new.status::text not in ('pending', 'retrying', 'awaiting_user', 'sent') then
    return new;
  end if;

  while attempts < 48 loop
    select max(sc.scheduled_for)
      into conflicting_scheduled_for
    from public.scheduled_checkins sc
    where sc.user_id = new.user_id
      and sc.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and sc.status::text in ('pending', 'retrying', 'awaiting_user', 'sent')
      and abs(extract(epoch from (sc.scheduled_for - new.scheduled_for))) < 3600;

    exit when conflicting_scheduled_for is null;

    new.scheduled_for := conflicting_scheduled_for + interval '1 hour';
    attempts := attempts + 1;
  end loop;

  return new;
end;
$$;

create or replace function public.request_morning_active_action_checkins_refresh(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
begin
  if p_user_id is null then
    return;
  end if;

  delete from public.scheduled_checkins
  where user_id = p_user_id
    and event_context = 'morning_active_actions_nudge'
    and status::text in ('pending', 'retrying', 'awaiting_user')
    and scheduled_for >= now();

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
    raise notice '[request_morning_active_action_checkins_refresh] missing edge config; skipped async refresh for user %', p_user_id;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/schedule-morning-active-action-checkins',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'full_reset', true
    )
  );
end;
$$;

create or replace function public.cleanup_whatsapp_scheduling_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  update public.scheduled_checkins
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status::text in ('pending', 'retrying', 'awaiting_user')
    and scheduled_for >= now()
    and (
      event_context = 'morning_active_actions_nudge'
      or event_context like 'recurring_reminder:%'
    );

  update public.whatsapp_pending_actions
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and (
      (
        kind = 'scheduled_checkin'
        and (
          coalesce(payload->>'event_context', '') = 'morning_active_actions_nudge'
          or coalesce(payload->>'event_context', '') like 'recurring_reminder:%'
        )
      )
      or (
        kind = 'proactive_template_candidate'
        and coalesce(payload->>'purpose', '') = 'recurring_reminder'
      )
    );
end;
$$;

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
    url := rtrim(base_url, '/') || '/functions/v1/schedule-recurring-checkins',
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
