-- FF-038 — LE POIDS D'UNE UNITÉ, POUR LES ALIMENTS QU'UNE RECETTE COMPTE.
--
-- ── LE DÉFAUT MESURÉ (2026-08-12, 80 générations réelles) ──────────────────
-- « 2 aubergines », « 1 poivron », « 2 branches de céleri »: le référentiel
-- connaît l'aliment, la recette donne un NOMBRE, et `gramsRawOf` rend `null`
-- faute de savoir ce que pèse une unité. L'ingrédient sort alors de toutes les
-- sommes — il compte pour ZÉRO kcal dans un plat où il pèse 250 g.
--
-- 35 lignes sur 911 portaient un `unit_grams`. Les aliments réellement comptés
-- à l'unité dans les plans générés en manquaient presque tous.
--
-- ── CE QUI EST DANS CETTE LISTE, ET CE QUI N'Y EST PAS ─────────────────────
-- On ne pose un poids que là où l'unité est une PROPRIÉTÉ de l'aliment, pas
-- une convention de recette. Un œuf pèse 55 g, une échalote 25 g: ce sont des
-- calibres, pas des estimations. Le melon en est absent exprès — « 1 melon »
-- va de 400 g à 2 kg selon la variété, et un chiffre posé au milieu serait un
-- nombre inventé, ce que le commentaire de `gramsRawOf` interdit explicitement
-- (« un dénombrement converti à l'estime est un nombre inventé »).
--
-- Les conserves y sont, avec leur poids ÉGOUTTÉ pour celles qu'on égoutte et
-- leur poids net pour celles dont on mange le jus: la boîte de 400 g est un
-- standard de rayon, pas une moyenne.
--
-- ── LA DIRECTION DE L'ERREUR ──────────────────────────────────────────────
-- Sur un aliment ambigu, on prend la lecture BASSE. « celery » peut être une
-- branche (40 g) ou un pied entier (500 g); une recette qui écrit « 2 celery »
-- parle de branches. Se tromper vers le bas sur un légume à 18 kcal/100 g coûte
-- quelques dizaines de kcal; se tromper vers le haut ferait passer un plat pour
-- deux fois plus lourd qu'il n'est.
--
-- REJOUABLE: des UPDATE à valeur littérale, sans condition d'état.

update food_composition_refs r
set unit_grams = v.g
from (values
  -- Œufs — calibre moyen français (55 g sans coquille).
  ('egg', 55.0),
  ('egg_hard', 55.0),
  -- Légumes entiers, calibre moyen.
  ('aubergine', 250.0),
  ('bell_pepper', 150.0),
  ('courgette', 200.0),
  ('cucumber', 300.0),
  ('red_onion', 110.0),
  ('shallot', 25.0),
  ('fennel', 250.0),
  ('leek', 100.0),
  ('broccoli', 300.0),
  -- « celery » et « celery stalk » désignent la même chose dans une recette:
  -- la branche. Le pied entier ne se compte pas à l'unité dans un plat.
  ('celery', 40.0),
  ('celery_stalk', 40.0),
  -- Champignon de couche, pièce.
  ('mushroom', 15.0),
  -- Fruits.
  ('fig', 50.0),
  ('avocado_pulp', 140.0),
  -- Conserves — la boîte de 400 g est le format de rayon.
  -- Égouttées: le poids net égoutté d'une boîte de 400 g est de ~240 g.
  ('chickpeas_tinned', 240.0),
  ('white_beans', 240.0),
  ('black_beans', 240.0),
  -- Non égouttées: on mange le jus, donc le poids net.
  ('baked_beans', 400.0),
  ('tinned_tomatoes', 400.0)
) as v(slug, g)
where r.slug = v.slug;

-- ── LA PREUVE ─────────────────────────────────────────────────────────────
-- Un slug renommé en amont ferait échouer l'UPDATE en silence: zéro ligne
-- touchée se lit exactement comme une migration qui a marché. On vérifie donc
-- que les aliments les plus comptés portent bien un poids à la sortie.
do $$
declare
  manquants text;
begin
  select string_agg(slug, ', ' order by slug) into manquants
  from food_composition_refs
  where slug in (
    'egg', 'aubergine', 'bell_pepper', 'courgette', 'celery',
    'chickpeas_tinned', 'white_beans'
  )
    and unit_grams is null;
  if manquants is not null then
    raise exception 'unit_grams absent après migration: %', manquants;
  end if;
end $$;
