import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  type AccidentPlan,
  cascadeSkippedWave,
  parseAccidentPlan,
} from "./accident.ts";
import { planGroceryWaves } from "./grocery_waves.ts";

/**
 * FF-061 — LA CASCADE D'UNE VAGUE DE COURSES RATÉE.
 *
 * ══ LES DEUX DÉFAUTS QUE CES ÉPREUVES FERMENT ════════════════════════════
 *
 * 1. **`servesCookOn` ne nomme qu'UNE cuisson.** Une vague est un paquet
 *    d'articles qui tombent le même jour d'achat, et deux d'entre eux peuvent
 *    servir deux cuissons différentes. Un décalage fondé sur `servesCookOn`
 *    laissait la seconde sans ingrédients, sans qu'une erreur ne se lève.
 *
 * 2. **La première vague ne servait JAMAIS rien.** `serves` n'était posé que si
 *    `buyOn > startsOn`, donc toute vague datée du premier jour du plan portait
 *    `null` — et `shiftProposalAfterShoppingLater` rendait `null` dans ce cas.
 *    Rater la grosse course de début de plan, le cas le plus fréquent de tous,
 *    ne proposait rien du tout.
 *
 * Et une propriété qui vient de la jumelle et qu'on vérifie ici parce que
 * l'UNION pouvait la perdre: **une coche vivante gagne toujours**.
 */

const MEAL = "33333333-3333-4333-8333-333333333333";
const STARTS_ON = "2026-03-09"; // lundi

function dish(
  title: string,
  day: string,
  prepIds: string[],
): Record<string, unknown> {
  return {
    title,
    slot: "dinner",
    day,
    method: `Cook ${title}.`,
    ingredients: [{ term: "filler", amount: 100, unit: "g" }],
    uses: prepIds.map((id) => ({ preparation_id: id, servings: 1 })),
  };
}

function prep(
  id: string,
  cookOn: string,
  terms: string[],
): Record<string, unknown> {
  return {
    id,
    title: `Prep ${id}`,
    cook_on: cookOn,
    servings_made: 3,
    method: "Roast.",
    active_minutes: 10,
    total_minutes: 50,
    ingredients: terms.map((t) => ({ term: t, amount: 600, unit: "g" })),
  };
}

/**
 * Un plan à DEUX sessions — lundi et jeudi — servies par des courses.
 *
 * `prep_a` (lundi) nourrit les dîners de lundi et mardi.
 * `prep_b` (jeudi) nourrit les dîners de jeudi et vendredi.
 * Le dîner de mercredi ne consomme AUCUNE préparation: il ne tombe jamais.
 */
function planRow(): Record<string, unknown> {
  return {
    starts_on: STARTS_ON,
    duration_days: 7,
    dishes: [
      dish("Lundi", "mon", ["prep_a"]), // 0
      dish("Mardi", "tue", ["prep_a"]), // 1
      dish("Mercredi", "wed", []), // 2 — sans préparation
      dish("Jeudi", "thu", ["prep_b"]), // 3
      dish("Vendredi", "fri", ["prep_b"]), // 4
    ],
    preparations: [
      prep("prep_a", "mon", ["chicken thighs"]),
      prep("prep_b", "thu", ["white beans"]),
    ],
    cooking_sessions: [
      { day: "mon", preparation_ids: ["prep_a"], run_through: "Oven on." },
      { day: "thu", preparation_ids: ["prep_b"], run_through: "Simmer." },
    ],
    shopping_list: [
      { term: "chicken thighs", aisle: "protein", quantity: "600 g" },
      { term: "white beans", aisle: "protein", quantity: "400 g" },
      { term: "rice", aisle: "grain", quantity: "500 g" },
    ],
  };
}

function planOf(): AccidentPlan {
  const parsed = parseAccidentPlan(MEAL, planRow());
  if (!parsed) throw new Error("fixture did not parse");
  return parsed;
}

// ---------------------------------------------------------------------------
// LE DÉFAUT N°2 — la première vague
// ---------------------------------------------------------------------------

Deno.test("🔴 la vague du PREMIER JOUR sert des cuissons, et le dit enfin", () => {
  const row = planRow();
  const waves = planGroceryWaves({
    startsOn: STARTS_ON,
    durationDays: 7,
    shoppingList: row.shopping_list as never[],
    preparations: [
      { id: "prep_a", cookOn: "mon", ingredientTerms: ["chicken thighs"] },
      { id: "prep_b", cookOn: "thu", ingredientTerms: ["white beans"] },
    ],
  });

  const first = waves.find((w) => w.buyOn === STARTS_ON);
  assert(first, "une vague tombe bien le premier jour du plan");
  // LE DÉFAUT, dans sa forme exacte: la phrase se tait…
  assertEquals(
    first.servesCookOn,
    null,
    "`servesCookOn` reste nul sur la première vague — c'est sa définition",
  );
  // …et la décision, elle, sait.
  assert(
    first.servesCookDates.length > 0,
    "`servesCookDates` DOIT porter la cuisson que cette vague sert: sans lui, " +
      "rater la grosse course de début de plan ne propose rien du tout",
  );
});

