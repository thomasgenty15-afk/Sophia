-- ══════════════════════════════════════════════════════════════════════════
-- LES ALIAS FRANÇAIS QUE LA RÉDUCTION NE PEUT PAS ATTEINDRE
-- ══════════════════════════════════════════════════════════════════════════
--
-- Chantier grammage, mesuré sur un RUN RÉEL du foyer `5600347f` le 2026-08-20:
-- le produit compose en FRANÇAIS et le référentiel est anglais-d'abord. Sept
-- plats sur neuf n'avaient aucune énergie, donc aucun ancrage, donc des
-- grammes identiques pour deux corps différents.
--
-- La moitié du trou est réparée dans `food_composition.ts` (symétrie du
-- vocabulaire de modificateurs, et un pluriel français ÉTROIT). Ce qui reste
-- est ce que la réduction ne peut pas atteindre sans devenir dangereuse —
-- écrit à la main, une entrée à la fois, avec la raison.
--
-- ⛔ AUCUNE LIGNE DE RÉFÉRENTIEL N'EST CRÉÉE ICI. Que des alias vers des lignes
-- existantes: aucun nombre nutritionnel n'est inventé.

insert into public.food_composition_aliases (alias, slug) values
  -- `abricot` n'existe qu'en formes qualifiées (`abricot denoyaute cru`,
  -- `abricots secs`). Le terme NU n'atteint rien, et le pluriel étroit ne fait
  -- que rendre `abricot`, qui n'est pas plus un alias que `abricots`.
  -- ⚠️ Vers le FRAIS (`apricot_pitted`, 45,9 kcal) et non vers le SEC
  -- (`dried_apricot`): un abricot sec pèse cinq fois plus au 100 g, et c'est
  -- le piège que le lot 0-B a documenté sur `plums` -> `prune`.
  ('abricot', 'apricot_pitted'),
  ('abricots', 'apricot_pitted'),

  -- Le pluriel français ne repasse PLUS par le retrait des modificateurs
  -- (`food_composition.ts`: la composition des deux réductions atteignait les
  -- lignes de moyenne du référentiel). `tortilla de ble complet` résout donc,
  -- son pluriel non: il s'écrit ici.
  ('tortillas de ble complet', 'tortilla_wrap'),
  ('tortillas de ble', 'tortilla_wrap'),
  ('tortillas', 'tortilla_wrap'),

  -- Vus dans les mêmes générations, même famille, même raison.
  ('cuisses de poulet desossees', 'chicken_thigh'),
  ('hauts de cuisse de poulet', 'chicken_thigh'),
  ('semoule complete', 'couscous'),
  ('semoule de ble', 'couscous')
on conflict (alias) do nothing;
