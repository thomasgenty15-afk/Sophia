
-- Ajout de la colonne email
alter table public.profiles
add column email text;

-- Mise à jour de la fonction handle_new_user pour inclure l'email
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
    coalesce(new.raw_user_meta_data->>'phone', new.phone, ''),
    new.email -- On récupère l'email directement depuis l'objet user (auth.users)
  );
  return new;
end;
$$;

-- Trigger pour garder l'email à jour si l'utilisateur le change dans auth.users
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set email = new.email,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_updated_email
  after update of email on auth.users
  for each row execute procedure public.handle_user_email_update();

