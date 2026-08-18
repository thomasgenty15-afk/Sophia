// FF-059 — LE CALCUL. Ce que ces tests protègent, dans l'ordre de ce que ça
// coûte quand ça casse:
//
//   * LE TOTAL QUI FAIT SEMBLANT — un plat sans chiffre qui disparaît d'une
//     somme présentée comme la journée. C'est le rabbit hole n°3 de la fiche et
//     le seul défaut de ce module qui trompe activement quelqu'un;
//   * LE CHIFFRE AMPUTÉ — une préparation non pliée retire 41 % de l'énergie
//     (mesuré, 80 générations) sans que rien ne baisse le drapeau `complete`;
//   * L'ARITHMÉTIQUE — vérifiée À LA MAIN contre une table de référence. C'est
//     une table, pas un modèle: l'écart attendu est NUL;
//   * `complete: false` AVEC UN CHIFFRE — la combinaison interdite. Elle
//     n'existe dans aucune sortie, et un test la cherche sur toutes.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  dishEnergy,
  type DishEnergy,
  ENERGY_GAPS,
  type EnergyDish,
  memberAddonEnergy,
  PLAN_ENERGY_BASIS,
  planEnergy,
} from "./plan_energy.ts";
import type { CompositionInput } from "./food_composition.ts";

// ---------------------------------------------------------------------------
// LE BANC — des valeurs RONDES, pour que l'attendu se calcule de tête
// ---------------------------------------------------------------------------

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    ...over,
  } as CompositionRef;
}

const REFS: CompositionRef[] = [
  // 110 kcal / 100 g CRUS, la viande perd 30 % à la cuisson.
  ref({
    slug: "chicken_breast",
    foodGroupRef: "poultry",
    energyKcal: 110,
    yieldClass: "meat_shrinks",
  }),
  // 350 kcal / 100 g CRUS, le riz gonfle ×2,6.
  ref({
    slug: "white_rice",
    foodGroupRef: "refined_grain",
    energyKcal: 350,
    yieldClass: "grain_absorbs",
  }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, energyDense: true }),
  ref({ slug: "broccoli", energyKcal: 30, yieldClass: "veg_shrinks" }),
  // Un poids d'unité: « 2 œufs » est pesable, « 2 courgettes » ne l'est pas.
  ref({ slug: "whole_eggs", foodGroupRef: "eggs", energyKcal: 140, unitGrams: 50 }),
  // Résolu, DENSE, et sans poids d'unité: le piège du non-pesé.
  ref({ slug: "butter", foodGroupRef: "other_added_fat", energyKcal: 750, energyDense: true }),
];

const INDEX = buildCompositionIndex(REFS, [
  { alias: "chicken breast", slug: "chicken_breast" },
  { alias: "rice", slug: "white_rice" },
  { alias: "olive oil", slug: "olive_oil" },
  { alias: "broccoli", slug: "broccoli" },
  { alias: "eggs", slug: "whole_eggs" },
  { alias: "butter", slug: "butter" },
]);

// ---------------------------------------------------------------------------
// EASY — l'arithmétique, vérifiée à la main
// ---------------------------------------------------------------------------

