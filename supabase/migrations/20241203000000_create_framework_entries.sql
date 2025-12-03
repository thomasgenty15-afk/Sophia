-- Table pour stocker les entrées/réponses aux frameworks (outils d'écriture)
create table if not exists user_framework_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  
  -- Identifiant du type de framework (ex: 'gratitude_journal', 'deuil_letter')
  -- Permet de les regrouper dans le Grimoire plus tard
  framework_id text not null, 
  
  -- Titre au moment de la création (ex: "Journal de Gratitude")
  title text,
  
  -- Les réponses de l'utilisateur (JSON)
  -- Ex: { "q1": "Je suis reconnaissant pour...", "q2": "..." }
  content jsonb default '{}'::jsonb,
  
  -- Snapshot de la structure au moment de la réponse (pour l'historique si l'IA change le format plus tard)
  schema_snapshot jsonb,
  
  -- Lien optionnel vers le plan ou l'action qui a déclenché ça
  plan_id uuid references user_plans(id),
  action_id text, -- ID de l'action dans le JSON du plan
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table user_framework_entries enable row level security;

create policy "Users can insert their own entries"
  on user_framework_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own entries"
  on user_framework_entries for select
  using (auth.uid() = user_id);

create policy "Users can update their own entries"
  on user_framework_entries for update
  using (auth.uid() = user_id);

