-- Avoid Edge 403 spam locally when INTERNAL_FUNCTION_SECRET is missing.
-- If Vault secret is not present, skip calling the protected Edge Function.

create or replace function public.handle_new_profile_welcome_email()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  url text;
  secret text;
begin
  -- Main safety block: ensure signup NEVER fails due to this trigger
  begin
    -- 1) Base URL from app_config (best-effort)
    begin
      select c.value into base_url
      from public.app_config c
      where c.key = 'edge_functions_base_url'
      limit 1;
    exception when others then
      base_url := null;
    end;

    -- 2) Fallback URL if config missing
    base_url := coalesce(base_url, 'https://iabxchanerdkczbxyjgg.supabase.co');
    url := base_url || '/functions/v1/send-welcome-email';

    -- 3) Vault secret (best-effort)
    begin
      select decrypted_secret into secret
      from vault.decrypted_secrets
      where name = 'INTERNAL_FUNCTION_SECRET'
      limit 1;
    exception when others then
      secret := null;
    end;

    -- If secret missing, skip calling protected Edge function (prevents 403 noise)
    if secret is null or length(trim(secret)) = 0 then
      raise notice 'Warning: INTERNAL_FUNCTION_SECRET missing; skipping welcome email edge call.';
      return new;
    end if;

    -- 4) Send request via pg_net
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Secret', secret
        ),
        body := jsonb_build_object(
          'record', row_to_json(new),
          'type', 'INSERT',
          'table', 'profiles'
        )
      );
  exception when others then
    -- Log error but DO NOT fail the transaction
    raise notice 'Warning: Welcome email trigger failed (ignored): %', SQLERRM;
  end;

  return new;
end;
$$;




