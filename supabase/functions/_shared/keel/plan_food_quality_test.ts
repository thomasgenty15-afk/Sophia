/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-21 — LA QUALITÉ DES ALIMENTS, COMPTÉE SUR LES BOÎTES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le décor est un condensé du plan `3e121b21` (3 bouches, 5 jours), relu en
 * base: une casserole bœuf-riz-poivron-oignon tirée midi ET soir le même
 * jour, une casserole porc-saucisse-pâtes, un petit-déjeuner petits-suisses
 * répété au fruit près, et un goûter de thon pour la seule bouche qui grignote.
 * Les nombres attendus sont ÉCRITS EN DUR, jamais recalculés par la fonction
 * sous test.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  ANIMAL_PROTEIN_MAX_G_RAW_PER_SERVING,
  CHARCUTERIE_MAX_DISHES_PER_7_DAYS,
  DAIRY_MAX_G_PER_MOUTH_DAY,
  DAIRY_MAX_G_PER_SNACK,
  INGREDIENT_MAX_SHARE_OF_DISHES,
  CHARCUTERIE_SLUGS,
  FATTY_FISH_MAX_PER_7_DAYS,
  FATTY_FISH_MIN_PER_7_DAYS,
  RED_MEAT_PREP_MAX_DRAWS,
  FISH_MIN_SHARED_MAINS_PER_5_DAYS,
  foodQualityOf,
  perWindowCap,
  perWindowFloor,
  RED_MEAT_MAX_MAINS_PER_7_DAYS,
  TUNA_MAX_SERVINGS_PER_MOUTH_PER_7_DAYS,
  VEG_DISTINCT_FLOOR,
  VEG_FLOOR_G_PER_MAIN_SERVING,
} from "./plan_food_quality.ts";

const GROUPS: Record<string, string> = {
  beef_mince: "red_meat",
  sausage: "red_meat",
  pork_loin: "lean_protein",
  white_rice: "refined_grain",
  wholewheat_pasta: "whole_grain",
  bell_pepper: "non_starchy_veg",
  onion: "non_starchy_veg",
  spinach: "leafy_greens",
  broccoli: "cruciferous_veg",
  petit_suisse_cream_cheese: "dairy_yogurt",
  milk_semi: "dairy_yogurt",
  oats: "whole_grain",
  apple: "other_fruit",
  peach: "other_fruit",
  tuna_tinned: "white_fish",
  sardines: "fatty_fish",
  crispbread_rye: "whole_grain",
  olive_oil: "olive_oil",
  salmon: "fatty_fish",
};
const groupOf = (slug: string) => GROUPS[slug] ?? null;

const T = "thomas";
const F = "fabrice";
const C = "christele";

/** La casserole bœuf-riz du plan, en grammes crus. */
const BEEF_RICE = {
  id: "prep_beef_rice",
  cookOn: "tue",
  ingredients: [
    { ref: "beef_mince", amount: 945 },
    { ref: "white_rice", amount: 1540 },
    { ref: "bell_pepper", amount: 310 },
    { ref: "onion", amount: 310 },
    { ref: "olive_oil", amount: 75 },
  ],
};
const PORK_PASTA = {
  id: "prep_pork_pasta",
  cookOn: "wed",
  ingredients: [
    { ref: "sausage", amount: 1099 },
    { ref: "pork_loin", amount: 549 },
    { ref: "wholewheat_pasta", amount: 1282 },
    { ref: "onion", amount: 549 },
    { ref: "bell_pepper", amount: 549 },
    { ref: "olive_oil", amount: 92 },
  ],
};
const pot = (id: string, grams: number) => ({ ref: null, preparationId: id, grams });
const fresh = (ref: string, grams: number) => ({ ref, preparationId: null, grams });

/** Trois parts d'une casserole, comme le plan les sert. */
const threeBoxes = (id: string, t: number, c: number, f: number) => [
  { memberIds: [T], items: [pot(id, t)] },
  { memberIds: [C], items: [pot(id, c)] },
  { memberIds: [F], items: [pot(id, f)] },
];
const breakfast = (fruit: string) => [
  { memberIds: [T], items: [fresh("petit_suisse_cream_cheese", 223), fresh("oats", 92), fresh(fruit, 77)] },
  { memberIds: [C], items: [fresh("petit_suisse_cream_cheese", 156), fresh("oats", 65), fresh(fruit, 54)] },
  { memberIds: [F], items: [fresh("petit_suisse_cream_cheese", 173), fresh("oats", 72), fresh(fruit, 60)] },
];

