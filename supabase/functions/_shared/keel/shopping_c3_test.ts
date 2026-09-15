/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C3 — RECONSTRUIRE DES COURSES EXACTES APRÈS TOUTE RÉPARATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chantier : `docs/keel/PLAN-CLOTURE-APRES-SIX-TIRS-2026-09-11.md` § C3.
 * Preuves  : `docs/keel/CAMPAGNE-SIX-TIRS-2026-09-11.md` § 8 ① et ⑥.
 *
 * ── LE DÉFAUT VISÉ, ET IL A DÉJÀ COÛTÉ DEUX FOIS ────────────────────────
 * Une réparation JETAIT des lignes de courses parce qu'elle comparait des
 * libellés. `retry_merge.ts` filtrait `meal.shopping_list` sur
 * `normalizePantryTerm(l.term) ∈ termes d'ingrédients` : « citrons » ≠
 * « citron » ⇒ **la ligne disparaît**, et le message disait pourtant « kept,
 * not guessed ». Mesuré sur un run du banc du 2026-09-11 : **6 lignes sur 26**
 * perdues — `oignons`, `carottes`, `tomates`, `citrons`, `pommes de terre`,
 * `pitas complètes` — avec `splice.shopping_pruned: 6`. L'audit du lot E les
 * rattrapait ensuite en 5 `ingredient_not_bought`.
 *
 * ⛔ MÊME RACINE QUE LES 8 FAUX POSITIFS DU MATIN, UN CRAN PLUS GRAVE : là on
 * SIGNALAIT à tort, ici on SUPPRIME pour de bon.
 *
 * ⛔ CHAQUE ÉPREUVE PORTE UN CAS QUI MORD **ET** UN CAS QUI PASSE. Une garde
 * qui ne mord jamais ressemble trait pour trait à une garde qui marche ; une
 * garde qui refuse tout aussi (`guards-need-a-passing-case`).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionInput,
  type CompositionRef,
  type CompositionUnit,
  normalizeTerm,
} from "./food_composition.ts";
import {
  type GeneratedMeal,
  normalizePantryTerm,
} from "./meal_generation.ts";
import {
  appendDedicatedDishes,
  mergeRetryCells,
  spliceReworkableUnits,
} from "./retry_merge.ts";
import {
  claimedIdentities,
  foodIdentityOf,
  freshnessGroupOf,
  isNonPurchasableLine,
  NON_PURCHASABLE_SLUGS,
  sortShoppingLines,
} from "./shopping_identity.ts";
import {
  rebuildShoppingQuantities,
  shoppingNeedsOf,
} from "./shopping_rebuild.ts";
import { shoppingIdentityAudit } from "./final_plan_audit.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — les aliments des six tirs, et les alias RÉELS de la base
// ---------------------------------------------------------------------------

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
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
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const REFS: CompositionRef[] = [
  ref({ slug: "lemon", foodGroupRef: "citrus", energyKcal: 29, unitGrams: 60 }),
  ref({ slug: "tomato", energyKcal: 18 }),
  ref({ slug: "onion", energyKcal: 40 }),
  ref({ slug: "carrot", energyKcal: 41 }),
  ref({ slug: "potato", foodGroupRef: "starchy_veg", energyKcal: 77 }),
  ref({
    slug: "pita_wholemeal",
    label: "Wholemeal pita bread",
    foodGroupRef: "whole_grain",
    energyKcal: 265,
    unitGrams: 60,
  }),
  ref({ slug: "feta", foodGroupRef: "dairy_cheese", energyKcal: 264, proteinG: 14 }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 884, energyDense: true }),
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 165, yieldClass: "meat_shrinks" }),
  ref({ slug: "tofu", foodGroupRef: "tofu_tempeh", energyKcal: 145 }),
  ref({ slug: "white_rice", foodGroupRef: "refined_grain", energyKcal: 350, yieldClass: "grain_absorbs" }),
  ref({ slug: "lentils", foodGroupRef: "legumes", energyKcal: 336, yieldClass: "grain_absorbs" }),
  // ⛔ L'EAU, ET SON GROUPE EST `water` AU RÉFÉRENTIEL — un groupe de la classe
  // `beverage`, aux côtés de `coffee_tea` et `sweetened_beverage`. C'est très
  // exactement pourquoi l'exclusion se fait par SLUG et pas par groupe.
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0, proteinG: 0 }),
  // ⟳ 2026-09-12 · C6 — LES DEUX CHAMPIGNONS DU TIR RÉEL n° 1. Le référentiel
  // porte `button_mushroom_cultivated_mushroom` (le slug que le MODÈLE écrit),
  // et le sas a créé `champignons_de_paris` pour la phrase française exacte.
  // Deux entrées, deux slugs, un seul aliment — c'est la configuration qui a
  // coûté un plan entier.
  ref({ slug: "button_mushroom_cultivated_mushroom", energyKcal: 22 }),
  ref({ slug: "champignons_de_paris", energyKcal: 22 }),
];

/**
 * ⚠️ LA TABLE D'ALIAS EST CELLE DE LA BASE, ET SON ASYMÉTRIE EST LE POINT.
 * Le singulier ET le pluriel existent pour les cinq légumes/fruits ; pour la
 * pita, la base porte « pitas completes » et **PAS** « pita complète » — donc
 * cette ligne-là ne se résout QUE par son identifiant.
 */
const INDEX: CompositionIndex = buildCompositionIndex(REFS, [
  { alias: "citron", slug: "lemon" },
  { alias: "citrons", slug: "lemon" },
  { alias: "tomate", slug: "tomato" },
  { alias: "tomates", slug: "tomato" },
  { alias: "oignon", slug: "onion" },
  { alias: "oignons", slug: "onion" },
  { alias: "carotte", slug: "carrot" },
  { alias: "carottes", slug: "carrot" },
  { alias: "pomme de terre", slug: "potato" },
  { alias: "pommes de terre", slug: "potato" },
  { alias: "pitas completes", slug: "pita_wholemeal" },
  { alias: "feta", slug: "feta" },
  { alias: "huile d'olive", slug: "olive_oil" },
  { alias: "blanc de poulet", slug: "chicken_breast" },
  { alias: "tofu", slug: "tofu" },
  { alias: "riz", slug: "white_rice" },
  { alias: "lentilles", slug: "lentils" },
  { alias: "eau", slug: "water" },
  // ⚠️ L'ASYMÉTRIE EXACTE DE LA BASE : « champignons de paris » n'atteint PAS
  // `button_mushroom_cultivated_mushroom` (la base ne porte que
  // « champignon de paris ou champignon de couche cru »), il atteint l'entrée
  // du sas. C'est pour ça que le libellé et l'identifiant divergent.
  { alias: "champignons de paris", slug: "champignons_de_paris" },
]);