Deno.test("FF-059 — un plat pesé rend SON chiffre, calculé à la main", () => {
  //   150 g poulet CRU   → 1,50 × 110 = 165
  //    80 g riz CRU      → 0,80 × 350 = 280
  //    10 g huile        → 0,10 × 900 =  90
  //                                    ----
  //                                     535
  const e = dishEnergy(INDEX, {
    method: "Roast it.",
    ingredients: [
      { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
      { term: "rice", amount: 80, unit: "g", state: "raw" },
      { term: "olive oil", amount: 10, unit: "g", state: "raw" },
    ],
  });
  assertEquals(e, {
    kcal: 535,
    basis: PLAN_ENERGY_BASIS,
    complete: true,
    gaps: [],
    unreadableTerms: [],
  });
});

Deno.test("FF-059 — `cooked` repasse par le rendement, il ne se croit pas cru", () => {
  // 260 g de riz CUIT = 100 g cru (×2,6) = 350 kcal. Sans le rendement, on
  // compterait 910 — l'erreur d'un facteur 2,6, toujours vers le haut.
  const e = dishEnergy(INDEX, {
    method: "Reheat it.",
    ingredients: [{ term: "rice", amount: 260, unit: "g", state: "cooked" }],
  });
  assertEquals(e.kcal, 350);
});

Deno.test("FF-059 — la friture impute son huile (convention avouée de FF-038)", () => {
  // 200 g poulet cru = 220 kcal. Poids CUIT = 200 × 0,70 = 140 g.
  // Huile absorbée = 12 % × 140 = 16,8 g × 9 kcal/g = 151,2.  Total 371,2 → 371.
  const fried = dishEnergy(INDEX, {
    method: "Deep fried in a pan.",
    ingredients: [{ term: "chicken breast", amount: 200, unit: "g", state: "raw" }],
  });
  const steamed = dishEnergy(INDEX, {
    method: "Steamed, no oil.",
    ingredients: [{ term: "chicken breast", amount: 200, unit: "g", state: "raw" }],
  });
  assertEquals(steamed.kcal, 220);
  assertEquals(fried.kcal, 371);
});

Deno.test("FF-059 — « unit » se pèse quand le référentiel connaît le poids d'une", () => {
  // 3 œufs × 50 g = 150 g → 1,5 × 140 = 210.
  const e = dishEnergy(INDEX, {
    method: "Scramble them.",
    ingredients: [{ term: "eggs", amount: 3, unit: "unit", state: null }],
  });
  assertEquals(e.kcal, 210);
});

// ---------------------------------------------------------------------------
// HARD — les modes de défaillance de §7
// ---------------------------------------------------------------------------

Deno.test("FF-059 — un ingrédient HORS TABLE: pas de chiffre sur ce plat", () => {
  const e = dishEnergy(INDEX, {
    method: "Cook it.",
    ingredients: [
      { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
      { term: "kokum rind", amount: 5, unit: "g", state: "raw" },
    ],
  });
  assertEquals(e.kcal, null);
  assertEquals(e.complete, false);
  assertEquals(e.gaps, ["unknown_ingredient"]);
  assertEquals(e.unreadableTerms, ["kokum rind"]);
});

Deno.test("FF-059 — une QUANTITÉ ABSENTE: pas de chiffre, et le motif est distinct", () => {
  // « a drizzle of olive oil »: le référentiel CONNAÎT l'huile, on ne sait pas
  // la peser. Motif `missing_quantity` et pas `unknown_ingredient` — les deux
  // se réparent ailleurs (le prompt vs la curation d'alias).
  const e = dishEnergy(INDEX, {
    method: "Cook it.",
    ingredients: [
      { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
      { term: "olive oil", amount: null, unit: null, state: null },
    ],
  });
  assertEquals(e.kcal, null);
  assertEquals(e.gaps, ["missing_quantity"]);
  assertEquals(e.unreadableTerms, ["olive oil"]);
});

Deno.test("FF-059 — un `state` absent sur du riz ABSTIENT (facteur 2,6)", () => {
  // Deviner « raw » ferait compter 260 g de riz cru là où l'élève en mange 100
  // cuits: ~900 kcal d'écart sur une assiette. `gramsRawOf` rend `null`, et ce
  // module en fait une abstention plutôt qu'un défaut.
  const e = dishEnergy(INDEX, {
    method: "Serve it.",
    ingredients: [{ term: "rice", amount: 100, unit: "g", state: null }],
  });
  assertEquals(e.kcal, null);
  assertEquals(e.gaps, ["missing_quantity"]);
});

Deno.test("FF-059 — un `state` absent sur une HUILE ne coûte rien (rendement 1,0)", () => {
  // Prémisse fausse de la garde ci-dessus: elle doit laisser passer là où le
  // `state` ne change rien. Une garde qui refuse tout ressemble à une garde.
  const e = dishEnergy(INDEX, {
    method: "Drizzle.",
    ingredients: [{ term: "olive oil", amount: 10, unit: "g", state: null }],
  });
  assertEquals(e.kcal, 90);
  assertEquals(e.complete, true);
});

Deno.test("FF-059 — un plat sans ingrédient nommé n'est pas un plat à 0 kcal", () => {
  for (const ingredients of [[], [{ term: "  " }]]) {
    const e = dishEnergy(INDEX, { method: "…", ingredients });
    assertEquals(e.kcal, null);
    assertEquals(e.gaps, ["no_ingredients"]);
  }
});

// ---------------------------------------------------------------------------
// LE PLIAGE DES PRÉPARATIONS — 41 % de l'énergie en dépend
// ---------------------------------------------------------------------------

Deno.test("FF-059 — la préparation entre au PRORATA, pas en entier", () => {
  // Lot: 1000 g de poulet cru = 1100 kcal, pour 4 portions.
  // Le plat en prend 1 → 275 kcal, plus ses 80 g de riz crus (280).
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [{
      day: "mon",
      method: "Assemble.",
      ingredients: [{ term: "rice", amount: 80, unit: "g", state: "raw" }],
      uses: [{ preparationId: "prep_chicken", servings: 1 }],
    }],
    preparations: [{
      id: "prep_chicken",
      servingsMade: 4,
      ingredients: [{ term: "chicken breast", amount: 1000, unit: "g", state: "raw" }],
    }],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.dishes[0].kcal, 555);
  assertEquals(plan.dishes[0].complete, true);
});

Deno.test("FF-059 — une préparation ILLISIBLE contamine le plat qui y puise", () => {
  // Sans ça, le plat rendrait 280 kcal `complete: true` en ayant perdu tout son
  // poulet — un chiffre amputé qui a l'air d'un résultat.
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [{
      day: "mon",
      method: "Assemble.",
      ingredients: [{ term: "rice", amount: 80, unit: "g", state: "raw" }],
      uses: [{ preparationId: "prep_x", servings: 1 }],
    }],
    preparations: [{
      id: "prep_x",
      servingsMade: 4,
      ingredients: [{ term: "wagyu tri-tip", amount: 900, unit: "g", state: "raw" }],
    }],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.dishes[0].kcal, null);
  assertEquals(plan.dishes[0].gaps, ["unknown_ingredient"]);
});

Deno.test("FF-059 — un ingrédient DENSE non pesé dans une préparation abstient", () => {
  // « butter, to taste » dans le lot: le référentiel le connaît, on ne sait pas
  // le peser, et il vaut 750 kcal aux 100 g. C'est le mode de défaillance
  // `unweighedEnergyDense` de FF-038, transporté jusqu'ici.
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [{
      day: "mon",
      method: "Assemble.",
      ingredients: [],
      uses: [{ preparationId: "p", servings: 1 }],
    }],
    preparations: [{
      id: "p",
      servingsMade: 2,
      ingredients: [
        { term: "chicken breast", amount: 400, unit: "g", state: "raw" },
        { term: "butter", amount: null, unit: null, state: null },
      ],
    }],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.dishes[0].kcal, null);
  assertEquals(plan.dishes[0].gaps, ["missing_quantity"]);
});

