/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-15 · BÊTA — LA BORNE D'ARRONDI EST CALCULÉE, ET ELLE FERME PEU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La campagne des 30 a rendu des journées à 61,9 g de protéine pour un
 * plancher de 62, et des cases à 133 kcal/100 g pour un couloir qui commence à
 * 134. La tentation était de les appeler « d'arrondi » sur leur taille en
 * pourcentage. Ici on calcule DE COMBIEN l'arrondi au gramme des items peut
 * déplacer la mesure — `boxNutrition` le rend par boîte, l'audit le porte par
 * case et par jour, la garde le lit — et on prouve que ce nombre est petit:
 * de l'ordre du dixième de gramme de protéine et du centième de kcal/100 g.
 *
 * Ce que ces tests tiennent:
 *   ① la borne d'une boîte est la formule, pas un pourcentage;
 *   ② une boîte d'un seul terme a une borne de densité NULLE;
 *   ③ la garde tient un plancher manqué de moins que la borne, le COMPTE, et
 *      refuse toujours un plancher manqué de plus — en nommant la borne;
 *   ④ une borne absente (`null`) vaut zéro: l'oubli ne tolère rien.
 */
import { assert, assertAlmostEquals, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  boxNutrition,
  densityRoundingOf,
  GRAMS_ROUNDING_HALF_STEP,
  potDensities,
  potProteinPerGram,
  PROTEIN_DISPLAY_HALF_STEP,
} from "./mouth_energy.ts";
import { type CellNutritionRow, dayNutritionTable } from "./final_plan_audit.ts";
import {
  FINAL_GATE_POLICY_LOT_4,
  finalPlanGate,
  type GateContext,
  type GatePlan,
} from "./final_plan_gate.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "refined_grain",
    label: over.slug,
    source: "ciqual",
    energyKcal: 350,
    proteinG: 7,
    carbsG: 78,
    fatG: 1,
    fiberG: 1,
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

const INDEX: CompositionIndex = buildCompositionIndex([
  ref({ slug: "rice", yieldClass: "grain_absorbs" }),
  ref({ slug: "lentils", foodGroupRef: "legumes", energyKcal: 330, proteinG: 25, yieldClass: "legume_absorbs" }),
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }),
  ref({ slug: "oil", foodGroupRef: "olive_oil", energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0, energyDense: true }),
], []);

function g(term: string, amount: number, unit: "g" | "ml" = "g") {
  return { term, amount, unit, state: unit === "ml" ? null : ("raw" as const) };
}

const POTS = [
  { id: "p_lentils", servingsMade: 2, method: "mijoter", ingredients: [g("lentils", 200), g("water", 400, "ml"), g("oil", 20)] },
  { id: "p_rice", servingsMade: 2, method: "bouillir", ingredients: [g("rice", 100), g("water", 300, "ml")] },
];

const DISH = {
  day: "mon",
  slot: "dinner",
  method: "",
  ingredients: [],
  uses: [{ preparationId: "p_lentils", servings: 1 }, { preparationId: "p_rice", servings: 1 }],
  boxes: [
    {
      id: "b_mix",
      memberIds: ["m1"],
      items: [{ grams: 300, preparationId: "p_lentils" }, { grams: 150, preparationId: "p_rice" }],
      legacyTotalGrams: null,
    },
    { id: "b_one", memberIds: ["m2"], items: [{ grams: 400, preparationId: "p_rice" }], legacyTotalGrams: null },
  ],
};

