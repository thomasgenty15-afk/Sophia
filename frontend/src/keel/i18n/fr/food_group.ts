// Pack français — le namespace `food_group`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `food_group.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frFoodGroup = {
  // ── Les groupes d'aliments ───────────────────────────────────────────────
  // Le mot, en milieu de phrase, en minuscules.
  "food_group.lean_protein": "protéines",
  "food_group.fatty_fish": "poissons gras",
  "food_group.white_fish": "poissons blancs",
  "food_group.shellfish": "fruits de mer",
  "food_group.poultry": "volaille",
  "food_group.red_meat": "viande rouge",
  "food_group.eggs": "œufs",
  "food_group.legumes": "légumineuses",
  "food_group.tofu_tempeh": "tofu ou tempeh",
  "food_group.dairy_yogurt": "yaourt",
  "food_group.dairy_cheese": "fromage",
  "food_group.whole_grain": "céréales complètes",
  "food_group.refined_grain": "céréales raffinées",
  "food_group.starchy_veg": "légumes féculents",
  "food_group.cruciferous_veg": "crucifères",
  "food_group.leafy_greens": "légumes-feuilles",
  "food_group.non_starchy_veg": "légumes",
  "food_group.berries": "fruits rouges",
  "food_group.citrus": "agrumes",
  "food_group.other_fruit": "fruits",
  "food_group.nuts_seeds": "fruits à coque et graines",
  "food_group.olive_oil": "huile d’olive",
  "food_group.other_added_fat": "matières grasses ajoutées",
  "food_group.sauce_dressing": "sauces et vinaigrettes",
  "food_group.sugar_sweets": "sucre et sucreries",
  "food_group.fried_food": "fritures",
  "food_group.alcohol": "alcool",
  "food_group.sweetened_beverage": "boissons sucrées",
  "food_group.water": "eau",
  "food_group.coffee_tea": "café ou thé",

  // ── Les mêmes groupes, APRÈS UNE QUANTITÉ ────────────────────────────────
  // C'EST CETTE TABLE QUI A FAIT DÉPLACER LE « of » HORS DU GABARIT. Trois
  // choses qu'aucune règle mécanique ne produit ensemble:
  //   · l'élision devant voyelle — « d’œufs », « d’agrumes », « d’alcool »;
  //   · l'élision devant un h MUET — « d’huile d’olive » — alors qu'un h aspiré
  //     ne s'élide pas (« de haricots »), et rien dans le mot ne le dit;
  //   · le redoublement à l'intérieur d'un groupe composé — « de fruits à coque
  //     et DE graines », « de sauces et DE vinaigrettes ».
  "food_group.of.lean_protein": "de protéines",
  "food_group.of.fatty_fish": "de poissons gras",
  "food_group.of.white_fish": "de poissons blancs",
  "food_group.of.shellfish": "de fruits de mer",
  "food_group.of.poultry": "de volaille",
  "food_group.of.red_meat": "de viande rouge",
  "food_group.of.eggs": "d’œufs",
  "food_group.of.legumes": "de légumineuses",
  "food_group.of.tofu_tempeh": "de tofu ou de tempeh",
  "food_group.of.dairy_yogurt": "de yaourt",
  "food_group.of.dairy_cheese": "de fromage",
  "food_group.of.whole_grain": "de céréales complètes",
  "food_group.of.refined_grain": "de céréales raffinées",
  "food_group.of.starchy_veg": "de légumes féculents",
  "food_group.of.cruciferous_veg": "de crucifères",
  "food_group.of.leafy_greens": "de légumes-feuilles",
  "food_group.of.non_starchy_veg": "de légumes",
  "food_group.of.berries": "de fruits rouges",
  "food_group.of.citrus": "d’agrumes",
  "food_group.of.other_fruit": "de fruits",
  "food_group.of.nuts_seeds": "de fruits à coque et de graines",
  "food_group.of.olive_oil": "d’huile d’olive",
  "food_group.of.other_added_fat": "de matières grasses ajoutées",
  "food_group.of.sauce_dressing": "de sauces et de vinaigrettes",
  "food_group.of.sugar_sweets": "de sucre et de sucreries",
  "food_group.of.fried_food": "de fritures",
  "food_group.of.alcohol": "d’alcool",
  "food_group.of.sweetened_beverage": "de boissons sucrées",
  "food_group.of.water": "d’eau",
  "food_group.of.coffee_tea": "de café ou de thé",
} satisfies TranslatedMessagesOf<"food_group">;
