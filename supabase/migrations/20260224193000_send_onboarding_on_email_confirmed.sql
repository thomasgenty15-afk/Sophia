-- Send onboarding communications when email is actually confirmed.
-- This avoids sending welcome/WhatsApp too early for double opt-in flows.

create or replace function public.handle_user_email_confirmed_onboarding()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  anon_key text;
  secret text;
  welcome_url text;
  wa_optin_url text;
begin
  -- React only when email is confirmed:
  -- - INSERT with email_confirmed_at already set
  -- - UPDATE where email_confirmed_at transitions null -> non-null
  if tg_op not in ('INSERT', 'UPDATE') then
    return new;
  end if;

  if new.email_confirmed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;

  -- Base URL + headers for Edge function gateway.
  begin
    select value into base_url
    from public.app_config
    where key = 'edge_functions_base_url'
    limit 1;
  exception when others then
    base_url := null;
  end;
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');

  begin
    select value into anon_key
    from public.app_config
    where key = 'edge_functions_anon_key'
    limit 1;
  exception when others then
    anon_key := null;
  end;

  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'INTERNAL_FUNCTION_SECRET'
    limit 1;
  exception when others then
    secret := null;
  end;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice 'edge_functions_anon_key missing; skipping email-confirmed onboarding dispatch.';
    return new;
  end if;

  if secret is null or length(trim(secret)) = 0 then
    raise notice 'INTERNAL_FUNCTION_SECRET missing; skipping email-confirmed onboarding dispatch.';
    return new;
  end if;

  welcome_url := base_url || '/functions/v1/send-welcome-email';
  wa_optin_url := base_url || '/functions/v1/whatsapp-optin';

  -- Best effort only: never block auth update.
  begin
    perform net.http_post(
      url := welcome_url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret
      ),
      body := jsonb_build_object(
        'record', jsonb_build_object(
          'id', new.id,
          'email', new.email,
          'full_name', coalesce(new.raw_user_meta_data->>'full_name', '')
        ),
        'type', 'UPDATE',
        'table', 'auth.users',
        'reason', 'email_confirmed'
      )
    );
  exception when others then
    raise notice 'Warning: send-welcome-email dispatch failed (ignored): %', SQLERRM;
  end;

  begin
    perform net.http_post(
      url := wa_optin_url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret
      ),
      body := jsonb_build_object(
        'user_id', new.id,
        'reason', 'email_confirmed'
      )
    );
  exception when others then
    raise notice 'Warning: whatsapp-optin dispatch failed (ignored): %', SQLERRM;
  end;

  return new;
exception when others then
  raise notice 'Warning: email-confirmed onboarding trigger failed (ignored): %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed_send_onboarding on auth.users;
create trigger on_auth_user_email_confirmed_send_onboarding
  after insert or update on auth.users
  for each row
  execute function public.handle_user_email_confirmed_onboarding();

-- Disable legacy "welcome on profile insert" trigger: onboarding comms are now sent
-- only once email is confirmed on auth.users.
drop trigger if exists on_profile_created_send_welcome on public.profiles;

