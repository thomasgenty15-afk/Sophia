-- ============================================================================
-- 2026-09-25 — UN LÉGUME ET UN FRUIT ONT UNE FAMILLE, comme la viande.
-- ============================================================================
--
-- ── LE BESOIN ──────────────────────────────────────────────────────────────
-- Chaque plat du plan porte désormais son aliment principal (`main_food`,
-- `dish_main_food.ts`), et l'écran en tire une icône. Pour un plat sans
-- protéine, l'aliment principal est un légume, un féculent ou un fruit. Sans
-- famille, `foodFamilyOf` retombe sur le slug : `tomato_cherry`,
-- `tomato_round` et `passata` seraient trois aliments, et l'écran aurait
-- besoin de trois entrées pour dessiner une seule tomate.
--
-- `20260923200000_un_aliment_a_une_famille.sql` a rempli les protéines et les
-- féculents. Cette migration remplit les six groupes restants que le plat
-- peut nommer : `cruciferous_veg`, `leafy_greens`, `non_starchy_veg`,
-- `berries`, `citrus`, `other_fruit`.
--
-- ── CE QUE ÇA NE CHANGE PAS ────────────────────────────────────────────────
-- La liste « à éviter » (`plan_avoid_list.ts`) ne lit que les familles des
-- groupes protéines et féculents (`kindOf`) : les familles écrites ici n'y
-- entrent jamais. Aucun calcul d'énergie, de portion ou de courses ne lit
-- `family`.
--
-- Quand une famille existe déjà côté féculents, on la reprend : `sweet_corn`
-- est `corn`, `garden_peas` est `peas`, `pumpkin` est `squash`.
-- ============================================================================