const PLAN = {
  days: 2,
  preparations: [BEEF_RICE, PORK_PASTA],
  dishes: [
    { day: "tue", slot: "breakfast", boxes: breakfast("apple") },
    { day: "tue", slot: "lunch", boxes: threeBoxes("prep_beef_rice", 692, 559, 619) },
    { day: "tue", slot: "snack_pm", boxes: [{ memberIds: [T], items: [fresh("tuna_tinned", 149), fresh("crispbread_rye", 25), fresh("olive_oil", 12)] }] },
    // ⛔ LE MÊME POT MIDI ET SOIR, pour les trois: c'est le mercredi du plan.
    { day: "tue", slot: "dinner", boxes: threeBoxes("prep_beef_rice", 697, 490, 542) },
    { day: "wed", slot: "breakfast", boxes: breakfast("peach") },
    { day: "wed", slot: "lunch", boxes: threeBoxes("prep_pork_pasta", 551, 445, 493) },
    { day: "wed", slot: "snack_pm", boxes: [{ memberIds: [T], items: [fresh("tuna_tinned", 137), fresh("crispbread_rye", 40)] }] },
    { day: "wed", slot: "dinner", boxes: threeBoxes("prep_pork_pasta", 551, 390, 431) },
  ],
  groupOf,
  firstDay: "tue",
};

// ── LES NOMBRES DES RÈGLES, ÉPINGLÉS — les mêmes que le prompt ─────────────
Deno.test("épinglage — les nombres des règles de qualité", () => {
  assertEquals(VEG_FLOOR_G_PER_MAIN_SERVING, 150);
  assertEquals(VEG_DISTINCT_FLOOR, 4);
  assertEquals(CHARCUTERIE_MAX_DISHES_PER_7_DAYS, 1);
  assertEquals(RED_MEAT_MAX_MAINS_PER_7_DAYS, 3);
  assertEquals(FISH_MIN_SHARED_MAINS_PER_5_DAYS, 1);
  assertEquals(FATTY_FISH_MIN_PER_7_DAYS, 1);
  assertEquals(FATTY_FISH_MAX_PER_7_DAYS, 2);
  assertEquals(RED_MEAT_PREP_MAX_DRAWS, 2);
  assertEquals(TUNA_MAX_SERVINGS_PER_MOUTH_PER_7_DAYS, 2);
  // La liste fermée relue en base le 2026-09-21: 89 slugs, sans les jarrets frais.
  assertEquals(CHARCUTERIE_SLUGS.size, 89);
  assert(CHARCUTERIE_SLUGS.has("sausage"));
  assert(CHARCUTERIE_SLUGS.has("cured_ham"));
  assert(!CHARCUTERIE_SLUGS.has("pork_loin"));
  assert(!CHARCUTERIE_SLUGS.has("beef_knuckle"));
  assert(!CHARCUTERIE_SLUGS.has("pork_ham_escalope"));
});

Deno.test("prorata des plafonds et des exigences sur la fenêtre", () => {
  // « 3 sur 7 jours »: 2 sur 5, 3 sur 7, jamais sous 1.
  assertEquals(perWindowCap(3, 5), 2);
  assertEquals(perWindowCap(3, 7), 3);
  assertEquals(perWindowCap(1, 5), 1);
  assertEquals(perWindowCap(1, 2), 1);
  assertEquals(perWindowCap(2, 5), 1);
  // « 1 par tranche de 5 jours »: 0 sur 2, 1 sur 5, 1 sur 7.
  assertEquals(perWindowFloor(1, 5, 2), 0);
  assertEquals(perWindowFloor(1, 5, 5), 1);
  assertEquals(perWindowFloor(1, 5, 7), 1);
  assertEquals(perWindowFloor(1, 7, 5), 0);
  assertEquals(perWindowFloor(1, 7, 7), 1);
});