// ---------------------------------------------------------------------------
// LE DÉFAUT N°1 — deux cuissons dans une vague
// ---------------------------------------------------------------------------

Deno.test("une vague qui sert DEUX cuissons les invalide toutes les deux", () => {
  const cascade = cascadeSkippedWave({
    plan: planOf(),
    cookDates: ["2026-03-09", "2026-03-12"], // lundi ET jeudi
    tickedDishIndexes: [],
  });
  assertEquals(cascade.cookDates, ["2026-03-09", "2026-03-12"]);
  assertEquals(
    cascade.invalidatedDishIndexes,
    [0, 1, 3, 4],
    "les quatre plats qui descendent des deux cuissons",
  );
  assert(
    !cascade.invalidatedDishIndexes.includes(2),
    "le dîner de mercredi ne consomme AUCUNE préparation: il a bel et bien eu " +
      "lieu, et l'éteindre effacerait du réel",
  );
});

Deno.test("une seule cuisson servie n'emporte que ce qui en descend", () => {
  const cascade = cascadeSkippedWave({
    plan: planOf(),
    cookDates: ["2026-03-12"], // jeudi seul
    tickedDishIndexes: [],
  });
  assertEquals(cascade.invalidatedDishIndexes, [3, 4]);
});

// ---------------------------------------------------------------------------
// CE QUE L'UNION AURAIT PU PERDRE
// ---------------------------------------------------------------------------

Deno.test("⛔ UNE COCHE VIVANTE GAGNE, même quand deux cuissons se contredisent", () => {
  // Le plat 1 (mardi) descend de `prep_a`. S'il est coché, la préparation
  // existait — donc c'est la déclaration de courses qui est partiellement
  // fausse, et c'est le FAIT qui gagne.
  const cascade = cascadeSkippedWave({
    plan: planOf(),
    cookDates: ["2026-03-09", "2026-03-12"],
    tickedDishIndexes: [1],
  });
  assert(
    !cascade.invalidatedDishIndexes.includes(1),
    "un repas mangé ne s'efface pas parce qu'on a dit ne pas avoir fait les courses",
  );
  assertEquals(cascade.survivingTickedIndexes, [1]);
  assertEquals(cascade.invalidatedDishIndexes, [0, 3, 4]);
});

Deno.test("un plat mangé AVANT sa cuisson ne tombe jamais", () => {
  // `prep_b` cuit le jeudi; le dîner du lundi ne peut pas en dépendre. La
  // jumelle le classe déjà ainsi, et l'union ne doit pas le reclasser.
  const cascade = cascadeSkippedWave({
    plan: planOf(),
    cookDates: ["2026-03-12"],
    tickedDishIndexes: [],
  });
  assert(!cascade.invalidatedDishIndexes.includes(0));
  assert(!cascade.invalidatedDishIndexes.includes(1));
});

Deno.test("aucune cuisson servie ⇒ rien ne tombe", () => {
  // Une vague d'épicerie seule. « Rien ne dépend de cette vague » est une
  // réponse, pas une absence de réponse.
  const cascade = cascadeSkippedWave({
    plan: planOf(),
    cookDates: [],
    tickedDishIndexes: [],
  });
  assertEquals(cascade.cookDates, []);
  assertEquals(cascade.invalidatedDishIndexes, []);
});

Deno.test("une date répétée ne double rien et ne coûte qu'un parcours", () => {
  const once = cascadeSkippedWave({
    plan: planOf(),
    cookDates: ["2026-03-09"],
    tickedDishIndexes: [],
  });
  const twice = cascadeSkippedWave({
    plan: planOf(),
    cookDates: ["2026-03-09", "2026-03-09"],
    tickedDishIndexes: [],
  });
  assertEquals(twice.invalidatedDishIndexes, once.invalidatedDishIndexes);
  assertEquals(twice.cookDates, ["2026-03-09"]);
});

Deno.test("une date sans session ne casse rien", () => {
  // Le mercredi ne porte aucune session. La jumelle rend une cascade vide, et
  // l'union doit l'absorber sans lever.
  const cascade = cascadeSkippedWave({
    plan: planOf(),
    cookDates: ["2026-03-11", "2026-03-09"],
    tickedDishIndexes: [],
  });
  assertEquals(cascade.invalidatedDishIndexes, [0, 1]);
});
