create extension if not exists "pg_net" with schema "extensions";

create or replace function public.whatsapp_scheduling_access_eligible(p_access_tier text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_access_tier, '')) in ('trial', 'alliance', 'architecte');
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
    and status::text in ('pending', 'awaiting_user')
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
  profile_access_tier text;
  profile_whatsapp_opted_in boolean;
begin
  if p_user_id is null then
    return;
  end if;

  delete from public.scheduled_checkins
  where user_id = p_user_id
    and event_context = 'morning_active_actions_nudge'
    and status in ('pending', 'awaiting_user')
    and scheduled_for >= now();

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
    raise notice '[request_morning_active_action_checkins_refresh] missing edge config; skipped async refresh for user %', p_user_id;
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
      'full_reset', true
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
      and status::text in ('pending', 'awaiting_user')
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

create or replace function public.handle_whatsapp_scheduling_access_tier_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_eligible boolean := false;
  is_eligible boolean := false;
begin
  was_eligible := public.whatsapp_scheduling_access_eligible(old.access_tier);
  is_eligible := public.whatsapp_scheduling_access_eligible(new.access_tier);

  if was_eligible = is_eligible then
    return new;
  end if;

  if not is_eligible then
    perform public.cleanup_whatsapp_scheduling_for_user(new.id);
    return new;
  end if;

  if coalesce(new.whatsapp_opted_in, false) then
    perform public.request_morning_active_action_checkins_refresh(new.id);
    perform public.request_recurring_reminder_checkins_refresh(new.id, true);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_whatsapp_scheduling_on_access_tier_change on public.profiles;
create trigger trg_refresh_whatsapp_scheduling_on_access_tier_change
after update of access_tier on public.profiles
for each row
when (old.access_tier is distinct from new.access_tier)
execute function public.handle_whatsapp_scheduling_access_tier_change();

do $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
    where not public.whatsapp_scheduling_access_eligible(p.access_tier)
  loop
    perform public.cleanup_whatsapp_scheduling_for_user(r.id);
  end loop;
end;
$$;
