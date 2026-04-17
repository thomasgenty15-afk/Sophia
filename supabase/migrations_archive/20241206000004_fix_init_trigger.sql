-- CORRECTION: La Table Ronde ne doit pas être initialisée au début.
-- Elle ne s'ouvre qu'après la fin des 12 semaines.

create or replace function public.initialize_user_modules()
returns trigger
language plpgsql
security definer
as $$
begin
  -- 1. Insérer UNIQUEMENT le premier module Semaine (Semaine 1)
  insert into public.user_module_states (user_id, module_id, status, available_at)
  values (new.id, 'week_1', 'available', now())
  on conflict (user_id, module_id) do nothing;

  return new;
end;
$$;

-- Nettoyage pour les utilisateurs de test qui auraient reçu la table ronde par erreur
-- (Optionnel, mais propre pour le dev)
delete from public.user_module_states 
where module_id = 'round_table_1' 
and user_id in (
    select user_id from public.user_module_states where module_id = 'week_1' and status != 'completed'
);

