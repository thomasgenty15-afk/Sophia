-- 2026-09-22 — « lait d'avoine » et « graines » n'avaient AUCUN alias : un aliment
-- VOULU (préférence gardée) ne se résolvait pas, donc ne pouvait pas être épinglé
-- dans le catalogue envoyé au modèle (`pinned_unresolved`). Mesuré : « mets des
-- bols de flocons d'avoine avec du lait d'avoine et des graines » ⇒ lait de soja.
-- `amendes` est la faute la plus courante pour « amandes », écrite telle quelle
-- dans une note de retour.
insert into public.food_composition_aliases (alias, slug, note) values
  ('lait d''avoine', 'oat_milk', '2026-09-22: boisson d''avoine, dite « lait » dans la langue courante'),
  ('lait d avoine', 'oat_milk', '2026-09-22: sans apostrophe'),
  ('lait davoine', 'oat_milk', '2026-09-22: collé'),
  ('boisson d''avoine', 'oat_milk', '2026-09-22: le nom réglementaire'),
  ('boisson vegetale d''avoine', 'oat_milk', '2026-09-22: forme longue'),
  ('boisson végétale d''avoine', 'oat_milk', '2026-09-22: forme longue, accentuée'),
  ('oat milk', 'oat_milk', '2026-09-22: anglais courant'),
  ('oat drink', 'oat_milk', '2026-09-22: anglais réglementaire'),
  ('graines', 'mixed_seeds', '2026-09-22: « des graines » sans précision = un mélange de graines'),
  ('amendes', 'almonds', '2026-09-22: faute courante pour amandes, écrite telle quelle dans une note')
on conflict (alias) do nothing;
