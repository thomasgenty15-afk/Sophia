-- Backfill / repair internal_admins for the master admin email.
-- This is needed if the master user existed before the lockdown trigger was added.

do $$
declare
  master_email text := 'thomasgenty15@gmail.com';
  master_id uuid;
begin
  -- Remove any non-master admin rows (safety).
  delete from public.internal_admins ia
  where exists (
    select 1 from auth.users u
    where u.id = ia.user_id
      and lower(u.email) <> master_email
  );

  -- Find master user id
  select u.id
    into master_id
  from auth.users u
  where lower(u.email) = master_email
  limit 1;

  if master_id is null then
    raise notice '[backfill_master_admin] master user not found in auth.users for email=%', master_email;
    return;
  end if;

  -- Ensure exactly one admin row for master.
  delete from public.internal_admins where user_id <> master_id;

  insert into public.internal_admins (user_id)
  values (master_id)
  on conflict (user_id) do nothing;

  raise notice '[backfill_master_admin] ensured internal_admins for master user_id=%', master_id;
end $$;


