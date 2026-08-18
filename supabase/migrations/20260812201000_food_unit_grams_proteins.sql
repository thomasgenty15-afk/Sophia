-- FF-038 — LE POIDS D'UNE UNITÉ, SECOND LOT: LES PROTÉINES COMPTÉES À LA PIÈCE.
--
-- ── POURQUOI UN SECOND LOT ────────────────────────────────────────────────
-- Le premier (`20260812200000`) a donné un poids aux légumes et aux œufs. En
-- rejouant la mesure sur les 80 mêmes générations, un second rang est apparu
-- derrière eux — et il coûte beaucoup plus cher: « 2 filets de saumon », « 1
-- boîte de thon », « 2 cuisses de poulet », « 2 tranches de pain ».
--
-- Un légume non pesé retire 30 kcal d'une journée. Un filet de saumon non pesé
-- en retire 300 ET 30 g de protéine — c'est-à-dire un tiers du plancher
-- protéique d'une femme de 55 kg, disparu d'un plan qui se présente comme
-- lisible. C'est très probablement une partie de ce qu'on lisait comme « les
-- plans servent une fraction de leur enveloppe ».
--
-- ── CE QUI RESTE DEHORS, ET POURQUOI ──────────────────────────────────────
-- `melon` et `fruit` (l'entrée « fruit moyen ») restent sans poids: « 1 melon »
-- va de 400 g à 2 kg, et « 1 fruit » ne désigne aucun aliment. Un chiffre posé
-- au milieu de ces intervalles serait un nombre inventé.
--
-- Les poids sont des CALIBRES DE RAYON, pas des moyennes de recette: la boîte
-- de thon de 160 g s'égoutte à ~120 g, la mozzarella se vend en boule de 125 g,
-- la tranche de pain de mie fait 35 g.
--
-- REJOUABLE: des UPDATE à valeur littérale, sans condition d'état.

update food_composition_refs r
set unit_grams = v.g
from (values
  -- Poissons — le filet portion.
  ('salmon', 130.0),
  ('cod', 130.0),
  -- Conserves de poisson, poids ÉGOUTTÉ.
  ('tuna_tinned', 120.0),
  ('sardines', 90.0),
  -- Viandes — la pièce.
  ('chicken_thigh', 90.0),
  ('beef_steak', 150.0),
  -- Fromage — la boule vendue en rayon.
  ('mozzarella', 125.0),
  -- Pain — la tranche.
  ('bread', 35.0),
  -- Salade — « 1 salade » est un petit pied, pas un pied de marché. Lecture
  -- BASSE, à 15 kcal/100 g le coût d'une erreur est négligeable.
  ('lettuce', 100.0),
  -- Herbes — la branche. Négligeable en énergie, mais ça retire une ligne du
  -- seau des non-pesés, où elle ne renseignait rien.
  ('herbs_thyme', 1.0)
) as v(slug, g)
where r.slug = v.slug;

-- ── LA PREUVE ─────────────────────────────────────────────────────────────
-- Zéro ligne touchée se lit comme une migration qui a marché. On vérifie donc
-- que les plus coûteux — ceux qui portent de la protéine — sont bien servis.
do $$
declare
  manquants text;
begin
  select string_agg(slug, ', ' order by slug) into manquants
  from food_composition_refs
  where slug in ('salmon', 'cod', 'tuna_tinned', 'chicken_thigh', 'bread')
    and unit_grams is null;
  if manquants is not null then
    raise exception 'unit_grams absent après migration: %', manquants;
  end if;
end $$;
