-- ============================================================================
-- FF-043 · LE MEMBRE DE RÉFÉRENCE DU FOYER
--
-- Fiche: docs/fonctionnalites/le-foyer/FF-043-la-resolution-foyer.md
-- Design d'origine: scratchpad/DESIGN-UNITES-DE-COMPOSITION.md §4.1 point 2
--
-- POURQUOI CETTE COLONNE EXISTE, ET POURQUOI ELLE EST DÉCLARÉE
-- -------------------------------------------------------------
-- La doctrine du tronc doit venir de QUELQU'UN. Les deux façons de le choisir
-- sans le demander ont été essayées sur le papier et écartées:
--
--   * PAR MÉTRIQUE (le plus lourd, le plus âgé) — c'est dériver une décision
--     sociale d'une donnée de santé;
--   * PAR ORDRE D'OBJECTIFS (déterministe et documenté) — combiné à la
--     citation de la doctrine du référent dans le plan, ça rend **l'objectif
--     le plus bas du foyer lisible par tous à table**. Le plan lui-même
--     devient le canal de divulgation.
--
-- Elle est donc DÉCLARÉE. Et quand elle ne l'est pas, le défaut est **le
-- membre qui compose la session** — pas une dérivation: composer est un geste
-- visible de tous, donc aucune information cachée ne fuit.
--
-- CE QUE LA BASE NE GARANTIT PAS, ET QUI EST DANS LE CODE
-- -------------------------------------------------------
-- Qu'un mineur ne soit pas référent. La FK ne peut pas l'exprimer — `age_state`
-- est dérivé de `birth_date` à la lecture, pas stocké — et un CHECK qui le
-- figerait deviendrait faux le jour de l'anniversaire de quelqu'un.
-- `referenceMemberId` (`household_composition.ts`) filtre les mineurs à
-- CHAQUE résolution, ce qui est la seule façon d'avoir raison à toutes les
-- dates.
--
-- `on delete set null`: un membre qui quitte le foyer ne doit pas emporter la
-- ligne du foyer avec lui. Le défaut (le compositeur) reprend la main.
-- ============================================================================

alter table public.households
  add column if not exists reference_member_id uuid;

alter table public.households
  drop constraint if exists households_reference_member_fk;
alter table public.households
  add constraint households_reference_member_fk
  foreign key (reference_member_id)
  references public.household_members(member_id)
  on delete set null;

comment on column public.households.reference_member_id is
  'FF-043: la bouche dont la doctrine gouverne le TRONC commun. DÉCLARÉE, '
  'jamais dérivée d''une métrique ni d''un ordre d''objectifs — dériver la '
  'rendrait l''objectif le plus bas du foyer lisible par tout le monde à '
  'table. NULL = le membre qui compose la session. Un mineur n''est jamais '
  'référent, et c''est le code qui le tient (age_state est dérivé, pas '
  'stocké).';
