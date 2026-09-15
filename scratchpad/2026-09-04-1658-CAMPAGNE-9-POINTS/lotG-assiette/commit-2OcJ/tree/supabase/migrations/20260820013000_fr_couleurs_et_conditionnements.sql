-- Chantier grammage — les derniers termes français mesurés sur des RUNS RÉELS.
--
-- ⛔ POURQUOI DES ALIAS ET PAS UNE RÈGLE SUR LES COULEURS. « oignon jaune » est
-- un oignon, mais « haricots blancs » (87,5 kcal) et « haricots rouges » (108)
-- sont DEUX aliments différents, et « poivron rouge » / « poivron vert » aussi
-- selon les référentiels. Retirer la couleur comme classe fusionnerait des
-- lignes distinctes — le mode d'échec que ce chantier passe son temps à éviter.
-- On écrit donc les cas sûrs à la main, un par un.

insert into public.food_composition_aliases (alias, slug) values
  ('oignon jaune', 'onion'),
  ('oignons jaunes', 'onion'),
  ('oignon blanc', 'onion'),
  ('oignons blancs', 'onion'),
  ('oignon rouge', 'red_onion'),
  ('oignons rouges', 'red_onion')
on conflict (alias) do nothing;
