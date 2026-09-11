-- ============================================================================
-- LE THYM SÉCHÉ N'EST PAS UNE FEUILLE FRAÎCHE — 2026-09-09.
--
-- ⛔ LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL (brouillon du 2026-09-08)
-- ------------------------------------------------------------------
-- « romarin, 1 petit pot » — un pot d'herbe SÉCHÉE, en rayon épicerie — se
-- résolvait par l'alias `romarin` sur le slug `herbs_thyme`, dont la fiche est
-- CIQUAL 11038 « Thym, séché » (285 kcal/100 g: c'est bien du sec), mais dont le
-- groupe était `leafy_greens`. Conséquences, toutes mesurées:
--   · la fenêtre crue lui donnait TROIS jours (`RAW_WINDOW_DAYS.leafy_greens`),
--     donc « ce qui se cuisine dimanche s'achète au plus près » sortait pour
--     des pommes de terre au romarin;
--   · le compteur `raw_keeping_needs_later_shop` le comptait en brèche
--     (2/8 préparations, dont une pour ce seul pot);
--   · une doctrine « feuilles vertes encouragées » l'aurait compté.
--
-- ⛔ CE QUE CETTE MIGRATION TOUCHE, ET RIEN D'AUTRE
-- ------------------------------------------------
-- `food_composition_refs.food_group_ref`, sur DEUX slugs nommés: `herbs_thyme`
-- (thym, romarin) et `herbs_bay_leaf` (laurier) — les deux herbes du référentiel
-- qui se vendent et s'emploient SÉCHÉES. Le groupe d'arrivée est celui que
-- `dried_herbs` (herbes de Provence), `cumin` et `paprika` portent déjà:
-- `sauce_dressing`, fenêtre crue 21 jours (« ne contraint rien »).
--
-- Ni `energy_kcal`, ni les macros, ni un alias, ni `herbs_parsley`,
-- `herbs_basil`, `herbs_mint`, `herbs_coriander`, `herbs_chives`, `herbs_dill`
-- — celles-là sont FRAÎCHES au référentiel (« Persil, frais »), et une feuille
-- fraîche tient trois jours: leur groupe est juste.
--
-- ⚠️ LES LIGNES DE COURSES DÉJÀ ÉCRITES GARDENT LEUR `food_group` (il est
-- persisté sur la ligne, jamais relu depuis le référentiel): aucune ligne
-- existante ne bouge, seuls les plans composés après ce fichier changent.
-- ============================================================================

update public.food_composition_refs
   set food_group_ref = 'sauce_dressing'
 where slug in ('herbs_thyme', 'herbs_bay_leaf')
   and food_group_ref = 'leafy_greens';

-- ── CONTRÔLE: les deux slugs existent et portent le groupe attendu ──────────
do $$
declare
  n integer;
begin
  select count(*) into n
    from public.food_composition_refs
   where slug in ('herbs_thyme', 'herbs_bay_leaf')
     and food_group_ref = 'sauce_dressing';
  if n <> 2 then
    raise exception 'herbs_thyme / herbs_bay_leaf: attendu 2 lignes en sauce_dressing, trouvé %', n;
  end if;
end $$;
