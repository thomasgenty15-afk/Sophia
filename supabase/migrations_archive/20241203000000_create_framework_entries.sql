-- Table pour stocker les entrées des frameworks (Journaling, Exercices, etc.)
create table if not exists public.user_framework_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- Lien vers le plan et l'action spécifique (pour savoir de quel outil il s'agit)
  plan_id uuid references public.user_plans(id) on delete set null,
  action_id text not null, -- L'ID de l'action dans le JSON du plan (ex: 'a3')
  
  -- Méta-données pour le Grimoire (facilite le filtrage sans parser le JSON plan)
  framework_title text not null, -- Ex: "Journal de Gratitude"
  framework_type text not null, -- Ex: "gratitude", "shadow_work", "daily_planner"
  
  -- Le contenu rempli par l'utilisateur
  content jsonb not null default '{}'::jsonb, -- { "question_1": "Réponse...", "humeur": 5 }
  
  -- Snapshot du schéma pour pouvoir rejouer le framework plus tard
  schema_snapshot jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index pour récupérer rapidement l'historique d'un type de framework (Grimoire)
create index if not exists framework_entries_user_type_idx on public.user_framework_entries(user_id, framework_type);
create index if not exists framework_entries_plan_action_idx on public.user_framework_entries(plan_id, action_id);

-- RLS (Sécurité)
alter table public.user_framework_entries enable row level security;

create policy "Users can view their own framework entries"
  on public.user_framework_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own framework entries"
  on public.user_framework_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own framework entries"
  on public.user_framework_entries for update
  using (auth.uid() = user_id);

create policy "Users can delete their own framework entries"
  on public.user_framework_entries for delete
  using (auth.uid() = user_id);