// ---------------------------------------------------------------------------
// LE TOTAL DU JOUR — et le total qui fait semblant
// ---------------------------------------------------------------------------

const THREE_DISHES: EnergyDish[] = [
  {
    day: "mon",
    method: "Boil.",
    ingredients: [{ term: "rice", amount: 80, unit: "g", state: "raw" }],
    uses: [],
  },
  {
    day: "mon",
    method: "Roast.",
    ingredients: [{ term: "chicken breast", amount: 150, unit: "g", state: "raw" }],
    uses: [],
  },
  {
    day: "tue",
    method: "Steam.",
    ingredients: [{ term: "broccoli", amount: 200, unit: "g", state: "raw" }],
    uses: [],
  },
];

Deno.test("FF-059 — la journée porte SA somme, plat par plat", () => {
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: THREE_DISHES,
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.dishes.map((d) => d.kcal), [280, 165, 60]);
  assertEquals(plan.days, [
    {
      day: "mon",
      kcal: 445,
      basis: PLAN_ENERGY_BASIS,
      complete: true,
      dishesCounted: 2,
      dishesTotal: 2,
      mealsOut: 0,
      subject: "the_day",
      addonKcal: 0,
    },
    {
      day: "tue",
      kcal: 60,
      basis: PLAN_ENERGY_BASIS,
      complete: true,
      dishesCounted: 1,
      dishesTotal: 1,
      mealsOut: 0,
      subject: "the_day",
      addonKcal: 0,
    },
  ]);
});

