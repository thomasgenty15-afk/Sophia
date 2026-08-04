-- Fire the post-onboarding week 1 validation scheduling on BOTH unblocking events.
--
-- The prompt has two hard prerequisites that are written by two different
-- services, in either order:
--   * an active plan          -> user_plans_v2.status = 'active'   (onboarding web)
--   * a confirmed WhatsApp opt-in -> profiles.whatsapp_opted_in = true (whatsapp-webhook)
--
-- The original design only listened to plan activation. When the opt-in lands
-- *after* activation (a common few-minute race during onboarding), the edge
-- function was invoked while opted_in was still false, skipped with
-- `whatsapp_not_opted_in`, and nothing ever re-fired it -> the prompt was lost
-- silently. See 20260615143000_schedule_onboarding_week1_validation.sql.
--
-- Fix: keep the plan-activation trigger AND add a profiles trigger on the
-- opt-in transition to true. Whichever event completes the pair invokes the
-- SAME internal edge function. The edge function stays the single owner of the
-- product checks (plan active, opted in, week not yet confirmed) and of dedupe
-- (hasActiveCheckinForPlan), so firing from both triggers is safe and cannot
-- double-schedule.

create extension if not exists "pg_net" with schema "extensions";

-- Shared invoker: POST to schedule-onboarding-week1-validation for one plan.
-- Config/secret loading mirrors request_onboarding_week1_validation_schedule().
create or replace function public.invoke_onboarding_week1_validation_schedule(
  p_user_id uuid,
  p_plan_id uuid,
  p_activated_at timestamptz
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
  if p_user_id is null or p_plan_id is null then
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
    raise notice '[invoke_onboarding_week1_validation_schedule] missing edge config; skipped user % plan %', p_user_id, p_plan_id;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/schedule-onboarding-week1-validation',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'plan_id', p_plan_id,
      'activated_at', coalesce(p_activated_at, now())
    )
  );
exception
  when others then
    raise notice '[invoke_onboarding_week1_validation_schedule] failed for user % plan %: %', p_user_id, p_plan_id, sqlerrm;
end;
$$;

-- Event 1 (existing): plan becomes active. Refactored to delegate to the shared
-- invoker; firing behaviour is unchanged.
create or replace function public.request_onboarding_week1_validation_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null or new.id is null then
    return new;
  end if;

  if new.status::text <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status::text = 'active' then
    return new;
  end if;

  perform public.invoke_onboarding_week1_validation_schedule(
    new.user_id,
    new.id,
    coalesce(new.activated_at, now())
  );

  return new;
exception
  when others then
    raise notice '[request_onboarding_week1_validation_schedule] failed for plan %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_request_onboarding_week1_validation_schedule on public.user_plans_v2;

create trigger trg_request_onboarding_week1_validation_schedule
after insert or update of status, activated_at on public.user_plans_v2
for each row
execute function public.request_onboarding_week1_validation_schedule();

-- Event 2 (new): WhatsApp opt-in flips to true. Recover scheduling for any plan
-- that is already active for this user. If no plan is active yet, the loop is a
-- no-op and Event 1 will fire the invoker later when the plan activates.
create or replace function public.request_onboarding_week1_validation_on_optin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_rec record;
begin
  if coalesce(new.whatsapp_opted_in, false) is not true then
    return new;
  end if;

  for plan_rec in
    select id, activated_at
    from public.user_plans_v2
    where user_id = new.id
      and status::text = 'active'
  loop
    perform public.invoke_onboarding_week1_validation_schedule(
      new.id,
      plan_rec.id,
      coalesce(plan_rec.activated_at, now())
    );
  end loop;

  return new;
exception
  when others then
    raise notice '[request_onboarding_week1_validation_on_optin] failed for user %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_request_onboarding_week1_validation_on_optin on public.profiles;

-- Only fire on a real transition to true. The webhook re-writes whatsapp_opted_in
-- on every inbound message, so the WHEN clause keeps the body from running unless
-- the value actually changed (false/null -> true).
create trigger trg_request_onboarding_week1_validation_on_optin
after update of whatsapp_opted_in on public.profiles
for each row
when (
  new.whatsapp_opted_in is distinct from old.whatsapp_opted_in
  and coalesce(new.whatsapp_opted_in, false) = true
)
execute function public.request_onboarding_week1_validation_on_optin();
