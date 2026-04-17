-- Fonction pour initialiser les modules d'un nouvel utilisateur
create or replace function public.initialize_user_modules()
returns trigger
language plpgsql
security definer
as $$
begin
  -- 1. Insérer UNIQUEMENT le premier module Semaine (Semaine 1)
  -- La Table Ronde et la Forge se débloqueront plus tard (après la Semaine 12)
  insert into public.user_module_states (user_id, module_id, status, available_at)
  values (new.id, 'week_1', 'available', now())
  on conflict (user_id, module_id) do nothing;

  return new;
end;
$$;

-- Trigger qui se déclenche à la création d'un profil
create trigger on_profile_created_init_modules
  after insert on public.profiles
  for each row execute procedure public.initialize_user_modules();

-- RATTRAPAGE POUR LES UTILISATEURS EXISTANTS (DEV ONLY)
-- On insère week_1 pour tous ceux qui ne l'ont pas
insert into public.user_module_states (user_id, module_id, status, available_at)
select id, 'week_1', 'available', now()
from auth.users
where not exists (
    select 1 from public.user_module_states 
    where user_id = auth.users.id and module_id = 'week_1'
);

-- Note: On ne rattrape PAS la Table Ronde ici, car elle se débloque organiquement plus tard.
