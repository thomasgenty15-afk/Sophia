
alter table public.profiles
add column phone_number text unique;

-- Index pour rechercher rapidement par numéro (très important pour le webhook WhatsApp)
create index profiles_phone_number_idx on public.profiles (phone_number);

-- Mise à jour de la fonction handle_new_user pour récupérer le téléphone depuis les métadonnées
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, phone_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    -- On essaie de récupérer le téléphone soit des metadata (si inscrit via formulaire custom)
    -- soit de auth.users.phone (si inscrit via OTP téléphone, même si on utilise email ici)
    coalesce(new.raw_user_meta_data->>'phone', new.phone, '')
  );
  return new;
end;
$$;

