-- Table pour suivre l'état d'avancement des modules (Semaines, Forge, Tables Rondes)
create table if not exists public.user_module_states (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    
    -- L'identifiant du module défini dans le code (ex: 'week_1', 'forge_deconstruction_2')
    module_id text not null,
    
    -- État du module
    -- 'available' : Le module est visible (mais peut être bloqué par le temps si available_at > now())
    -- 'completed' : Le module est terminé
    status text not null check (status in ('available', 'completed')),
    
    -- Date à partir de laquelle le module est accessible / jouable
    -- Si available_at > now(), c'est un compte à rebours
    available_at timestamptz not null default now(),
    
    -- Date de complétion réelle
    completed_at timestamptz,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    -- Contrainte d'unicité : un utilisateur ne peut avoir qu'une seule entrée par module
    unique(user_id, module_id)
);

-- Index pour les requêtes fréquentes
create index if not exists user_module_states_user_idx on public.user_module_states(user_id);
create index if not exists user_module_states_user_module_idx on public.user_module_states(user_id, module_id);

-- RLS (Sécurité)
alter table public.user_module_states enable row level security;

create policy "Users can view their own module states"
  on public.user_module_states for select
  using (auth.uid() = user_id);

create policy "Users can update their own module states" -- Nécessaire pour marquer comme completed
  on public.user_module_states for update
  using (auth.uid() = user_id);

create policy "Users can insert their own module states" -- Nécessaire pour les triggers ou API
  on public.user_module_states for insert
  with check (auth.uid() = user_id);

