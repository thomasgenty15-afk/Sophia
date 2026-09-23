/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 · AUDIT DES DOSAGES, LOT 2 — LES DEUX MOITIÉS D'UN PLAT À DEUX
 * CASSEROLES, LUES HORS DU GÉNÉRATEUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `two_pot_parts.ts` est l'extraction du bloc « LOT C — LE FÉCULENT À CÔTÉ »
 * de `generate-household-meal-v1/index.ts`, pour que le chemin d'une personne
 * seule serve lui aussi son féculent à la forme de son objectif.
 *
 * Le banc: une casserole principale (poulet 400 g + courgette 400 g, 550 kcal,
 * 96,8 g de protéine, 800 g prêts) et une casserole de riz (240 g, 840 kcal,
 * 16,8 g, 240 g prêts), chacune tirée deux fois. Une part: principal 275 kcal /
 * 48,4 g / 400 g, riz 420 kcal / 8,4 g / 120 g.
 *
 * ⛔ NOMBRES EN DUR. ⛔ CHAQUE REFUS A SON CAS.
 */
import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import type { GeneratedDish, MealPreparation } from "./meal_generation.ts";
import { splitStarchSide } from "./starch_side.ts";
import {
  partsOfPlate,
  sidePotsOf,
  type TwoPotPreparation,
  twoPotPartsOf,
} from "./two_pot_parts.ts";

// ───────────────────────────────────────────────────────────────────────────
// LE RÉFÉRENTIEL DU BANC
// ───────────────────────────────────────────────────────────────────────────
function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1.0,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const INDEX = buildCompositionIndex(
  [
    ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 121, proteinG: 23 }),
    ref({ slug: "courgette", energyKcal: 16.5, proteinG: 1.2 }),
    ref({ slug: "rice", foodGroupRef: "refined_grain", energyKcal: 350, proteinG: 7 }),
  ],
  [{ alias: "poulet", slug: "chicken_breast" }, { alias: "riz", slug: "rice" }],
);

/** Une ligne pesée: `amount` pour la mesure, `gramsRaw` pour le groupe. */
function line(term: string, g: number | null) {
  return {
    term,
    ref: null,
    refRefused: false,
    amount: g,
    unit: "g",
    state: "raw",
    gramsRaw: g,
  };
}

function pot(id: string, role: string, ingredients: ReturnType<typeof line>[]) {
  return { id, method: "", ingredients, components: [{ role }] };
}

const MAIN_POT = pot("prep_main", "main", [line("poulet", 400), line("courgette", 400)]);
const RICE_POT = pot("prep_rice", "separable_side", [line("riz", 240)]);
const DISH = {
  method: "",
  ingredients: [],
  uses: [{ preparationId: "prep_main" }, { preparationId: "prep_rice" }],
};
const DRAWS = new Map<string, number>([["prep_main", 2], ["prep_rice", 2]]);

