create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  type text not null, -- ex: 'welcome', 'trial_warning_j_minus_1'
  status text not null default 'sent', -- 'sent', 'delivered', 'failed'
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Index pour requêter rapidement l'historique d'un user
create index communication_logs_user_id_idx on public.communication_logs(user_id);
create index communication_logs_type_idx on public.communication_logs(type);

-- RLS (Security)
alter table public.communication_logs enable row level security;

-- Seul le service role (nos Edge Functions) peut écrire. 
-- L'utilisateur peut lire ses propres logs s'il le souhaite (optionnel, mis à true ici pour debug facile)
create policy "Users can view their own logs"
  on public.communication_logs for select
  using (auth.uid() = user_id);

-- Fonction utilitaire pour logger facilement depuis une Edge Function (via RPC si besoin, ou direct insert)