Deno.test("FF-059 — UN plat non calculable ⇒ la journée DIT qu'elle est incomplète", () => {
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [
      THREE_DISHES[0],
      {
        day: "mon",
        method: "Cook.",
        ingredients: [{ term: "kokum rind", amount: 5, unit: "g", state: "raw" }],
        uses: [],
      },
    ],
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  const monday = plan.days[0];
  assertEquals(monday.complete, false);
  // Le chiffre EXISTE, et il est explicitement partiel. C'est le §8 mot pour
  // mot — et ce qui l'empêche d'être un mensonge est le couple ci-dessous, que
  // la copie DOIT rendre.
  assertEquals(monday.kcal, 280);
  assertEquals(monday.dishesCounted, 1);
  assertEquals(monday.dishesTotal, 2);
  // Et le plat fautif ne porte rien.
  assertEquals(plan.dishes[1].kcal, null);
});

Deno.test("FF-059 — une journée dont AUCUN plat n'est lisible ne vaut pas 0", () => {
  // « 0 kcal » se lirait « cette journée ne nourrit pas », le sens exactement
  // inverse de « on n'a pas su lire ».
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [{
      day: "wed",
      method: "Cook.",
      ingredients: [{ term: "kokum rind", amount: 5, unit: "g", state: "raw" }],
      uses: [],
    }],
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.days[0].kcal, null);
  assertEquals(plan.days[0].complete, false);
  assertEquals(plan.days[0].dishesCounted, 0);
});

Deno.test("FF-059 — les jours sortent dans l'ORDRE D'ENTRÉE, pas triés", () => {
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [
      { ...THREE_DISHES[0], day: "thu" },
      { ...THREE_DISHES[1], day: "fri" },
      { ...THREE_DISHES[2], day: null },
    ],
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.days.map((d) => d.day), ["thu", "fri", null]);
});

// ---------------------------------------------------------------------------
// LES PORTIONS
// ---------------------------------------------------------------------------

