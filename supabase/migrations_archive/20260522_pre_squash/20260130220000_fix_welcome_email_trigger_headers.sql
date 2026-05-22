-- Ensure the welcome email trigger uses the correct auth headers when calling Edge Functions via pg_net.
--
-- Why:
-- - The Functions gateway (Kong) expects an `apikey` header (and in some cases `authorization: Bearer <anon>`).
-- - Our Edge Function is protected by `ensureInternalRequest()` which expects `x-internal-secret`.
-- - DB triggers call the function via `net.http_post`, so we must attach these headers here.
--
-- Requirements (set per environment):
-- - public.app_config('edge_functions_base_url') = 'https://<project-ref>.supabase.co'
-- - public.app_config('edge_functions_anon_key') = '<SUPABASE_ANON_KEY>'
-- - vault secret name 'INTERNAL_FUNCTION_SECRET' contains the same value as the Edge secret.
--
-- NOTE ABOUT SECRETS (IMPORTANT):
-- We intentionally do NOT seed the Vault secret value from this migration, because it would
-- commit a production secret into git. Seed/rotate it out-of-band (SQL Editor or a script).
-- See `scripts/seed_vault_internal_secret.sql.template`.

create or replace function public.handle_new_profile_welcome_email()
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
  -- Base URL
  select value into base_url
  from public.app_config
  where key = 'edge_functions_base_url'
  limit 1;

  -- Safe fallback (should be overridden by app_config in each environment)
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');
  url := base_url || '/functions/v1/send-welcome-email';

  -- Anon key (for Kong)
  select value into anon_key
  from public.app_config
  where key = 'edge_functions_anon_key'
  limit 1;

  -- Internal secret (for ensureInternalRequest)
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice 'edge_functions_anon_key missing; skipping welcome email.';
    return new;
  end if;

  if secret is null or length(trim(secret)) = 0 then
    raise notice 'INTERNAL_FUNCTION_SECRET missing; skipping welcome email.';
    return new;
  end if;

  -- Never block signup if the HTTP call fails.
  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret
      ),
      body := jsonb_build_object(
        'record', row_to_json(new),
        'type', 'INSERT',
        'table', 'profiles'
      )
    );
  exception when others then
    raise notice 'Warning: Welcome email trigger failed (ignored): %', SQLERRM;
  end;

  return new;
exception when others then
  raise notice 'Warning: Welcome email trigger failed (ignored): %', SQLERRM;
  return new;
end;
$$;

-- Ensure the trigger is attached (idempotent)
drop trigger if exists on_profile_created_send_welcome on public.profiles;
create trigger on_profile_created_send_welcome
  after insert on public.profiles
  for each row
  execute function public.handle_new_profile_welcome_email();


