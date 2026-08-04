-- W2.A — Désactivation des surfaces legacy (KEEL).
--
-- Doctrine: on DÉSACTIVE avant de supprimer. Cette migration ne DROP aucune
-- table, aucune colonne et aucune fonction: elle coupe uniquement les deux
-- déclencheurs automatiques qui font vivre l'Architecte et les revues de
-- niveau. Le code des edge functions correspondantes reste en place (W2.B), et
-- les tables restent intactes (W2.C).
--
-- Réversibilité: recréer les triggers depuis leurs migrations d'origine et
-- re-planifier les deux jobs cron.
--
-- Contenu:
--   1. cron.unschedule de 'trigger-level-review-transitions-v1' et
--      'cleanup-architect-draft-scopes'.
--   2. DROP des 8 triggers Architecte / modules / niveaux. Le plus urgent est
--      `on_profile_created_init_modules`: il seede le parcours identitaire FR
--      (user_week_states + user_module_state_entries) à CHAQUE signup, y
--      compris pour un élève KEEL qui n'en verra jamais la surface.
--
-- Noms vérifiés en base locale avant écriture:
--   select tgname, relname from pg_trigger t
--     join pg_class c on c.oid = t.tgrelid where not tgisinternal;

-- 1. Jobs cron ---------------------------------------------------------------

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in (
      -- Revues de niveau: la machine de transition de niveau part avec le
      -- legacy (generate-next-level-v1 / complete-level-v1, W2.B).
      'trigger-level-review-transitions-v1',
      -- Nettoyage des scopes de brouillon de l'Architecte: sans Architecte,
      -- ce balayage n'a plus d'objet.
      'cleanup-architect-draft-scopes'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

-- 2. Triggers Architecte / modules / niveaux ---------------------------------

-- Seede le parcours identitaire FR à chaque création de profil.
drop trigger if exists on_profile_created_init_modules on public.profiles;

-- Progression identitaire pilotée par l'état hebdomadaire legacy.
drop trigger if exists on_week_completed_identity on public.user_week_states;
drop trigger if exists on_week12_manual_unlock on public.user_week_states;

-- Mémoire et déblocages pilotés par les entrées de modules.
drop trigger if exists on_module_created_memory
  on public.user_module_state_entries;
drop trigger if exists on_module_updated_memory
  on public.user_module_state_entries;
drop trigger if exists on_module_entry_update
  on public.user_module_state_entries;
drop trigger if exists on_module_activity_unlock
  on public.user_module_state_entries;
drop trigger if exists on_forge_level_progression
  on public.user_module_state_entries;