Deno.test("① la borne d'une boîte est la formule — ½ g par item, au gramme de protéine et à la densité de sa casserole", () => {
  const per = boxNutrition({ index: INDEX, dishes: [DISH], preparations: POTS });
  const densities = potDensities(INDEX, POTS);
  const proteins = potProteinPerGram(INDEX, POTS);
  const dL = densities.get("p_lentils")!, dR = densities.get("p_rice")!;
  const pL = proteins.get("p_lentils")!, pR = proteins.get("p_rice")!;
  assert(dL !== null && dR !== null && pL !== null && pR !== null, "les deux casseroles se lisent");

  const mix = per.find((b) => b.boxId === "b_mix")!;
  assert(mix.kcal !== null && mix.proteinG !== null);
  // Protéine: Σ ½ g × protéine au gramme, plus le demi-dixième de l'affichage.
  assertAlmostEquals(
    mix.proteinRoundingG!,
    GRAMS_ROUNDING_HALF_STEP * (pL + pR) + PROTEIN_DISPLAY_HALF_STEP,
    1e-9,
  );
  // Densité: ½ × Σ|d_i − d̄| / G, en kcal/100 g.
  const mean = (300 * dL + 150 * dR) / 450;
  assertAlmostEquals(
    mix.densityRoundingPer100G!,
    (GRAMS_ROUNDING_HALF_STEP * (Math.abs(dL - mean) + Math.abs(dR - mean)) / 450) * 100,
    1e-9,
  );
  // ⛔ L'ORDRE DE GRANDEUR EST LE POINT: une boîte de deux casseroles rend une
  // borne de moins d'un gramme de protéine et de moins d'un kcal/100 g. Un
  // plancher manqué de 2 g ou un couloir manqué d'un point n'est PAS de
  // l'arrondi.
  assert(mix.proteinRoundingG! < 1, `borne protéique ${mix.proteinRoundingG} g`);
  assert(mix.densityRoundingPer100G! < 1, `borne de densité ${mix.densityRoundingPer100G} kcal/100 g`);
});

Deno.test("② une boîte d'un seul terme: arrondir sa masse ne change pas sa densité — borne NULLE", () => {
  const per = boxNutrition({ index: INDEX, dishes: [DISH], preparations: POTS });
  const one = per.find((b) => b.boxId === "b_one")!;
  assertEquals(one.densityRoundingPer100G, 0);
  assertEquals(densityRoundingOf([{ g: 400, perG: 1.3461538461538463 }], 400 * 1.3461538461538463, 400), 0);
  const pR = potProteinPerGram(INDEX, POTS).get("p_rice")!;
  assertAlmostEquals(one.proteinRoundingG!, GRAMS_ROUNDING_HALF_STEP * pR + PROTEIN_DISPLAY_HALF_STEP, 1e-9);
});

Deno.test("② bis — `densityRoundingOf` sur des nombres ronds", () => {
  assertEquals(densityRoundingOf([{ g: 100, perG: 2 }], 200, 100), 0);
  // Deux termes à 1 et 3 kcal/g, 100 g chacun: d̄ = 2, Σ|d_i − d̄| = 2,
  // ½ × 2 / 200 × 100 = 0,5 kcal/100 g.
  assertEquals(densityRoundingOf([{ g: 100, perG: 1 }, { g: 100, perG: 3 }], 400, 200), 0.5);
  assertEquals(densityRoundingOf([], 0, 0), 0);
});

function cellule(over: Partial<CellNutritionRow>): CellNutritionRow {
  return {
    memberId: "m1",
    day: "mon",
    date: "2026-09-14",
    slot: "dinner",
    targetKcal: 800,
    hasDish: true,
    hasPortion: true,
    servedKcal: 800,
    grams: 500,
    densityPer100G: 160,
    proteinG: 30,
    proteinRoundingG: 0.1,
    densityRoundingPer100G: 0.05,
    gap: null,
    deltaPct: 0,
    sharedWith: 1,
    portionExpected: true,
    state: "conforme",
    ...over,
  };
}

