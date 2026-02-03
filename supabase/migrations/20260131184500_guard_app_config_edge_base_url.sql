-- Guard against cross-project Edge Function calls caused by misconfigured public.app_config.
--
-- Incident recap:
-- - Staging had public.app_config.edge_functions_base_url pointing to PROD.
-- - pg_cron jobs in staging used pg_net to call Edge Functions, which then hit PROD with staging headers,
--   producing confusing 403s in PROD Edge logs.
--
-- This migration introduces:
-- - A per-project config key: public.app_config('supabase_project_ref')
-- - A DB trigger that prevents setting edge_functions_base_url to the "wrong" project once the ref is set.
--
-- Notes:
-- - We cannot infer the project ref inside Postgres reliably, so it must be set once per environment.
-- - This guard only blocks invalid updates when supabase_project_ref is present and non-empty.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

-----------------------------------------------------------------------------
-- 1) Ensure the config key exists (no-op if already present)
-----------------------------------------------------------------------------
insert into public.app_config (key, value)
values ('supabase_project_ref', '')
on conflict (key) do nothing;

-----------------------------------------------------------------------------
-- 2) Validator helpers
-----------------------------------------------------------------------------
create or replace function public._app_config_get(_key text)
returns text
language sql
stable
as $$
  select value
  from public.app_config
  where key = _key
  limit 1
$$;

create or replace function public._expected_edge_base_url()
returns text
language sql
stable
as $$
  select
    case
      when length(trim(coalesce(public._app_config_get('supabase_project_ref'), ''))) = 0
        then null
      else
        'https://' || trim(public._app_config_get('supabase_project_ref')) || '.supabase.co'
    end
$$;

-----------------------------------------------------------------------------
-- 3) Trigger: block cross-project base_url updates once project_ref is set
-----------------------------------------------------------------------------
create or replace function public._validate_app_config_edge_base_url()
returns trigger
language plpgsql
security definer
as $$
declare
  expected text;
  incoming text;
begin
  perform set_config('search_path', 'public,extensions', true);

  -- Only validate the specific key.
  if new.key <> 'edge_functions_base_url' then
    return new;
  end if;

  expected := public._expected_edge_base_url();
  incoming := trim(coalesce(new.value, ''));

  -- If project ref isn't set, allow (but you should set it to enable this guard).
  if expected is null then
    return new;
  end if;

  -- Allow local dev base URL patterns explicitly.
  if incoming like 'http://host.docker.internal:%' or incoming like 'http://localhost:%' then
    return new;
  end if;

  -- Enforce exact match for hosted projects.
  if incoming <> expected then
    raise exception
      using
        errcode = '22023',
        message = format(
          'Invalid edge_functions_base_url=%s (expected %s for supabase_project_ref=%s). Refusing to prevent cross-project calls.',
          incoming,
          expected,
          trim(public._app_config_get('supabase_project_ref'))
        );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_app_config_edge_base_url on public.app_config;
create trigger trg_validate_app_config_edge_base_url
before insert or update on public.app_config
for each row
execute function public._validate_app_config_edge_base_url();



