-- ============================================================================
-- FF-038 (étage B) · CE QUE PÈSE UNE UNITÉ
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-038-le-referentiel-de-composition.md
--
-- POURQUOI CETTE COLONNE EXISTE
-- -----------------------------
-- « 3 œufs », « 1 banane », « 2 tranches de pain complet » est la façon
-- NORMALE d'écrire une recette, et c'est ce que le générateur écrit. Avec le
-- contrat de quantités structurées (`amount` / `unit` / `state`), ces lignes
-- arrivent en `unit: 'unit'` — résolues par le référentiel, et jamais pesées.
-- Mesuré sur les plats déjà en base: « eggs » est le sixième terme le plus
-- fréquent.
--
-- CE QU'ELLE N'EST PAS
-- --------------------
-- Une portion. `food_items.typical_amount` répond à « combien on en sert »
-- pour l'écran du coach; cette colonne-ci répond à « combien pèse UN », ce qui
-- est une propriété physique de l'aliment. Les deux se ressemblent sur les
-- œufs et divergent partout ailleurs (une portion de riz n'est pas un grain).
--
-- LA COLONNE RESTE NULL PARTOUT OÙ « UN » NE VEUT RIEN DIRE
-- ---------------------------------------------------------
-- « 2 courgettes » n'a pas de poids honnête: entre 150 et 400 g selon la
-- saison et le maraîcher. Y poser une valeur ferait d'un dénombrement une
-- mesure, ce qui est exactement le nombre inventé que le recalcul côté parseur
-- existe pour empêcher. La liste ci-dessous est donc COURTE et fermée: les
-- aliments qu'on compte réellement à l'unité, et dont le calibre est
-- suffisamment standardisé pour qu'un ordre de grandeur soit défendable.
--
-- Les valeurs sont des calibres usuels du commerce, arrondis, et assumés comme
-- tels: un œuf moyen fait 53 à 63 g selon le calibre, on écrit 55.
-- ============================================================================

alter table public.food_composition_refs
  add column if not exists unit_grams numeric check (unit_grams > 0);

comment on column public.food_composition_refs.unit_grams is
  'FF-038: ce que pèse UNE unité de cet aliment, en grammes. NULL quand « un » '
  'ne veut rien dire (une courgette pèse 150 à 400 g). Distinct de '
  'food_items.typical_amount, qui est une taille de PORTION pour l''écran du '
  'coach. Sans lui, « 3 œufs » est résolu et jamais pesé.';

update public.food_composition_refs as r
set unit_grams = v.grams
from (values
  -- ── ŒUFS ───────────────────────────────────────────────────────────────
  ('whole_eggs', 55),      -- calibre moyen, hors coquille
  ('egg_white', 33),
  ('egg_yolk', 18),
  -- ── FRUITS QUI SE COMPTENT ─────────────────────────────────────────────
  ('banana', 120),         -- épluchée
  ('apple', 150),
  ('pear', 150),
  ('orange', 150),
  ('clementine', 80),
  ('kiwi', 80),
  ('lemon', 60),
  ('lime', 45),
  ('grapefruit', 200),
  ('peach', 130),
  ('avocado', 100),        -- chair, hors noyau et peau
  ('dates', 8),
  -- ── LÉGUMES DE CALIBRE STANDARD ────────────────────────────────────────
  -- Ceux dont le calibre du commerce est resserré. Courgette, aubergine,
  -- poivron et brocoli n'y sont PAS: leur poids varie du simple au triple.
  ('potato', 150),
  ('sweet_potato', 200),
  ('onion', 110),
  ('spring_onion', 15),
  ('carrot', 70),
  ('tomato', 100),
  ('garlic', 5),           -- une gousse
  ('chilli', 10),
  -- ── PAIN ET ASSIMILÉS, À LA TRANCHE OU À LA PIÈCE ──────────────────────
  ('wholemeal_bread', 40),
  ('white_bread', 35),
  ('rye_bread', 40),
  -- ── AUTRES ─────────────────────────────────────────────────────────────
  ('sausage', 60),
  ('scallops', 20)
) as v(slug, grams)
where r.slug = v.slug;
