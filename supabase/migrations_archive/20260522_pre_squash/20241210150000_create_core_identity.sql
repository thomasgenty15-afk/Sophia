
-- 1. Table Active : L'identité fondamentale (12 lignes max par user, une par semaine/axe)
create table if not exists public.user_core_identity (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    week_id text not null, -- ex: 'week_1', 'week_2'
    content text not null, -- Le résumé de 5 lignes
    last_updated_at timestamp with time zone default now(),
    
    -- Unicité : Une seule identité par semaine pour un utilisateur
    unique(user_id, week_id)
);

-- 2. Table Archive : Historique des modifications
create table if not exists public.user_core_identity_archive (
    id uuid default gen_random_uuid() primary key,
    identity_id uuid references public.user_core_identity(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    week_id text not null,
    content text not null,
    archived_at timestamp with time zone default now(),
    reason text -- 'creation' ou 'update_forge'
);

-- 3. RLS (Sécurité)
alter table public.user_core_identity enable row level security;
alter table public.user_core_identity_archive enable row level security;

create policy "Users can view their own identity" on public.user_core_identity for select using (auth.uid() = user_id);
create policy "Users can view their own identity archive" on public.user_core_identity_archive for select using (auth.uid() = user_id);
-- Les inserts/updates se feront via Service Role (Edge Function), donc pas besoin de policies permissives d'écriture pour l'user direct.

-- 4. Index
create index if not exists idx_core_identity_user on public.user_core_identity(user_id);
create index if not exists idx_core_identity_archive_parent on public.user_core_identity_archive(identity_id);

