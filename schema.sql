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

-- 3. AUTOMATISATION (TRIGGER)
-- Crée automatiquement un profil quand un utilisateur s'inscrit
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_metadata->>'full_name', ''), -- Gère le cas où le nom est vide
    coalesce(new.raw_user_metadata->>'avatar_url', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

