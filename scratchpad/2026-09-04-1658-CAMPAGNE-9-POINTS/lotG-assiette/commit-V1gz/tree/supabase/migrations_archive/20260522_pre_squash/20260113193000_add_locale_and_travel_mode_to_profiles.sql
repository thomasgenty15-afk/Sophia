-- Add locale + travel mode (follow device timezone) to profiles.
-- We already have `profiles.timezone` (IANA name) via 20251215190000_add_profile_timezone.sql.

alter table public.profiles
  add column if not exists locale text not null default 'fr-FR';

alter table public.profiles
  add column if not exists tz_follow_device boolean not null default false;

-- Ensure new signups can set these values from auth.user metadata (idempotent).
-- IMPORTANT: do not overwrite user-chosen tz_follow_device on conflict (keep existing value).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta_timezone text;
  meta_locale text;
  meta_follow boolean;
begin
  meta_timezone := nullif(coalesce(new.raw_user_meta_data->>'timezone', ''), '');
  meta_locale := coalesce(nullif(coalesce(new.raw_user_meta_data->>'locale', ''), ''), 'fr-FR');
  meta_follow := lower(coalesce(new.raw_user_meta_data->>'tz_follow_device', '')) in ('t','true','1','yes','y','on');

  insert into public.profiles (id, full_name, avatar_url, phone_number, email, timezone, locale, tz_follow_device)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(coalesce(new.raw_user_meta_data->>'phone', new.phone, ''), ''),
    new.email,
    meta_timezone,
    meta_locale,
    meta_follow
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    phone_number = excluded.phone_number,
    email = excluded.email,
    -- If timezone was never set, allow backfill from metadata; otherwise keep the user's preference.
    timezone = coalesce(profiles.timezone, excluded.timezone),
    -- locale has a default and is currently locked to fr-FR; keep existing (non-destructive).
    locale = coalesce(profiles.locale, excluded.locale),
    updated_at = now();

  return new;
end;
$$;



