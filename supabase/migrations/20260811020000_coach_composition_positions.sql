-- ============================================================================
-- FF-041 · LES POSITIONS DU COACH — sa feuille de réponses, pas la forme compilée
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-041-la-methode-du-coach-executable.md
--
-- POURQUOI DEUX COLONNES ET PAS UNE
-- ---------------------------------
-- `composition_steering` est la forme COMPILÉE — des jetons, lus par le moteur,
-- que le coach ne voit jamais. Celle-ci est ce que le coach A RÉPONDU: des clés
-- de position, dans le vocabulaire du débat.
--
-- Les fondre reviendrait à re-dériver les réponses depuis les jetons pour
-- réafficher l'écran. Ce serait un DÉCOMPILATEUR, et il serait faux dès que
-- deux positions produisent le même jeton — ce qui arrive déjà (« nutrients
-- first » et « satiety first » posent tous deux `protein` en priorité
-- secondaire). Le coach rouvrirait son écran et n'y retrouverait pas sa
-- réponse.
--
-- C'est la même séparation que `belief_key`: la conviction citable et le jeton
-- exécutable vivent côte à côte et pointent l'un vers l'autre, plutôt que l'un
-- de se déduire de l'autre.
--
-- FORME: un objet `{ fork_key: position_key }`, pas un tableau. Une réponse par
-- débat, et la clé du débat porte l'unicité — un tableau autoriserait deux
-- réponses au même débat, ce que l'écran ne peut pas rendre.
-- ============================================================================

alter table public.coach_doctrines
  add column if not exists composition_positions jsonb not null default '{}'::jsonb;

alter table public.coach_doctrines
  drop constraint if exists coach_doctrines_composition_positions_is_object;
alter table public.coach_doctrines
  add constraint coach_doctrines_composition_positions_is_object
  check (jsonb_typeof(composition_positions) = 'object');

comment on column public.coach_doctrines.composition_positions is
  'FF-041: ce que le coach a RÉPONDU aux débats de composition, sous la forme '
  '{fork_key: position_key}. Distincte de composition_steering, qui en est la '
  'forme compilée: re-dériver les réponses depuis les jetons serait un '
  'décompilateur, et il serait faux dès que deux positions produisent le même '
  'jeton.';
