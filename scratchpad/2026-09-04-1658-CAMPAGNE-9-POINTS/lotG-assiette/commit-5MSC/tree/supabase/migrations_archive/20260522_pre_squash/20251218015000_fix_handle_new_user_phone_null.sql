-- Fix: phone_number is UNIQUE on profiles, so inserting '' for users without a phone
-- breaks after the first signup. Use NULL instead (multiple NULLs are allowed).

-- Normalize existing data (if any)
update public.profiles
set phone_number = null
where phone_number = '';

-- Ensure new signups don't insert empty-string phone numbers
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