Deno.test("③ la journée porte la SOMME des bornes de ses cases — et `null` dès qu'une case ne se mesure pas", () => {
  const jours = [{
    memberId: "m1",
    date: "2026-09-14",
    coveredBudgetKcal: 2400,
    protein: { dayFloorG: 62, coveredFloorG: 62, perMealFloorG: null, fixedProteinG: null, dayCeilingG: null, coveredCeilingG: null, reason: "applied_full_day" as const },
  }];
  const somme = dayNutritionTable({
    cells: [
      cellule({ slot: "breakfast", proteinRoundingG: 0.1 }),
      cellule({ slot: "lunch", proteinRoundingG: 0.2 }),
      cellule({ slot: "dinner", proteinRoundingG: 0.15 }),
    ],
    days: jours,
  });
  assertAlmostEquals(somme[0].proteinRoundingG!, 0.45, 1e-9);
  const trou = dayNutritionTable({
    cells: [
      cellule({ slot: "breakfast" }),
      cellule({ slot: "lunch", proteinG: null, proteinRoundingG: null, servedKcal: null, gap: "dish_incomplete" }),
    ],
    days: jours,
  });
  assertEquals(trou[0].proteinG, null);
  assertEquals(trou[0].proteinRoundingG, null);
});

// ── la garde ───────────────────────────────────────────────────────────────

function planVide(): GatePlan {
  return { dishes: [], preparations: [], cooking_sessions: [], shopping_list: [] };
}

function decor(nutrition: GateContext["nutrition"]): GateContext {
  return {
    lane: "household",
    startsOn: "2026-09-11",
    windowDays: ["fri", "sat", "sun"],
    hasFreezer: true,
    maxFridgeDays: 3,
    mouths: [],
    dedicated: [],
    energy: null,
    boxContract: null,
    exclusions: { table: [], byMember: [] },
    strictestRegime: null,
    houseRuleLabels: [],
    pantryTerms: [],
    shopping: null,
    nutrition,
    policy: FINAL_GATE_POLICY_LOT_4,
  };
}

function journee(proteinG: number, proteinRoundingG: number | null) {
  return {
    memberId: "m1",
    date: "2026-09-12",
    cellsExpected: 3,
    cellsMeasured: 3,
    coveredBudgetKcal: 2000,
    servedKcal: 2000,
    deltaPct: 0,
    proteinG,
    proteinRoundingG,
    protein: { coveredFloorG: 62, coveredCeilingG: null, reason: "applied_full_day" },
    state: "conforme" as const,
  };
}

Deno.test("④ la garde tient un plancher manqué de MOINS que la borne, et le compte à part", () => {
  const out = finalPlanGate(planVide(), decor({ cells: [], days: [journee(61.9, 0.25)] }));
  assertEquals(out.counters.refusals_by_cause.protein_floor_short, 0);
  assertEquals(out.counters.checked.protein_days, 1);
  assertEquals(out.counters.checked.protein_within_rounding, 1);
});

Deno.test("④ bis — un plancher manqué de PLUS que la borne reste refusé, et la phrase nomme la borne", () => {
  const out = finalPlanGate(planVide(), decor({ cells: [], days: [journee(61.5, 0.25)] }));
  assertEquals(out.counters.refusals_by_cause.protein_floor_short, 1);
  assertEquals(out.counters.checked.protein_within_rounding, 0);
  const refus = out.refusals.find((r) => r.cause === "protein_floor_short")!;
  assertStringIncludes(refus.detail, "61.5 g de protéine pour un plancher couvert de 62 g");
  assertStringIncludes(refus.detail, "borne d'arrondi 0.3 g");
});

Deno.test("④ ter — une borne ABSENTE vaut zéro: l'oubli d'un appelant ne tolère rien", () => {
  const out = finalPlanGate(planVide(), decor({ cells: [], days: [journee(61.9, null)] }));
  assertEquals(out.counters.refusals_by_cause.protein_floor_short, 1);
  assertEquals(out.counters.checked.protein_within_rounding, 0);
  assertStringIncludes(
    out.refusals.find((r) => r.cause === "protein_floor_short")!.detail,
    "borne d'arrondi 0 g",
  );
});