/**
 * L'ANCIENNE RÈGLE, RECOPIÉE ICI COMME TÉMOIN — et nulle part ailleurs.
 *
 * ⛔ C'EST LE CORPS EXACT DU FILTRE RETIRÉ DE `retry_merge.ts` :
 * `meal.shopping_list.filter((l) => claimedAll.has(normalizePantryTerm(l.term)))`.
 * Le garder ici EST l'épreuve : sans lui, « les 6 lignes ne sont plus jetées »
 * serait une affirmation sur du code qui n'existe plus, donc invérifiable —
 * c'est la leçon de `log-the-counterfactual-not-two-runs`.
 */
function ancienFiltre(
  lignes: readonly { term: string }[],
  ingredients: readonly { term: string }[],
): { term: string }[] {
  const claimedAll = new Set(ingredients.map((i) => normalizePantryTerm(i.term)));
  return lignes.filter((l) => claimedAll.has(normalizePantryTerm(l.term)));
}

// ---------------------------------------------------------------------------
// LES FABRIQUES — un plan minimal, dans la forme du parseur
// ---------------------------------------------------------------------------

type Ing = {
  term: string;
  quantity: string | null;
  amount: number | null;
  unit: CompositionUnit | null;
  state: "raw" | null;
  ref?: string | null;
};

/** Une ligne de besoin, TYPÉE — un `as` sur un type étranger désarme le typecheck. */
function need(term: string, amount: number, unit: CompositionUnit, refSlug: string): CompositionInput {
  return { term, amount, unit, state: "raw", ref: refSlug };
}

/** Une ligne de courses reconstruite, telle que `rebuildShoppingQuantities` la voit. */
function panier(
  term: string,
  quantity: string | null,
  amount: number | null,
  unit: CompositionUnit | null,
): {
  term: string;
  quantity: string | null;
  amount: number | null;
  unit: CompositionUnit | null;
  purchasable?: boolean;
  state?: string | null;
} {
  return { term, quantity, amount, unit };
}

function ing(
  term: string,
  amount: number | null,
  unit: CompositionUnit | null,
  refSlug?: string,
): Ing {
  return {
    term,
    quantity: amount === null ? null : `${amount} ${unit ?? ""}`.trim(),
    amount,
    unit,
    state: amount === null ? null : "raw",
    ref: refSlug ?? null,
  };
}

function dish(day: string, slot: string, title: string, ingredients: Ing[], uses: string[] = []) {
  return {
    day,
    slot,
    title,
    memberId: null,
    method: "Cuire.",
    ingredients,
    boxes: [],
    uses: uses.map((preparationId) => ({ preparationId, servings: 1, kept: "fridge" })),
  } as unknown as GeneratedMeal["dishes"][number];
}

function pot(id: string, ingredients: Ing[], cookOn: string | null = "sat", servingsMade = 2) {
  return {
    id,
    title: id,
    method: "Mijoter.",
    cookOn,
    servingsMade,
    ingredients,
  } as unknown as GeneratedMeal["preparations"][number];
}

function line(term: string, quantity: string | null) {
  return { term, quantity, aisle: "other", food_group: null } as unknown as
    GeneratedMeal["shopping_list"][number];
}

function meal(over: Partial<GeneratedMeal>): GeneratedMeal {
  return {
    dishes: [],
    preparations: [],
    cooking_sessions: [],
    shopping_list: [],
    empty_slots: [],
    rejected_numeric: [],
    rejected_aisles: [],
    protein_anchor_missing: [],
    session_overruns: [],
    ...over,
  } as unknown as GeneratedMeal;
}

/** Les six couples exactement nommés par la campagne du 2026-09-11. */
const SIX_PLURIELS: readonly (readonly [string, string, string])[] = [
  ["oignon", "oignons", "onion"],
  ["carotte", "carottes", "carrot"],
  ["tomate", "tomates", "tomato"],
  ["citron", "citrons", "lemon"],
  ["pomme de terre", "pommes de terre", "potato"],
  // ⛔ CELLE-CI N'A PAS D'ALIAS AU SINGULIER : elle ne se sauve QUE par son
  // identifiant, et c'est la démonstration la plus courte du lot.
  ["pita complète", "pitas complètes", "pita_wholemeal"],
];

// ═══════════════════════════════════════════════════════════════════════════
// ① LES SIX LIGNES AU PLURIEL SURVIVENT À UNE RÉPARATION
// ═══════════════════════════════════════════════════════════════════════════

/** Le plan de base : un plat, une casserole, et les six lignes au pluriel. */
function planSixPluriels(): GeneratedMeal {
  return meal({
    dishes: [
      dish("sat", "dinner", "Ragoût et pita", [
        ing("oignon", 120, "g"),
        ing("carotte", 150, "g"),
        ing("tomate", 200, "g"),
        ing("citron", 1, "unit"),
        ing("pita complète", 2, "unit", "pita_wholemeal"),
        ing("huile d'olive", 15, "ml"),
      ], ["prep_stew"]),
    ],
    preparations: [pot("prep_stew", [ing("pomme de terre", 300, "g")])],
    shopping_list: SIX_PLURIELS.map(([, pluriel]) => line(pluriel, "1"))
      .concat([line("huile d'olive", "15 ml")]),
  });
}

Deno.test("C3 ① — LE TÉMOIN : l'ancien filtre par libellé jette bien les SIX lignes", () => {
  // ⛔ SANS CE TÉMOIN, LE TEST SUIVANT NE PROUVE RIEN. « Les six survivent »
  // serait vrai d'un plan qui n'a jamais été menacé.
  const base = planSixPluriels();
  const ingredients = [
    ...base.dishes.flatMap((d) => d.ingredients),
    ...base.preparations.flatMap((p) => p.ingredients),
  ];
  const restantes = ancienFiltre(base.shopping_list, ingredients);
  assertEquals(
    restantes.map((l) => l.term),
    ["huile d'olive"],
    "l'ancien filtre devait ne garder que la ligne dont le libellé est identique",
  );
  assertEquals(base.shopping_list.length - restantes.length, 6, "six lignes jetées");
});

