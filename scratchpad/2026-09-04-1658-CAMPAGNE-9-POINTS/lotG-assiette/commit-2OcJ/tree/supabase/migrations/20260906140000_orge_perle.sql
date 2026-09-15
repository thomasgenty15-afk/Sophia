-- ⟳ 2026-09-06 — « orge perlé » : trois bacs communs du quatre (tir 13:53) illisibles
-- parce que la forme française qualifiée n'atteint pas `barley` (« orge » nu et
-- « pearl barley » l'atteignent déjà). Alias vers la ligne existante, rien de créé.
begin;
insert into public.food_composition_aliases (alias, slug, note) values
  ('orge perle', 'barley', '2026-09-06: " pearl barley " et " orge " atteignent déjà la ligne (orge cru sec, 346 kcal) ; la forme française qualifiée non.'),
  ('orge perlee', 'barley', '2026-09-06: variante orthographique de la forme ci-dessus.'),
  ('orge perlee seche', 'barley', '2026-09-06: vu sur M05 (05/09) ; la ligne EST l''orge sec.')
on conflict (alias) do nothing;
commit;
