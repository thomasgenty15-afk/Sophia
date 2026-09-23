import { assert, assertEquals } from "jsr:@std/assert@1";
import { readDishes, readEnergyBoxDishes, readEnergySideCourses } from "./plan_energy_read.ts";

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
  // ⟳ LOT 0 (2026-09-06) — la clé de casserole VOYAGE avec l'item : c'est elle
  // qui ouvre l'énergie par grammes tirés (`boxKcalByItems`). Le terme, lui,
  // reste dehors : l'énergie d'un item de boîte ne se résout jamais par son nom.
  assertEquals(dish.boxes[0].items, [{ grams: 350, preparationId: "prep_chicken" }]);
  assertEquals(dish.boxes[0].legacyTotalGrams, null);
  assertEquals(dish.boxes[1].memberIds, ["m-julie", "m-tom"]);
  // Un item écrit SANS la clé (archive d'avant v4) ne la reçoit pas en `null` :
  // `undefined` = pliage legacy, `null` = frais. Les deux ne se confondent pas.
  assertEquals(dish.boxes[1].items, [{ grams: 700 }]);
  assert(!("preparationId" in dish.boxes[1].items[0]));
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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-23 — LES À-CÔTÉS ET L'IDENTIFIANT DES ITEMS, chantier « assiettes
// normales », flux F. Un à-côté vit HORS des boîtes, dans
// `dishes[i].side_courses[]`; ce lecteur est le seul chemin du JSON vers son
// énergie (`served_final.ts`, `final_plan_audit.ts`, `meal-energy-v1`).
// ═══════════════════════════════════════════════════════════════════════════

const WITH_SIDES = [
  { day: "mon", slot: "breakfast", method: "", ingredients: [], uses: [], boxes: [] },
  {
    day: "mon",
    slot: "lunch",
    method: "",
    ingredients: [],
    uses: [],
    boxes: [{
      id: "box_mon_lunch_fabrice",
      member_ids: ["m-fabrice"],
      items: [{ grams: 300, preparation_id: "prep_main", term: "poulet", ref: " chicken_breast " }],
      legacy_total_grams: null,
    }],
    side_courses: [
      {
        member_id: "m-fabrice",
        kind: "dessert",
        term: " yaourt nature ",
        ref: " plain_yogurt ",
        grams: 125,
        unit_count: 1,
        preparation_id: null,
        source: "engine_fallback",
      },
      {
        member_id: "m-fabrice",
        kind: "starter",
        term: "soupe de légumes",
        ref: null,
        grams: 200,
        unit_count: null,
        preparation_id: "prep_soup",
        source: "model",
      },
      // Sans personne: jeté — un à-côté n'est servi qu'à quelqu'un.
      { member_id: "", kind: "cheese", term: "comté", ref: null, grams: 30 },
      // Un type hors vocabulaire et une masse illisible: GARDÉ, compté, jamais à zéro.
      { member_id: "m-fabrice", kind: "salad", term: "pomme", ref: "apple", grams: "?", source: "x" },
      null,
    ],
  },
];

Deno.test("⟳ 2026-09-23 — readEnergySideCourses lit les à-côtés dans l'ordre du payload", () => {
  const sides = readEnergySideCourses(WITH_SIDES);
  assertEquals(sides.length, 3, "l'entrée sans personne et le `null` sont jetés");
  assertEquals(sides[0], {
    dishIndex: 1,
    memberId: "m-fabrice",
    day: "mon",
    slot: "lunch",
    kind: "dessert",
    term: "yaourt nature",
    // ⛔ LE SLUG EST GARDÉ TEL QU'ÉCRIT (après trim), jamais reconstruit du mot.
    ref: "plain_yogurt",
    preparationId: null,
    grams: 125,
    unitCount: 1,
    source: "engine_fallback",
  });
  assertEquals([sides[1].ref, sides[1].preparationId, sides[1].kind], [null, "prep_soup", "starter"]);
  // LE CAS QUI MORD: un type inconnu n'efface pas la nourriture, une masse
  // illisible n'est pas un zéro.
  assertEquals([sides[2].kind, sides[2].grams, sides[2].source, sides[2].ref], [null, null, null, "apple"]);
});

Deno.test("⟳ 2026-09-23 — un plan sans `side_courses` n'a aucun à-côté", () => {
  assertEquals(readEnergySideCourses(STORED), []);
  assertEquals(readEnergySideCourses(null), []);
  assertEquals(readEnergySideCourses([{ day: "mon", side_courses: "x" }]), []);
});

Deno.test("⟳ 2026-09-23 — l'item de boîte garde son `ref` écrit, et seulement s'il est écrit", () => {
  const [, lunch] = readEnergyBoxDishes(WITH_SIDES);
  assertEquals(lunch.boxes[0].items, [{ grams: 300, preparationId: "prep_main", ref: "chicken_breast" }]);
  // LE CAS QUI PASSE: une archive sans `ref` se relit à l'octet près comme avant.
  const [dish] = readEnergyBoxDishes(STORED);
  assert(!("ref" in dish.boxes[0].items[0]));
});