Deno.test("C3 ① — les six lignes au pluriel SURVIVENT à un épissage de réparation", () => {
  const base = planSixPluriels();
  // La réparation réécrit le frais du plat : elle remplace l'huile par une
  // quantité plus grande, et ne touche à rien d'autre.
  const retry = meal({
    dishes: [
      dish("sat", "dinner", "Ragoût et pita", [
        ing("oignon", 120, "g"),
        ing("carotte", 150, "g"),
        ing("tomate", 200, "g"),
        ing("citron", 1, "unit"),
        ing("pita complète", 2, "unit", "pita_wholemeal"),
        ing("huile d'olive", 30, "ml"),
      ], ["prep_stew"]),
    ],
    preparations: [pot("prep_stew", [ing("pomme de terre", 300, "g")])],
    shopping_list: [],
  });
  const out = spliceReworkableUnits({
    base,
    retry,
    asks: [{ dishIndex: 0, freshReworkable: true, reworkablePotIds: [] }],
    index: INDEX,
  });
  assertEquals(out.counts.fresh_spliced, 1, "l'épissage n'a pas eu lieu : le test ne mesure rien");
  assertEquals(out.counts.shopping_pruned, 0, "une ligne a été jetée par la réparation");
  for (const [, pluriel] of SIX_PLURIELS) {
    assert(
      out.meal.shopping_list.some((l) => l.term === pluriel),
      `« ${pluriel} » a disparu de la liste de courses`,
    );
  }
  assertEquals(out.meal.shopping_list.length, 7);
});

Deno.test("C3 ① — et elles survivent AUSSI sans référentiel : le doute ne retire rien", () => {
  // ⛔ LE REPLI EST LE REPLI SÛR, PAS CELUI D'AVANT. Sans index, toutes les
  // identités sont `term:…` : les six lignes ne se rattachent ni au gardé ni au
  // retiré, donc elles RESTENT — et le compteur du troisième sort le dit.
  const base = planSixPluriels();
  const retry = meal({
    dishes: [dish("sat", "dinner", "Ragoût et pita", [ing("huile d'olive", 30, "ml")], ["prep_stew"])],
    preparations: [pot("prep_stew", [ing("pomme de terre", 300, "g")])],
    shopping_list: [],
  });
  const out = spliceReworkableUnits({
    base,
    retry,
    asks: [{ dishIndex: 0, freshReworkable: true, reworkablePotIds: [] }],
    index: null,
  });
  assertEquals(out.counts.shopping_pruned, 0);
  assertEquals(out.counts.shopping_unattributed, 6, "les six pluriels non rattachés sont COMPTÉS");
  assertEquals(out.meal.shopping_list.length, 7);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② UN INGRÉDIENT RÉELLEMENT RETIRÉ CESSE D'ÊTRE ACHETÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 ② — un ingrédient RÉELLEMENT retiré de la recette cesse d'être acheté", () => {
  // Le poulet du plat remplacé n'est plus au plan : sa ligne part, et on peut
  // la NOMMER. C'est la garde R2-A, rejouée sur l'identité.
  const base = meal({
    dishes: [
      dish("sat", "dinner", "Poulet et riz", [ing("blanc de poulet", 400, "g")], ["prep_rice"]),
      dish("sun", "lunch", "Lentilles", [ing("lentilles", 200, "g")]),
    ],
    preparations: [pot("prep_rice", [ing("riz", 200, "g")])],
    shopping_list: [line("blanc de poulet", "400 g"), line("riz", "200 g"), line("lentilles", "200 g")],
  });
  const retry = meal({
    dishes: [dish("sat", "dinner", "Tofu et riz", [ing("tofu", 300, "g")], ["prep_rice"])],
    preparations: [pot("prep_rice", [ing("riz", 200, "g")])],
    shopping_list: [line("tofu", "300 g")],
  });
  const out = mergeRetryCells({ base, retry, cells: ["sat/dinner"], index: INDEX });
  assertEquals(out.cells, ["sat/dinner"]);
  assert(
    !out.meal.shopping_list.some((l) => l.term === "blanc de poulet"),
    "on achète encore le poulet d'un plat qui n'existe plus",
  );
  assertEquals(out.shoppingPruned, 1);
  assertEquals(out.shoppingSorts, { claimed: 3, removed: 1, unattributed: 0 });
  // LE CAS QUI PASSE : le riz de la casserole gardée et les lentilles du
  // dimanche restent, et le tofu de la relance entre.
  assertEquals(
    out.meal.shopping_list.map((l) => l.term).sort(),
    ["lentilles", "riz", "tofu"],
  );
});

