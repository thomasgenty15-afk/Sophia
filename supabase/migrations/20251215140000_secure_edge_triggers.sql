-- Secure Edge Function trigger calls by attaching an internal secret header.
-- This assumes you store the secret in Supabase Vault under name: INTERNAL_FUNCTION_SECRET
-- and you set the same value as an Edge secret: INTERNAL_FUNCTION_SECRET
--
-- If the Vault secret is missing, the trigger will SKIP the HTTP call (fail safe).

create extension if not exists "pg_net" with schema "extensions";

-- Helper: fetch secret from vault (best effort)
-- Note: vault schema is provided by supabase_vault extension.

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
  select decrypted_secret
    into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if internal_secret is null then
    raise notice '[handle_module_memory_trigger] INTERNAL_FUNCTION_SECRET missing in vault; skipping edge call.';
    return new;
  end if;

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
  select decrypted_secret
    into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if internal_secret is null then
    raise notice '[handle_round_table_trigger] INTERNAL_FUNCTION_SECRET missing in vault; skipping edge call.';
    return new;
  end if;

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
  select decrypted_secret
    into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if internal_secret is null then
    raise notice '[handle_core_identity_trigger] INTERNAL_FUNCTION_SECRET missing in vault; skipping edge call.';
    return new;
  end if;

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
  select decrypted_secret
    into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if internal_secret is null then
    raise notice '[handle_archive_plan_trigger] INTERNAL_FUNCTION_SECRET missing in vault; skipping edge call.';
    return new;
  end if;

  perform
    net.http_post(
      url := url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', internal_secret
      ),
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'user_plans',
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );

  return new;
end;
$$;


