do $$
begin
  begin
    alter table public.whatsapp_pending_actions drop constraint if exists whatsapp_pending_actions_kind_check;
  exception when undefined_table then
    null;
  end;

  begin
    alter table public.whatsapp_pending_actions
      add constraint whatsapp_pending_actions_kind_check
      check (
        kind in (
          'scheduled_checkin',
          'memory_echo',
          'deferred_send',
          'bilan_reschedule',
          'weekly_bilan',
          'proactive_template_candidate',
          'access_ended_notification',
          'access_reactivation_offer'
        )
      );
  exception when duplicate_object then
    null;
  end;
end $$;

create or replace function public.queue_whatsapp_access_ended_notification(
  p_user_id uuid,
  p_previous_access_tier text,
  p_new_access_tier text default 'none'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ended_reason text;
  profile_whatsapp_opted_in boolean;
  profile_phone_invalid boolean;
  profile_phone_number text;
begin
  if p_user_id is null then
    return;
  end if;

  if lower(coalesce(p_new_access_tier, '')) <> 'none' then
    return;
  end if;

  ended_reason :=
    case
      when lower(coalesce(p_previous_access_tier, '')) = 'trial' then 'trial_ended'
      when lower(coalesce(p_previous_access_tier, '')) in ('system', 'alliance', 'architecte') then 'subscription_ended'
      else null
    end;

  if ended_reason is null then
    return;
  end if;

  select
    p.whatsapp_opted_in,
    p.phone_invalid,
    p.phone_number
  into
    profile_whatsapp_opted_in,
    profile_phone_invalid,
    profile_phone_number
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  if coalesce(profile_whatsapp_opted_in, false) is not true
     or coalesce(profile_phone_invalid, false) is true
     or coalesce(profile_phone_number, '') = '' then
    return;
  end if;

  update public.whatsapp_pending_actions
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and kind in ('access_ended_notification', 'access_reactivation_offer');

  insert into public.whatsapp_pending_actions (
    user_id,
    kind,
    status,
    payload,
    expires_at
  )
  values (
    p_user_id,
    'access_ended_notification',
    'pending',
    jsonb_build_object(
      'ended_reason', ended_reason,
      'from_access_tier', lower(coalesce(p_previous_access_tier, '')),
      'to_access_tier', 'none',
      'upgrade_path', '/upgrade',
      'source', 'access_tier_transition'
    ),
    now() + interval '14 days'
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
  should_queue_access_ended boolean := false;
begin
  was_eligible := public.whatsapp_scheduling_access_eligible(old.access_tier);
  is_eligible := public.whatsapp_scheduling_access_eligible(new.access_tier);
  should_queue_access_ended :=
    lower(coalesce(new.access_tier, '')) = 'none'
    and lower(coalesce(old.access_tier, '')) in ('trial', 'system', 'alliance', 'architecte');

  if should_queue_access_ended then
    perform public.queue_whatsapp_access_ended_notification(new.id, old.access_tier, new.access_tier);
  end if;

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
