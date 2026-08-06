-- ===========================================================================
-- CE QUE L'ÉLÈVE A ENVIE DE MANGER — pour CETTE composition.
--
-- POURQUOI UNE COLONNE ET PAS `practical_constraints.food_preferences`
-- -------------------------------------------------------------------
-- Ce sont deux choses différentes, et les confondre casserait la première.
--
--   `practical_constraints.food_preferences`  — ce que l'élève a dit de sa
--     bouffe EN CONVERSATION, extrait par le memorizer, proposé sur un écran,
--     confirmé par lui. « Je déteste le brocoli. » C'est DURABLE, ça se retire
--     quand la mémoire le dément, et ça vaut pour toutes ses semaines.
--
--   `student_generated_meals.preferences`  — ce dont il a envie MAINTENANT,
--     tapé dans le formulaire au moment de générer. « Mezze d'été cette
--     semaine, plein de carottes. » C'est DATÉ: ça vaut pour cette composition
--     et pas pour la suivante.
--
-- Écrire l'envie du moment dans la liste durable la polluerait pour toujours —
-- « mezze d'été » reviendrait en février, sans que personne comprenne d'où ça
-- sort ni comment l'enlever. C'est exactement la distinction que le prompt fait
-- déjà entre `situation` (stable) et `context` (daté), et cette colonne est le
-- pendant de `context` sur l'axe du GOÛT plutôt que de la contrainte.
-- ===========================================================================

begin;

alter table public.student_generated_meals
  add column if not exists preferences text;

-- Même plafond que `context`, et pour la même raison: ce champ part dans un
-- prompt, donc c'est une surface de coût autant que de contenu.
alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_preferences_len_check;

alter table public.student_generated_meals
  add constraint student_generated_meals_preferences_len_check
    check (preferences is null or length(preferences) <= 2000);

comment on column public.student_generated_meals.preferences is
  'Ce dont l''élève a envie POUR CETTE composition, en prose libre, tapé au '
  'moment de générer (« mezze d''été, plein de carottes »). DATÉ, comme '
  '`context`, et à ne pas confondre avec '
  '`student_goals.practical_constraints.food_preferences`, qui est ce qu''il a '
  'dit de sa bouffe en conversation et qui vaut pour toutes ses semaines. '
  'Le modèle le lit; le code ne branche jamais dessus.';

commit;

-- ===========================================================================
-- VÉRIFICATION
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_generated_meals'
      and column_name = 'preferences'
  ) then
    raise exception 'preferences column missing after migration';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_generated_meals'::regclass
      and conname = 'student_generated_meals_preferences_len_check'
  ) then
    raise exception 'preferences length check missing after migration';
  end if;

  -- La colonne DURABLE n'a pas bougé: ce chantier ajoute un axe, il n'en
  -- remplace aucun.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_goals'
      and column_name = 'practical_constraints'
  ) then
    raise exception 'practical_constraints disappeared — wrong migration ran';
  end if;
end $$;
