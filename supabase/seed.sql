-- Seed file for local development.
-- This repo's local config (`supabase/config.toml`) references `./seed.sql`.
-- Keep it empty (or add deterministic test fixtures later) so `supabase db reset` is stable.

-- Local master admin seed (idempotent).
-- Creates:
-- - auth user: thomasgenty15@gmail.com
-- - profile row (public.profiles)
-- - internal admin row (public.internal_admins)
--
-- Password (local only): 123456
do $$
declare
  master_email text := 'thomasgenty15@gmail.com';
  master_password text := '123456';
  master_id uuid;
  inst_id uuid;
begin
  -- If user already exists, ensure admin + profile are consistent.
  select id into master_id from auth.users where lower(email) = lower(master_email) limit 1;

  if master_id is null then
    -- Find an auth instance id (Supabase local has at least 1).
    if to_regclass('auth.instances') is not null then
      select id into inst_id from auth.instances limit 1;
    end if;
    -- Local Supabase Auth uses a fixed instance_id (see users created via /auth/v1/signup).
    if inst_id is null then
      inst_id := '00000000-0000-0000-0000-000000000000'::uuid;
    end if;

    master_id := gen_random_uuid();

    -- Create auth user (email/password) with confirmed email.
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      master_id,
      inst_id,
      'authenticated',
      'authenticated',
      master_email,
      crypt(master_password, gen_salt('bf', 10)),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','Master Admin','phone','+33600000000'),
      now(),
      now()
    );

    -- Some GoTrue/Supabase Auth versions require confirmed_at (not just email_confirmed_at).
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = 'confirmed_at'
    ) then
      -- Some versions restrict updates to DEFAULT only.
      execute 'update auth.users set confirmed_at = default where id = $1 and confirmed_at is null' using master_id;
    end if;

    -- Best-effort: mark phone confirmed if column exists (prevents some edge cases).
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = 'phone_confirmed_at'
    ) then
      execute 'update auth.users set phone_confirmed_at = now() where id = $1 and phone_confirmed_at is null' using master_id;
    end if;

    -- Create identity row if the table exists (Supabase Auth uses it).
    if to_regclass('auth.identities') is not null then
      -- Note: Supabase Auth expects provider_id NOT NULL (often = email for provider 'email').
      insert into auth.identities (
        id,
        user_id,
        provider,
        provider_id,
        identity_data,
        created_at,
        updated_at
      ) values (
        gen_random_uuid(),
        master_id,
        'email',
        master_email,
        jsonb_build_object('sub', master_id::text, 'email', master_email, 'provider', 'email'),
        now(),
        now()
      )
      on conflict do nothing;
    end if;
  end if;

  -- Ensure auth user fields match GoTrue expectations (idempotent).
  -- Some auth versions rely on instance_id for lookups; also ensure bcrypt cost ~10.
  update auth.users
  set
    instance_id = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
    encrypted_password = crypt(master_password, gen_salt('bf', 10)),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    reauthentication_token = coalesce(reauthentication_token, ''),
    is_sso_user = false,
    is_anonymous = false,
    updated_at = now()
  where id = master_id;

  -- Ensure profile exists/updated
  insert into public.profiles (id, full_name, onboarding_completed)
  values (master_id, 'Master Admin', true)
  on conflict (id) do update set
    full_name = excluded.full_name,
    onboarding_completed = excluded.onboarding_completed,
    updated_at = now();

  -- Ensure master is internal admin (trigger enforces email + singleton)
  insert into public.internal_admins (user_id)
  values (master_id)
  on conflict (user_id) do nothing;
end $$;


