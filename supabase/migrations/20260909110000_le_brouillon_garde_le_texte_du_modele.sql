-- ⟳ 2026-09-09 — LE BROUILLON GARDE LE TEXTE DU MODÈLE, pour être REPRIS.
--
-- La chirurgie locale (`operation: "edit_cells"`) repart d'un plan : elle
-- donne au modèle le plan de départ, ne prend de sa réponse que les cases
-- demandées, et recopie le reste octet pour octet. Pour cela il lui faut le
-- plan de départ dans la forme que le parseur sait relire — le texte rendu
-- par le modèle (après relances acceptées), pas la réponse rendue à l'écran,
-- ni le `write_payload` (une forme d'écriture, pas de lecture).
--
-- ⚠️ NULL SUR LES LIGNES D'AVANT CE LOT : un brouillon sans texte ne peut pas
-- être repris localement, et la fonction le dit (`draft_has_no_source`) au
-- lieu de recomposer en silence.
alter table public.student_meal_drafts
  add column if not exists source_text text;

comment on column public.student_meal_drafts.source_text is
  'Le texte rendu par le modèle pour ce brouillon (relances acceptées comprises) — ce que `edit_cells` relit pour repartir de ce plan. NULL avant le 2026-09-09.';