function partsOf(preparations: TwoPotPreparation[], dish = DISH) {
  return twoPotPartsOf({
    index: INDEX,
    dish,
    preparations,
    drawsByPrep: DRAWS,
    sidePots: sidePotsOf({ index: INDEX, preparations }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE PLAT RETENU, ET SES DEUX MOITIÉS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("MORD — riz déclaré à côté ET confirmé: les deux moitiés d'une part", () => {
  const out = partsOf([MAIN_POT, RICE_POT]);
  assertEquals(out.sidePrepId, "prep_rice");
  assertEquals(out.refusal, null);
  // Riz: 840 kcal ÷ 2 tirages, 16,8 g ÷ 2, 240 g ÷ 2.
  assertAlmostEquals(out.side!.kcal, 420, 1e-9);
  assertAlmostEquals(out.side!.proteinG, 8.4, 1e-9);
  assertAlmostEquals(out.side!.readyG, 120, 1e-9);
  // Principal: tout le reste de l'assiette (695 − 420, 56,8 − 8,4, 520 − 120).
  assertAlmostEquals(out.main!.kcal, 275, 1e-9);
  assertAlmostEquals(out.main!.proteinG, 48.4, 1e-9);
  assertAlmostEquals(out.main!.readyG, 400, 1e-9);
});

Deno.test("le groupe vient du RÉFÉRENTIEL des lignes pesées, pas du modèle", () => {
  const pots = sidePotsOf({
    index: INDEX,
    preparations: [
      MAIN_POT,
      RICE_POT,
      // Une ligne non pesée ne dit aucun groupe; une ligne inconnue rend `null`.
      pot("prep_mix", "separable_side", [line("riz", null), line("graine mystère", 50)]),
      // Une casserole sans identifiant n'entre pas: aucun plat ne peut la tirer.
      pot("", "separable_side", [line("riz", 100)]),
    ],
  });
  assertEquals([...pots.keys()], ["prep_main", "prep_rice", "prep_mix"]);
  assertEquals(pots.get("prep_main")!.weighedGroups, ["poultry", "non_starchy_veg"]);
  assertEquals(pots.get("prep_rice")!.weighedGroups, ["refined_grain"]);
  assertEquals(pots.get("prep_rice")!.roles, ["separable_side"]);
  assertEquals(pots.get("prep_mix")!.weighedGroups, [null]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES REFUS, NOMMÉS — ET L'ASSIETTE N'EST PAS MESURÉE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("refus nommés: une casserole, aucune à côté, deux à côté, un « féculent » qui n'en est pas un", () => {
  const seul = partsOf([MAIN_POT], { ...DISH, uses: [{ preparationId: "prep_main" }] });
  assertEquals([seul.sidePrepId, seul.refusal, seul.main, seul.side], [null, "single_pot", null, null]);

  const aucun = partsOf([MAIN_POT, pot("prep_rice", "main", [line("riz", 240)])]);
  assertEquals(aucun.refusal, "no_side_declared");

  const deux = partsOf([pot("prep_main", "separable_side", [line("riz", 100)]), RICE_POT]);
  assertEquals(deux.refusal, "two_sides");

  // ⛔ UN POULET DÉCLARÉ « À CÔTÉ » EST REFUSÉ PAR LE RÉFÉRENTIEL.
  const poulet = partsOf([
    pot("prep_main", "main", [line("courgette", 400)]),
    pot("prep_rice", "separable_side", [line("poulet", 240)]),
  ]);
  assertEquals(poulet.refusal, "side_not_starch");

  // ⚠️ Une casserole dont aucune ligne pesée ne se résout ne peut rien ouvrir.
  const muette = partsOf([MAIN_POT, pot("prep_rice", "separable_side", [line("graine mystère", 240)])]);
  assertEquals(muette.refusal, "side_not_starch");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ UNE MESURE QUI SE TAIT REND `null`, JAMAIS UN ZÉRO
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("partsOfPlate: féculent illisible ⇒ deux `null`; assiette illisible ⇒ principal `null`", () => {
  const pots = [
    { id: "prep_main", draws: 2, water: "kept" as const, readyG: 400, kcal: 275, proteinG: 48.4 },
    { id: "prep_rice", draws: 2, water: "kept" as const, readyG: 120, kcal: null, proteinG: 8.4 },
  ];
  assertEquals(
    partsOfPlate({ kcal: 695, proteinG: 56.8, readyG: 520, pots }, "prep_rice"),
    { main: null, side: null },
  );
  const lisible = [pots[0], { ...pots[1], kcal: 420 }];
  assertEquals(
    partsOfPlate({ kcal: null, proteinG: 56.8, readyG: 520, pots: lisible }, "prep_rice"),
    { main: null, side: { kcal: 420, proteinG: 8.4, readyG: 120 } },
  );
  assertEquals(
    partsOfPlate({ kcal: 695, proteinG: 56.8, readyG: 520, pots: lisible }, "prep_absente"),
    { main: null, side: null },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE BUT DE L'EXTRACTION: UNE PERSONNE SEULE REÇOIT LA FORME DE SON OBJECTIF
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("personne seule en perte: le riz redescend à 0,30 de l'énergie de la part", () => {
  const { main, side } = partsOf([MAIN_POT, RICE_POT]);
  // Part de riz de la recette 420/695 = 0,6043. Plafond de perte 0,30:
  // principal 0,7 × 695/275 = 1,769091 (≤ 2,0 ✓; bande basse 0,8 × 695/275 =
  // 2,0218 ✓); riz (695 − 486,5)/420 = 0,496429.
  const seule = splitStarchSide({
    main,
    side,
    uniformFactor: 1,
    tableFactor: null,
    tableGoal: null,
    floorG: null,
    bounds: null,
    goal: "fat_loss",
  });
  assertEquals(seule.outcome, "goal_shape");
  assertAlmostEquals(seule.mainFactor, 1.769091, 1e-6);
  assertAlmostEquals(seule.sideFactor, 0.496429, 1e-6);
  assertAlmostEquals(seule.starchShareAfter!, 0.3, 1e-9);
  // ⚠️ `goal: null` (mineur, âge inconnu): la recette telle quelle.
  const mineur = splitStarchSide({
    main,
    side,
    uniformFactor: 1,
    tableFactor: null,
    tableGoal: null,
    floorG: null,
    bounds: null,
    goal: null,
  });
  assertEquals(mineur.outcome, "uniform");
  assertEquals([mineur.mainFactor, mineur.sideFactor], [1, 1]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES TYPES DU PLAN ENTRENT SANS `as`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ CONTRÔLE DE TYPES SEUL: `MealPreparation[]` et `GeneratedDish` (les types
 * que le générateur manipule) entrent tels quels. Un `as` à l'appel désarmerait
 * le contrôle des champs lus ici.
 */
function typesDuPlan(index: CompositionIndex, dish: GeneratedDish, preparations: MealPreparation[]) {
  return twoPotPartsOf({
    index,
    dish,
    preparations,
    drawsByPrep: new Map(),
    sidePots: sidePotsOf({ index, preparations }),
  });
}

Deno.test("les types du plan entrent sans conversion", () => {
  assertEquals(typeof typesDuPlan, "function");
});
