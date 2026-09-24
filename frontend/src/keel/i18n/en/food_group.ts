// Seed anglais — le namespace `food_group`, et lui seul.
// Assemblé dans `../en.ts`; une clé `food_group.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enFoodGroup = {
  // food_groups.label_i18n_key. The table has carried these keys since the P0
  // migration and nothing defined them; every food line therefore had to fall
  // back to its raw slug ("non_starchy_veg"). Written as the word a coach uses
  // mid-sentence, lowercase, because that is where they are read:
  // "2 servings of vegetables".
  "food_group.lean_protein": "protein",
  "food_group.fatty_fish": "oily fish",
  "food_group.white_fish": "white fish",
  "food_group.shellfish": "shellfish",
  "food_group.poultry": "poultry",
  "food_group.red_meat": "red meat",
  "food_group.eggs": "eggs",
  "food_group.legumes": "legumes",
  "food_group.tofu_tempeh": "tofu or tempeh",
  "food_group.dairy_yogurt": "yogurt",
  "food_group.dairy_cheese": "cheese",
  "food_group.whole_grain": "wholegrains",
  "food_group.refined_grain": "refined grains",
  "food_group.starchy_veg": "starchy vegetables",
  "food_group.cruciferous_veg": "cruciferous vegetables",
  "food_group.leafy_greens": "leafy greens",
  "food_group.non_starchy_veg": "vegetables",
  "food_group.berries": "berries",
  "food_group.citrus": "citrus fruit",
  "food_group.other_fruit": "fruit",
  "food_group.nuts_seeds": "nuts and seeds",
  "food_group.olive_oil": "olive oil",
  "food_group.other_added_fat": "added fat",
  "food_group.sauce_dressing": "sauces and dressings",
  "food_group.sugar_sweets": "sugar and sweets",
  "food_group.fried_food": "fried food",
  "food_group.alcohol": "alcohol",
  "food_group.sweetened_beverage": "sweetened drinks",
  "food_group.water": "water",
  "food_group.coffee_tea": "coffee or tea",

  // ==========================================================================
  // LES MÊMES GROUPES, APRÈS UNE QUANTITÉ ("2 servings ___")
  //
  // ⚠️ CETTE TABLE A L'AIR REDONDANTE EN ANGLAIS, ET C'EST EXACTEMENT POURQUOI
  // ELLE EST ÉCRITE ICI PLUTÔT QUE FABRIQUÉE PAR DU CODE. En anglais, « of » +
  // le mot nu suffit, donc un `"of " + foodGroupLabel(slug)` aurait rendu les
  // trente lignes identiques à ce qu'on lit ci-dessous. En français, non:
  //
  //     de légumes · d'œufs · d'huile d'olive
  //     de fruits à coque et DE graines
  //
  // L'élision dépend du mot suivant (et pas seulement de sa première lettre:
  // « d'huile » s'élide, « de haricots » ne s'élide pas), et un groupe composé
  // redouble la préposition à l'intérieur de lui-même. Aucune règle mécanique
  // ne produit les trois — le dépôt a déjà payé un matcher maison écrit sur ce
  // genre d'intuition. La préposition est donc de la DONNÉE de langue, au même
  // titre que le mot, et elle est rangée avec lui.
  //
  // Le jeton, lui, ne bouge pas: `food_group.of.eggs` reste `eggs` (R1).
  // ==========================================================================
  "food_group.of.lean_protein": "of protein",
  "food_group.of.fatty_fish": "of oily fish",
  "food_group.of.white_fish": "of white fish",
  "food_group.of.shellfish": "of shellfish",
  "food_group.of.poultry": "of poultry",
  "food_group.of.red_meat": "of red meat",
  "food_group.of.eggs": "of eggs",
  "food_group.of.legumes": "of legumes",
  "food_group.of.tofu_tempeh": "of tofu or tempeh",
  "food_group.of.dairy_yogurt": "of yogurt",
  "food_group.of.dairy_cheese": "of cheese",
  "food_group.of.whole_grain": "of wholegrains",
  "food_group.of.refined_grain": "of refined grains",
  "food_group.of.starchy_veg": "of starchy vegetables",
  "food_group.of.cruciferous_veg": "of cruciferous vegetables",
  "food_group.of.leafy_greens": "of leafy greens",
  "food_group.of.non_starchy_veg": "of vegetables",
  "food_group.of.berries": "of berries",
  "food_group.of.citrus": "of citrus fruit",
  "food_group.of.other_fruit": "of fruit",
  "food_group.of.nuts_seeds": "of nuts and seeds",
  "food_group.of.olive_oil": "of olive oil",
  "food_group.of.other_added_fat": "of added fat",
  "food_group.of.sauce_dressing": "of sauces and dressings",
  "food_group.of.sugar_sweets": "of sugar and sweets",
  "food_group.of.fried_food": "of fried food",
  "food_group.of.alcohol": "of alcohol",
  "food_group.of.sweetened_beverage": "of sweetened drinks",
  "food_group.of.water": "of water",
  "food_group.of.coffee_tea": "of coffee or tea",
} as const
