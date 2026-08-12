-- ===========================================================================
-- FF-059 LOT 3 — L'INTERRUPTEUR DE LA CIBLE, PORTE ⑤.
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md
--
-- POURQUOI UN SECOND BOOLÉEN, ET PAS `energy_display_enabled`
-- -----------------------------------------------------------
-- Parce que ce ne sont pas les mêmes objets, et que les confondre ferait du
-- second le prix du premier.
--
--   `energy_display_enabled` (porte ④) — « je veux savoir ce que pèse mon
--     dîner ». Un FAIT SUR LA NOURRITURE, calculé depuis des quantités que le
--     produit a écrites (MAPE 2,3 %).
--   `energy_target_enabled`  (porte ⑤) — « je veux qu'on estime ce que mon
--     corps devrait manger ». Un JUGEMENT SUR LA PERSONNE. C'est-à-dire un
--     tracker, et `coachStartingNumbers` refuse depuis toujours de le montrer
--     à un élève: « un chiffre affiché à l'élève devient un objectif ».
--
-- Un élève doit pouvoir accepter le premier sans hériter du second. Un
-- interrupteur unique lui retirerait ce choix — sur exactement la distinction
-- que ce chantier a passé sa vie à tenir.
--
-- CE QU'IL N'OUVRE PAS
-- --------------------
-- Rien, à lui seul. `canShowTarget` prend en entrée le RÉSULTAT de la chaîne
-- A/B: il n'existe aucun chemin vers une cible qui ne traverse pas d'abord le
-- plancher TCA, l'âge, la doctrine du coach et la porte ④. Mettre `true` ici
-- est une permission de plus à obtenir, jamais une dérogation.
--
-- LE DÉFAUT EST `false`, POUR UNE RAISON DE PLUS QUE LA PORTE ④
-- -------------------------------------------------------------
-- Les trois raisons de `20260812230000` valent ici (le plancher TCA est un
-- détecteur EN RETARD; le produit n'a jamais montré de chiffre; la métrique
-- doit mesurer la demande). Une quatrième leur est propre:
--
--   LA CIBLE EST LE NIVEAU QUE LA LITTÉRATURE MET EN CAUSE. Levinson 2017 ne
--   parle pas d'étiquettes de calories sur des plats: elle parle de TRACKERS,
--   c'est-à-dire très exactement d'un chiffre du jour comparé à un objectif.
--   C'est le niveau C, et c'est celui-ci. Il s'allume donc à la demande, et
--   jamais parce qu'on a allumé autre chose.
--
-- RÉVERSIBILITÉ — une ligne:
--   alter table public.profiles
--     alter column energy_target_enabled set default true;
-- ===========================================================================

begin;

alter table public.profiles
  add column if not exists energy_target_enabled boolean not null default false;

comment on column public.profiles.energy_target_enabled is
  'FF-059 porte ⑤ — l''élève accepte qu''on lui montre une FOURCHETTE de '
  'maintenance à côté du total de sa journée (niveau C). Distinct de '
  'energy_display_enabled (porte ④, les faits sur la nourriture): celui-ci est '
  'un jugement sur la personne, donc un tracker, donc il s''allume seul. '
  'N''ouvre rien à lui seul — canShowTarget exige d''abord toute la chaîne A/B. '
  'La fourchette est une MAINTENANCE (28-33 kcal/kg), jamais un déficit, et '
  'elle n''entre dans aucun générateur (FF-059 R6).';

commit;
