-- ===========================================================================
-- LA TAILLE DE L'ÉLÈVE — la mesure qui manquait aux quantités.
--
-- POURQUOI ELLE N'EXISTAIT PAS, ET CE QUE ÇA COÛTAIT
-- --------------------------------------------------
-- Le produit connaît le poids (`weekly_reviews`), le tour de taille, l'âge
-- (`profiles.birth_date`) et le sexe. Pas la taille. `CoachStudentPage` le dit
-- déjà en toutes lettres à propos de sa propre estimation: « height, age or
-- activity » n'entrent pas dans le calcul, « treat it as the bracket ».
--
-- Or deux personnes de même poids et de tailles différentes n'ont pas les mêmes
-- besoins, et surtout pas les mêmes PORTIONS — ce qui est précisément ce que ce
-- produit écrit. Sans la taille, la portion est posée sur le poids seul, et
-- l'écart se paie sur chaque assiette de chaque jour.
--
-- OÙ ELLE SE RANGE, ET POURQUOI PAS DANS `student_goals`
-- ------------------------------------------------------
-- `profiles`, à côté de `birth_date` et `gender`: c'est une propriété de la
-- PERSONNE, pas de ce qu'elle vise. Un élève qui change d'objectif ne change
-- pas de taille, et la ranger dans `student_goals` la ferait disparaître le
-- jour où cette ligne est refaite.
--
-- Elle n'est PAS dans `weekly_reviews` non plus, et c'est la même règle vue de
-- l'autre côté: `weekly_reviews` porte ce qui BOUGE d'une semaine à l'autre. La
-- taille d'un adulte ne bouge pas, et lui demander chaque dimanche serait une
-- question dont la réponse est toujours la même — la friction qui finit par
-- produire des réponses bâclées.
--
-- CE QUE LA COLONNE NE FAIT PAS
-- -----------------------------
-- Elle ne calcule aucun IMC et n'ouvre aucune mesure d'énergie. Le plancher de
-- `CONTRACT.md` s'applique tel quel, et l'assouplissement en cours
-- (`CALORIE_REVERSAL.md`) ne change rien ici: cette colonne est une entrée de
-- PORTION, pas un indicateur montré à l'élève.
-- ===========================================================================

begin;

alter table public.profiles
  add column if not exists height_cm numeric;

-- LES BORNES SONT LARGES ET EXISTENT QUAND MÊME. Elles n'attrapent pas une
-- erreur de 3 cm — elles attrapent le doigt qui glisse (« 17 » pour 170, ou une
-- taille tapée en mètres), qui donnerait une portion absurde sans que personne
-- ne voie d'où elle vient. Même posture que les bornes de poids et de tour de
-- taille, déjà en place sur `student_goals`.
alter table public.profiles
  drop constraint if exists profiles_height_cm_range_check;

alter table public.profiles
  add constraint profiles_height_cm_range_check
    check (height_cm is null or (height_cm >= 90 and height_cm <= 250));

comment on column public.profiles.height_cm is
  'Taille en centimètres, saisie par l''élève. Propriété de la PERSONNE, à côté '
  'de birth_date et gender — pas de `weekly_reviews`, qui porte ce qui bouge '
  'chaque semaine. Sert aux PORTIONS des repas composés; n''est jamais rendue '
  'comme un indicateur à l''élève et n''ouvre aucun calcul d''énergie '
  '(voir docs/keel/CONTRACT.md).';

commit;
