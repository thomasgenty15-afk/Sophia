-- ══════════════════════════════════════════════════════════════════════════
-- ⟳ 2026-09-24 — LES QUENELLES DE POISSON SONT DU POISSON
-- ══════════════════════════════════════════════════════════════════════════
--
-- Relu sur un plan réel (brouillon `97567be2`) : « galette de poisson »
-- rattachée à `fish_quenelle`, rangée en `red_meat` — donc deux jours de
-- fenêtre crue au lieu d'un, et comptée comme viande rouge. Une relecture de
-- toute la base (libellés de poisson et de fruits de mer dans les groupes de
-- viande, et l'inverse) n'a trouvé que ces deux lignes.
--
--   · `fish_quenelle` (« Fish quenelle, raw ») : du poisson cru, à pocher.
--   · `fish_quenelle_sauce` (« Fish quenelle, in sauce ») : un plat déjà
--     cuisiné, à réchauffer — il ne fond plus à la cuisson (`neutral`), et ne
--     doit pas être pris pour du poisson cru que personne ne cuit
--     (`raw_protein_cooking.ts`).

update public.food_composition_refs
   set food_group_ref = 'white_fish', yield_class = 'fish_shrinks'
 where slug = 'fish_quenelle';

update public.food_composition_refs
   set food_group_ref = 'white_fish', yield_class = 'neutral'
 where slug = 'fish_quenelle_sauce';
