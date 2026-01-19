-- Fix: Wrap entire welcome email logic in a BEGIN/EXCEPTION block
-- to prevent signup failures if app_config or vault are missing/erroring.

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
    
    -- 1. Try to get base_url from app_config (if table exists)
    begin
        select c.value into base_url
        from public.app_config c
        where c.key = 'edge_functions_base_url'
        limit 1;
    exception when others then
        -- Table might not exist or other error
        base_url := null;
    end;

    -- 2. Fallback URL if config missing
    base_url := coalesce(base_url, 'https://iabxchanerdkczbxyjgg.supabase.co');
    url := base_url || '/functions/v1/send-welcome-email';

    -- 3. Try to get secret from vault (if extension/table exists)
    begin
        select decrypted_secret into secret 
        from vault.decrypted_secrets 
        where name = 'INTERNAL_FUNCTION_SECRET' 
        limit 1;
    exception when others then
        -- Vault might not be enabled
        secret := null;
    end;

    -- 4. Send request via pg_net (if extension enabled)
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Secret', coalesce(secret, '')
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