Deno.test("C3 ② — un retrait se fait aussi quand le pluriel diffère des DEUX côtés", () => {
  // ⛔ LE CAS QUE L'ANCIEN FILTRE RATAIT DANS L'AUTRE SENS : la ligne de courses
  // dit « tomates », l'ingrédient retiré disait « tomate ». L'égalité de
  // libellés ne les rapprochait pas, donc la ligne restait — on achetait pour
  // un plat disparu, en silence.
  const base = meal({
    dishes: [dish("sat", "dinner", "Salade", [ing("tomate", 200, "g")])],
    shopping_list: [line("tomates", "200 g")],
  });
  const retry = meal({
    dishes: [dish("sat", "dinner", "Salade de lentilles", [ing("lentilles", 200, "g")])],
    shopping_list: [line("lentilles", "200 g")],
  });
  const out = mergeRetryCells({ base, retry, cells: ["sat/dinner"], index: INDEX });
  assertEquals(out.meal.shopping_list.map((l) => l.term), ["lentilles"]);
  assertEquals(out.shoppingPruned, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ APRÈS UNE PUIS DEUX RÉPARATIONS — la condition la plus facile à sauter
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 ③ — les six lignes survivent après UNE puis DEUX réparations enchaînées", () => {
  // ⛔ « TESTER APRÈS UNE PUIS DEUX RÉPARATIONS » — le plan l'écrit, et c'est la
  // condition la plus utile : le défaut NAÎT d'une réparation, donc deux
  // réparations le font naître deux fois. Le budget du produit est de deux
  // rappels au maximum ; c'est exactement ce que cette épreuve enchaîne.
  let courant = planSixPluriels();
  const avant = courant.shopping_list.length;
  for (const litres of [30, 45]) {
    const retry = meal({
      dishes: [
        dish("sat", "dinner", "Ragoût et pita", [
          ing("oignon", 120, "g"),
          ing("carotte", 150, "g"),
          ing("tomate", 200, "g"),
          ing("citron", 1, "unit"),
          ing("pita complète", 2, "unit", "pita_wholemeal"),
          ing("huile d'olive", litres, "ml"),
        ], ["prep_stew"]),
      ],
      preparations: [pot("prep_stew", [ing("pomme de terre", 320, "g")])],
      shopping_list: [],
    });
    const out = spliceReworkableUnits({
      base: courant,
      retry,
      asks: [{ dishIndex: 0, freshReworkable: true, reworkablePotIds: ["prep_stew"] }],
      index: INDEX,
    });
    assertEquals(out.counts.shopping_pruned, 0, `réparation ${litres} : une ligne jetée`);
    courant = out.meal;
  }
  assertEquals(courant.shopping_list.length, avant, "la liste a rétréci au fil des réparations");
  for (const [, pluriel] of SIX_PLURIELS) {
    assert(courant.shopping_list.some((l) => l.term === pluriel), `« ${pluriel} » perdu`);
  }
  // LE CAS QUI MORD, SUR LE MÊME ENCHAÎNEMENT : l'ancien filtre en aurait jeté
  // six au PREMIER tour, et il n'en reste rien à jeter au second.
  const ingredients = [
    ...courant.dishes.flatMap((d) => d.ingredients),
    ...courant.preparations.flatMap((p) => p.ingredients),
  ];
  assertEquals(ancienFiltre(courant.shopping_list, ingredients).length, 1);
});

Deno.test("C3 ③ — une entrée de dernier recours apparie ses courses par identité", () => {
  const base = meal({
    dishes: [dish("wed", "lunch", "Couscous", [ing("tomate", 100, "g")])],
    shopping_list: [line("tomates", "100 g")],
  });
  const retry = meal({
    dishes: [
      {
        ...dish("wed", "lunch", "Pain pita et feta", [
          ing("pitas complètes", 2, "unit", "pita_wholemeal"),
          ing("feta", 40, "g"),
        ]),
        memberId: "paul",
      } as unknown as GeneratedMeal["dishes"][number],
    ],
    shopping_list: [line("pitas complètes", "2"), line("feta", "40 g")],
  });
  const out = appendDedicatedDishes({
    base,
    retry,
    asks: [{ cell: "wed/lunch", memberId: "paul" }],
    index: INDEX,
  });
  assertEquals(out.added.length, 1);
  // ⛔ LE CAS QUI MORD : l'ingrédient du plat ajouté dit « pitas complètes »
  // avec son identifiant, la ligne de courses dit « pitas complètes » sans
  // identifiant — et la ligne de courses déjà présente dit « tomates » là où le
  // plat de base dit « tomate ». L'ancien appariement par libellé aurait gardé
  // la tomate hors du plan et raté l'appariement de la pita.
  assertEquals(out.shopping_added, 2);
  assertEquals(
    out.meal.shopping_list.map((l) => l.term).sort(),
    ["feta", "pitas complètes", "tomates"],
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ FETA ET HUILE SOUS-ACHETÉES — détectées, et chiffrées
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 ④ — feta et huile sous-achetées sont DÉTECTÉES, par la quantité structurée", () => {
  // Les nombres sont ceux du tir n° 1 : feta 80 g achetés pour 115,7 requis,
  // huile 90 pour 132,9. Ici la ligne de courses porte sa quantité STRUCTURÉE,
  // ce qui rend le contrôle possible sans réinterpréter une phrase.
  const plan = {
    dishes: [{
      ingredients: [
        { term: "feta", amount: 115.7, unit: "g", state: "raw", ref: "feta" },
        { term: "huile d'olive", amount: 132.9, unit: "ml", state: "raw", ref: "olive_oil" },
      ],
    }],
    preparations: [],
    shopping_list: [
      { term: "feta", quantity: "80 g", amount: 80, unit: "g", state: "raw", ref: "feta" },
      { term: "huile d'olive", quantity: "90 ml", amount: 90, unit: "ml", state: "raw", ref: "olive_oil" },
    ],
  };
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan,
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(audit.quantified, 2, "les deux suffisances ont été COMPARÉES");
  for (const slug of ["feta", "olive_oil"]) {
    const row = audit.rows.find((r) => r.identity === slug)!;
    assertEquals(row.state, "short", `${slug} : le sous-achat n'est pas vu`);
  }
  // LE CAS QUI PASSE : acheté à la hauteur du besoin, l'état change.
  const assez = shoppingIdentityAudit({
    index: INDEX,
    plan: {
      ...plan,
      shopping_list: [
        { term: "feta", quantity: "120 g", amount: 120, unit: "g", state: "raw", ref: "feta" },
        { term: "huile d'olive", quantity: "140 ml", amount: 140, unit: "ml", state: "raw", ref: "olive_oil" },
      ],
    },
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(assez.rows.filter((r) => r.state === "covered_measured").length, 2);
});

Deno.test("C3 ④ — SANS quantité structurée, le même plan rend « incomplet » et rien d'autre", () => {
  // ⛔ C'EST LA MESURE DE CE QUE LA DEMANDE OUVERTE COÛTAIT. « 2 pitas
  // complètes » et « 1,2 kg » ne se lisent pas en prose (`readQuantityFromProse`
  // ne connaît que `g`, `ml` et le nombre nu) : le contrôle s'abstenait, et
  // **26 identités sur 26 de GAIN** restaient incontrôlables en quantité.
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan: {
      dishes: [{
        ingredients: [
          { term: "pita complète", amount: 2, unit: "unit", state: "raw", ref: "pita_wholemeal" },
        ],
      }],
      preparations: [],
      shopping_list: [{ term: "pitas complètes", quantity: "2 pitas" }],
    },
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(audit.quantified, 0);
  assertEquals(audit.rows[0].state, "check_incomplete");
  assertEquals(audit.unverified, 1, "le défaut restant est COMPTÉ, pas déduit");
  // LE CAS QUI PASSE : la même ligne, avec sa quantité structurée.
  const avec = shoppingIdentityAudit({
    index: INDEX,
    plan: {
      dishes: [{
        ingredients: [
          { term: "pita complète", amount: 2, unit: "unit", state: "raw", ref: "pita_wholemeal" },
        ],
      }],
      preparations: [],
      shopping_list: [{
        term: "pitas complètes",
        quantity: "2 pitas",
        amount: 2,
        unit: "unit",
        state: "raw",
        ref: "pita_wholemeal",
      }],
    },
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(avec.quantified, 1);
  assertEquals(avec.rows[0].state, "covered_measured");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ STOCK ET CONDITIONNEMENT — on ne les invente pas
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 ⑤ — le garde-manger déclare une PRÉSENCE : la quantité reste non vérifiée, jamais suffisante", () => {
  const plan = {
    dishes: [{
      ingredients: [need("huile d'olive", 132.9, "ml", "olive_oil")],
    }],
    preparations: [],
    shopping_list: [],
  };
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan,
    pantryTerms: ["huile d'olive"],
    pantryCoveredG: new Map<string, number>(),
  });
  const row = audit.rows.find((r) => r.identity === "olive_oil")!;
  // ⛔ NI `covered_measured` (on inventerait un stock), NI `not_bought` (on
  // inventerait un manque). Un état à part, avec son motif en clair.
  assertEquals(row.state, "present_unquantified");
  assert(row.reason.includes("garde-manger"));
  assertEquals(audit.unverified, 1);
  // LE CAS QUI MORD : sans garde-manger, la même ligne est un vrai manque.
  const sans = shoppingIdentityAudit({
    index: INDEX,
    plan,
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(sans.rows[0].state, "not_bought");
});

Deno.test("C3 ⑤ — un conditionnement non convertible rend « incomplet », pas un manque chiffré", () => {
  // « 1 sachet » n'est ni un gramme ni un millilitre ni un nombre nu : rien ne
  // dit combien il contient. Le plan l'écrit : « une conversion ou un
  // conditionnement inconnu produit un contrôle incomplet, pas un manque
  // quantifié inventé ».
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan: {
      dishes: [{ ingredients: [need("lentilles", 250, "g", "lentils")] }],
      preparations: [],
      shopping_list: [{ term: "lentilles", quantity: "1 sachet" }],
    },
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(audit.rows[0].state, "check_incomplete");
  assertEquals(audit.quantified, 0);
  // LE CAS QUI PASSE : le même sachet, dont le poids est déclaré.
  const pese = shoppingIdentityAudit({
    index: INDEX,
    plan: {
      dishes: [{ ingredients: [need("lentilles", 250, "g", "lentils")] }],
      preparations: [],
      shopping_list: [{
        term: "lentilles",
        quantity: "1 sachet (500 g)",
        amount: 500,
        unit: "g",
        state: "raw",
        ref: "lentils",
      }],
    },
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(pese.rows[0].state, "covered_measured");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'EAU DE CUISSON — non achetable, et conservée dans la préparation
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 ⑥ — l'eau de cuisson ne produit AUCUNE alerte d'achat", () => {
  // Mesuré : tirs 2 et 4 de la campagne du 2026-09-11, 219 g et 287 g « requis ».
  const plan = {
    dishes: [],
    preparations: [{
      ingredients: [
        { term: "lentilles", amount: 200, unit: "g", state: "raw", ref: "lentils" },
        { term: "eau", amount: 219, unit: "ml", state: "raw", ref: "water" },
      ],
    }],
    shopping_list: [{ term: "lentilles", quantity: "200 g", amount: 200, unit: "g", state: "raw", ref: "lentils" }],
  };
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan,
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  const eau = audit.rows.find((r) => r.identity === "water")!;
  assertEquals(eau.state, "not_purchasable");
  assertEquals(audit.notPurchasable, 1);
  assertEquals(audit.rows.filter((r) => r.state === "not_bought").length, 0);
  // ⛔ ET ELLE RESTE DANS LA MESURE DE PRÉPARATION : la ligne est toujours là,
  // avec ses 219 ml. Ce lot décide d'un panier, pas d'une recette.
  assertEquals(audit.rows.find((r) => r.identity === "water")!.neededLines, 1);
  // ⛔ ET SURTOUT PAS « TOUTES LES BOISSONS » : le groupe de l'eau est
  // `water`, de la classe `beverage`, la même que le café et les sodas.
  assertEquals([...NON_PURCHASABLE_SLUGS], ["water"]);
});

Deno.test("C3 ⑥ — le CAS QUI MORD : un aliment voisin du même groupe reste achetable", () => {
  // Une ligne que le référentiel ne résout pas vers `water` n'est JAMAIS
  // non-achetable : on préfère un faux positif d'achat, visible et corrigible,
  // à un ingrédient qui disparaît du panier.
  assert(isNonPurchasableLine(INDEX, { term: "eau" }));
  assert(!isNonPurchasableLine(INDEX, { term: "eau minérale en bouteille" }));
  assert(!isNonPurchasableLine(INDEX, { term: "lentilles" }));
  // Sans référentiel, rien n'est non-achetable : l'abstention est du bon côté.
  assert(!isNonPurchasableLine(null, { term: "eau" }));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LE GROUPE DE FRAÎCHEUR VIENT DE LA RÉFÉRENCE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 ⑦ — le groupe de fraîcheur vient de la RÉFÉRENCE, pas du libellé", () => {
  // ⛔ `pita complète` n'a AUCUN alias dans la base (elle porte « pitas
  // completes »). Par le libellé seul, le groupe valait `null` — donc le repli
  // `MAX_FRIDGE_DAYS` côté vagues, donc une date d'achat trop précoce que
  // personne ne regarde. C'est le dernier lecteur de mesure partant du libellé,
  // nommé par deux chantiers.
  assertEquals(freshnessGroupOf(INDEX, { term: "pita complète" }), null);
  assertEquals(
    freshnessGroupOf(INDEX, { term: "pita complète", ref: "pita_wholemeal" }),
    "whole_grain",
  );
  // LE CAS QUI PASSE SANS IDENTIFIANT : un libellé que la base connaît.
  assertEquals(freshnessGroupOf(INDEX, { term: "citrons" }), "citrus");
  // ⛔ ET UN IDENTIFIANT REFUSÉ NE RETOMBE PAS SUR LE TERME.
  assertEquals(
    freshnessGroupOf(INDEX, { term: "citrons", ref: null, refRefused: true }),
    null,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LA RECONSTRUCTION DES QUANTITÉS — depuis le plan final arrondi
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 ⑧ — la quantité de courses est RECALCULÉE depuis le plan final, pas héritée", () => {
  // ⛔ « Après un patch modèle, ne pas garder une ancienne quantité de courses
  // faute de champ actualisé. » Le plan a doublé sa feta ; la ligne dit encore
  // 80 g. Elle doit dire 160.
  const dishes = [{ ingredients: [need("feta", 160, "g", "feta")] }];
  const { needs, identityByTerm } = shoppingNeedsOf({ index: INDEX, dishes, preparations: [] });
  const out = rebuildShoppingQuantities({
    index: INDEX,
    lines: [panier("feta", "80 g", 80, "g")],
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });
  assertEquals(out.items[0].amount, 160);
  assertEquals(out.items[0].unit, "g");
  assertEquals(out.items[0].quantity, "160 g");
  assertEquals(out.counts.requantified, 1);
  // ⛔ IDEMPOTENTE : un second passage ne change rien.
  const encore = rebuildShoppingQuantities({
    index: INDEX,
    lines: out.items,
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });
  assertEquals(encore.counts.requantified, 0);
  assertEquals(encore.counts.unchanged, 1);
  assertEquals(encore.items[0].quantity, "160 g");
});

Deno.test("C3 ⑧ — un LOT PARTAGÉ arrondi : la ligne de courses porte la somme du lot, pas une part", () => {
  // ⛔ « Tester après arrondi des lots partagés. » La casserole est cuisinée
  // UNE fois pour deux dîners ; ce qui s'achète est le lot, pas la portion.
  const preparations = [{
    ingredients: [need("lentilles", 400, "g", "lentils"), need("eau", 500, "ml", "water")],
  }];
  const dishes = [
    { ingredients: [need("citron", 1, "unit", "lemon")] },
    { ingredients: [need("citron", 1, "unit", "lemon")] },
  ];
  const { needs, identityByTerm } = shoppingNeedsOf({ index: INDEX, dishes, preparations });
  // Les deux citrons des deux plats font DEUX citrons à acheter, pas un.
  assertEquals(needs.get("lemon")!.amount, 2);
  assertEquals(needs.get("lemon")!.unit, "unit");
  assertEquals(needs.get("lentils")!.amount, 400);
  assertEquals(needs.get("water")!.purchasable, false);
  const out = rebuildShoppingQuantities({
    index: INDEX,
    lines: [
      panier("citrons", "1 citron", 1, "unit"),
      panier("lentilles", "200 g", 200, "g"),
      panier("eau", "500 ml", 500, "ml"),
    ],
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });
  assertEquals(out.items[0].amount, 2, "la part d'un plat a été prise pour le lot");
  assertEquals(out.items[1].amount, 400);
  // ⛔ L'EAU SORT DU PANIER, ET SA LIGNE RESTE LISIBLE.
  assertEquals(out.items[2].purchasable, false);
  assertEquals(out.items[2].amount, null);
  assertEquals(out.counts.not_purchasable, 1);
});

Deno.test("LOT 1 ⑧ — un besoin que rien n'achète est PRODUIT, et l'oubli reste NOMMÉ", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ CE TEST DISAIT L'INVERSE JUSQU'AU 2026-09-12, ET IL AVAIT RAISON POUR
  //    SON LOT. C3 refusait d'ajouter une ligne pour préserver le signal
  //    `ingredient_not_bought`. La revue de clôture C6 (§ 5) a tranché : « la
  //    solution n'est pas de choisir entre tout refuser et masquer le manque…
  //    les omissions initiales peuvent rester mesurées même après leur
  //    correction déterministe ». La ligne est donc PRODUITE **et** l'oubli
  //    COMPTÉ — c'est la même phrase, tenue des deux bouts.
  // ══════════════════════════════════════════════════════════════════════
  const dishes = [{ ingredients: [need("feta", 120, "g", "feta")] }];
  const { needs, identityByTerm } = shoppingNeedsOf({ index: INDEX, dishes, preparations: [] });
  const out = rebuildShoppingQuantities({
    index: INDEX,
    // ⟳ 2026-09-12 · LOT 3 — UNE LIGNE ÉCRITE PAR LE MODÈLE, à laquelle il
    // MANQUE la feta. C'est la condition de l'oubli : depuis que le prompt ne
    // demande plus de liste, `lines: []` veut dire « on ne lui a rien demandé »
    // et non « il a tout oublié ». Mesuré : `model_omitted:24` sur un plan de
    // 24 lignes, c'est-à-dire un compteur qui ne compte plus rien.
    lines: [{ term: "pain", quantity: "200 g", amount: 200, unit: "g" as const }],
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });
  const feta = out.items.find((l) => l.term === "feta") ?? null;
  assertEquals(feta !== null, true, "le besoin n'a produit aucune ligne");
  assertEquals(feta!.amount, 120);
  assertEquals(feta!.quantity, "120 g");
  // ⛔ L'OMISSION DU MODÈLE SURVIT À SA RÉPARATION.
  assertEquals(out.counts.model_omitted, 1);
  assertEquals(out.omitted.map((n) => n.term), ["feta"]);
  assertEquals(out.counts.synthesized, 1);
  // ⛔ ET LA GARDE VAUT ZÉRO : plus aucun besoin achetable sans ligne.
  assertEquals(out.counts.needs_unbought, 0);
  assertEquals(out.unbought, []);
});

Deno.test("C3 ⑧ — une ligne dont l'aliment a QUITTÉ le plan part ; une ligne orpheline RESTE", () => {
  const dishes = [{ ingredients: [need("tofu", 300, "g", "tofu")] }];
  const { needs, identityByTerm } = shoppingNeedsOf({ index: INDEX, dishes, preparations: [] });
  const out = rebuildShoppingQuantities({
    index: INDEX,
    lines: [
      panier("tofu", "300 g", 300, "g"),
      // Était au plan, n'y est plus : elle part.
      panier("blanc de poulet", "400 g", 400, "g"),
      // N'a jamais été rattachée à rien : elle RESTE, et se compte.
      panier("épices du placard", "1 pot", null, null),
    ],
    needs,
    identityByTerm,
    removed: new Set(["chicken_breast"]),
    locale: "fr",
  });
  assertEquals(out.items.map((l) => l.term), ["tofu", "épices du placard"]);
  assertEquals(out.counts.dropped, 1);
  assertEquals(out.counts.unattributed, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ LES TROIS SORTS, ISOLÉS — la règle partagée entre le parseur et la fusion
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 ⑨ — `sortShoppingLines` : réclamée reste, retirée part, orpheline reste et se compte", () => {
  const claimed = claimedIdentities(INDEX, [
    { ingredients: [{ term: "tomate" }, { term: "citron" }] },
  ]);
  const out = sortShoppingLines({
    index: INDEX,
    lines: [
      { term: "tomates" },
      { term: "citrons" },
      { term: "blanc de poulet" },
      { term: "un truc que personne ne connaît" },
    ],
    claimed,
    removed: new Set(["chicken_breast"]),
  });
  assertEquals(out.kept.map((l) => l.term), [
    "tomates",
    "citrons",
    "un truc que personne ne connaît",
  ]);
  assertEquals(out.dropped.map((l) => l.term), ["blanc de poulet"]);
  assertEquals(out.counts, { claimed: 2, removed: 1, unattributed: 1 });
  // ⛔ LE CAS QUI MORD : sur les mêmes entrées, l'ancien filtre par libellé
  // aurait jeté « tomates » ET « citrons » — deux lignes dont le plan a besoin.
  assertEquals(
    ancienFiltre(
      [{ term: "tomates" }, { term: "citrons" }],
      [{ term: "tomate" }, { term: "citron" }],
    ).length,
    0,
  );
});

Deno.test("C3 ⑨ — trois espaces de noms, et ils ne se touchent pas", () => {
  // ⛔ Fondre `term:` et `refused:` rapprocherait une ligne dont l'identifiant
  // est FAUX d'une ligne de courses homonyme — c'est-à-dire referait le
  // rapprochement par libellé que ce lot supprime.
  assertEquals(foodIdentityOf(INDEX, { term: "citrons" }).identity, "lemon");
  assertEquals(foodIdentityOf(INDEX, { term: "wombat" }).identity, `term:${normalizeTerm("wombat")}`);
  assertEquals(
    foodIdentityOf(INDEX, { term: "citrons", ref: "inventé_par_le_modèle" }).identity,
    `refused:${normalizeTerm("citrons")}`,
  );
  assert(
    foodIdentityOf(INDEX, { term: "citrons", ref: "inventé_par_le_modèle" }).identity !==
      foodIdentityOf(INDEX, { term: "citrons" }).identity,
    "un identifiant faux rejoint l'identité de son homonyme",
  );
});

Deno.test("C3 ⑧ — le PONT PAR TERME EXACT : l'identifiant de l'ingrédient gagne sur le libellé de la ligne", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ SUR UN RUN RÉEL DU BANC, LE 2026-09-12 (plan `44390f2e`).
  // ══════════════════════════════════════════════════════════════════════
  // L'ingrédient écrit `ref: lamb_leg` (« gigot d'agneau ») ; la ligne de
  // courses « agneau » atteint `lamb` par son seul libellé. Deux identités
  // pour le MÊME achat : la ligne gardait une quantité périmée pendant que
  // le besoin se déclarait « non acheté ». Le pont est l'égalité EXACTE des
  // termes normalisés, la même règle que `final_plan_audit.ts` — jamais une
  // sous-chaîne, jamais une distance d'édition.
  const index = buildCompositionIndex(
    [
      ref({ slug: "lamb", foodGroupRef: "red_meat", energyKcal: 250 }),
      ref({ slug: "lamb_leg", foodGroupRef: "red_meat", energyKcal: 230 }),
    ],
    [{ alias: "agneau", slug: "lamb" }],
  );
  const dishes = [{ ingredients: [need("agneau", 232, "g", "lamb_leg")] }];
  const { needs, identityByTerm } = shoppingNeedsOf({ index, dishes, preparations: [] });
  // La ligne de courses, seule, atteint l'AUTRE aliment.
  assertEquals(foodIdentityOf(index, { term: "agneau" }).identity, "lamb");
  assert(!needs.has("lamb"), "le besoin est sur `lamb_leg`, pas sur `lamb`");
  const out = rebuildShoppingQuantities({
    index,
    lines: [panier("agneau", "300 g d'agneau", 300, "g")],
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });
  assertEquals(out.items[0].amount, 232, "la ligne garde une quantité périmée");
  assertEquals(out.counts.unattributed, 0);
  assertEquals(out.counts.needs_unbought, 0, "le besoin se déclare encore non acheté");
  // ⛔ LE CAS QUI MORD : un libellé DIFFÉRENT ne franchit pas le pont. « gigot »
  // et « agneau » ne sont pas la même chaîne, et aucun rapprochement
  // approximatif n'est autorisé ici.
  const autre = rebuildShoppingQuantities({
    index,
    lines: [panier("gigot", "300 g de gigot", 300, "g")],
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });
  assertEquals(autre.counts.unattributed, 1);
  // ⟳ LOT 1 — LE BESOIN N'EST PLUS « NON ACHETÉ », IL EST PRODUIT ; et l'oubli
  // du modèle reste compté. La garde `needs_unbought` doit valoir zéro.
  assertEquals(autre.counts.needs_unbought, 0);
  assertEquals(autre.counts.model_omitted, 1);
  assertEquals(autre.counts.synthesized, 1);
  // ⛔ ET LA LIGNE « gigot » N'A PAS ÉTÉ ABSORBÉE : elle reste, elle est
  // comptée, et la ligne produite porte le terme de l'INGRÉDIENT.
  assertEquals(autre.items.map((l) => l.term), ["gigot", "agneau"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ ÉTAPE C6 — UN `ref` TIRÉ DU LIBELLÉ NE DOIT PAS DÉSARMER LE PONT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT, MESURÉ SUR UN TIR RÉEL QUI A PERDU SON PLAN. Campagne du
// 2026-09-12, tir n° 1 (`4d82720c`) : **422 `plan_not_deliverable`**, une seule
// cause bloquante, `ingredient_not_bought « champignons de Paris »` — alors que
// la ligne EST sur la liste, écrite au caractère près, 200 g pour 200 g.
// Reproduit hors ligne à zéro appel modèle (`banc-lot-F.ts --reponse=…`).
//
// ── LA MÉCANIQUE ──────────────────────────────────────────────────────────
// C3 a donné un identifiant aux lignes de courses : le parseur appelle
// `resolveCompositionLine(index, { term, ref: null })` et écrit le slug obtenu.
// Ce n'est donc PAS l'identifiant du modèle, c'est le LIBELLÉ RÉSOLU. Sur ce
// plan il valait `champignons_de_paris` (entrée du sas) pendant que
// l'ingrédient de la préparation portait `button_mushroom_cultivated_mushroom`
// (identifiant du modèle). L'audit ne franchissait le pont que si
// `ref === null` : il ne le franchissait plus, et rendait deux identités.
//
// ⛔ ET LES DEUX LECTEURS SE CONTREDISAIENT : au même instant,
// `rebuildShoppingQuantities` annonçait `needs_unbought: 0`.
Deno.test("C6 ⑩ — une ligne dont le `ref` vient de son LIBELLÉ rejoint le besoin du modèle", () => {
  // LE TÉMOIN, D'ABORD : les deux identités sont bien différentes.
  assertEquals(
    foodIdentityOf(INDEX, { term: "champignons de Paris" }).identity,
    "champignons_de_paris",
  );
  assertEquals(
    foodIdentityOf(INDEX, {
      term: "champignons de Paris",
      ref: "button_mushroom_cultivated_mushroom",
    }).identity,
    "button_mushroom_cultivated_mushroom",
  );

  const plan = meal({
    dishes: [dish("sat", "dinner", "Frittata", [], ["prep_frittata"])],
    preparations: [
      pot("prep_frittata", [
        ing("champignons de Paris", 200, "g", "button_mushroom_cultivated_mushroom"),
      ]),
    ],
    // ⚠️ LA LIGNE TELLE QUE LE PARSEUR L'ÉCRIT AUJOURD'HUI : le `ref` est le
    // libellé résolu, pas une déclaration du modèle.
    shopping_list: [
      {
        term: "champignons de Paris",
        quantity: "200 g",
        aisle: "produce",
        food_group: "non_starchy_veg",
        ref: "champignons_de_paris",
        amount: 200,
        unit: "g",
        state: "raw",
        purchasable: true,
      } as unknown as GeneratedMeal["shopping_list"][number],
    ],
  });

  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan: plan as unknown as Parameters<typeof shoppingIdentityAudit>[0]["plan"],
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  const ligne = audit.rows.find((r) => r.identity === "button_mushroom_cultivated_mushroom");
  assert(ligne !== undefined, "le besoin du modèle doit être audité");
  assertEquals(ligne.state, "covered_measured", `état rendu : ${ligne.state}`);
  assertEquals(ligne.boughtRawG, 200);
  assertEquals(
    audit.rows.filter((r) => r.state === "not_bought").length,
    0,
    "aucun achat manquant : la ligne est sur la liste, à l'identique",
  );
  // ⛔ ET LES DEUX LECTEURS DISENT LA MÊME CHOSE — c'est la propriété qui
  // manquait : la reconstruction annonçait `needs_unbought: 0` au moment même
  // où la garde refusait le plan.
  const { needs, identityByTerm } = shoppingNeedsOf({
    index: INDEX,
    dishes: plan.dishes,
    preparations: plan.preparations,
  });
  const rebuilt = rebuildShoppingQuantities({
    index: INDEX,
    lines: plan.shopping_list as unknown as Parameters<
      typeof rebuildShoppingQuantities
    >[0]["lines"],
    needs,
    identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });
  assertEquals(rebuilt.counts.needs_unbought, 0);
  assertEquals(rebuilt.counts.unattributed, 0);
});

Deno.test("C6 ⑩ — LE CAS QUI MORD : un `ref` qui atteint DÉJÀ un besoin n'est pas détourné", () => {
  // ⛔ SANS CETTE ÉPREUVE, LE PONT POURRAIT TOUT RECOUVRIR. La règle de
  // `rebuildShoppingQuantities` est reprise mot pour mot : « le pont ne sert que
  // lorsque la ligne n'atteint aucun besoin ; il ne peut donc pas détourner une
  // ligne qui en atteignait un ».
  //
  // Ici DEUX aliments portent le même libellé chez deux besoins différents : la
  // ligne « champignons de Paris » qui déclare `champignons_de_paris` doit
  // rester sur `champignons_de_paris`, parce que c'est un besoin du plan.
  const plan = meal({
    dishes: [
      dish("sat", "dinner", "Deux champignons", [
        ing("champignons de Paris", 100, "g", "champignons_de_paris"),
        ing("champignons de Paris", 150, "g", "button_mushroom_cultivated_mushroom"),
      ]),
    ],
    shopping_list: [
      {
        term: "champignons de Paris",
        quantity: "100 g",
        aisle: "produce",
        food_group: "non_starchy_veg",
        ref: "champignons_de_paris",
        amount: 100,
        unit: "g",
        state: "raw",
        purchasable: true,
      } as unknown as GeneratedMeal["shopping_list"][number],
    ],
  });
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan: plan as unknown as Parameters<typeof shoppingIdentityAudit>[0]["plan"],
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  const sas = audit.rows.find((r) => r.identity === "champignons_de_paris");
  const modele = audit.rows.find((r) => r.identity === "button_mushroom_cultivated_mushroom");
  assert(sas !== undefined && modele !== undefined);
  assertEquals(sas.boughtRawG, 100, "la ligne reste sur l'identité qu'elle déclare");
  assertEquals(modele.state, "not_bought", "l'autre besoin reste, lui, non acheté");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · FERMETURE LOT 2 — LES DEUX MODULES LISENT LE MÊME BESOIN NET
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ le stock déduit par la reconstruction est RETRANCHÉ du besoin de l'audit", () => {
  // ⛔ LA MINE, ÉCRITE DANS `RESTE-A-FAIRE.md`. `rebuildShoppingQuantities`
  // DÉDUIT le stock quantifié : la ligne porte le besoin NET. L'audit, lui,
  // comparait le besoin ENTIER à cette ligne réduite — et rendait « pas assez
  // acheté » sur un plan parfaitement juste, c'est-à-dire
  // `ingredient_short_bought` sur quelqu'un qui a déjà l'aliment chez lui.
  const plan = {
    dishes: [{
      day: "mon",
      slot: "lunch",
      ingredients: [
        { term: "feta", quantity: "200 g", amount: 200, unit: "g", state: "raw", ref: "feta" },
      ],
    }],
    preparations: [],
    // La reconstruction a déduit 120 g de stock : la ligne n'en porte que 80.
    shopping_list: [
      { term: "feta", quantity: "80 g", amount: 80, unit: "g", state: "raw", ref: "feta" },
    ],
  };
  // ── SANS LA CARTE: le besoin entier contre une ligne réduite ⇒ « short » ──
  const aveugle = shoppingIdentityAudit({
    index: INDEX,
    plan,
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(
    aveugle.rows.find((r) => r.identity === "feta")?.state,
    "short",
    "le cas d'avant ne se reproduit plus : ce test ne prouve plus rien",
  );
  assertEquals(aveugle.pantryNetted, 0);

  // ── AVEC: le besoin net est 80 g, et 80 g ont été achetés ⇒ « covered » ──
  const net = shoppingIdentityAudit({
    index: INDEX,
    plan,
    pantryTerms: ["feta"],
    pantryCoveredG: new Map<string, number>([["feta", 120]]),
  });
  assertEquals(net.pantryNetted, 1);
  assertEquals(
    net.rows.find((r) => r.identity === "feta")?.state,
    "covered_measured",
    "le stock déduit n'est pas retranché du besoin",
  );
});

Deno.test("⛔ bis — un stock PLUS GROS que le besoin ne rend pas un besoin négatif", () => {
  const plan = {
    dishes: [{
      day: "mon",
      slot: "lunch",
      ingredients: [
        { term: "feta", quantity: "100 g", amount: 100, unit: "g", state: "raw", ref: "feta" },
      ],
    }],
    preparations: [],
    shopping_list: [],
  };
  const net = shoppingIdentityAudit({
    index: INDEX,
    plan,
    pantryTerms: ["feta"],
    pantryCoveredG: new Map<string, number>([["feta", 900]]),
  });
  const row = net.rows.find((r) => r.identity === "feta")!;
  assertEquals(row.neededRawG, 0, "le besoin est passé sous zéro");
  assertEquals(net.pantryNetted, 1);
});
