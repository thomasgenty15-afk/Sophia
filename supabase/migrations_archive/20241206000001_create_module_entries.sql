-- Table pour stocker les réponses et contenus des modules (Architecte)
-- Séparé des framework_entries (Actions) pour une meilleure distinction sémantique
create table if not exists public.user_module_entries (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    
    -- L'identifiant du module (ex: 'week_1', 'forge_deconstruction_2', 'round_table_5')
    module_id text not null,
    
    -- Le contenu des réponses de l'utilisateur pour ce module
    content jsonb not null default '{}'::jsonb,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Index pour retrouver rapidement les réponses d'un utilisateur pour un module donné
create index if not exists user_module_entries_user_module_idx on public.user_module_entries(user_id, module_id);

-- RLS (Sécurité)
alter table public.user_module_entries enable row level security;

create policy "Users can view their own module entries"
  on public.user_module_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own module entries"
  on public.user_module_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own module entries"
  on public.user_module_entries for update
  using (auth.uid() = user_id);

