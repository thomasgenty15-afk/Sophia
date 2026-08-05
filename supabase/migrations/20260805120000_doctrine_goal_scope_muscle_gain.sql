-- ============================================================================
-- LE SIXIÈME OBJECTIF — ce que le lot doctrine-by-goal doit en faire
-- ============================================================================
-- `muscle_gain` est apparu dans `GOAL_TOKENS` (`_shared/keel/tokens.ts`).
--
-- CE QUE CETTE MIGRATION FAIT, ET SURTOUT CE QU'ELLE NE FAIT PAS
-- --------------------------------------------------------------
-- Elle étend les TROIS contraintes posées par
-- `20260805110000_doctrine_by_goal.sql`, et rien d'autre.
--
-- Elle ne touche PAS `student_goals.goal`, ni les `goal_scope` de
-- `coach_food_rules` / `coach_timing_rules`: ces trois-là appartiennent au lot
-- qui introduit l'objectif, parce que les étendre revient à décider qu'un élève
-- peut le déclarer et qu'un coach peut y adosser une règle — deux décisions de
-- produit qui ne sont pas celles de ce lot-ci.
--
-- POURQUOI ELLE EST NÉCESSAIRE MALGRÉ TOUT, ET TOUT DE SUITE
-- ----------------------------------------------------------
-- `compileAllDoctrineVariants` compile UNE variante par jeton de `GOAL_TOKENS`,
-- plus la `default`. Le jeton ajouté fait donc passer la publication de six à
-- sept lignes, et la septième — `goal = 'muscle_gain'` — serait REFUSÉE par le
-- CHECK de `coach_doctrine_compilations`. Autrement dit: sans cette migration,
-- publier une doctrine échoue pour TOUS les coachs, pour un objectif qu'aucun
-- élève ne peut encore déclarer.
--
-- C'est le coût d'un vocabulaire recopié dans un CHECK — un CHECK ne peut pas
-- lire une table, donc la liste est forcément dupliquée, donc elle doit être
-- rattrapée à chaque ajout. Le rattrapage est trivial; l'oublier ne l'est pas.
--
-- Ajouter une valeur à un CHECK ne peut invalider aucune ligne existante: la
-- migration est non cassante par construction, et la validation le prouve à
-- l'application.

create or replace function public.keel_doctrine_goal_scope_ok(entries jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when entries is null or jsonb_typeof(entries) <> 'array' then true
    else not exists (
      select 1
      from jsonb_array_elements(entries) as e
      where jsonb_typeof(e) = 'object'
        and e ? 'goal_scope'
        and (
          jsonb_typeof(e->'goal_scope') <> 'array'
          or exists (
            select 1
            from jsonb_array_elements_text(e->'goal_scope') as g
            where g not in (
              'fat_loss', 'muscle_gain', 'recomposition',
              'performance', 'health', 'maintenance'
            )
          )
        )
    )
  end;
$$;

-- Les deux CHECK de `coach_doctrines` appellent la fonction ci-dessus: la
-- remplacer suffit, il n'y a rien à recréer. On les revalide quand même, pour
-- que l'application de cette migration soit la preuve que les doctrines déjà
-- écrites passent toujours — plutôt que de l'espérer.
alter table public.coach_doctrines
  validate constraint coach_doctrines_beliefs_goal_scope_check;
alter table public.coach_doctrines
  validate constraint coach_doctrines_arbitrations_goal_scope_check;

-- La clé de variante, elle, est un CHECK littéral sur la colonne.
alter table public.coach_doctrine_compilations
  drop constraint if exists coach_doctrine_compilations_goal_check;
alter table public.coach_doctrine_compilations
  add constraint coach_doctrine_compilations_goal_check
  check (goal in (
    'default', 'fat_loss', 'muscle_gain', 'recomposition',
    'performance', 'health', 'maintenance'
  ));
