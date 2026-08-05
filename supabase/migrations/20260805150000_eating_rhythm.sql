-- ===========================================================================
-- LE RYTHME DE L'ÉLÈVE — à quels moments il mange, sur une journée normale.
--
-- LE DÉFAUT QUE ÇA CORRIGE, ET IL N'ÉTAIT PAS « ON NE DEMANDE PAS »
-- ----------------------------------------------------------------
-- `meal_generation.ts` imposait, en dur, à tout le monde: « every day of the
-- stretch needs breakfast, lunch and dinner ». Trois repas, pour chaque élève,
-- quelle que soit sa vie. Quelqu'un qui s'effondre à 17h n'avait aucun endroit
-- où le dire, et le moteur ne pouvait pas placer un moment là: le vocabulaire
-- des créneaux de repas n'avait qu'un seul jeton `snack`, donc 10h et 17h
-- étaient le même mot.
--
-- Deux transformations, et aucune n'invente de table.
--
-- 1. LE VOCABULAIRE DES CRÉNEAUX S'ALIGNE SUR CELUI QUI EXISTE DÉJÀ.
--    `slot_vocabulary` (les plans publiés) porte `snack_am`, `snack_pm`,
--    `before_bed` depuis toujours. Le moteur de repas en tenait un second, plus
--    pauvre, en parallèle. On ne crée pas un troisième vocabulaire: on adopte
--    celui du dépôt, en ne gardant que ce qui décrit un MOMENT DE FAIM
--    (`pre_workout`/`post_workout` sont des constructions d'entraînement).
--
--    `snack` reste ACCEPTÉ. Des lignes en portent déjà; le retirer ferait que
--    le parseur DROP ces plats à la relecture, et un plan composé hier
--    deviendrait un plan troué. Il n'est simplement plus proposé.
--
-- 2. LE RYTHME SE RANGE DANS `practical_constraints`, PAS DANS UNE COLONNE
--    NEUVE. Cette colonne existe depuis le premier jour du pivot, avec son
--    propre commentaire: « Séparées de la prose parce que le générateur BRANCHE
--    dessus, alors qu'il ne fait que lire `situation` ». C'est exactement ça.
--    Le trou n'était pas l'absence de colonne — c'est que `generate-meal-v1` ne
--    la sélectionnait pas.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LE CRÉNEAU DEMANDÉ ACCEPTE LES SIX MOMENTS
-- ---------------------------------------------------------------------------
-- Uniquement `meal_slot`, la colonne du créneau DEMANDÉ. Le créneau de chaque
-- plat vit dans le jsonb `dishes` et n'a jamais porté de CHECK — c'est le
-- parseur TypeScript qui le borne, et lui seul, ce qui est cohérent avec le
-- reste de cette table (`dishes` est validé en amont de l'INSERT, jamais par
-- la base).
alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_meal_slot_check;

alter table public.student_generated_meals
  add constraint student_generated_meals_meal_slot_check
    check (meal_slot is null or meal_slot in (
      'breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'before_bed',
      -- LEGACY, en lecture seule de fait: plus aucun écran ne le propose, mais
      -- les lignes déjà écrites le portent et doivent rester relisibles.
      'snack'
    ));

-- ---------------------------------------------------------------------------
-- 2. LA FORME DU RYTHME, GARDÉE À L'ÉCRITURE
-- ---------------------------------------------------------------------------
-- `practical_constraints` est un jsonb libre, et le rester: chaque contrainte
-- pratique y a sa clé, et leur imposer un schéma commun figerait la prochaine.
-- Ce qui est gardé ici est le MINIMUM qui rend la clé lisible sans deviner —
-- un tableau, ou rien. Le contenu de chaque entrée est validé par
-- `parseEatingRhythm`, qui écarte ce qu'il ne reconnaît pas plutôt que de le
-- deviner: un CHECK sur la forme des entrées ferait échouer une écriture que
-- le lecteur sait déjà réparer.
alter table public.student_goals
  drop constraint if exists student_goals_eating_rhythm_shape_check;

alter table public.student_goals
  add constraint student_goals_eating_rhythm_shape_check
    check (
      not (practical_constraints ? 'eating_rhythm')
      or jsonb_typeof(practical_constraints -> 'eating_rhythm') = 'array'
    );

comment on column public.student_goals.practical_constraints is
  'Contraintes pratiques STRUCTURÉES, sur lesquelles le générateur branche '
  '(par opposition à `situation`, qu''il ne fait que lire). Clés connues: '
  'cooking_time_min, budget_band, eats_out_per_week, no_cook_days[], et '
  'eating_rhythm[] = [{"slot":"breakfast"|"snack_am"|"lunch"|"snack_pm"'
  '|"dinner"|"before_bed", "at":"HH:MM"|null}] — les moments où l''élève mange '
  'sur une journée normale. L''heure est FACULTATIVE: « je grignote '
  'l''après-midi » vaut sans « à 17h », et une heure inventée deviendrait une '
  'contrainte que personne n''a exprimée.';

commit;

-- ===========================================================================
-- VÉRIFICATION — ce qui doit être vrai après cette migration
-- ===========================================================================
do $$
declare
  slot_check_src text;
begin
  select pg_get_constraintdef(oid) into slot_check_src
  from pg_constraint
  where conrelid = 'public.student_generated_meals'::regclass
    and conname = 'student_generated_meals_meal_slot_check';

  if slot_check_src is null then
    raise exception 'meal_slot check missing after migration';
  end if;
  if slot_check_src not like '%snack_pm%' then
    raise exception 'meal_slot check does not accept snack_pm: %', slot_check_src;
  end if;
  -- La faim de 17h est le cas qui a motivé le chantier: si elle ne passe pas,
  -- rien n'a été corrigé.
  if slot_check_src not like '%snack_am%' then
    raise exception 'meal_slot check does not accept snack_am: %', slot_check_src;
  end if;
  -- ... et l'ancien vocabulaire reste relisible.
  if slot_check_src not like '%''snack''%' then
    raise exception 'meal_slot check dropped legacy snack: %', slot_check_src;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_goals'::regclass
      and conname = 'student_goals_eating_rhythm_shape_check'
  ) then
    raise exception 'eating_rhythm shape check missing after migration';
  end if;
end $$;