update public.food_composition_refs as r
set family = v.family
from (values
  -- ── LES CRUCIFÈRES ────────────────────────────────────────────────────────
  ('broccoli', 'broccoli'), ('broccoli_water_crunchy', 'broccoli'),
  ('broccoli_water_tender', 'broccoli'),
  ('brussels_sprout_water', 'brussels_sprouts'), ('brussels_sprouts', 'brussels_sprouts'),
  ('cabbage', 'cabbage'), ('green_cabbage_water', 'cabbage'), ('red_cabbage', 'cabbage'),
  ('white_cabbage', 'cabbage'), ('white_cabbage_water', 'cabbage'),
  ('cauliflower', 'cauliflower'), ('romanesco_cauliflower_romanesco_broccoli', 'cauliflower'),
  ('kale', 'kale'),
  ('pak_choi', 'pak_choi'),
  ('radish', 'radish'), ('radish_black', 'radish'),
  ('turnip_water', 'turnip'),

  -- ── LES FEUILLES ──────────────────────────────────────────────────────────
  ('herbs_basil', 'herbs'), ('herbs_chives', 'herbs'), ('herbs_coriander', 'herbs'),
  ('herbs_dill', 'herbs'), ('herbs_mint', 'herbs'), ('herbs_parsley', 'herbs'),
  ('lamb_s_lettuce', 'lettuce'), ('lettuce', 'lettuce'), ('lettuce_oak_leaf', 'lettuce'),
  ('lettuce_sucrine', 'lettuce'), ('lettuce_var_batavia', 'lettuce'),
  ('little_gem_lettuce', 'lettuce'), ('mixed_leaves', 'lettuce'),
  ('rocket', 'rocket'),
  ('spinach', 'spinach'), ('spinach_water', 'spinach'), ('spinach_young_leaves', 'spinach'),
  ('swiss_chard', 'chard'), ('swiss_chard_leaf_stalk', 'chard'),
  ('watercress', 'watercress'),

  -- ── LES AUTRES LÉGUMES ────────────────────────────────────────────────────
  ('artichoke', 'artichoke'), ('artichoke_base', 'artichoke'), ('artichoke_heart', 'artichoke'),
  ('asparagus', 'asparagus'), ('asparagus_green_water', 'asparagus'),
  ('asparagus_white_water', 'asparagus'),
  ('aubergine', 'aubergine'), ('eggplant_pulp', 'aubergine'),
  ('avocado_pulp', 'avocado'),
  ('bamboo_shoots', 'bamboo_shoots'),
  ('bell_pepper', 'bell_pepper'), ('pepper_sweet_green_sauteed', 'bell_pepper'),
  ('pepper_sweet_red_sauteed', 'bell_pepper'), ('pepper_sweet_yellow_sauteed', 'bell_pepper'),
  ('sweet_pepper_green', 'bell_pepper'), ('sweet_pepper_red', 'bell_pepper'),
  ('sweet_pepper_yellow', 'bell_pepper'),
  ('butter_bean_yellow_bean', 'green_beans'), ('french_bean', 'green_beans'),
  ('french_bean_water', 'green_beans'), ('green_beans', 'green_beans'),
  ('carrot', 'carrot'), ('carrot_water_crunchy', 'carrot'), ('carrot_water_tender', 'carrot'),
  ('carrots_puree', 'carrot'), ('carrots_puree_cream', 'carrot'),
  ('celeriac', 'celeriac'), ('celeriac_water', 'celeriac'),
  ('celery', 'celery'), ('celery_stalk', 'celery'),
  ('chayote_island_la_reunion', 'chayote'),
  ('chicory', 'chicory'),
  ('chilli', 'chilli'),
  ('chinese_cabbageor_bok_choi', 'pak_choi'),
  ('chinese_japanese_artichokes', 'chinese_artichoke'),
  ('coleslaw_mix', 'cabbage'),
  ('courgette', 'courgette'), ('courgette_zucchini_pulp_peel', 'courgette'),
  ('cucumber', 'cucumber'), ('cucumber_pulp', 'cucumber'), ('cucumber_pulp_peel', 'cucumber'),
  ('fennel', 'fennel'),
  ('garden_peas', 'peas'), ('garden_peas_water', 'peas'), ('peas_frozen', 'peas'),
  ('garlic', 'garlic'),
  ('ginger', 'ginger'),
  ('leek', 'leek'), ('leek_water', 'leek'),
  ('lima_bean', 'lima_beans'),
  ('button_mushroom_cultivated_mushroom', 'mushroom'), ('caesar_s_mushroom_royal', 'mushroom'),
  ('cep_boletus_mushroom', 'mushroom'), ('champignons_de_paris', 'mushroom'),
  ('chanterelle_girolle_mushroom', 'mushroom'), ('field_mushroom', 'mushroom'),
  ('morel', 'mushroom'), ('mushroom', 'mushroom'), ('mushroom_all_types', 'mushroom'),
  ('oyster_mushroom', 'mushroom'), ('shiitake_mushroom', 'mushroom'),
  ('garden_peas_carrots', 'mixed_vegetables'), ('mixed_vegetables', 'mixed_vegetables'),
  ('mixed_vegetables_couscous', 'mixed_vegetables'),
  ('mixed_vegetables_soups', 'mixed_vegetables'), ('vegetable', 'mixed_vegetables'),
  ('vegetables_mashed', 'mixed_vegetables'),
  ('olives', 'olives'),
  ('onion', 'onion'), ('onion_red_sauteed_pan', 'onion'),
  ('onion_white_yellow_sauteed', 'onion'), ('red_onion', 'onion'), ('yellow_onion', 'onion'),
  ('spring_onion', 'onion'), ('spring_onion_sauteed_pan', 'onion'),
  ('shallot', 'shallot'), ('shallot_pan_fat', 'shallot'),
  ('pumpkin', 'squash'), ('pumpkin_pulp', 'squash'), ('red_kuri_squash_pulp', 'squash'),
  ('salsify_water', 'salsify'),
  ('snow_pea_water', 'snow_peas'),
  ('sweet_corn', 'corn'),
  ('passata', 'tomato'), ('tinned_tomatoes', 'tomato'), ('tomato', 'tomato'),
  ('tomato_beef_heart', 'tomato'), ('tomato_bunch', 'tomato'), ('tomato_cherry', 'tomato'),
  ('tomato_oil', 'tomato'), ('tomato_paste_concentrated', 'tomato'),
  ('tomato_paste_double_concentrate', 'tomato'), ('tomato_pulp', 'tomato'),
  ('tomato_puree', 'tomato'), ('tomato_round', 'tomato'),

  -- ── LES BAIES ─────────────────────────────────────────────────────────────
  ('blackberry', 'blackberry'),
  ('blueberries', 'blueberry'), ('blueberry', 'blueberry'),
  ('cranberry_sugar', 'cranberry'),
  ('mixed_berries', 'mixed_berries'),
  ('raspberries', 'raspberry'), ('raspberry', 'raspberry'),
  ('strawberries', 'strawberry'), ('strawberry', 'strawberry'),

  -- ── LES AGRUMES ───────────────────────────────────────────────────────────
  ('clementine', 'clementine'), ('clementine_mandarin_orange_pulp', 'clementine'),
  ('grapefruit', 'grapefruit'), ('grapefruit_pulp', 'grapefruit'),
  ('lemon', 'lemon'), ('lemon_pulp', 'lemon'), ('lemon_wedge', 'lemon'),
  ('lime', 'lime'), ('lime_pulp', 'lime'),
  ('orange', 'orange'), ('orange_pulp', 'orange'),

  -- ── LES AUTRES FRUITS ─────────────────────────────────────────────────────
  ('apple', 'apple'), ('apple_compote', 'apple'), ('apple_compote_reduced_sugar', 'apple'),
  ('apple_var_chanteclerc_pulp', 'apple'), ('apple_var_gala_pulp', 'apple'),
  ('apple_var_golden_pulp', 'apple'), ('apple_var_granny_smith', 'apple'),
  ('apple_var_pink_lady', 'apple'), ('fruits_puree_apple_sugar', 'apple'),
  ('apricot_pitted', 'apricot'), ('apricot_pitted_rehydrated_35', 'apricot'),
  ('dried_apricot', 'apricot'),
  ('avocado', 'avocado'),
  ('banana', 'banana'), ('banana_pulp', 'banana'),
  ('cherry_pitted', 'cherry'),
  ('colombo_papaya_mature_seeds', 'papaya'), ('papaya_pulp', 'papaya'),
  ('dates', 'dates'),
  ('fig', 'fig'),
  ('fruit', 'mixed_fruit'), ('fruit_compote_reduced_sugar', 'mixed_fruit'),
  ('fruits_compote_miscellaneous', 'mixed_fruit'),
  ('fruits_compote_miscellaneous_reduced', 'mixed_fruit'),
  ('fruits_puree_sugar_added', 'mixed_fruit'), ('tropical_fruit_mix_snack', 'mixed_fruit'),
  ('grape_chasselas', 'grapes'), ('grape_red_muscat', 'grapes'), ('grape_white', 'grapes'),
  ('grapes', 'grapes'),
  ('greengage_plum', 'plum'), ('mirabelle_plum', 'plum'), ('plum', 'plum'),
  ('prune', 'prune'),
  ('kiwi', 'kiwi'), ('kiwi_fruit_pulp_seeds', 'kiwi'),
  ('lychee_pulp', 'lychee'),
  ('mango', 'mango'), ('mango_jose_flesh_island', 'mango'), ('mango_pulp', 'mango'),
  ('melon', 'melon'), ('melon_cantaloupe_pulp', 'melon'),
  ('watermelon_pulp', 'watermelon'),
  ('nectarine_white_flesh', 'peach'), ('nectarine_yellow_flesh', 'peach'), ('peach', 'peach'),
  ('peach_white_flesh_variety', 'peach'), ('peach_yellow_flesh_variety', 'peach'),
  ('passion_fruit_pulp_pips', 'passion_fruit'),
  ('pear', 'pear'), ('pear_light_syrup', 'pear'), ('pear_var_conference_pulp', 'pear'),
  ('pear_var_williams_pulp', 'pear'),
  ('persimmon_pulp', 'persimmon'),
  ('pineapple', 'pineapple'), ('pineapple_pulp', 'pineapple'),
  ('queen_vicoria_ananas_flesh', 'pineapple'),
  ('pomegranate_pulp_pips', 'pomegranate'),
  ('raisin', 'raisins'), ('raisins', 'raisins'),
  ('red_currant', 'red_currant')
) as v(slug, family)
where r.slug = v.slug;