Deno.test("FF-059 — `servings` divise: la quantité écrite est pour LA TABLE", () => {
  const four = planEnergy({
    index: INDEX,
    servings: 4,
    dishes: THREE_DISHES,
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(four.dishes.map((d) => d.kcal), [70, 41, 15]);
  assertEquals(four.days[0].kcal, 111);
});

Deno.test("FF-059 — un `servings` absent ou absurde LÈVE, il ne vaut pas 1", () => {
  const base = {
    index: INDEX,
    dishes: THREE_DISHES,
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  };
  for (const servings of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertThrows(() => planEnergy({ ...base, servings }), Error, "servings");
  }
  assertThrows(
    () => planEnergy({ ...base } as unknown as Parameters<typeof planEnergy>[0]),
    Error,
    "servings",
  );
});

Deno.test("FF-059 — `addons` absent LÈVE: `[]` et « on ne sait pas » ne se confondent pas", () => {
  // C'est la garde qui porte tout le comportement du foyer. Un `?? []` chez
  // l'appelant ferait passer un plan D'AVANT la trace des deltas pour un plan
  // SANS add-ons — c'est-à-dire qu'il afficherait le tronc seul comme s'il
  // était l'assiette entière, sur exactement la population où l'écart est le
  // plus grand.
  const base = { index: INDEX, dishes: THREE_DISHES, preparations: [], servings: 1 };
  assertThrows(
    () => planEnergy({ ...base } as unknown as Parameters<typeof planEnergy>[0]),
    Error,
    "addons",
  );
  // Prémisse fausse: `[]` passe, et c'est le cas nominal d'un plan personnel.
  assertEquals(
    planEnergy({ ...base, addons: [], mealsOutByDay: new Map<string | null, number>() })
      .days[0].addonKcal,
    0,
  );
});

// ---------------------------------------------------------------------------
// LES ADD-ONS — la bifurcation du foyer, en nombre
// ---------------------------------------------------------------------------

Deno.test("FF-059 — l'add-on du lecteur s'ajoute AU JOUR, jamais au plat", () => {
  // 120 g de riz CRU = 1,20 × 350 = 420 kcal d'add-on quotidien.
  const plan = planEnergy({
    index: INDEX,
    servings: 4,
    dishes: THREE_DISHES,
    preparations: [],
    addons: [{ foodRef: "white_rice", grams: 120 }],
    mealsOutByDay: new Map<string | null, number>(),
  });
  // LES PLATS N'ONT PAS BOUGÉ. Deux personnes autour de la même casserole
  // doivent lire le MÊME chiffre pour le même plat — c'est ce qui rend
  // l'add-on lisible comme un ajout plutôt que comme un plat plus gros.
  assertEquals(plan.dishes.map((d) => d.kcal), [70, 41, 15]);
  // Le jour, lui, porte les deux.
  assertEquals(plan.days[0].addonKcal, 420);
  assertEquals(plan.days[0].kcal, 111 + 420);
  assertEquals(plan.days[1].addonKcal, 420);
  assertEquals(plan.days[1].kcal, 15 + 420);
  assertEquals(plan.days.every((d) => d.complete), true);
});

Deno.test("FF-059 — AUCUN add-on est un RÉSULTAT (0), pas une abstention", () => {
  // La bouche qui a le plus petit besoin de la table n'a rien à ajouter: le
  // tronc EST son assiette. Rendre « incomplet » à la seule personne dont
  // l'assiette est exactement le plat serait le contresens du lot.
  const zero = memberAddonEnergy(INDEX, []);
  assertEquals(zero, {
    kcal: 0,
    basis: PLAN_ENERGY_BASIS,
    complete: true,
    gaps: [],
    unreadableTerms: [],
  });
});

Deno.test("FF-059 — un add-on ILLISIBLE rend la journée incomplète, pas fausse", () => {
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: THREE_DISHES,
    preparations: [],
    addons: [{ foodRef: "quinoa_flakes", grams: 60 }],
    mealsOutByDay: new Map<string | null, number>(),
  });
  // Les plats restent justes; c'est la JOURNÉE qui perd sa complétude, parce
  // que c'est elle qui aurait dû porter l'add-on.
  assertEquals(plan.dishes.map((d) => d.kcal), [280, 165, 60]);
  assertEquals(plan.days[0].complete, false);
  assertEquals(plan.days[0].addonKcal, 0);
});

Deno.test("FF-059 — un add-on ne fabrique PAS un total sur un jour illisible", () => {
  // Le total qui fait semblant, dans sa version la plus trompeuse: « 420 kcal »
  // sur une journée dont on n'a su lire aucun repas.
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [{
      day: "mon",
      method: "Cook.",
      ingredients: [{ term: "kokum rind", amount: 5, unit: "g", state: "raw" }],
      uses: [],
    }],
    preparations: [],
    addons: [{ foodRef: "white_rice", grams: 120 }],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.days[0].kcal, null);
  assertEquals(plan.days[0].complete, false);
  assertEquals(plan.days[0].addonKcal, 420);
});

