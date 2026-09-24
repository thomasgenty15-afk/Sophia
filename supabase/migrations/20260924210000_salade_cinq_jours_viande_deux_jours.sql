-- ══════════════════════════════════════════════════════════════════════════
-- ⟳ 2026-09-24 — DEUX FENÊTRES CRUES CORRIGÉES, sur un plan réel
-- ══════════════════════════════════════════════════════════════════════════
--
-- Brouillon `59b06fd6` (foyer de trois, jeudi 24 → lundi 28) :
--
--   · LA LAITUE : trois jours de fenêtre. Mangée jeudi et lundi, elle a été
--     achetée deux fois — jeudi, et vendredi pour lundi : une course pour une
--     salade seule, le lendemain de la grosse. Décision de l'utilisateur : une
--     salade se garde cinq jours au frigo.
--
--   · LE PORC : « filet de porc », identifié `pork_filet_mignon`, groupe
--     `red_meat`, trois jours de fenêtre — acheté jeudi, cuit dimanche.
--     Décision de l'utilisateur : trop long pour une viande crue, dangereux.
--     `red_meat` passe à deux jours, comme `poultry` et `lean_protein`.
--
-- ⚠️ LA FENÊTRE EST PAR GROUPE, pas par aliment : la première vaut pour toutes
-- les feuilles (laitues, épinards, roquette, mâche, cresson, blettes, herbes
-- fraîches), la seconde pour toute viande en pièce (porc, bœuf, agneau…).
--
-- ⛔ MIROIR : `RAW_WINDOW_DAYS` (`fridge_window.ts`) porte les mêmes nombres,
-- épinglés un par un par `fridge_window_test.ts`.

update public.food_groups set raw_window_days = 5 where slug = 'leafy_greens';
update public.food_groups set raw_window_days = 2 where slug = 'red_meat';
