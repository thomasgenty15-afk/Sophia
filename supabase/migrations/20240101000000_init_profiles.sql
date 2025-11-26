-- 1. TABLE PROFILES
-- Stocke les infos publiques des utilisateurs (liée à auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  full_name text,
  avatar_url text
);

-- 2. SÉCURITÉ (RLS)
-- Active la sécurité niveau ligne
alter table public.profiles enable row level security;

-- Les utilisateurs peuvent voir leur propre profil
create policy "Users can view their own profile" 
  on profiles for select 
  using ( auth.uid() = id );

-- Les utilisateurs peuvent modifier leur propre profil
create policy "Users can update their own profile" 
  on profiles for update 
  using ( auth.uid() = id );

-- Les utilisateurs peuvent insérer leur propre profil (nécessaire si le trigger échoue ou pour insertion manuelle)
create policy "Users can insert their own profile" 
  on profiles for insert 
  with check ( auth.uid() = id );

-- 3. AUTOMATISATION (TRIGGER)
-- Crée automatiquement un profil quand un utilisateur s'inscrit
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- VERSION SIMPLIFIÉE : On n'utilise pas raw_user_metadata car la colonne manque en local
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    '', -- Nom vide par défaut
    ''  -- Avatar vide par défaut
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
