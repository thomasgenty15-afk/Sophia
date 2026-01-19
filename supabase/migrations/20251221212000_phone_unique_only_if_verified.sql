-- Phone numbers should only be unique once they are "validated".
-- This prevents hard signup failures when a user mistypes someone else's phone number.
--
-- Policy:
-- - Multiple profiles can temporarily share the same phone_number while NOT validated.
-- - Once validated (phone_verified_at IS NOT NULL), the phone_number must be unique.
--
-- Also adds an RPC for the frontend to show a friendly message BEFORE signup.

-- 1) Add validation marker
alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

-- 2) Remove global uniqueness (created by `phone_number text unique`)
alter table public.profiles
  drop constraint if exists profiles_phone_number_key;

-- 3) Enforce uniqueness only for validated phones
drop index if exists public.profiles_phone_number_verified_unique;
create unique index profiles_phone_number_verified_unique
  on public.profiles (phone_number)
  where phone_verified_at is not null and phone_number is not null;

-- 4) Backfill: WhatsApp opted-in users are considered validated (safe because phone was previously globally unique)
update public.profiles
set phone_verified_at = coalesce(phone_verified_at, now())
where whatsapp_opted_in is true and phone_number is not null;

-- 5) Ensure new users don't insert empty-string phone numbers (avoid uniqueness edge cases)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, phone_number, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(coalesce(new.raw_user_meta_data->>'phone', new.phone, ''), ''),
    new.email
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    phone_number = excluded.phone_number,
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

-- 6) RPC: check if a phone is already taken by a validated profile (returns boolean only)
create or replace function public.is_verified_phone_in_use(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.phone_number = p_phone
      and p.phone_verified_at is not null
  );
$$;

grant execute on function public.is_verified_phone_in_use(text) to anon, authenticated;




