-- ============================================================================
-- 2026-09-22 — UN LIQUIDE NE SE PÈSE PAS, IL SE VERSE.
-- ============================================================================
--
-- ── LE DÉFAUT, VU À L'ÉCRAN ────────────────────────────────────────────────
-- La dose par personne d'un repas sans cuisson affiche « huile de colza — 6 g ».
-- Personne ne pèse 6 g d'huile: on en verse une cuillère. Le même bloc affiche
-- « boisson de soja — 200 g », qui se sert au verre. Les grammes sont JUSTES —
-- c'est la grandeur du calcul — mais ils ne sont pas EXÉCUTABLES dans une
-- cuisine, et une dose qu'on ne sait pas servir ne se sert pas.
--
-- ── CE QUE CETTE COLONNE AJOUTE, ET CE QU'ELLE N'AJOUTE PAS ────────────────
-- Ce que pèse UN millilitre de cet aliment. C'est une constante physique, pas
-- une portion: elle ne dit ni combien en servir, ni à qui. Le gramme reste
-- l'autorité partout — dans le calcul d'énergie, dans la pesée du Boxing, dans
-- la liste de courses. La colonne ne sert qu'à DIRE le même gramme dans l'unité
-- du geste.
--
-- ⚠️ C'EST LE MÊME PATRON QUE `unit_grams` (migration 20260810180000), et pour
-- la même raison: « 3 œufs » et « une cuillère d'huile » sont deux façons
-- normales de dire une quantité, et sans une table qui les traduit, l'une est
-- résolue et l'autre pas. La liste est donc COURTE et FERMÉE, exactement comme
-- là-bas: les aliments qu'on VERSE ou qu'on prend à la cuillère, et rien
-- d'autre.
--
-- ⛔ `null` PARTOUT AILLEURS, ET C'EST LE CAS DE 920 LIGNES SUR 945. Un poulet
-- n'a pas de volume utile; lui en donner un ferait apparaître « ≈ 2 c. à soupe
-- de poulet » quelque part. L'absence se lit « cet aliment ne se verse pas »,
-- et l'écran se tait — la même abstention que `unit_grams` sur « 2 courgettes ».
--
-- ⛔ CE N'EST PAS UNE DENSITÉ NUTRITIONNELLE. `energy_dense` et
-- `densityPer100G` (portion_sizing) parlent de kcal; celle-ci parle de masse
-- et de volume. Les deux mots se ressemblent et ne se touchent jamais.
--
-- Les valeurs sont des densités usuelles, arrondies au centième et assumées
-- comme telles: une huile alimentaire tient entre 0,91 et 0,93 selon la
-- température, on écrit 0,92.
-- ============================================================================

alter table public.food_composition_refs
  add column if not exists grams_per_ml numeric
    check (grams_per_ml > 0 and grams_per_ml <= 2);

comment on column public.food_composition_refs.grams_per_ml is
  'Ce que pèse UN millilitre de cet aliment. NULL quand « verser » ne veut rien '
  'dire pour lui (une viande, un légume), ce qui est le cas de la quasi-totalité '
  'des lignes. Sert UNIQUEMENT à redire un gramme dans l''unité du geste '
  '(cuillère, millilitre) sur la dose d''un repas; aucun calcul d''énergie, de '
  'portion ou de courses ne le lit. Distinct de energy_dense et de toute '
  '« densité » de kcal.';

update public.food_composition_refs as r
set grams_per_ml = v.d
from (values
  -- ── LES HUILES ────────────────────────────────────────────────────────
  -- 0,91 à 0,93 selon la température; l'écart entre deux huiles est plus
  -- petit que l'arrondi de la cuillère qu'on en tire.
  ('olive_oil', 0.92),
  ('rapeseed_oil', 0.92),
  ('sunflower_oil', 0.92),
  ('sesame_oil', 0.92),
  -- ⚠️ L'huile de coco est SOLIDE sous 24 °C. Sa densité fondue est la même
  -- que les autres, et c'est fondue qu'on la verse.
  ('coconut_oil', 0.92),
  ('cod_liver_oil', 0.92),
  ('herring_oil', 0.92),
  ('salmon_oil', 0.92),
  ('sardine_oil', 0.92),
  -- ⛔ `paraffin_oil` N'EST PAS SEMÉE. Elle porte 0 kcal et n'est pas un
  -- aliment: lui donner une cuillère l'inviterait dans une assiette.

  -- ── LES BOISSONS, LAITIÈRES ET VÉGÉTALES ──────────────────────────────
  -- Un peu au-dessus de l'eau: le sucre et les protéines dissous pèsent.
  ('milk_semi', 1.03),
  ('soy_milk', 1.03),
  ('oat_milk', 1.03),
  ('fermented_milk_drink_milk', 1.03),
  ('fermented_milk_drink_skimmed', 1.03),
  ('coconut_milk', 0.98),
  ('single_cream', 1.00),
  ('orange_juice', 1.04),

  -- ── CE QUI SE PREND À LA CUILLÈRE ─────────────────────────────────────
  ('vinegar', 1.01),
  ('soy_sauce', 1.20),
  ('reduced_salt_soy_sauce', 1.20),
  ('hot_sauce', 1.10),
  ('ketchup', 1.14),
  ('mustard', 1.05),
  ('mayonnaise', 0.91),
  ('honey', 1.42),
  ('maple_syrup', 1.32),

  -- ── L'EAU ET SES VOISINS ──────────────────────────────────────────────
  ('water', 1.00),
  ('coffee', 1.00),
  ('tea', 1.00),
  ('vegetable_stock', 1.00)
) as v(slug, d)
where r.slug = v.slug;

-- ── LA VÉRIFICATION, DANS LA MIGRATION ─────────────────────────────────────
-- Un slug qui n'existe pas dans le référentiel fait un `update` de zéro ligne,
-- en silence — c'est-à-dire une valeur écrite nulle part et personne pour le
-- dire. On compte ce qui a été posé; en dessous de 25, la liste ci-dessus parle
-- d'aliments que cette base n'a pas.
do $$
declare
  posees integer;
begin
  select count(*) into posees
  from public.food_composition_refs
  where grams_per_ml is not null;
  if posees < 25 then
    raise exception 'grams_per_ml: % lignes posées, au moins 25 attendues — des slugs de la liste n''existent pas', posees;
  end if;
end;
$$;