// ── LE PLAN CONDENSÉ ────────────────────────────────────────────────────────
Deno.test("légumes — 12 parts principales mesurées, toutes sous 150 g, deux légumes", () => {
  const q = foodQualityOf(PLAN);
  assertEquals(q.unresolved_refs, 0);
  assertEquals(q.vegetables.main_servings, 12);
  // Le prorata est celui de ce que la part TIRE sur tout ce qui est tiré de
  // la casserole (3 599 g pour le bœuf-riz, 2 861 g pour le porc-pâtes). Les
  // six parts de bœuf-riz portent 85 à 119 g de poivron+oignon: sous 150.
  // Les parts de porc-pâtes vont de 150 (390 g pour Christèle: 149,7) à 211 g:
  // une seule sous le plancher. Sept en tout.
  assertEquals(q.vegetables.under_floor, 7);
  assertEquals(q.vegetables.distinct, 2);
  assertEquals(q.vegetables.distinct_floor, 4);
  assertEquals(q.vegetables.mouth_days, 6);
  assert(q.vegetables.min_g_per_mouth_day !== null && q.vegetables.min_g_per_mouth_day < 200);
});

Deno.test("charcuterie et viande rouge — la saucisse compte comme charcuterie, le bœuf comme viande rouge", () => {
  const q = foodQualityOf(PLAN);
  // Deux plats de porc-pâtes (mercredi midi et soir) portent de la saucisse.
  assertEquals(q.charcuterie.dishes, 2);
  assertEquals(q.charcuterie.cap, 1);
  assertEquals(q.charcuterie.over, 1);
  // Bœuf-riz midi et soir: deux plats principaux à la viande rouge (la
  // saucisse n'y est pas comptée deux fois: elle est charcuterie).
  assertEquals(q.red_meat.main_dishes, 2);
  assertEquals(q.red_meat.cap, 1);
  assertEquals(q.red_meat.over, 1);
  assert(q.charcuterie.max_g_per_mouth_day !== null && q.charcuterie.max_g_per_mouth_day > 150);
});

Deno.test("poisson — aucun plat partagé, tout le thon dans les goûters d'une seule bouche", () => {
  const q = foodQualityOf(PLAN);
  assertEquals(q.fish.shared_mains, 0);
  // Deux jours: aucune exigence de poisson n'est encore due.
  assertEquals(q.fish.required, 0);
  assertEquals(q.fish.missing, 0);
  assertEquals(q.fish.fatty_dishes, 0);
  assertEquals(q.fish.tuna_servings_max_per_mouth, 2);
  assertEquals(q.fish.tuna_cap, 1);
  assertEquals(q.fish.tuna_over, 1);
});

Deno.test("répétition — le même pot midi et soir, six fois; un seul petit-déjeuner au fruit près", () => {
  const q = foodQualityOf(PLAN);
  // Mardi bœuf-riz ×2 et mercredi porc-pâtes ×2, pour trois bouches: 6.
  assertEquals(q.repetition.same_pot_twice_a_day, 6);
  assertEquals(q.repetition.breakfast_dishes, 2);
  assertEquals(q.repetition.breakfast_bases, 1);
  // Sous trois petits-déjeuners, on ne conclut pas encore.
  assertEquals(q.repetition.under_two_bases, false);
});

Deno.test("un plan de cinq jours avec un poisson partagé et des légumes variés passe", () => {
  const q = foodQualityOf({
    days: 5,
    preparations: [],
    dishes: [
      { day: "mon", slot: "lunch", boxes: [{ memberIds: [T, F], items: [fresh("salmon", 140), fresh("spinach", 160), fresh("white_rice", 70)] }] },
      { day: "tue", slot: "dinner", boxes: [{ memberIds: [T, F], items: [fresh("pork_loin", 130), fresh("broccoli", 180), fresh("wholewheat_pasta", 80)] }] },
      { day: "wed", slot: "dinner", boxes: [{ memberIds: [T, F], items: [fresh("beef_mince", 120), fresh("bell_pepper", 100), fresh("onion", 60), fresh("white_rice", 70)] }] },
    ],
    groupOf,
    firstDay: "mon",
  });
  assertEquals(q.vegetables.under_floor, 0);
  assertEquals(q.vegetables.distinct, 4);
  assertEquals(q.fish.shared_mains, 1);
  assertEquals(q.fish.required, 1);
  assertEquals(q.fish.missing, 0);
  assertEquals(q.fish.fatty_dishes, 1);
  assertEquals(q.fish.fatty_required, 0);
  assertEquals(q.red_meat.main_dishes, 1);
  assertEquals(q.red_meat.cap, 2);
  assertEquals(q.charcuterie.dishes, 0);
  assertEquals(q.repetition.same_pot_twice_a_day, 0);
});

