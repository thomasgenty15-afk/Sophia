-- Lock internal_admins to a single master admin email (no other admins allowed).
-- Master admin email: thomasgenty15@gmail.com

create or replace function public.enforce_single_master_admin()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  u_email text;
  others integer;
begin
  select lower(email)
    into u_email
  from auth.users
  where id = new.user_id;

  if u_email is null then
    raise exception 'internal_admins: user email not found';
  end if;

  if u_email <> 'thomasgenty15@gmail.com' then
    raise exception 'internal_admins: only master admin email is allowed';
  end if;

  select count(*) into others
  from public.internal_admins
  where user_id <> new.user_id;

  if others > 0 then
    raise exception 'internal_admins: only one admin row is allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_single_master_admin_trg on public.internal_admins;
create trigger enforce_single_master_admin_trg
before insert or update
on public.internal_admins
for each row
execute function public.enforce_single_master_admin();

-- Auto-add master admin on profile creation (when auth user is created).
create or replace function public.maybe_add_master_admin_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  u_email text;
begin
  select lower(email)
    into u_email
  from auth.users
  where id = new.id;

  if u_email = 'thomasgenty15@gmail.com' then
    insert into public.internal_admins (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_created_master_admin on public.profiles;
create trigger on_profile_created_master_admin
after insert
on public.profiles
for each row
execute function public.maybe_add_master_admin_from_profile();


