-- Schedule the post-onboarding week 1 validation prompt when a plan becomes active.
--
-- The trigger delegates to an internal Edge Function so Postgres only detects
-- the activation event. The Edge Function owns product checks and dedupe.

create extension if not exists "pg_net" with schema "extensions";

create or replace function public.request_onboarding_week1_validation_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
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
    raise notice '[request_onboarding_week1_validation_schedule] missing edge config; skipped plan %', new.id;
    return new;
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
      'user_id', new.user_id,
      'plan_id', new.id,
      'activated_at', coalesce(new.activated_at, now())
    )
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