Deno.test("un slug inconnu du référentiel est compté, jamais deviné", () => {
  const q = foodQualityOf({
    days: 1,
    preparations: [],
    dishes: [{ day: "mon", slot: "lunch", boxes: [{ memberIds: [T], items: [fresh("mystery_root", 200)] }] }],
    groupOf,
    firstDay: "mon",
  });
  assertEquals(q.unresolved_refs, 1);
  assertEquals(q.vegetables.under_floor, 1);
});


// ── ⟳ 2026-09-21 — LES CAPS DE PART, DE LAITAGE, D'INGRÉDIENT, ET L'HEURE ───
Deno.test("épinglage — les nombres des caps", () => {
  assertEquals(ANIMAL_PROTEIN_MAX_G_RAW_PER_SERVING, 150);
  assertEquals(DAIRY_MAX_G_PER_MOUTH_DAY, 250);
  assertEquals(DAIRY_MAX_G_PER_SNACK, 150);
  assertEquals(INGREDIENT_MAX_SHARE_OF_DISHES, 0.5);
});

Deno.test("part animale — 300 g de maquereau par part sont comptés au-dessus de 150", () => {
  // Le condensé du plan `c1ce4658`: 1 837 g de maquereau, 1 418 g de pommes de
  // terre, 1 060 g de haricots verts, tirés 3 699 g sur deux déjeuners.
  const q = foodQualityOf({
    days: 2,
    firstDay: "thu",
    preparations: [{
      id: "prep_mackerel_potato",
      cookOn: "thu",
      ingredients: [{ ref: "mackerel", amount: 1837 }, { ref: "potato", amount: 1418 }, { ref: "french_bean", amount: 1060 }],
    }],
    dishes: [
      { day: "thu", slot: "lunch", boxes: threeBoxes("prep_mackerel_potato", 688, 546, 615) },
      { day: "fri", slot: "lunch", boxes: threeBoxes("prep_mackerel_potato", 688, 546, 616) },
    ],
    groupOf: (slug) => ({ mackerel: "fatty_fish", potato: "starchy_veg", french_bean: "non_starchy_veg" })[slug] ?? null,
  });
  assertEquals(q.animal_protein.main_servings, 6);
  // 1 837 × 688 / 3 699 = 342 g pour la plus grosse part.
  assertEquals(q.animal_protein.max_g_raw, 342);
  assertEquals(q.animal_protein.over, 6, "les six parts dépassent 150 g");
  // Et le déjeuner de jeudi est tiré d'une casserole cuite jeudi: cuisine du
  // matin. Jeudi est le premier jour du condensé, donc toléré; vendredi non.
  assertEquals(q.timing.lunch_from_same_day_pot, 1);
  assertEquals(q.timing.of_which_first_day, 1);
});

Deno.test("laitages — 773 g par jour et 235 g dans un goûter dépassent les caps", () => {
  const q = foodQualityOf(PLAN);
  // Thomas: 223 g au petit-déjeuner, deux jours: 223 par journée-bouche.
  assertEquals(q.dairy.max_g_per_mouth_day, 223);
  assertEquals(q.dairy.over_mouth_days, 0);
  assertEquals(q.dairy.snack_max_g, null, "aucun laitage dans les goûters au thon");
  const gros = foodQualityOf({
    ...PLAN,
    dishes: [
      ...PLAN.dishes,
      { day: "tue", slot: "snack_pm", boxes: [{ memberIds: [T], items: [fresh("petit_suisse_cream_cheese", 235), fresh("oats", 17)] }] },
      { day: "tue", slot: "snack_am", boxes: [{ memberIds: [T], items: [fresh("petit_suisse_cream_cheese", 177), fresh("milk_semi", 62)] }] },
    ],
  });
  // 223 + 235 + 177 = 635 g le mardi pour Thomas; les 62 ml de lait du
  // shaker ne comptent pas (`MILK_SLUG_PREFIX`).
  assertEquals(gros.dairy.max_g_per_mouth_day, 635);
  assertEquals(gros.dairy.over_mouth_days, 1);
  assertEquals(gros.dairy.snack_max_g, 235);
  assertEquals(gros.dairy.snack_over, 2);
});

