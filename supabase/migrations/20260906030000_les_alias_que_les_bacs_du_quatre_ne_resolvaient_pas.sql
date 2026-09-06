-- ══════════════════════════════════════════════════════════════════════════
-- LES ALIAS QUE LES BACS DU QUATRE NE RÉSOLVAIENT PAS — 2026-09-06
-- ══════════════════════════════════════════════════════════════════════════
--
-- Mesuré sur les tirs du 2026-09-06 (foyer de quatre, C03 02:10 ; duo D01 ;
-- solo C01) : « galettes complètes » ne résout pas, donc la casserole
-- `prep_galettes_sun` n'a ni énergie ni densité, donc deux bacs communs sur
-- seize rendent `dish_incomplete` et ne sont pas dimensionnés (`pot_incomplete
-- 2`). Les autres termes ci-dessous reviennent d'un tir à l'autre (« curry en
-- poudre » ×3 sur C01, « moutarde de dijon », « jus de citron vert »,
-- « vinaigre de cidre ») et rongent la couverture sans qu'aucun plat ne tombe.
--
-- ⛔ AUCUNE LIGNE DE RÉFÉRENTIEL N'EST CRÉÉE ICI. Que des alias vers des lignes
-- existantes, chacun vers la ligne que la forme voisine atteint déjà (le
-- patron de `20260822113000_lot19b_les_alias_verifies.sql`).
-- ⚠️ Les alias sont écrits SANS accent : `normalizeTerm` les déplie à la lecture.
-- ⚠️ « raviolis frais » n'a AUCUNE ligne dans le référentiel : rien à aliaser,
-- et inventer une densité serait le piège que ce dépôt refuse.
begin;

insert into public.food_composition_aliases (alias, slug, note) values
  -- `galette de ble` atteint déjà `tortilla_wrap` ; la forme « complète » du
  -- modèle vise la ligne complète, qui existe (`tortilla_wholemeal`, 290 kcal).
  ('galette complete', 'tortilla_wholemeal', '2026-09-06: la forme que le modèle écrit pour la galette de blé complet ; " galette de ble " atteint déjà la ligne blanche.'),
  ('galettes completes', 'tortilla_wholemeal', '2026-09-06: pluriel de la forme ci-dessus.'),
  ('galette de ble complet', 'tortilla_wholemeal', '2026-09-06: forme longue ; " tortilla de ble complet " atteint déjà la ligne.'),
  ('galettes de ble complet', 'tortilla_wholemeal', '2026-09-06: pluriel de la forme longue (vu sur C03 02:10).'),
  ('galette complete de ble', 'tortilla_wholemeal', '2026-09-06: ordre des mots inversé, même chose.'),
  -- `curry powder` atteint déjà `curry_paste` (choix du dépôt) ; sa traduction non.
  ('curry en poudre', 'curry_paste', '2026-09-06: " curry powder " atteint déjà la ligne ; trois fois sur C01 sans résoudre.'),
  -- `moutarde` atteint `mustard` ; la forme qualifiée retombait sur rien.
  ('moutarde de dijon', 'mustard', '2026-09-06: " moutarde " atteint déjà la ligne ; le qualificatif ne change pas la ligne.'),
  -- `jus de citron` → `lemon` et `lime juice` → `lime` existent ; pas la forme française du citron vert.
  ('jus de citron vert', 'lime', '2026-09-06: " lime juice " atteint déjà la ligne ; " citron vert " aussi.'),
  -- `vinegar` est la seule ligne de vinaigre ; le balsamique (plus sucré) n''y est PAS envoyé.
  ('vinaigre de cidre', 'vinegar', '2026-09-06: la seule ligne de vinaigre du référentiel ; ~20 kcal, aucun enjeu de densité.'),
  ('vinaigre de vin', 'vinegar', '2026-09-06: idem.'),
  -- `chicken` (nu) atteint `chicken_breast` ; la forme française nue non.
  ('poulet', 'chicken_breast', '2026-09-06: " chicken " nu atteint déjà " chicken_breast " ; le modèle écrit " poulet " nu dans les items de boîte.')
on conflict (alias) do nothing;

commit;
