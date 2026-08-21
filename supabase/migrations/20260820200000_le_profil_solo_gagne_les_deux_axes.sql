-- KEEL — ② LES DEUX AXES ARRIVENT SUR `profiles` (2026-08-20, soir).
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ CE QUE CETTE MIGRATION EMPÊCHE, ET C'EST UNE RÉGRESSION SILENCIEUSE
-- ══════════════════════════════════════════════════════════════════════════
--
-- L'entonnoir remplace ce soir sa question d'activité à QUATRE crans mélangés
-- (`own_activity_level`) par les DEUX AXES journée x sport. Cette question-là
-- écrivait `profiles.activity_level`, et `profiles.activity_level` a deux
-- lecteurs vivants qui n'ont rien à voir avec le foyer:
--
--   · `meal-energy-v1`      -> `maintenanceRange`, la fourchette de l'écran
--   · `generate-meal-v1`    -> `envelopeFor`, la lane individuelle
--
-- Retirer la question sans poser les colonnes ferait retomber TOUT NOUVEL
-- INSCRIT sur l'hypothèse 1,5 pour ces deux chemins — sans qu'une ligne de
-- code change, sans qu'un test rougisse, et sans que personne le voie. C'est
-- la forme la plus chère du « lecteur sans écrivain » de ce dépôt: ici
-- l'écrivain disparaît et le lecteur continue de rendre un nombre.
--
-- ⛔ ET ON NE DÉRIVE PAS `activity_level` DES DEUX AXES. Le croisement rend un
-- PAL; remonter de ce PAL au cran le plus proche fabriquerait une déclaration
-- que personne n'a faite, dans une colonne que d'autres écrans montrent. La
-- colonne d'avant reste, intacte, comme repli nommé pour qui l'a déjà remplie
-- (`activityFactorOf`, source `legacy`).

alter table public.profiles
  add column if not exists day_activity text,
  add column if not exists sport_frequency text,
  add column if not exists activity_axes_asked_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_day_activity_check;
alter table public.profiles
  add constraint profiles_day_activity_check
  check (day_activity is null or day_activity in ('seated', 'on_feet', 'physical_job'));

alter table public.profiles
  drop constraint if exists profiles_sport_frequency_check;
alter table public.profiles
  add constraint profiles_sport_frequency_check
  check (sport_frequency is null
    or sport_frequency in ('none', '1_2', '3_4', '5_plus'));

comment on column public.profiles.day_activity is
  '② (2026-08-20) — le PREMIER axe: ce que la journée fait faire au corps, '
  'SPORT EXCLU. Jumeau de `household_member_bodies.day_activity`, pour la lane '
  'SOLO (`generate-meal-v1`, `meal-energy-v1`), qui lit `profiles` et jamais '
  'les corps du foyer. ⛔ Il ne remplace pas `activity_level`, il le précède: '
  'le cran mélangé reste le repli nommé de qui n''a répondu qu''à lui.';
comment on column public.profiles.sport_frequency is
  '② (2026-08-20) — le SECOND axe: séances par semaine, journée exclue. '
  '`none` est une RÉPONSE, `null` veut dire « pas répondu ».';
comment on column public.profiles.activity_axes_asked_at is
  'QUAND un écran portant les deux questions a enregistré ce profil. Sépare '
  '« pas posé » de « pas répondu » — deux nombres pour trois états est le zéro '
  'ambigu que ce chantier paie en boucle.';