Deno.test("④ quater — LE CAS QUI PASSE: un plancher tenu n'est pas compté « dans la borne »", () => {
  const out = finalPlanGate(planVide(), decor({ cells: [], days: [journee(62, 0.25)] }));
  assertEquals(out.counters.refusals_by_cause.protein_floor_short, 0);
  assertEquals(out.counters.checked.protein_within_rounding, 0);
});

// ── la case, par le vrai tableau ───────────────────────────────────────────

import { type AuditCell, cellNutritionTable } from "./final_plan_audit.ts";

const PLAN_DEUX_CASSEROLES = {
  dishes: [{
    day: "mon",
    slot: "dinner",
    ingredients: [],
    uses: [{ preparation_id: "p_lentils", servings: 1 }, { preparation_id: "p_rice", servings: 1 }],
    boxes: [{
      id: "b_mix",
      member_ids: ["m1"],
      items: [{ grams: 300, preparation_id: "p_lentils" }, { grams: 150, preparation_id: "p_rice" }],
    }],
  }],
  preparations: [
    {
      id: "p_lentils",
      method: "mijoter",
      servings_made: 2,
      ingredients: [
        { term: "lentils", amount: 200, unit: "g", state: "raw" },
        { term: "water", amount: 400, unit: "ml", state: null },
        { term: "oil", amount: 20, unit: "g", state: "raw" },
      ],
    },
    {
      id: "p_rice",
      method: "bouillir",
      servings_made: 2,
      ingredients: [
        { term: "rice", amount: 100, unit: "g", state: "raw" },
        { term: "water", amount: 300, unit: "ml", state: null },
      ],
    },
  ],
  shopping_list: [],
};

function caseM1(over: Partial<AuditCell>): AuditCell {
  return {
    memberId: "m1",
    day: "mon",
    date: "2026-09-14",
    slot: "dinner",
    targetKcal: null,
    gramsMin: null,
    gramsMax: null,
    densityMin: null,
    densityMax: null,
    densityMinExact: null,
    densityMaxExact: null,
    ...over,
  };
}

Deno.test("⑤ la case juge la densité À LA BORNE PRÈS, sur les bornes exactes — et pas au-delà", () => {
  const libre = cellNutritionTable({
    index: INDEX,
    plan: PLAN_DEUX_CASSEROLES,
    cells: [caseM1({})],
    portionsArePersonal: true,
  })[0];
  assert(libre.servedKcal !== null && libre.densityPer100G !== null, "la case se mesure");
  const borne = libre.densityRoundingPer100G;
  assert(borne !== null && borne > 0, `deux casseroles: une borne strictement positive (${borne})`);
  assert(libre.proteinRoundingG !== null && libre.proteinRoundingG > 0);
  const densite = libre.densityPer100G;
  const cible = libre.servedKcal;

  // Sous le couloir de MOINS que la borne: conforme.
  const dedans = cellNutritionTable({
    index: INDEX,
    plan: PLAN_DEUX_CASSEROLES,
    cells: [caseM1({ targetKcal: cible, densityMinExact: densite + borne / 2, densityMaxExact: 400 })],
    portionsArePersonal: true,
  })[0];
  assertEquals(dedans.state, "conforme");

  // Sous le couloir de PLUS que la borne: hors bornes — la recette, pas l'arrondi.
  const dehors = cellNutritionTable({
    index: INDEX,
    plan: PLAN_DEUX_CASSEROLES,
    cells: [caseM1({ targetKcal: cible, densityMinExact: densite + borne + 0.01, densityMaxExact: 400 })],
    portionsArePersonal: true,
  })[0];
  assertEquals(dehors.state, "bounds_off");

  // Et le plafond, symétriquement.
  const plafond = cellNutritionTable({
    index: INDEX,
    plan: PLAN_DEUX_CASSEROLES,
    cells: [caseM1({ targetKcal: cible, densityMinExact: 1, densityMaxExact: densite - borne / 2 })],
    portionsArePersonal: true,
  })[0];
  assertEquals(plafond.state, "conforme");
});
