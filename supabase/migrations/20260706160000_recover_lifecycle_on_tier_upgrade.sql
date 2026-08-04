-- Recover paywall-lapsed lifecycle loops when a user gains a paid tier.
--
-- While a user sits between trial end and subscription (access_tier none),
-- WhatsApp sends are paywalled: the week-planning validation prompt fails
-- permanently (402 is not retryable) and level-review reminders stop. Nothing
-- replayed those loops after the user subscribed. This trigger relaunches the
-- right loop depending on where the plan lifecycle stopped:
--
--   - level end reached (or transition crashed mid-flight) during the paywall
--     window -> re-invoke trigger-level-review-transitions-v1, which
--     self-decides via its date windows and resumes crashed transitions; the
--     resulting plan activation then fires the week-1 validation circuit via
--     trg_request_onboarding_week1_validation_schedule;
--   - weeks remaining in the current level and the current local week still
--     pending_confirmation -> re-invoke schedule-onboarding-week1-validation
--     targeting the current week (the function is idempotent).

-- Generic internal edge invoker; mirrors invoke_onboarding_week1_validation_schedule.
create or replace function public.invoke_internal_edge_function(
  p_function_name text,
  p_body jsonb
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
begin
  if coalesce(p_function_name, '') = '' then
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
    raise notice '[invoke_internal_edge_function] missing edge config; skipped %', p_function_name;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := p_body
  );
exception
  when others then
    raise notice '[invoke_internal_edge_function] failed for %: %', p_function_name, sqlerrm;
end;
$$;

create or replace function public.request_lifecycle_recovery_on_tier_upgrade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_rec record;
  user_tz text;
  current_week_start date;
  current_week_ymd text;
begin
  -- Only a lapse-ending upgrade counts: from a non-paid tier to a paid one.
  -- alliance -> architecte (or the reverse) never had a paywall lapse.
  if coalesce(new.access_tier, '') not in ('alliance', 'architecte') then
    return new;
  end if;
  if coalesce(old.access_tier, '') in ('alliance', 'architecte') then
    return new;
  end if;

  -- Level-transition loop: the edge function scans this user's active plans
  -- and self-decides (end date passed -> auto-generate / resume; otherwise
  -- reminder windows). Idempotent via its generation-event guard.
  perform public.invoke_internal_edge_function(
    'trigger-level-review-transitions-v1',
    jsonb_build_object('user_id', new.id)
  );

  -- Week-validation loop: only when the current local week of an active plan
  -- is still pending_confirmation and no validation/auto-validation checkin is
  -- already in flight for that week (avoids doubling the Monday prompt chain).
  user_tz := coalesce(nullif(trim(new.timezone), ''), 'Europe/Paris');
  current_week_start := (
    (now() at time zone user_tz)::date
    - (extract(isodow from (now() at time zone user_tz))::int - 1)
  );
  current_week_ymd := to_char(current_week_start, 'YYYY-MM-DD');

  for plan_rec in
    select p.id, p.activated_at
    from public.user_plans_v2 p
    where p.user_id = new.id
      and p.status::text = 'active'
  loop
    if exists (
      select 1
      from public.user_habit_week_plans w
      where w.user_id = new.id
        and w.plan_id = plan_rec.id
        and w.week_start_date = current_week_start
        and w.status::text = 'pending_confirmation'
    ) and not exists (
      select 1
      from public.scheduled_checkins c
      where c.user_id = new.id
        and c.status in ('pending', 'retrying', 'awaiting_user', 'sent')
        and c.event_context in (
          'weekly_planning_auto_validation_v2',
          'onboarding_week1_validation_prompt_v1'
        )
        and coalesce(
          c.message_payload ->> 'target_week_start_date',
          c.message_payload ->> 'week_start_date',
          ''
        ) = current_week_ymd
    ) then
      perform public.invoke_internal_edge_function(
        'schedule-onboarding-week1-validation',
        jsonb_build_object(
          'user_id', new.id,
          'plan_id', plan_rec.id,
          'activated_at', coalesce(plan_rec.activated_at, now()),
          'target_week_start_date', current_week_ymd
        )
      );
    end if;
  end loop;

  return new;
exception
  when others then
    raise notice '[request_lifecycle_recovery_on_tier_upgrade] failed for user %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_request_lifecycle_recovery_on_tier_upgrade on public.profiles;

create trigger trg_request_lifecycle_recovery_on_tier_upgrade
after update of access_tier on public.profiles
for each row
when (old.access_tier is distinct from new.access_tier)
execute function public.request_lifecycle_recovery_on_tier_upgrade();
