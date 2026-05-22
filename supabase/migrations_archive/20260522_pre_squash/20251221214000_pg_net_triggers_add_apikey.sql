-- Ensure pg_net-triggered Edge Function calls include `apikey`.
--
-- In local + in production, the Functions gateway (Kong) expects an `apikey` header,
-- even when `verify_jwt = false`. DB triggers typically don't have a user JWT,
-- so we supply the project's anon key from public.app_config:
--   key='edge_functions_anon_key' value='<SUPABASE_ANON_KEY>'
--
-- NOTE: This does not weaken security by itself:
-- - The anon key is not a secret (it is shipped to the frontend).
-- - The called function still enforces X-Internal-Secret via ensureInternalRequest().

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
  -- Never block signup due to network/email issues.
  begin
    -- 1) Base URL (per environment)
    select c.value into base_url
    from public.app_config c
    where c.key = 'edge_functions_base_url'
    limit 1;
  exception when others then
    base_url := null;
  end;

  base_url := coalesce(base_url, 'https://iabxchanerdkczbxyjgg.supabase.co');
  url := base_url || '/functions/v1/send-welcome-email';

  -- 2) Anon key for Kong gateway
  begin
    select c.value into anon_key
    from public.app_config c
    where c.key = 'edge_functions_anon_key'
    limit 1;
  exception when others then
    anon_key := null;
  end;

  -- 3) Internal secret header
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'INTERNAL_FUNCTION_SECRET'
    limit 1;
  exception when others then
    secret := null;
  end;

  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', coalesce(anon_key, ''),
        'X-Internal-Secret', coalesce(secret, '')
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
end;
$$;




