-- Repair signup profile creation after the schema squash.
--
-- The squashed schema kept public.handle_new_user() but did not recreate the
-- auth.users triggers that depend on it. That leaves newly confirmed users
-- without public.profiles rows, which makes whatsapp-optin fail with
-- "Profile not found".

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_existing_profile_id uuid;
  v_timezone text;
  v_locale text;
  v_tz_follow_device boolean;
begin
  v_phone := nullif(coalesce(new.raw_user_meta_data->>'phone', new.phone, ''), '');
  v_timezone := nullif(coalesce(new.raw_user_meta_data->>'timezone', ''), '');
  v_locale := coalesce(nullif(coalesce(new.raw_user_meta_data->>'locale', ''), ''), 'fr-FR');
  v_tz_follow_device := lower(coalesce(new.raw_user_meta_data->>'tz_follow_device', '')) in
    ('t', 'true', '1', 'yes', 'y', 'on');

  -- Defense in depth: do not let a bypassed frontend signup attach to a phone
  -- already verified or WhatsApp-active on another profile.
  if v_phone is not null then
    select p.id into v_existing_profile_id
    from public.profiles p
    where p.phone_number = v_phone
      and p.id <> new.id
      and (p.phone_verified_at is not null or p.whatsapp_opted_in = true)
    limit 1;

    if v_existing_profile_id is not null then
      raise exception 'Ce numéro de téléphone est déjà utilisé par un autre compte.'
        using errcode = 'unique_violation';
    end if;
  end if;

  insert into public.profiles (
    id,
    full_name,
    avatar_url,
    phone_number,
    email,
    timezone,
    locale,
    tz_follow_device
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    v_phone,
    new.email,
    v_timezone,
    v_locale,
    v_tz_follow_device
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    phone_number = excluded.phone_number,
    email = excluded.email,
    timezone = coalesce(public.profiles.timezone, excluded.timezone),
    locale = coalesce(public.profiles.locale, excluded.locale),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_confirmed_send_onboarding on auth.users;
create trigger on_auth_user_email_confirmed_send_onboarding
  after insert or update on auth.users
  for each row
  execute function public.handle_user_email_confirmed_onboarding();

-- Onboarding messages should be sent after email confirmation via auth.users,
-- not on profile insert.
drop trigger if exists on_profile_created_send_welcome on public.profiles;

-- Repair users created while the auth.users -> profiles trigger was missing.
-- This is intentionally narrow: only auth users without a profile are inserted,
-- and users whose phone is already verified/WhatsApp-active elsewhere are
-- skipped so the repaired state matches handle_new_user's guard.
insert into public.profiles (
  id,
  full_name,
  avatar_url,
  phone_number,
  email,
  timezone,
  locale,
  tz_follow_device
)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  coalesce(u.raw_user_meta_data->>'avatar_url', ''),
  nullif(coalesce(u.raw_user_meta_data->>'phone', u.phone, ''), ''),
  u.email,
  nullif(coalesce(u.raw_user_meta_data->>'timezone', ''), ''),
  coalesce(nullif(coalesce(u.raw_user_meta_data->>'locale', ''), ''), 'fr-FR'),
  lower(coalesce(u.raw_user_meta_data->>'tz_follow_device', '')) in
    ('t', 'true', '1', 'yes', 'y', 'on')
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
)
and not exists (
  select 1
  from public.profiles p2
  where p2.phone_number = nullif(coalesce(u.raw_user_meta_data->>'phone', u.phone, ''), '')
    and p2.id <> u.id
    and (p2.phone_verified_at is not null or p2.whatsapp_opted_in = true)
);
