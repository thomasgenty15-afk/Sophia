-- Harden DB trigger functions that call Edge Functions via pg_net.
-- Goals:
-- - Avoid breaking the business transaction if net.http_post fails (exception handler)
-- - Lock down security definer search_path
-- - Align archive-plan headers with webhook-style triggers

create extension if not exists "pg_net" with schema "extensions";

-- 1) Module memory trigger
create or replace function public.handle_module_memory_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  url text := 'http://host.docker.internal:54321/functions/v1/create-module-memory';
  internal_secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select decrypted_secret
    into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if internal_secret is null then
    raise notice '[handle_module_memory_trigger] INTERNAL_FUNCTION_SECRET missing in vault; skipping edge call.';
    return new;
  end if;

  begin
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Supabase-Event-Type', 'webhook',
          'X-Internal-Secret', internal_secret
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

-- 2) Round table trigger
create or replace function public.handle_round_table_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  url text := 'http://host.docker.internal:54321/functions/v1/create-round-table-summary';
  internal_secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select decrypted_secret
    into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if internal_secret is null then
    raise notice '[handle_round_table_trigger] INTERNAL_FUNCTION_SECRET missing in vault; skipping edge call.';
    return new;
  end if;

  begin
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Supabase-Event-Type', 'webhook',
          'X-Internal-Secret', internal_secret
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

-- 3) Core identity trigger
create or replace function public.handle_core_identity_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  url text := 'http://host.docker.internal:54321/functions/v1/update-core-identity';
  internal_secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select decrypted_secret
    into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if internal_secret is null then
    raise notice '[handle_core_identity_trigger] INTERNAL_FUNCTION_SECRET missing in vault; skipping edge call.';
    return new;
  end if;

  begin
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Supabase-Event-Type', 'webhook',
          'X-Internal-Secret', internal_secret
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

-- 4) Archive plan trigger
create or replace function public.handle_archive_plan_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  url text := 'http://host.docker.internal:54321/functions/v1/archive-plan';
  internal_secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select decrypted_secret
    into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if internal_secret is null then
    raise notice '[handle_archive_plan_trigger] INTERNAL_FUNCTION_SECRET missing in vault; skipping edge call.';
    return new;
  end if;

  begin
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Supabase-Event-Type', 'webhook',
          'X-Internal-Secret', internal_secret
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


