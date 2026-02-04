-- Harden other pg_net triggers & crons that call protected Edge Functions.
--
-- Problem class (same as welcome email):
-- - Kong may require `apikey` (and often `authorization: Bearer <anon>`).
-- - Protected functions require `x-internal-secret` (ensureInternalRequest()).
-- - Some older triggers/crons used hardcoded local URLs and/or omitted auth headers.
--
-- Requirements (set per environment):
-- - public.app_config('edge_functions_base_url') = 'https://<project-ref>.supabase.co'
-- - public.app_config('edge_functions_anon_key') = '<SUPABASE_ANON_KEY>'
-- - Vault secret name 'INTERNAL_FUNCTION_SECRET' matches the Edge secret value.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

-----------------------------------------------------------------------------
-- 1) Trigger functions: module memory / round table / core identity / archive plan
-----------------------------------------------------------------------------

create or replace function public.handle_module_memory_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  url text;
  anon_key text;
  secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select value into base_url from public.app_config where key = 'edge_functions_base_url' limit 1;
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');
  url := base_url || '/functions/v1/create-module-memory';

  select value into anon_key from public.app_config where key = 'edge_functions_anon_key' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice '[handle_module_memory_trigger] edge_functions_anon_key missing; skipping edge call.';
    return new;
  end if;
  if secret is null or length(trim(secret)) = 0 then
    raise notice '[handle_module_memory_trigger] INTERNAL_FUNCTION_SECRET missing; skipping edge call.';
    return new;
  end if;

  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret,
        'x-supabase-event-type', 'webhook'
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );
  exception when others then
    raise notice '[handle_module_memory_trigger] net.http_post failed: %', SQLERRM;
  end;

  return new;
end;
$$;

create or replace function public.handle_round_table_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  url text;
  anon_key text;
  secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select value into base_url from public.app_config where key = 'edge_functions_base_url' limit 1;
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');
  url := base_url || '/functions/v1/create-round-table-summary';

  select value into anon_key from public.app_config where key = 'edge_functions_anon_key' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice '[handle_round_table_trigger] edge_functions_anon_key missing; skipping edge call.';
    return new;
  end if;
  if secret is null or length(trim(secret)) = 0 then
    raise notice '[handle_round_table_trigger] INTERNAL_FUNCTION_SECRET missing; skipping edge call.';
    return new;
  end if;

  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret,
        'x-supabase-event-type', 'webhook'
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );
  exception when others then
    raise notice '[handle_round_table_trigger] net.http_post failed: %', SQLERRM;
  end;

  return new;
end;
$$;

create or replace function public.handle_core_identity_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  url text;
  anon_key text;
  secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select value into base_url from public.app_config where key = 'edge_functions_base_url' limit 1;
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');
  url := base_url || '/functions/v1/update-core-identity';

  select value into anon_key from public.app_config where key = 'edge_functions_anon_key' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice '[handle_core_identity_trigger] edge_functions_anon_key missing; skipping edge call.';
    return new;
  end if;
  if secret is null or length(trim(secret)) = 0 then
    raise notice '[handle_core_identity_trigger] INTERNAL_FUNCTION_SECRET missing; skipping edge call.';
    return new;
  end if;

  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret,
        'x-supabase-event-type', 'webhook'
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );
  exception when others then
    raise notice '[handle_core_identity_trigger] net.http_post failed: %', SQLERRM;
  end;

  return new;
end;
$$;

create or replace function public.handle_archive_plan_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  url text;
  anon_key text;
  secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select value into base_url from public.app_config where key = 'edge_functions_base_url' limit 1;
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');
  url := base_url || '/functions/v1/archive-plan';

  select value into anon_key from public.app_config where key = 'edge_functions_anon_key' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice '[handle_archive_plan_trigger] edge_functions_anon_key missing; skipping edge call.';
    return new;
  end if;
  if secret is null or length(trim(secret)) = 0 then
    raise notice '[handle_archive_plan_trigger] INTERNAL_FUNCTION_SECRET missing; skipping edge call.';
    return new;
  end if;

  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret,
        'x-supabase-event-type', 'webhook'
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );
  exception when others then
    raise notice '[handle_archive_plan_trigger] net.http_post failed: %', SQLERRM;
  end;

  return new;
end;
$$;

-----------------------------------------------------------------------------
-- 2) Cron jobs: retention emails + proactive scheduler
-----------------------------------------------------------------------------

-- Re-schedule retention emails job to avoid hardcoded environment URLs and include required headers.
do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid from cron.job where jobname = 'trigger-retention-emails' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'trigger-retention-emails',
  '0 9 * * *',
  $$
  with cfg as (
    select
      coalesce(
        (select value from public.app_config where key = 'edge_functions_base_url' limit 1),
        'https://ybyqxwnwjvuxckolsddn.supabase.co'
      ) as base_url,
      coalesce(
        (select value from public.app_config where key = 'edge_functions_anon_key' limit 1),
        ''
      ) as anon_key,
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1),
        ''
      ) as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/trigger-retention-emails',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := '{}'::jsonb
    ) as request_id
  from cfg
  where (select anon_key from cfg) <> '' and (select internal_secret from cfg) <> '';
  $$
);

-- Re-schedule proactive scheduler job to include authorization + avoid 401/403 spam when config is missing.
do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid from cron.job where jobname = 'trigger-proactive-scheduler' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'trigger-proactive-scheduler',
  '*/30 * * * *',
  $$
  with cfg as (
    select
      coalesce(
        (select value from public.app_config where key = 'edge_functions_base_url' limit 1),
        'https://ybyqxwnwjvuxckolsddn.supabase.co'
      ) as base_url,
      coalesce(
        (select value from public.app_config where key = 'edge_functions_anon_key' limit 1),
        ''
      ) as anon_key,
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1),
        ''
      ) as internal_secret
  )
  select
    net.http_post(
      url := (select base_url from cfg) || '/functions/v1/trigger-proactive-scheduler',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select anon_key from cfg),
        'authorization', 'Bearer ' || (select anon_key from cfg),
        'x-internal-secret', (select internal_secret from cfg)
      ),
      body := '{}'::jsonb
    ) as request_id
  from cfg
  where (select anon_key from cfg) <> '' and (select internal_secret from cfg) <> '';
  $$
);