Deno.test("FF-059 — l'add-on ne prend PAS l'huile de friture du plat", () => {
  // Il n'est pas cuisiné, il est ajouté. Lui passer la méthode d'un plat frit
  // lui imputerait 12 % de son poids en huile — sur un ajout dont l'objet est
  // précisément d'être un nombre juste.
  assertEquals(
    memberAddonEnergy(INDEX, [{ foodRef: "white_rice", grams: 100 }]).kcal,
    350,
  );
});

// ---------------------------------------------------------------------------
// LES INVARIANTS DE SORTIE — cherchés sur TOUTES les sorties du fichier
// ---------------------------------------------------------------------------

/** Toutes les formes de plat que ce banc sait produire. */
function everyDishShape(): DishEnergy[] {
  const cases: Array<{ method: string; ingredients: CompositionInput[] }> = [
    { method: "Roast.", ingredients: [{ term: "chicken breast", amount: 150, unit: "g", state: "raw" }] },
    { method: "Fry.", ingredients: [{ term: "chicken breast", amount: 150, unit: "g", state: "raw" }] },
    { method: "Cook.", ingredients: [{ term: "kokum rind", amount: 5, unit: "g", state: "raw" }] },
    { method: "Cook.", ingredients: [{ term: "olive oil", amount: null, unit: null, state: null }] },
    { method: "Cook.", ingredients: [{ term: "rice", amount: 100, unit: "g", state: null }] },
    { method: "…", ingredients: [] },
  ];
  return cases.map((c) => dishEnergy(INDEX, c));
}

Deno.test("FF-059 — `complete: false` ne porte JAMAIS de chiffre, et l'inverse", () => {
  for (const e of everyDishShape()) {
    assertEquals(
      e.complete,
      e.kcal !== null,
      `complete=${e.complete} kcal=${e.kcal} gaps=${e.gaps.join(",")}`,
    );
    assertEquals(e.gaps.length === 0, e.complete);
    for (const gap of e.gaps) assert((ENERGY_GAPS as readonly string[]).includes(gap));
  }
});

Deno.test("FF-059 — TOUTE sortie porte sa base, y compris les abstentions", () => {
  // C'est la quatrième couche de `CALORIE_REVERSAL` §5: « tout rendu qui
  // affiche kcal affiche aussi sa base ». On la tient à la source — il n'existe
  // aucune forme de sortie de ce module sans `basis`.
  for (const e of everyDishShape()) assertEquals(e.basis, PLAN_ENERGY_BASIS);
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: THREE_DISHES,
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.basis, PLAN_ENERGY_BASIS);
  for (const d of plan.dishes) assertEquals(d.basis, PLAN_ENERGY_BASIS);
  for (const d of plan.days) assertEquals(d.basis, PLAN_ENERGY_BASIS);
});

Deno.test("FF-059 — R5: le chiffre se RECALCULE, il n'y a rien de périmé", () => {
  // Deux appels sur la même entrée rendent la même chose (pureté), et un plan
  // MODIFIÉ rend immédiatement autre chose — il n'existe aucun état à
  // invalider parce qu'il n'existe aucun état.
  const before = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: THREE_DISHES,
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  const again = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: THREE_DISHES,
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(before, again);

  const changed = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [
      { ...THREE_DISHES[0], ingredients: [{ term: "rice", amount: 160, unit: "g", state: "raw" }] },
      THREE_DISHES[1],
      THREE_DISHES[2],
    ],
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(changed.dishes[0].kcal, 560);
  assertEquals(changed.days[0].kcal, 725);
});

