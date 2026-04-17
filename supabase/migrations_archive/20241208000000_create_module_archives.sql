-- Table pour l'historique des modifications des modules
create table if not exists public.user_module_archives (
    id uuid default gen_random_uuid() primary key,
    
    -- Lien vers l'entrée originale (pour savoir de quel module on parle)
    entry_id uuid references public.user_module_entries(id) on delete cascade not null,
    
    user_id uuid references auth.users(id) on delete cascade not null,
    module_id text not null,
    
    -- Le contenu tel qu'il était AVANT la modification
    content jsonb not null,
    
    -- Date de l'archivage (qui correspond à la date de création de cette version passée)
    archived_at timestamptz default now()
);

-- Index pour récupérer l'historique rapidement
create index if not exists user_module_archives_entry_idx on public.user_module_archives(entry_id);
create index if not exists user_module_archives_user_module_idx on public.user_module_archives(user_id, module_id);

-- RLS (Sécurité)
alter table public.user_module_archives enable row level security;

create policy "Users can view their own module archives"
  on public.user_module_archives for select
  using (auth.uid() = user_id);

-- Fonction Trigger : Copie automatique lors d'un UPDATE
create or replace function public.handle_module_entry_archive()
returns trigger
language plpgsql
security definer
as $$
begin
  -- On insère l'ANCIENNE version (OLD) dans la table archives
  insert into public.user_module_archives (entry_id, user_id, module_id, content, archived_at)
  values (OLD.id, OLD.user_id, OLD.module_id, OLD.content, now());
  
  return NEW;
end;
$$;

-- Déclenchement du trigger
drop trigger if exists on_module_entry_update on public.user_module_entries;
create trigger on_module_entry_update
  after update on public.user_module_entries
  for each row
  execute procedure public.handle_module_entry_archive();

