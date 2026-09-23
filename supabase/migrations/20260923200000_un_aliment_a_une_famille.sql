-- ============================================================================
-- 2026-09-23 — UN ALIMENT A UNE FAMILLE : « encore du poulet » se compte enfin.
-- ============================================================================
--
-- ── LE BESOIN ──────────────────────────────────────────────────────────────
-- D'un plan à l'autre, les mêmes aliments principaux reviennent. Pour donner au
-- modèle la liste de ce qui est beaucoup revenu (3 protéines + 2 féculents,
-- `plan_avoid_list.ts`), il faut savoir que deux lignes du référentiel sont LE
-- MÊME aliment aux yeux de la personne qui mange.
--
-- ── POURQUOI NI LE SLUG NI LE GROUPE ───────────────────────────────────────
-- · `slug` est trop fin : `chicken_breast`, `chicken_leg_meat` et
--   `chicken_breast_organic` sont trois lignes ; la liste dirait « poulet »
--   trois fois.
-- · `food_group_ref` est trop large : `poultry` mélange poulet et dinde,
--   `red_meat` mélange bœuf, porc, agneau et lardons.
-- `family` est entre les deux : ce que la personne appelle « la même chose ».
-- Une famille peut traverser deux groupes : `white_rice` (refined_grain) et
-- `brown_rice` (whole_grain) sont tous deux `rice`.
--
-- ── CE QUI EST REMPLI ──────────────────────────────────────────────────────
-- Les 12 groupes que la liste lit : les `PROTEIN_SOURCES` de `tokens.ts` SAUF
-- `dairy_yogurt` (un yaourt n'est pas l'aliment principal d'un dîner), et les
-- trois groupes féculents `whole_grain`, `refined_grain`, `starchy_veg`.
-- Partout ailleurs `family` reste NULL, et le lecteur retombe sur le slug.
--
-- ⛔ NULLABLE, EXPRÈS. La promotion du sas (`promote_pending_food_compositions`)
-- insère avec une liste de colonnes fixe, sans celle-ci : un `not null` la
-- ferait échouer. Une ligne promue plus tard est comptée sous son slug.
--
-- Les valeurs sont des mots anglais lisibles, parce qu'elles sont écrites
-- telles quelles dans la consigne du modèle (`_` rendu en espace).
-- La liste a été produite une fois par un script, puis relue ligne à ligne.
-- ============================================================================

alter table public.food_composition_refs
  add column if not exists family text
    constraint food_composition_refs_family_format_check
    check (family is null or family ~ '^[a-z][a-z_]{1,39}$');

comment on column public.food_composition_refs.family is
  'Ce que la personne appelle « le même aliment » : chicken_breast et '
  'chicken_leg_meat sont tous deux chicken. Rempli pour les protéines (hors '
  'dairy_yogurt) et les féculents ; NULL ailleurs, et le lecteur retombe alors '
  'sur le slug. Lu par la liste « à éviter » de la génération de plan '
  '(plan_avoid_list.ts) ; aucun calcul d''énergie, de portion ou de courses ne '
  'le lit. Écrit tel quel dans la consigne du modèle.';

update public.food_composition_refs as r
set family = v.family
from (values
  -- ── LES PROTÉINES ─────────────────────────────────────────────────────────
  ('anchovy', 'anchovies'),
  ('bacon', 'bacon'), ('bacon_back', 'bacon'), ('lardoons', 'bacon'), ('pancetta', 'bacon'),
  ('pork_belly_salt_cured', 'bacon'), ('pork_belly_smoked', 'bacon'),
  ('smoked_lardoons', 'bacon'),
  ('baked_beans', 'beans'), ('black_beans', 'beans'), ('kidney_beans', 'beans'),
  ('white_beans', 'beans'),
  ('beef', 'beef'), ('beef_bolar_blade', 'beef'), ('beef_bolar_blade_pan', 'beef'),
  ('beef_braising', 'beef'), ('beef_cheek', 'beef'), ('beef_chuck', 'beef'),
  ('beef_chuck_steak', 'beef'), ('beef_eye_round', 'beef'), ('beef_flank_steak', 'beef'),
  ('beef_flank_steak_pan', 'beef'), ('beef_ground', 'beef'), ('beef_hanger_steak', 'beef'),
  ('beef_knuckle', 'beef'), ('beef_knuckle_water', 'beef'), ('beef_meat_balls', 'beef'),
  ('beef_mince', 'beef'), ('beef_neck', 'beef'), ('beef_on_skewer', 'beef'),
  ('beef_oxtail', 'beef'), ('beef_oxtail_water', 'beef'), ('beef_rib', 'beef'),
  ('beef_rib_steak', 'beef'), ('beef_rib_steak_lean', 'beef'), ('beef_roast_beef', 'beef'),
  ('beef_round', 'beef'), ('beef_rump_steak', 'beef'), ('beef_short_ribs', 'beef'),
  ('beef_shoulder', 'beef'), ('beef_sirloin_steak', 'beef'),
  ('beef_sirloin_steak_pan', 'beef'), ('beef_steak', 'beef'), ('beef_steak_10_fat', 'beef'),
  ('beef_steak_15_fat', 'beef'), ('beef_steak_20_fat', 'beef'),
  ('beef_steak_5_fat', 'beef'), ('beef_steak_beef_steak', 'beef'),
  ('beef_stewing_meat', 'beef'), ('beef_tenderloin', 'beef'), ('beef_thin_flank', 'beef'),
  ('beef_thin_flank_pan', 'beef'), ('beef_topside', 'beef'), ('beef_topside_pan', 'beef'),
  ('boeuf_a_mijoter', 'beef'), ('bresaola', 'beef'), ('corned_beef', 'beef'),
  ('viande_des_grisons_bundnerfleisch', 'beef'),
  ('broad_beans', 'broad_beans'),
  ('capon_meat', 'chicken'), ('chicken_breast', 'chicken'),
  ('chicken_breast_label_rouge', 'chicken'), ('chicken_breast_meat', 'chicken'),
  ('chicken_breast_organic', 'chicken'), ('chicken_drumstick', 'chicken'),
  ('chicken_eviscerated_offal', 'chicken'), ('chicken_free_range_meat', 'chicken'),
  ('chicken_high_leg_meat', 'chicken'), ('chicken_leg_meat', 'chicken'),
  ('chicken_leg_meat_label', 'chicken'), ('chicken_leg_meat_organic', 'chicken'),
  ('chicken_leg_meat_water', 'chicken'), ('chicken_marinated_wing', 'chicken'),
  ('chicken_meat', 'chicken'), ('chicken_nugget_breaded_croquette', 'chicken'),
  ('chicken_stewing_leg', 'chicken'), ('chicken_thigh', 'chicken'),
  ('chicken_white_race_meat', 'chicken'), ('chicken_wing_meat', 'chicken'),
  ('cuisses_de_poulet_avec_peau', 'chicken'), ('hen_meat', 'chicken'),
  ('hen_meat_only', 'chicken'), ('poultry_nuggets', 'chicken'),
  ('chickpeas_dry', 'chickpeas'), ('chickpeas_tinned', 'chickpeas'),
  ('hummus', 'chickpeas'), ('pois_chiches_cuits_egouttes', 'chickpeas'),
  ('cod', 'cod'),
  ('crab', 'crab'),
  ('chorizo', 'cured_meat'), ('coppa', 'cured_meat'), ('cured_meat_sausages', 'cured_meat'),
  ('dry_sausage', 'cured_meat'), ('dry_sausage_pure_pork', 'cured_meat'),
  ('dry_sausage_w_walnuts', 'cured_meat'), ('dry_spicy_pork_sausage', 'cured_meat'),
  ('mortadella', 'cured_meat'), ('mortadella_pistachios_pure_pork', 'cured_meat'),
  ('mortadella_pure_pork', 'cured_meat'), ('pork_beef_mortadella', 'cured_meat'),
  ('rosette_dry_sausage', 'cured_meat'), ('salami', 'cured_meat'),
  ('salami_danish_style', 'cured_meat'), ('salami_pork_beef', 'cured_meat'),
  ('salami_pure_pork', 'cured_meat'), ('spicy_pork_sausage_red', 'cured_meat'),
  ('duck_breast', 'duck'), ('duck_breast_fillet', 'duck'),
  ('duck_breast_fillet_smoked', 'duck'), ('duck_confit_meat', 'duck'),
  ('duck_leg_meat', 'duck'), ('duck_magret_pan', 'duck'), ('duck_meat', 'duck'),
  ('preserved_duck', 'duck'),
  ('edamame', 'edamame'),
  ('duck_egg', 'eggs'), ('egg', 'eggs'), ('egg_added_fat', 'eggs'), ('egg_hard', 'eggs'),
  ('egg_powder', 'eggs'), ('egg_scrambled_added_fat', 'eggs'), ('egg_soft', 'eggs'),
  ('egg_white', 'eggs'), ('egg_white_powder', 'eggs'), ('egg_yolk', 'eggs'),
  ('egg_yolk_powder', 'eggs'), ('goose_egg', 'eggs'), ('omelette_cheese', 'eggs'),
  ('omelette_herbs', 'eggs'), ('omelette_lardoons', 'eggs'), ('omelette_mushrooms', 'eggs'),
  ('omelette_vegetables_cheese_meat', 'eggs'), ('quail_egg', 'eggs'),
  ('spanish_style_tortilla_onions', 'eggs'), ('turkey_egg', 'eggs'), ('whole_eggs', 'eggs'),
  ('foie_gras_block', 'foie_gras'), ('foie_gras_duck', 'foie_gras'),
  ('foie_gras_duck_s', 'foie_gras'),
  ('feathered_game_meat', 'game'), ('game', 'game'), ('hare_meat', 'game'),
  ('ostrich_meat', 'game'), ('pheasant_meat', 'game'), ('pigeon', 'game'),
  ('pigeon_meat', 'game'), ('quail_meat', 'game'), ('venison', 'game'),
  ('wild_boar', 'game'),
  ('young_goat', 'goat'),
  ('goose_meat', 'goose'),
  ('guinea_fowl', 'guinea_fowl'), ('guinea_fowl_breast', 'guinea_fowl'),
  ('guinea_fowl_leg', 'guinea_fowl'),
  ('haddock', 'haddock'),
  ('filets_de_colin', 'hake'), ('hake', 'hake'),
  ('bayonne_cured_ham_smoked', 'ham'), ('chicken_ham_slices', 'ham'), ('cured_ham', 'ham'),
  ('cured_ham_smoked', 'ham'), ('cured_ham_smoked_reduced', 'ham'),
  ('dry_cured_ham', 'ham'), ('dry_cured_ham_fat', 'ham'), ('ham', 'ham'),
  ('ham_choice', 'ham'), ('ham_choice_rind_less', 'ham'), ('ham_choice_w_rind', 'ham'),
  ('ham_cube', 'ham'), ('ham_on_bone', 'ham'), ('ham_parisian_style_rind', 'ham'),
  ('ham_pastry_crusty', 'ham'), ('ham_smoked', 'ham'), ('ham_superior_quality', 'ham'),
  ('ham_superior_quality_reduced', 'ham'), ('ham_superior_quality_rind', 'ham'),
  ('knuckle_ham', 'ham'), ('parma_dry_cured_ham', 'ham'), ('pork_ham_w_parsley', 'ham'),
  ('pork_shoulder_choice', 'ham'), ('pork_shoulder_standard_rind', 'ham'),
  ('poultry_ham_cube', 'ham'), ('round_ham', 'ham'), ('serrano_dry_cured_ham', 'ham'),
  ('turkey_ham_slices', 'ham'),
  ('herring', 'herring'),
  ('horse_meat', 'horse'), ('horse_rib_steak', 'horse'), ('horse_rib_steak_pan', 'horse'),
  ('horse_sirloin_steak', 'horse'), ('horse_sirloin_steak_pan', 'horse'),
  ('horse_steak', 'horse'), ('horse_topside', 'horse'), ('horse_topside_pan', 'horse'),
  ('lamb', 'lamb'), ('lamb_chop', 'lamb'), ('lamb_chop_decouverte', 'lamb'),
  ('lamb_chop_fillet', 'lamb'), ('lamb_chop_fillet_pan', 'lamb'), ('lamb_cutlet', 'lamb'),
  ('lamb_leg', 'lamb'), ('lamb_leg_pan', 'lamb'), ('lamb_meat', 'lamb'),
  ('lamb_neck', 'lamb'), ('lamb_on_skewer', 'lamb'), ('lamb_rib_chop', 'lamb'),
  ('lamb_rib_chop_pan', 'lamb'), ('lamb_saddle', 'lamb'), ('lamb_saddle_lean', 'lamb'),
  ('lamb_saddle_pan', 'lamb'), ('lamb_shoulder', 'lamb'), ('lamb_shoulder_lean', 'lamb'),
  ('mutton_leg', 'lamb'), ('mutton_meat', 'lamb'), ('mutton_shoulder', 'lamb'),
  ('lentilles_mijotees', 'lentils'), ('lentils_cooked', 'lentils'),
  ('lentils_dry', 'lentils'),
  ('mackerel', 'mackerel'),
  ('meat', 'meat'), ('mixed_meat_on_skewer', 'meat'), ('red_meat', 'meat'),
  ('white_meat', 'meat'),
  ('meat_balls_beef_lamb', 'meatballs'), ('meat_balls_pork_beef', 'meatballs'),
  ('mussels', 'mussels'),
  ('blood_beef', 'offal'), ('brain_calf', 'offal'), ('brain_lamb', 'offal'),
  ('brain_pork', 'offal'), ('calf_foot', 'offal'), ('calf_head_water', 'offal'),
  ('gizzard_chicken', 'offal'), ('heart_beef', 'offal'), ('heart_chicken', 'offal'),
  ('heart_lamb', 'offal'), ('heart_pork', 'offal'), ('heart_turkey', 'offal'),
  ('heart_veal', 'offal'), ('kidney_all_types', 'offal'), ('kidney_beef', 'offal'),
  ('kidney_calf', 'offal'), ('kidney_lamb', 'offal'), ('kidney_pork', 'offal'),
  ('kidney_veal_sauteed_pan', 'offal'), ('liver_calf', 'offal'), ('liver_chicken', 'offal'),
  ('liver_duck', 'offal'), ('liver_goose', 'offal'), ('liver_lamb', 'offal'),
  ('liver_pork', 'offal'), ('liver_poultry', 'offal'), ('liver_rabbit', 'offal'),
  ('liver_turkey', 'offal'), ('liver_young_cow', 'offal'), ('offal', 'offal'),
  ('ox_muzzle', 'offal'), ('ox_muzzle_salad_dressing', 'offal'),
  ('pork_ear_sat_cured', 'offal'), ('pork_snout_salad_dressing', 'offal'),
  ('pork_trotters_salt_cured', 'offal'), ('preserved_gizzards_duck', 'offal'),
  ('preserved_pork_liver', 'offal'), ('preserved_poultry_liver', 'offal'),
  ('sheep_foot', 'offal'), ('sheep_head', 'offal'), ('sweetbread_calf', 'offal'),
  ('sweetbread_calf_sauteed_pan', 'offal'), ('sweetbread_lamb', 'offal'),
  ('tongue_beef', 'offal'), ('tongue_calf', 'offal'), ('tongue_lamb', 'offal'),
  ('tongue_pork', 'offal'), ('tripe_beef', 'offal'),
  ('breton_pate', 'pate'), ('country_style_pate_mushrooms', 'pate'),
  ('country_style_pate_terrine', 'pate'), ('duck_mousse', 'pate'), ('duck_terrine', 'pate'),
  ('galantine', 'pate'), ('game_pate', 'pate'), ('goose_liver_pate', 'pate'),
  ('head_cheese_pate_brawn', 'pate'), ('pate', 'pate'), ('pate_crust', 'pate'),
  ('pate_w_green_pepper', 'pate'), ('pork_liver_mousse', 'pate'),
  ('pork_liver_mousse_superior', 'pate'), ('pork_liver_pate', 'pate'),
  ('pork_liver_pate_superior', 'pate'), ('poultry_liver_pate', 'pate'),
  ('rabbit_pate', 'pate'), ('rabbit_terrine', 'pate'), ('rillettes_duck', 'pate'),
  ('rillettes_goose', 'pate'), ('rillettes_mans', 'pate'), ('rillettes_pork', 'pate'),
  ('rillettes_poultry', 'pate'), ('rillettes_pure_goose', 'pate'),
  ('rillettes_pure_pork', 'pate'), ('rillettes_tours', 'pate'),
  ('green_peas', 'peas'),
  ('plaice', 'plaice'),
  ('plant_based_ham', 'plant_based_meat'), ('plant_based_pate', 'plant_based_meat'),
  ('plant_based_sausage_tofu', 'plant_based_meat'),
  ('plant_based_sausage_wheat', 'plant_based_meat'),
  ('pollock', 'pollock'),
  ('pork_80_20_trimming', 'pork'), ('pork_90_10_trimming', 'pork'),
  ('pork_back_fat_rindless', 'pork'), ('pork_belly', 'pork'),
  ('pork_belly_flank_removed', 'pork'), ('pork_chop', 'pork'),
  ('pork_filet_mignon', 'pork'), ('pork_ham_escalope', 'pork'),
  ('pork_ham_intended_be', 'pork'), ('pork_jowl_rindless', 'pork'),
  ('pork_knuckle_oh_ham', 'pork'), ('pork_knuckle_shank', 'pork'), ('pork_loin', 'pork'),
  ('pork_meat', 'pork'), ('pork_on_skewer', 'pork'), ('pork_rack', 'pork'),
  ('pork_roast', 'pork'), ('pork_round_steak', 'pork'), ('pork_shoulder', 'pork'),
  ('pork_shoulder_lower_rind', 'pork'), ('pork_shoulder_upper_rind', 'pork'),
  ('pork_spare_ribs', 'pork'), ('pork_tenderloin_lean', 'pork'),
  ('pork_tenderloin_roast', 'pork'), ('pork_way_leg_rind', 'pork'),
  ('prok_eye_shortloin', 'pork'), ('rolled_escalope_pork_pistachios', 'pork'),
  ('roti_de_porc', 'pork'),
  ('poultry', 'poultry'), ('poultry_meat', 'poultry'), ('poultry_on_skewer', 'poultry'),
  ('salt_curing_roast_poultry', 'poultry'),
  ('prawns', 'prawns'),
  ('fish_quenelle', 'quenelle'), ('fish_quenelle_sauce', 'quenelle'),
  ('poultry_quenelle', 'quenelle'), ('poultry_quenelle_sauce', 'quenelle'),
  ('quenelle', 'quenelle'), ('veal_quenelle_sauce', 'quenelle'),
  ('rabbit_meat', 'rabbit'), ('rabbit_wild_meat', 'rabbit'),
  ('salmon', 'salmon'), ('smoked_salmon', 'salmon'),
  ('sardines', 'sardines'),
  ('black_pudding_refrigerated', 'sausage'), ('black_pudding_sauteed_pan', 'sausage'),
  ('black_white_pudding_sauteed', 'sausage'), ('chipolata_sausage', 'sausage'),
  ('chipolata_slim_sausage', 'sausage'), ('chitterling_sausage', 'sausage'),
  ('chitterling_sausage_guemene', 'sausage'), ('chitterling_sausage_pan', 'sausage'),
  ('chitterling_sausage_sauteed_pan', 'sausage'), ('chitterling_sausage_troyes', 'sausage'),
  ('chitterling_sausage_vire', 'sausage'), ('cocktail_sausage', 'sausage'),
  ('frankfurter_sausage', 'sausage'), ('garlic_sausage', 'sausage'),
  ('ham_sausage', 'sausage'), ('liver_sausage', 'sausage'), ('merguez_sausage', 'sausage'),
  ('merguez_sausage_beef_mutton', 'sausage'), ('montbeliard_sausage', 'sausage'),
  ('morteaux_sausage', 'sausage'), ('morteaux_sausage_water', 'sausage'),
  ('poultry_sausage', 'sausage'), ('poultry_sausage_delicatessen_style', 'sausage'),
  ('sausage', 'sausage'), ('sausage_brioche_crust', 'sausage'), ('sausage_meat', 'sausage'),
  ('sausage_meat_pork_beef', 'sausage'), ('sausage_meat_pure_pork', 'sausage'),
  ('sausage_paris', 'sausage'), ('sausage_paris_smoked', 'sausage'),
  ('sausage_pure_pork', 'sausage'), ('saveloy_cervelat', 'sausage'),
  ('saveloy_cervelat_pure_pork', 'sausage'), ('strasbourg_sausage', 'sausage'),
  ('toulouse_sausage', 'sausage'), ('white_pudding_truffled', 'sausage'),
  ('scallops', 'scallops'),
  ('sea_bass', 'sea_bass'),
  ('soy_milk', 'soy_milk'),
  ('soy_yogurt', 'soy_yogurt'),
  ('squid', 'squid'),
  ('tempeh', 'tempeh'),
  ('tofu', 'tofu'), ('tofu_soyeux', 'tofu'),
  ('trout', 'trout'),
  ('tuna_fresh', 'tuna'), ('tuna_tinned', 'tuna'),
  ('boulettes_de_dinde', 'turkey'), ('milanese_style_turkey_escalope', 'turkey'),
  ('turkey_breaded_escalope', 'turkey'), ('turkey_breast', 'turkey'),
  ('turkey_escalope', 'turkey'), ('turkey_escalope_sauteed_pan', 'turkey'),
  ('turkey_leg_meat', 'turkey'), ('turkey_leg_meat_only', 'turkey'),
  ('turkey_meat', 'turkey'), ('turkey_mince', 'turkey'), ('turkey_wing', 'turkey'),
  ('veal_bread_escalope', 'veal'), ('veal_breast', 'veal'), ('veal_chop', 'veal'),
  ('veal_chop_pan', 'veal'), ('veal_escalope', 'veal'),
  ('veal_escalope_cordon_bleu', 'veal'), ('veal_fillet', 'veal'),
  ('veal_knuckle_shank', 'veal'), ('veal_loin', 'veal'), ('veal_loin_sauteed_pan', 'veal'),
  ('veal_meat', 'veal'), ('veal_neck', 'veal'), ('veal_roast', 'veal'),
  ('veal_shoulder', 'veal'), ('veal_shoulder_pan', 'veal'), ('veal_steak_15_fat', 'veal'),
  ('veal_steak_20_fat', 'veal'), ('veal_tenderloin', 'veal'),
  ('veal_tenderloin_pan', 'veal'),
  -- ── LES FÉCULENTS ─────────────────────────────────────────────────────────
  ('barley', 'barley'),
  ('beetroot', 'beetroot'),
  ('bagel', 'bread'), ('bran_grain_bread', 'bread'), ('bread', 'bread'),
  ('bread_flour_bread_preparation', 'bread'), ('bread_french_bread_baguette', 'bread'),
  ('bread_french_bread_ball', 'bread'), ('bread_french_bread_multigrain', 'bread'),
  ('bread_french_bread_salt', 'bread'), ('bread_french_bread_yeast', 'bread'),
  ('bread_gluten_free', 'bread'), ('bread_wholemeal_integral_bread', 'bread'),
  ('brear_t55_t110_flour', 'bread'), ('brioche_sandwich_bread', 'bread'),
  ('brown_bread_french_bread', 'bread'), ('country_style_bread', 'bread'),
  ('country_style_bread_french', 'bread'), ('english_muffin', 'bread'),
  ('english_muffin_wholewheat_flour', 'bread'), ('naan_bread', 'bread'),
  ('panini_bread', 'bread'), ('pita_bread', 'bread'), ('pita_wholemeal', 'bread'),
  ('rolls_hamburger_hotdog', 'bread'), ('rolls_hamburger_hotdog_wholemeal', 'bread'),
  ('rye_bread', 'bread'), ('rye_bread_wheat', 'bread'), ('sandwich_loaf', 'bread'),
  ('sandwich_loaf_bran_grain', 'bread'), ('sandwich_loaf_crust_less', 'bread'),
  ('sandwich_loaf_multigrain', 'bread'), ('sandwich_loaf_wholemeal', 'bread'),
  ('toasted_bread', 'bread'), ('white_bread', 'bread'), ('wholemeal_bread', 'bread'),
  ('breadcrumbs', 'breadcrumbs'),
  ('breadfruit', 'breadfruit'),
  ('buckwheat', 'buckwheat'),
  ('bulgur', 'bulgur'), ('bulgur_wheat', 'bulgur'),
  ('cassava_manioc_roots', 'cassava'), ('tapioca', 'cassava'),
  ('breakfast_cereal', 'cereal'), ('granola', 'cereal'),
  ('sweetcorn', 'corn'),
  ('couscous', 'couscous'), ('couscous_wholemeal', 'couscous'),
  ('bretzel', 'crispbread'), ('corn_cake', 'crispbread'),
  ('crispbread_extruded', 'crispbread'), ('crispbread_rye', 'crispbread'),
  ('grissini_bread_stick', 'crispbread'), ('puffed_cereals_textured_bread', 'crispbread'),
  ('puffed_rice_textured_bread', 'crispbread'), ('rusk', 'crispbread'),
  ('rusk_eggs', 'crispbread'), ('rusk_multigrain', 'crispbread'),
  ('rusk_slice_multigrain', 'crispbread'), ('rusk_slice_wheat', 'crispbread'),
  ('rusk_w_eggs', 'crispbread'), ('rusk_wholemeal_rich_fibre', 'crispbread'),
  ('swedish_toast_fruits', 'crispbread'), ('swedish_toast_linseeds', 'crispbread'),
  ('wheat_crackers', 'crispbread'), ('wheat_swedish_toast', 'crispbread'),
  ('wheat_swedish_toast_wholemeal', 'crispbread'),
  ('potato_crisps_flavoured', 'crisps'), ('potato_crisps_l_ancienne', 'crisps'),
  ('potato_crisps_related_reduced', 'crisps'),
  ('crouton_garlic_herbs_onions', 'croutons'), ('croutons', 'croutons'),
  ('croutons_spreads', 'croutons'),
  ('farine_de_ble', 'flour'),
  ('french_fries_chips', 'fries'), ('french_fries_chips_aw', 'fries'),
  ('french_fries_chips_deep', 'fries'), ('french_fries_chips_intended', 'fries'),
  ('jerusalem_artichoke', 'jerusalem_artichoke'),
  ('oat_milk', 'oat_milk'),
  ('flocons_d''avoine_certifies_sans_gluten', 'oats'), ('oats', 'oats'),
  ('parsnip', 'parsnip'),
  ('noodles', 'pasta'), ('noodles_wholewheat', 'pasta'), ('white_pasta', 'pasta'),
  ('wholewheat_pasta', 'pasta'),
  ('pate_a_pizza', 'pizza_dough'),
  ('plantain_banana', 'plantain'),
  ('polenta', 'polenta'),
  ('baked_potato', 'potato'), ('dauphine_potato', 'potato'), ('duchesse_potato', 'potato'),
  ('early_potato_water', 'potato'), ('mashed_potato_balls', 'potato'),
  ('mashed_potatoes', 'potato'), ('new_potato', 'potato'), ('potato', 'potato'),
  ('potato_chip_quarter_spiced', 'potato'), ('potato_flakes', 'potato'),
  ('potato_flakes_milk_cream', 'potato'), ('potato_into_cubes', 'potato'),
  ('potato_puree_flakes_reconstituted', 'potato'), ('potato_puree_milk_butter', 'potato'),
  ('potato_sauteed_pan', 'potato'), ('potato_sauteed_pan_goose', 'potato'),
  ('potato_vacuum', 'potato'), ('potato_water', 'potato'),
  ('rostis_potatoes_cake', 'potato'), ('ware_potato_water', 'potato'),
  ('quinoa', 'quinoa'),
  ('brown_rice', 'rice'), ('cooked_rice', 'rice'), ('white_rice', 'rice'),
  ('butternut_squash', 'squash'),
  ('sweet_potato', 'sweet_potato'), ('sweet_potato_puree_cream', 'sweet_potato'),
  ('taro_tuber', 'taro'),
  ('corn_tortilla_wrap_be', 'wrap'), ('tortilla_wholemeal', 'wrap'),
  ('tortilla_wrap', 'wrap'), ('wheat_tortilla_wrap_be', 'wrap'),
  ('yam_indian_potato', 'yam'), ('yam_indian_potato_water', 'yam')
) as v(slug, family)
where r.slug = v.slug;

-- ── LA VÉRIFICATION, DANS LA MIGRATION ─────────────────────────────────────
-- Un slug mal écrit ci-dessus fait un `update` de zéro ligne, en silence : la
-- vraie ligne resterait sans famille. On vérifie donc la couverture, pas le
-- nombre de couples : aucune ligne hors sas des 12 groupes ne reste NULL.
-- Les lignes du sas diffèrent d'une base à l'autre (elles sont promues à
-- l'exécution) ; un slug du sas absent d'ici ne modifie rien, et c'est voulu.
do $$
declare
  manquantes text;
begin
  select string_agg(slug, ', ' order by slug) into manquantes
  from public.food_composition_refs
  where family is null
    and source <> 'sas'
    and food_group_ref in (
      'lean_protein', 'fatty_fish', 'white_fish', 'shellfish', 'poultry',
      'red_meat', 'eggs', 'legumes', 'tofu_tempeh',
      'whole_grain', 'refined_grain', 'starchy_veg'
    );
  if manquantes is not null then
    raise exception 'family: lignes sans famille dans les groupes lus par la liste « à éviter » : %', manquantes;
  end if;
end;
$$;
