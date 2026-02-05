-- Fix: is_verified_phone_in_use must also check whatsapp_opted_in = true.
-- Otherwise, a user can register with a phone number already used by an active WhatsApp account
-- (because the original backfill only set phone_verified_at for existing whatsapp_opted_in users,
-- but new opt-ins don't automatically set phone_verified_at).
--
-- Policy:
-- - A phone is "in use" if it belongs to a profile with phone_verified_at IS NOT NULL
--   OR whatsapp_opted_in = true.

-- 1) Update the RPC to include whatsapp_opted_in check
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
      and (p.phone_verified_at is not null or p.whatsapp_opted_in = true)
  );
$$;

-- 2) Backfill: ensure all whatsapp_opted_in profiles have phone_verified_at set
-- This makes the unique index profiles_phone_number_verified_unique protect them too.
update public.profiles
set phone_verified_at = coalesce(phone_verified_at, now())
where whatsapp_opted_in = true 
  and phone_number is not null 
  and phone_verified_at is null;

-- 3) Create a unique index that covers both cases (phone_verified_at OR whatsapp_opted_in)
-- This provides database-level protection in addition to the RPC check.
-- Note: We can't easily do OR in a partial index, so we rely on the backfill above
-- to ensure whatsapp_opted_in users always have phone_verified_at set.
-- But let's add a trigger to ensure this invariant is maintained going forward.

-- Trigger to auto-set phone_verified_at when whatsapp_opted_in becomes true
create or replace function public.sync_phone_verified_on_whatsapp_optin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- When whatsapp_opted_in becomes true, ensure phone_verified_at is set
  if new.whatsapp_opted_in = true and new.phone_number is not null and new.phone_verified_at is null then
    new.phone_verified_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_phone_verified_on_whatsapp_optin_trigger on public.profiles;
create trigger sync_phone_verified_on_whatsapp_optin_trigger
  before update on public.profiles
  for each row
  when (new.whatsapp_opted_in is distinct from old.whatsapp_opted_in)
  execute function public.sync_phone_verified_on_whatsapp_optin();

-- 4) Update handle_new_user() to reject signup if phone is already used by a WhatsApp-active account.
-- This is a defense-in-depth measure; the frontend should already check via is_verified_phone_in_use().
-- If someone bypasses the frontend, this trigger will still block the registration.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_phone text;
  v_existing_profile_id uuid;
begin
  -- Extract and normalize phone from metadata
  v_phone := nullif(coalesce(new.raw_user_meta_data->>'phone', new.phone, ''), '');

  -- Check if this phone is already used by a verified or WhatsApp-active profile
  if v_phone is not null then
    select p.id into v_existing_profile_id
    from public.profiles p
    where p.phone_number = v_phone
      and (p.phone_verified_at is not null or p.whatsapp_opted_in = true)
    limit 1;

    if v_existing_profile_id is not null then
      raise exception 'Ce numéro de téléphone est déjà utilisé par un autre compte.'
        using errcode = 'unique_violation';
    end if;
  end if;

  -- Insert the new profile
  insert into public.profiles (id, full_name, avatar_url, phone_number, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    v_phone,
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