Deno.test("ingrédient — le petit-suisse dans plus de la moitié des plats se voit", () => {
  const q = foodQualityOf(PLAN);
  // 8 plats. L'huile est dans 5 (assaisonnement: ne compte pas), le citron et
  // le persil sont des pincées. Poivron et oignon sont dans les 4 plats de
  // casserole: pile la moitié, pas au-dessus.
  assertEquals(q.ingredients.dishes, 8);
  assertEquals(q.ingredients.max_share, 0.5);
  assertEquals(q.ingredients.over_half, false);
  const partout = foodQualityOf({
    ...PLAN,
    dishes: PLAN.dishes.map((d) => ({
      ...d,
      boxes: d.boxes.map((b) => ({ ...b, items: [...b.items, fresh("petit_suisse_cream_cheese", 50)] })),
    })),
  });
  assertEquals(partout.ingredients.top_slug, "petit_suisse_cream_cheese");
  assertEquals(partout.ingredients.top_dishes, 8);
  assertEquals(partout.ingredients.over_half, true);
});


// ── ⟳ 2026-09-21 — POISSON HORS DES REPAS, POISSON GRAS, TIRAGES D'UN POT ───
Deno.test("poisson — du thon au petit-déjeuner et quatre poissons gras en quatre jours se voient", () => {
  const q = foodQualityOf({
    days: 4,
    firstDay: "tue",
    preparations: [
      { id: "p_mack", cookOn: "tue", ingredients: [{ ref: "mackerel", amount: 340 }, { ref: "couscous_wholemeal", amount: 405 }] },
      { id: "p_salm", cookOn: "thu", ingredients: [{ ref: "salmon", amount: 714 }, { ref: "barley", amount: 833 }] },
      BEEF_RICE,
    ],
    dishes: [
      { day: "tue", slot: "dinner", boxes: threeBoxes("prep_beef_rice", 674, 480, 541) },
      { day: "wed", slot: "lunch", boxes: threeBoxes("prep_beef_rice", 691, 548, 618) },
      { day: "thu", slot: "lunch", boxes: threeBoxes("prep_beef_rice", 678, 538, 607) },
      { day: "wed", slot: "dinner", boxes: threeBoxes("p_mack", 688, 490, 553) },
      { day: "thu", slot: "dinner", boxes: threeBoxes("p_salm", 692, 492, 555) },
      { day: "fri", slot: "lunch", boxes: threeBoxes("p_salm", 698, 562, 634) },
      { day: "fri", slot: "breakfast", boxes: [{ memberIds: [T, C, F], items: [fresh("tuna_tinned", 142), fresh("wholemeal_bread", 142)] }] },
      { day: "fri", slot: "dinner", boxes: [{ memberIds: [T, C, F], items: [fresh("sardines", 123), fresh("wholemeal_bread", 112)] }] },
    ],
    groupOf: (slug) => ({ ...GROUPS, mackerel: "fatty_fish", salmon: "fatty_fish", barley: "whole_grain", couscous_wholemeal: "whole_grain" })[slug] ?? null,
  });
  // Maquereau, saumon ×2, sardines: quatre plats de poisson gras pour un
  // plafond de round(2 × 4 / 7) = 1.
  assertEquals(q.fish.fatty_dishes, 4);
  assertEquals(q.fish.fatty_cap, 1);
  assertEquals(q.fish.fatty_over, 3);
  // Le thon du petit-déjeuner: du poisson hors déjeuner et dîner.
  assertEquals(q.fish.outside_mains, 1);
  // Le pot de bœuf tiré trois fois, pour deux au plus.
  assertEquals(q.red_meat.max_draws, 3);
  assertEquals(q.red_meat.draws_over, 1);
});

Deno.test("poisson — LE CAS QUI PASSE: deux poissons gras sur sept jours, rien le matin, un pot tiré deux fois", () => {
  const q = foodQualityOf(PLAN);
  assertEquals(q.fish.outside_mains, 2, "les deux goûters au thon de Thomas, hors repas principaux");
  assertEquals(q.fish.fatty_over, 0);
  assertEquals(q.red_meat.max_draws, 2, "bœuf-riz tiré mardi midi et soir");
  assertEquals(q.red_meat.draws_over, 0);
});