comment on column public.food_composition_refs.family is
  'Ce que la personne appelle « le même aliment » : chicken_breast et '
  'chicken_leg_meat sont tous deux chicken, tomato_cherry et passata tomato. '
  'Rempli pour les protéines (hors dairy_yogurt), les féculents, les légumes et '
  'les fruits ; NULL ailleurs, et le lecteur retombe alors sur le slug. Lu par '
  'la liste « à éviter » (plan_avoid_list.ts, protéines et féculents seulement) '
  'et par l''aliment principal d''un plat (dish_main_food.ts) ; aucun calcul '
  'd''énergie, de portion ou de courses ne le lit.';

-- ── LA VÉRIFICATION, DANS LA MIGRATION ─────────────────────────────────────
-- Même contrôle que la migration du 2026-09-23 : un slug mal écrit ci-dessus
-- fait un `update` de zéro ligne, en silence. Aucune ligne hors sas des six
-- groupes ne doit rester NULL.
do $$
declare
  manquantes text;
begin
  select string_agg(slug, ', ' order by slug) into manquantes
  from public.food_composition_refs
  where family is null
    and source <> 'sas'
    and food_group_ref in (
      'cruciferous_veg', 'leafy_greens', 'non_starchy_veg',
      'berries', 'citrus', 'other_fruit'
    );
  if manquantes is not null then
    raise exception 'family: légumes ou fruits sans famille : %', manquantes;
  end if;
end;
$$;
