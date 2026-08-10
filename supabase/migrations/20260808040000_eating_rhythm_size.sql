-- ===========================================================================
-- LE RYTHME PORTE UNE TAILLE, PLUS UNE HEURE.
--
-- CE QUE L'HEURE FAISAIT, ET C'EST TOUT
-- -------------------------------------
-- `eating_rhythm[].at` (« 17:00 ») était lue à UN SEUL endroit du dépôt:
-- `rhythmLines`, dans `meal_generation.ts`, qui en faisait une parenthèse de
-- prose dans la consigne — `- afternoon snack (17:00)`. Elle ne gouvernait ni
-- le plafond de plats, ni le choix des créneaux, ni la composition. Une
-- question posée à chaque élève, un champ dans le jsonb, un format à valider,
-- pour une parenthèse que le modèle pouvait ignorer sans conséquence.
--
-- CE QUE LA TAILLE FAIT
-- ---------------------
-- « petit-déjeuner léger, gros dîner » et « trois repas égaux » ne se composent
-- PAS pareil, à rythme et objectif identiques. C'est la même case, au même
-- endroit de l'écran, qui rapporte quelque chose au générateur.
--
-- CE N'EST PAS UNE QUANTITÉ AU SENS DE CONTRACT.md
-- ------------------------------------------------
-- `small`/`medium`/`large` est RELATIF et sans unité: une préférence de
-- composition déclarée par l'élève, de la même famille que `cooking_time_min`
-- ou `budget_band`. Les règles de CONTRACT.md sur les quantités portent sur les
-- chiffres d'ÉNERGIE tirés de ce qui a été mangé (analyse de repas, photos, et
-- l'amendement du 2026-08-06 sur le chiffre nu). Autre couloir; rien ici n'y
-- touche, et cette colonne ne produit aucun chiffre.
--
-- LES LIGNES EXISTANTES NE SONT PAS MIGRÉES, ET C'EST DÉLIBÉRÉ
-- ------------------------------------------------------------
-- Des lignes portent encore `at`. `parseEatingRhythm` l'IGNORE et garde le
-- moment: le rythme survit, l'heure tombe. On ne la traduit pas en taille —
-- « 20:00 » ne dit pas si le dîner est gros, et deviner ici poserait une
-- contrainte que personne n'a exprimée. Un test nommé garde ce comportement
-- des deux côtés du jumeau (`eating_rhythm_test.ts`, `eatingRhythm.int.test.ts`):
-- rejeter l'entrée entière rendrait `[]`, donc le repli petit-déjeuner /
-- déjeuner / dîner — exactement le défaut qu'on vient de corriger, repris par
-- l'autre bout.
--
-- AUCUN CHECK SUR LA VALEUR, pour la même raison qu'à la création de la clé:
-- le parseur borne (liste fermée, ce qui n'est pas reconnu devient `null`), et
-- une contrainte SQL ferait échouer une écriture que le lecteur sait vraiment
-- réparer cette fois — c'est testé.
-- ===========================================================================

begin;

comment on column public.student_goals.practical_constraints is
  'Contraintes pratiques STRUCTURÉES, sur lesquelles le générateur branche '
  '(par opposition à `situation`, qu''il ne fait que lire). Clés connues: '
  'cooking_time_min, budget_band, eats_out_per_week, cook_days[], '
  'recipe_difficulty, variety, food_preferences[], et '
  'eating_rhythm[] = [{"slot":"breakfast"|"snack_am"|"lunch"|"snack_pm"'
  '|"dinner"|"before_bed", "size":"small"|"medium"|"large"|null}] — les moments '
  'où l''élève mange sur une journée normale, avec la taille du repas quand il '
  'l''a dite. La TAILLE EST FACULTATIVE: « je grignote l''après-midi » vaut sans '
  'savoir si c''est gros, et une taille inventée deviendrait une contrainte que '
  'personne n''a exprimée. La clé `at` (une heure) a porté ce champ jusqu''au '
  '2026-08-07; elle n''est plus écrite, et `parseEatingRhythm` l''ignore en '
  'gardant le moment. `no_cook_days[]` était annoncée ici sans avoir jamais eu '
  'ni lecteur ni écrivain — voir docs/fonctionnalites/composition-des-repas/'
  'FF-002-dire-son-absence.md.';

commit;