Deno.test("FF-059 — le module est PUR: ni horloge, ni hasard, ni I/O", () => {
  // Ce qui rend R5 tenable. Un `Date.now()` ici ferait un chiffre qui dépend du
  // moment de la lecture, et un cache le figerait aussitôt.
  const source = Deno.readTextFileSync(
    fromFileUrl(new URL("./plan_energy.ts", import.meta.url)),
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  for (const banned of ["Date.now", "Math.random", "new Date", "fetch(", "await "]) {
    assert(!source.includes(banned), `« ${banned} » dans plan_energy.ts`);
  }
});

// ---------------------------------------------------------------------------
// L8 ③ — LE CHIFFRE DU JOUR CHANGE DE SUJET QUAND UN REPAS LUI ÉCHAPPE
// ---------------------------------------------------------------------------

Deno.test("⛔ L8 ③ — un repas pris DEHORS change le SUJET du nombre, jamais sa valeur", () => {
  // « Ta journée : 1 400 · ta fourchette : 1 900–2 200 » est FAUX quand un repas
  // sur trois est pris dehors, et faux dans le sens qui décourage: la personne
  // lit un déficit alors qu'elle a peut-être mangé un burger.
  const base = {
    index: INDEX,
    dishes: THREE_DISHES,
    preparations: [],
    servings: 1,
    addons: [],
  };
  const home = planEnergy({ ...base, mealsOutByDay: new Map<string | null, number>() });
  const out = planEnergy({ ...base, mealsOutByDay: new Map<string | null, number>([["mon", 1]]) });

  const homeMon = home.days.find((d) => d.day === "mon")!;
  const outMon = out.days.find((d) => d.day === "mon")!;

  // ⚠️ LA VALEUR NE BOUGE PAS. Le total du plan reste exact sur ce qu'il couvre.
  assertEquals(outMon.kcal, homeMon.kcal);
  assertEquals(outMon.dishesCounted, homeMon.dishesCounted);
  assertEquals(outMon.dishesTotal, homeMon.dishesTotal);
  // ⚠️ ET `complete` NE BOUGE PAS NON PLUS. Un repas pris dehors n'est pas un
  // plat qu'on n'a pas su lire: les confondre ferait proposer la curation du
  // référentiel pour réparer la vie de quelqu'un.
  assertEquals(outMon.complete, homeMon.complete);

  assertEquals(homeMon.mealsOut, 0);
  assertEquals(homeMon.subject, "the_day");
  assertEquals(outMon.mealsOut, 1);
  assertEquals(outMon.subject, "what_the_plan_made");

  // Les autres jours ne bougent pas: le sujet est PAR JOUR.
  const outTue = out.days.find((d) => d.day === "tue")!;
  assertEquals(outTue.mealsOut, 0);
  assertEquals(outTue.subject, "the_day");
});

Deno.test("L8 ③ — `mealsOutByDay` est REQUIS, et une table vide est une valeur PLEINE", () => {
  const base = {
    index: INDEX,
    dishes: THREE_DISHES,
    preparations: [],
    servings: 1,
    addons: [],
  };
  // Prémisse fausse d'abord: la table vide passe, et c'est le cas nominal.
  assertEquals(
    planEnergy({ ...base, mealsOutByDay: new Map<string | null, number>() })
      .days[0].subject,
    "the_day",
  );
  assertThrows(
    () => planEnergy({ ...base } as unknown as Parameters<typeof planEnergy>[0]),
    Error,
    "mealsOutByDay",
  );
  assertThrows(
    () =>
      planEnergy(
        { ...base, mealsOutByDay: {} } as unknown as Parameters<typeof planEnergy>[0],
      ),
    Error,
    "mealsOutByDay",
  );
});

Deno.test("L8 ③ — un nombre de repas dehors aberrant ne fabrique pas un sujet aberrant", () => {
  const base = {
    index: INDEX,
    dishes: THREE_DISHES,
    preparations: [],
    servings: 1,
    addons: [],
  };
  // La table vient d'un `jsonb` relu: elle peut porter n'importe quoi. Un
  // négatif ou un NaN vaut zéro — « on ne sait pas » ne doit pas se lire « il
  // manque des repas », ce qui ferait changer de sujet un chiffre juste.
  for (const bad of [-3, Number.NaN, Number.POSITIVE_INFINITY]) {
    const plan = planEnergy({
      ...base,
      mealsOutByDay: new Map<string | null, number>([["mon", bad]]),
    });
    const mon = plan.days.find((d) => d.day === "mon")!;
    assertEquals(mon.mealsOut, 0, String(bad));
    assertEquals(mon.subject, "the_day", String(bad));
  }
});
