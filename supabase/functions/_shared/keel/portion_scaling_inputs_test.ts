/**
 * LES ENTRÉES DE LA MISE À L'ÉCHELLE — `scalingInputsFor`.
 *
 * ⛔ CE QUE CES ÉPREUVES GARDENT, ce sont les trois pièges écrits dans
 * l'en-tête du module, et chacun a son cas qui PASSE et son cas qui REFUSE.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { foldPreparationsIntoDishes } from "./meal_verdict.ts";
import {
  proteinFoodPredicate,
  scalingInputsFor,
} from "./portion_scaling_inputs.ts";

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
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  };
}

const INDEX = buildCompositionIndex([
  // 100 g de poulet: 160 kcal, 30 g de protéine. C'est l'ancre protéique.
  ref({ slug: "chicken", foodGroupRef: "poultry", energyKcal: 160, proteinG: 30 }),
  // 100 g de riz: 350 kcal, 7 g. Pesable, mais pas protéique.
  ref({ slug: "rice", foodGroupRef: "whole_grain", energyKcal: 350, proteinG: 7 }),
  // Une tortilla: dénombrable (`unitGrams`). MOBILE depuis le 2026-08-12.
  ref({ slug: "tortilla", foodGroupRef: "whole_grain", energyKcal: 300, proteinG: 8, unitGrams: 50 }),
  // Le sel: connu, jamais pesé. Il doit compter comme CONNU (piège ②).
  ref({ slug: "salt", foodGroupRef: "sauce_dressing", energyKcal: 0, proteinG: 0, condimentGrams: 1 }),
  // Une huile dense: c'est elle qui lève `unweighedDense` quand elle n'est pas pesée.
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, proteinG: 0, energyDense: true }),
], []);

const isProteinFood = proteinFoodPredicate(INDEX);

// deno-lint-ignore no-explicit-any
const g = (term: string, amount: number | null, unit: any = "g") => ({
  term,
  amount,
  unit,
  state: "raw" as const,
});

Deno.test("le prédicat protéique vient du RÉFÉRENTIEL, pas d'une liste de mots", () => {
  assert(isProteinFood("chicken"));
  assert(!isProteinFood("rice"));
  // ⛔ LE CAS QUI REFUSE, et c'est la cicatrice « jamais de matcher maison »:
  // un terme que le référentiel ne connaît pas n'est PAS protéique. On ne
  // devine pas — le facteur unique reprend la main, comme avant.
  assert(!isProteinFood("chicken-flavoured crisps from a brand we never heard of"));
});

Deno.test("l'énergie et la protéine se somment sur toute la fenêtre", () => {
  const dishes = foldPreparationsIntoDishes({
    dishes: [{
      slot: "lunch",
      method: "",
      ingredients: [g("chicken", 100), g("rice", 100)],
      uses: [],
    }],
    preparations: [],
  });
  const out = scalingInputsFor({ index: INDEX, dishes, isProteinFood });
  assertAlmostEquals(out.computedKcal, 160 + 350, 0.01);
  assertAlmostEquals(out.computedProteinG, 30 + 7, 0.01);
  assertAlmostEquals(out.proteinFoodKcal, 160, 0.01);
  assertAlmostEquals(out.otherScalableKcal, 350, 0.01);
  assertAlmostEquals(out.proteinFoodProteinG, 30, 0.01);
  assertEquals(out.resolvedShare, 1);
  assertEquals(out.unweighedDense, false);
});

Deno.test("⛔ PIÈGE ① — la frontière MOBILE/FIXE est celle du module, pas une seconde liste", () => {
  // ⚠️ LES DÉNOMBRABLES SONT MOBILES DEPUIS LE 2026-08-12. Ce test le PIN:
  // s'ils ressortaient de `isScalableUnit`, le facteur se remettrait à porter
  // sur une assiette qui n'est pas celle qu'on déplace (×1,81 demandé, ×1,39
  // rendu, ~60 % du plat hors de portée). C'est la valeur du partage: la
  // frontière bouge d'un seul côté, et ce fichier rougit.
  const dishes = foldPreparationsIntoDishes({
    dishes: [{
      slot: "lunch",
      method: "",
      // 2 tortillas × 50 g = 100 g ⇒ 300 kcal, `unit` ⇒ MOBILE.
      // Une pincée de sel: aucune quantité ⇒ FIXE.
      ingredients: [g("chicken", 100), g("tortilla", 2, "unit"), g("salt", null, null)],
      uses: [],
    }],
    preparations: [],
  });
  const out = scalingInputsFor({ index: INDEX, dishes, isProteinFood });
  assertAlmostEquals(out.computedKcal, 160 + 300, 0.01);
  assertAlmostEquals(out.proteinFoodKcal, 160, 0.01);
  // La tortilla EST dans la part mobile — c'est l'élargissement du 2026-08-12.
  assertAlmostEquals(out.otherScalableKcal, 300, 0.01);
});

Deno.test("⚠️ LE CAS QUI SORT DE LA PART MOBILE — une quantité que personne ne sait lire", () => {
  // ⛔ SANS CE CAS, `otherScalableKcal` pourrait valoir `computedKcal` en toute
  // circonstance et personne ne le verrait. Un ingrédient sans unité nourrit
  // (il compte au total) et ne se déplace pas (il sort des deux parts).
  const dishes = foldPreparationsIntoDishes({
    dishes: [{
      slot: "lunch",
      method: "",
      ingredients: [g("rice", null, null)],
      uses: [],
    }],
    preparations: [],
  });
  const out = scalingInputsFor({ index: INDEX, dishes, isProteinFood });
  assertAlmostEquals(out.otherScalableKcal, 0, 0.01);
  assertAlmostEquals(out.proteinFoodKcal, 0, 0.01);
});

Deno.test("⛔ PIÈGE ② — un condiment CONNU et non pesé ne fait pas chuter la lisibilité", () => {
  // Compter `resolved.length` donnait 69 % là où la couverture donne 96 %, et
  // la mise à l'échelle s'abstenait sur du sel.
  const dishes = foldPreparationsIntoDishes({
    dishes: [{
      slot: "lunch",
      method: "",
      ingredients: [g("chicken", 100), g("salt", null, null)],
      uses: [],
    }],
    preparations: [],
  });
  const out = scalingInputsFor({ index: INDEX, dishes, isProteinFood });
  assertEquals(out.resolvedShare, 1);
});

Deno.test("⚠️ LE CAS QUI REFUSE — un terme INCONNU fait chuter la lisibilité", () => {
  // ⛔ SANS CE CAS, `resolvedShare: 1` serait une constante déguisée en mesure.
  const dishes = foldPreparationsIntoDishes({
    dishes: [{
      slot: "lunch",
      method: "",
      ingredients: [g("chicken", 100), g("green or brown lentils", 300)],
      uses: [],
    }],
    preparations: [],
  });
  const out = scalingInputsFor({ index: INDEX, dishes, isProteinFood });
  assertEquals(out.resolvedShare, 0.5);
});

Deno.test("⛔ L'HUILE DENSE NON PESÉE LÈVE LE DRAPEAU — l'appelant doit s'abstenir", () => {
  const dishes = foldPreparationsIntoDishes({
    dishes: [{
      slot: "lunch",
      method: "",
      ingredients: [g("chicken", 100), g("olive_oil", null, null)],
      uses: [],
    }],
    preparations: [],
  });
  assertEquals(
    scalingInputsFor({ index: INDEX, dishes, isProteinFood }).unweighedDense,
    true,
  );
});

Deno.test("⛔ PIÈGE ③ — LA PRÉPARATION EST PLIÉE AU PRORATA, une fois et pas quatre", () => {
  // ⚠️ SANS LE PLIAGE, 41 % de l'énergie et 51 % de la protéine sont hors des
  // plats. AVEC un pliage fait deux fois, un lot pour quatre pèserait quatre
  // fois dans chacun des quatre dîners.
  const dishes = foldPreparationsIntoDishes({
    dishes: [
      { slot: "lunch", method: "", ingredients: [], uses: [{ preparationId: "p", servings: 1 }] },
      { slot: "dinner", method: "", ingredients: [], uses: [{ preparationId: "p", servings: 1 }] },
    ],
    preparations: [{ id: "p", servingsMade: 4, ingredients: [g("chicken", 800)] }],
  });
  const out = scalingInputsFor({ index: INDEX, dishes, isProteinFood });
  // 800 g pour 4 portions ⇒ 200 g par plat, deux plats ⇒ 400 g ⇒ 640 kcal.
  assertAlmostEquals(out.computedKcal, 640, 0.01);
  assertAlmostEquals(out.proteinFoodProteinG, 120, 0.01);
});

Deno.test("un plan VIDE ne se déclare pas illisible", () => {
  // `resolvedShare: 0` ferait ressembler un plan vide à un plan qu'on ne sait
  // pas lire, et les deux ne se réparent pas au même endroit.
  const out = scalingInputsFor({ index: INDEX, dishes: [], isProteinFood });
  assertEquals(out.ingredients, 0);
  assertEquals(out.resolvedShare, 1);
  assertEquals(out.computedKcal, 0);
});
