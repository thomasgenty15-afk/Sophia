-- Chantier grammage — dernier terme mesuré sur un run réel du 2026-08-20.
-- `semoule` résout déjà vers `couscous`; `semoule de couscous` non, parce que
-- « de » n'est pas un milieu coupable (voir `MEDIUM_PREPOSITIONS`: couper sur
-- « de » nu rendrait des têtes arbitraires sur tout le français).
insert into public.food_composition_aliases (alias, slug) values
  ('semoule de couscous', 'couscous'),
  ('semoule de couscous seche', 'couscous'),
  ('graine de couscous', 'couscous')
on conflict (alias) do nothing;
