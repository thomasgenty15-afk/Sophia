import { assertEquals } from "jsr:@std/assert@1";
import { readDishes, readEnergyBoxDishes } from "./plan_energy_read.ts";

// ⟳ LOT F (2026-09-04) — LE LECTEUR DES PLATS AVEC LEURS CONTENANTS.
//
// Il nourrit `boxEnergies` depuis le JSON STOCKÉ d'un plan (`student_generated_meals.dishes`),
// dont la forme est celle mesurée sur un plan réel: `boxes[].id`, `member_ids`,
// `items[].grams`, `legacy_total_grams`.

const STORED = [{
  day: "sat",
  slot: "lunch",
  method: "Réchauffer.",
  ingredients: [{ term: "poulet", amount: 400, unit: "g", state: "raw" }],
  uses: [{ preparation_id: "prep_chicken", servings: 2 }],
  boxes: [
    { id: "box_sat_lunch_marc", member_ids: ["m-marc"], items: [{ grams: 350, preparation_id: "prep_chicken", term: "poulet rôti" }], legacy_total_grams: null },
    { id: "box_sat_lunch_table", member_ids: ["m-julie", "m-tom"], items: [{ grams: 700 }], legacy_total_grams: null },
    { id: "", member_ids: ["m-x"], items: [], legacy_total_grams: null },
  ],
}];

Deno.test("LOT F — readEnergyBoxDishes lit les contenants tels que le plan les stocke", () => {
  const [dish] = readEnergyBoxDishes(STORED);
  assertEquals(dish.slot, "lunch");
  assertEquals(dish.boxes.length, 2, "un contenant sans id ne se lit pas");
  assertEquals(dish.boxes[0].id, "box_sat_lunch_marc");
  assertEquals(dish.boxes[0].memberIds, ["m-marc"]);
  assertEquals(dish.boxes[0].items, [{ grams: 350 }]);
  assertEquals(dish.boxes[0].legacyTotalGrams, null);
  assertEquals(dish.boxes[1].memberIds, ["m-julie", "m-tom"]);
});

Deno.test("⛔ LOT F — il S'APPUIE sur readDishes pour ce qu'ils ont en commun", () => {
  // Deux lectures de `uses` ou des ingrédients divergeraient au premier champ
  // ajouté; celle-ci ne réécrit rien de ce que l'autre sait déjà lire.
  const [common] = readDishes(STORED);
  const [withBoxes] = readEnergyBoxDishes(STORED);
  assertEquals(withBoxes.day, common.day);
  assertEquals(withBoxes.method, common.method);
  assertEquals(withBoxes.uses, common.uses);
  assertEquals(withBoxes.ingredients, common.ingredients);
});

Deno.test("LOT F — l'absence n'est pas un zéro: pas de boîtes, `[]`; pas de slot, `null`", () => {
  const [dish] = readEnergyBoxDishes([{ day: "mon", method: "", ingredients: [], uses: [] }]);
  assertEquals(dish.boxes, []);
  assertEquals(dish.slot, null);
  assertEquals(readEnergyBoxDishes(null), []);
  assertEquals(readEnergyBoxDishes("x"), []);
});
