-- ⟳ 2026-09-09 — LE BROUILLON GARDE AUSSI LE PLAN FINAL, tel que rendu.
--
-- Mesuré le soir même (`28-tir-edit.sh`, duo) : la fusion par cases était
-- juste — B identique au TEXTE SOURCE de A sur 11 plats — mais la réponse
-- rendue de A ne correspondait pas à son propre texte source : une relance
-- avait changé le plan en place sans que le texte suive (défaut du
-- générateur, préexistant). Le texte du modèle n'est donc PAS une base de
-- fusion fiable ; il reste le CONTEXTE donné au modèle (sa propre forme).
--
-- La base de fusion est le plan final (`GeneratedMeal`, sortie des
-- ceintures), rangé tel quel : ce que la personne a vu, octet pour octet.
alter table public.student_meal_drafts
  add column if not exists source_meal jsonb;

comment on column public.student_meal_drafts.source_meal is
  'Le plan final (GeneratedMeal, après ceintures) tel que rendu à l''écran — la BASE de `edit_cells`. `source_text` reste le contexte donné au modèle. NULL avant le 2026-09-09.';
