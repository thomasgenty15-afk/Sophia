/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA REPESÉE SUR L'INDEX RÉPARÉ — `regramMeal` / `gramsRawForIngredient`.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CES ÉPREUVES GARDENT, ET IL ÉTAIT MUET ──────────────────
 * Le sas de réparation (`LOT 18`) enrichit l'index APRÈS le parseur. Les deux
 * lanes réaffectaient bien leur `composition`, et tout ce qui LIT l'index
 * ensuite (verdict, couverture, énergie) en profitait — mais `grams_raw` est
 * une valeur FIGÉE sur la ligne, calculée par le parseur sur l'index d'AVANT.
 * La ligne écrite en base ne recevait donc jamais le bénéfice du sas: le
 * tableau de bord annonçait une réparation que la donnée n'avait pas eue.
 *
 * Mesuré le 2026-08-23 sur dix générations réelles: `composition_fill` a tourné
 * 8 fois, et pas un gramme écrit n'a bougé.
 *
 * ⛔ CHAQUE PROPRIÉTÉ A SON CAS QUI PASSE **ET** SON CAS QUI REFUSE. Une garde
 * dont on n'a vu qu'un côté bloque tout et ressemble à une garde qui marche.
 */
import { assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  type DishIngredient,
  type GeneratedDish,
  gramsRawForIngredient,
  type MealPreparation,
  regramMeal,
} from "./meal_generation.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "legumes",
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
  };
}

/** L'index de BASE: il ignore les lentilles. C'est l'état d'avant le sas. */
const BASE = buildCompositionIndex([ref({ slug: "rice" })], []);
/** L'index APRÈS le sas: la ligne manquante a été remplie. */
const FILLED = buildCompositionIndex(
  [ref({ slug: "rice" }), ref({ slug: "lentils" })],
  [],
);

function ing(over: Partial<DishIngredient> & { term: string }): DishIngredient {
  return {
    quantity: null,
    inPantry: false,
    amount: null,
    unit: null,
    state: null,
    gramsRaw: null,
    group: null,
    quantitySource: null,
    part: null,
    ...over,
  } as DishIngredient;
}

function dish(ingredients: DishIngredient[]): GeneratedDish {
  return { ingredients } as unknown as GeneratedDish;
}
function prep(ingredients: DishIngredient[]): MealPreparation {
  return { id: "p1", ingredients } as unknown as MealPreparation;
}

// ---------------------------------------------------------------------------
// `gramsRawForIngredient` — la brique
//
// ⟳ LOT C (2026-09-11) — CHAQUE LIGNE PORTE DEUX CHAMPS DE PLUS: `ref`,
// l'identifiant de référence rendu par le modèle, et `refRefused`, le fait
// qu'il en ait rendu un et qu'il ait été refusé. Tous les cas ci-dessous les
// laissent à `null`/`false` EXPRÈS: c'est le chemin par TERME LIBRE qu'ils
// testent, et ce lot ne le change pas — il ajoute un chemin prioritaire à
// côté. Le chemin par identifiant a ses propres cas, dans
// `composition_contract_test.ts`.
// ---------------------------------------------------------------------------

Deno.test("un terme INCONNU de l'index ne pèse rien, quelle que soit la quantité", () => {
  // C'est le cas mesuré: `900 g dried green or brown lentils`, quantité
  // structurée présente, et `grams_raw: null` parce que le terme ne résout pas.
  assertEquals(
    gramsRawForIngredient(BASE, {
      term: "lentils",
      ref: null,
      refRefused: false,
      quantity: "300 g lentils",
      amount: 300,
      unit: "g",
      state: "raw",
    }),
    null,
  );
});

Deno.test("le MÊME ingrédient pèse dès que l'index le connaît", () => {
  assertEquals(
    gramsRawForIngredient(FILLED, {
      term: "lentils",
      ref: null,
      refRefused: false,
      quantity: "300 g lentils",
      amount: 300,
      unit: "g",
      state: "raw",
    }),
    300,
  );
});

