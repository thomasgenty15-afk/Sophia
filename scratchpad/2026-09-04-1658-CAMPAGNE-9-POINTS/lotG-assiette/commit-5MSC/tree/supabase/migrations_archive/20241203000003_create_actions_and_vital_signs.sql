-- Table pour le suivi granulaire des actions (Missions & Habitudes)
create table if not exists public.user_actions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- Liens contextuels
  plan_id uuid references public.user_plans(id) on delete cascade not null,
  submission_id uuid, -- Pour relier au cycle d'onboarding global
  
  -- Détails de l'action
  type text not null check (type in ('mission', 'habit')),
  title text, -- Titre court si dispo
  description text not null, -- Le contenu de l'action
  
  -- Suivi de la progression
  target_reps integer default 1, -- Combien de fois il faut le faire au total (ou null si infini)
  current_reps integer default 0, -- Combien de fois ça a été fait
  
  -- État du check quotidien
  -- Au lieu d'un booléen à reset chaque jour, on stocke la date.
  -- Si last_performed_at est aujourd'hui, c'est fait.
  last_performed_at timestamptz,
  
  -- Statut global de l'action
  status text default 'active' check (status in ('active', 'completed', 'cancelled')),
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table pour le suivi du Signe Vital (Métriques long terme)
create table if not exists public.user_vital_signs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- Origine (peut survivre au plan)
  plan_id uuid references public.user_plans(id) on delete set null,
  submission_id uuid,
  
  -- Définition
  label text not null, -- Ex: "Poids", "Heures de sommeil"
  target_value text, -- Ex: "70kg"
  current_value text, -- Ex: "75kg"
  unit text, -- Ex: "kg", "h", "pas"
  
  -- Suivi
  status text default 'active' check (status in ('active', 'monitoring', 'archived')),
  last_checked_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index pour les perfs (notamment pour l'affichage dashboard)
create index if not exists actions_user_plan_idx on public.user_actions(user_id, plan_id);
create index if not exists actions_status_idx on public.user_actions(status);
create index if not exists vital_signs_user_idx on public.user_vital_signs(user_id);

-- RLS (Sécurité)
alter table public.user_actions enable row level security;
alter table public.user_vital_signs enable row level security;

-- Policies user_actions
create policy "Users can view their own actions"
  on public.user_actions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own actions"
  on public.user_actions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own actions"
  on public.user_actions for update
  using (auth.uid() = user_id);

create policy "Users can delete their own actions"
  on public.user_actions for delete
  using (auth.uid() = user_id);

-- Policies user_vital_signs
create policy "Users can view their own vital signs"
  on public.user_vital_signs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own vital signs"
  on public.user_vital_signs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own vital signs"
  on public.user_vital_signs for update
  using (auth.uid() = user_id);

create policy "Users can delete their own vital signs"
  on public.user_vital_signs for delete
  using (auth.uid() = user_id);

