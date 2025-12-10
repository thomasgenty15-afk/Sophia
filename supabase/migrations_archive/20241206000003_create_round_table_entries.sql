-- Table spécifique pour les réponses de la Table Ronde (Structure rigide pour analyse Data)
create table if not exists public.user_round_table_entries (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    
    -- Lien avec le système de modules (ex: 'round_table_1')
    module_id text not null,
    
    -- 1. Check-in Énergétique (Slider 0-100)
    energy_level integer check (energy_level >= 0 and energy_level <= 100),
    
    -- 2. La Revue des Faits
    wins_3 text, -- Stocké en texte multiligne ou JSON array selon le besoin front
    main_blocker text,
    
    -- 3. Alignement Identitaire (Non / Moyen / Oui)
    identity_alignment text check (identity_alignment in ('non', 'moyen', 'oui')),
    
    -- 4. L'Intention (Le Cap)
    week_intention text,

    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    -- Un utilisateur ne remplit qu'une fois une table ronde spécifique
    unique(user_id, module_id)
);

-- Index
create index if not exists user_round_table_entries_user_idx on public.user_round_table_entries(user_id);

-- RLS
alter table public.user_round_table_entries enable row level security;

create policy "Users can view their own round table entries"
  on public.user_round_table_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own round table entries"
  on public.user_round_table_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own round table entries"
  on public.user_round_table_entries for update
  using (auth.uid() = user_id);