Deno.test("⚠️ LA PROSE EST RELUE, pas seulement la copie structurée", () => {
  // ⛔ C'EST LA MOITIÉ QUI SE PERDRAIT SI ON REPARTAIT DE `amount`/`unit` SEULS.
  // Sur 3 850 lignes sans `amount`, 3 833 portent la quantité en prose
  // (lot `L-1-b`). Une repesée qui les ignore rendrait `null` sur 99,6 % des
  // lignes qu'elle est censée réparer.
  assertEquals(
    gramsRawForIngredient(FILLED, {
      term: "lentils",
      ref: null,
      refRefused: false,
      quantity: "250 g",
      amount: null,
      unit: null,
      state: "raw",
    }),
    250,
  );
});

Deno.test("sans index, rien ne pèse — et ce n'est pas une panne", () => {
  // Référentiel indisponible: le comportement d'avant, à la lettre.
  assertEquals(
    gramsRawForIngredient(null, {
      term: "lentils",
      ref: null,
      refRefused: false,
      quantity: "300 g",
      amount: 300,
      unit: "g",
      state: "raw",
    }),
    null,
  );
});

// ---------------------------------------------------------------------------
// `regramMeal` — le plan entier
// ---------------------------------------------------------------------------

Deno.test("le plan REPESÉ récupère les grammes que le sas vient d'ouvrir", () => {
  const meal = {
    dishes: [dish([ing({ term: "lentils", quantity: "150 g", amount: 150, unit: "g", state: "raw" })])],
    preparations: [
      prep([
        ing({ term: "lentils", quantity: "300 g", amount: 300, unit: "g", state: "raw" }),
        ing({ term: "rice", quantity: "80 g", amount: 80, unit: "g", state: "raw", gramsRaw: 80 }),
      ]),
    ],
  };
  // AVANT: les lentilles ne pèsent rien, le riz pèse déjà.
  assertEquals(meal.dishes[0].ingredients[0].gramsRaw, null);

  const changed = regramMeal(meal, FILLED);

  // DEUX lignes de lentilles réparées — celle du plat ET celle de la
  // préparation. Le riz ne compte pas: il ne CHANGE pas.
  assertEquals(changed, 2);
  assertEquals(meal.dishes[0].ingredients[0].gramsRaw, 150);
  assertEquals(meal.preparations[0].ingredients[0].gramsRaw, 300);
  assertEquals(meal.preparations[0].ingredients[1].gramsRaw, 80);
});

Deno.test("⚠️ LE CAS QUI NE CHANGE RIEN — un index qui n'apporte rien ne touche aucun gramme", () => {
  // ⛔ SANS CE CAS, UNE REPESÉE QUI ÉCRASE TOUT À `null` PASSERAIT POUR UN
  // SUCCÈS. Le compteur doit dire zéro, et les grammes d'origine doivent
  // survivre intacts.
  const meal = {
    dishes: [dish([ing({ term: "rice", quantity: "80 g", amount: 80, unit: "g", state: "raw", gramsRaw: 80 })])],
    preparations: [],
  };
  assertEquals(regramMeal(meal, BASE), 0);
  assertEquals(meal.dishes[0].ingredients[0].gramsRaw, 80);
});

Deno.test("⛔ ELLE NE TOUCHE QUE LES GRAMMES — la déclaration du modèle survit", () => {
  // `amount`, `unit`, `state` et `quantitySource` sont la DÉCLARATION du
  // modèle. Les réécrire ferait diverger les compteurs d'obéissance à FF-038,
  // c'est-à-dire rendrait un modèle qui cesse d'écrire ses quantités
  // indiscernable d'une lecture réparée.
  const line = ing({
    term: "lentils",
    quantity: "250 g",
    amount: null,
    unit: null,
    state: "raw",
    quantitySource: "prose",
    part: null,
  });
  const meal = { dishes: [dish([line])], preparations: [] };
  regramMeal(meal, FILLED);
  assertEquals(line.gramsRaw, 250);
  assertEquals(line.amount, null);
  assertEquals(line.unit, null);
  assertEquals(line.state, "raw");
  assertEquals(line.quantitySource, "prose");
});

Deno.test("sans index, le plan n'est pas touché du tout", () => {
  const meal = {
    dishes: [dish([ing({ term: "rice", amount: 80, unit: "g", state: "raw", gramsRaw: 80 })])],
    preparations: [],
  };
  assertEquals(regramMeal(meal, null), 0);
  assertEquals(meal.dishes[0].ingredients[0].gramsRaw, 80);
});
