import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";
import { parseFixedIntakes } from "./fixed_intakes.ts";
import { fixedIntakeSlotKcal } from "./slot_fixed_kcal.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "dairy_yogurt",
    label: over.slug,
    source: "ciqual",
    energyKcal: 60,
    proteinG: 4,
    carbsG: 5,
    fatG: 2,
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
    unitGrams: 125,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}
const INDEX = buildCompositionIndex([ref({ slug: "yoghurt" })], [{
  alias: "yaourt",
  slug: "yoghurt",
}]);

/** Le shaker de la fixture solo, forme exacte de `shakerIntakeJson`. */
const SHAKER = {
  food_ref: "declared_mon_shaker",
  label: "mon shaker",
  amount: 30,
  unit: "g",
  days: [] as string[],
  nutrition: "declared",
  serving_grams: 30,
  protein_g_per_serving: 24,
  energy_kcal_per_serving: 120,
  slot: "snack_pm",
  replaces_meal: false,
};

Deno.test("le shaker déclaré rend SES kcal, à SON moment", () => {
  const { intakes } = parseFixedIntakes([SHAKER]);
  assertEquals(intakes.length, 1);
  const r = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: "mon" });
  assertEquals(Math.round(r.bySlot.get("snack_pm") ?? 0), 120);
  assertEquals(r.bySlot.size, 1, "un seul moment touché");
  assertEquals(r.counts.declared, 1);
  assertEquals(r.counts.referential, 0);
  assertEquals(r.looseKcal, 0);
});

Deno.test("`days: []` VEUT DIRE TOUS LES JOURS — pas aucun", () => {
  const { intakes } = parseFixedIntakes([SHAKER]);
  for (const day of ["mon", "sat", null]) {
    const r = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: day });
    assertEquals(Math.round(r.bySlot.get("snack_pm") ?? 0), 120, `jour ${day}`);
    assertEquals(r.counts.off_day, 0);
  }
});

Deno.test("un apport qui n'a PAS lieu ce jour-là est compté, pas retranché", () => {
  const { intakes } = parseFixedIntakes([{ ...SHAKER, days: ["sat", "sun"] }]);
  const r = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: "mon" });
  assertEquals(r.bySlot.size, 0);
  assertEquals(r.counts.off_day, 1);
  // Et le samedi, il compte.
  const sat = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: "sat" });
  assertEquals(Math.round(sat.bySlot.get("snack_pm") ?? 0), 120);
});

Deno.test("⛔ JOUR INCONNU: seuls les apports de TOUS LES JOURS comptent", () => {
  // La direction de l'erreur est choisie: retrancher un apport qui n'a
  // peut-être pas lieu rognerait un vrai repas.
  const { intakes } = parseFixedIntakes([{ ...SHAKER, days: ["sat"] }]);
  const r = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: null });
  assertEquals(r.bySlot.size, 0);
  assertEquals(r.counts.off_day, 1);
});

Deno.test("⛔ UN APPORT SANS MOMENT N'EST JAMAIS RETRANCHÉ — mais il est CHIFFRÉ", () => {
  // Un yaourt à 16 h qui n'est pas « le goûter ». L'imputer d'office rognerait
  // un repas composé; l'ignorer en silence ferait disparaître 75 kcal.
  const { intakes } = parseFixedIntakes([{
    food_ref: "yaourt",
    label: "un yaourt",
    amount: 125,
    unit: "g",
    days: [],
  }]);
  assertEquals(intakes.length, 1);
  const r = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: "mon" });
  assertEquals(r.bySlot.size, 0, "rien n'est retranché");
  assertEquals(r.counts.loose, 1);
  assertEquals(Math.round(r.looseKcal), 75);
  assertEquals(r.counts.referential, 1, "il est résolu, juste pas plaçable");
});

Deno.test("un terme ILLISIBLE retranche ZÉRO, et se compte", () => {
  const { intakes } = parseFixedIntakes([{
    food_ref: "poudre_de_licorne",
    label: "licorne",
    amount: 30,
    unit: "g",
    days: [],
    slot: "snack_pm",
  }]);
  const r = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: "mon" });
  assertEquals(r.bySlot.size, 0);
  assertEquals(r.counts.unresolved, 1);
  // ⛔ Jamais une estimation: un apport dont on devinerait l'énergie rognerait
  // un vrai repas au profit d'un nombre inventé.
  assertEquals(r.looseKcal, 0);
});

Deno.test("deux apports au MÊME moment s'additionnent", () => {
  const { intakes } = parseFixedIntakes([
    SHAKER,
    { food_ref: "yaourt", label: "yaourt", amount: 125, unit: "g", days: [], slot: "snack_pm" },
  ]);
  assertEquals(intakes.length, 2);
  const r = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: "mon" });
  assertEquals(Math.round(r.bySlot.get("snack_pm") ?? 0), 195);
  assertEquals(r.counts.declared, 1);
  assertEquals(r.counts.referential, 1);
});

Deno.test("aucun apport ⇒ rien, et tous les compteurs sont là", () => {
  const r = fixedIntakeSlotKcal({ index: INDEX, intakes: [], dayToken: "mon" });
  assertEquals(r.bySlot.size, 0);
  assertEquals(r.looseKcal, 0);
  // ⛔ Les cinq clés existent même à zéro: « rien déclaré » et « comptage non
  // branché » doivent se distinguer dans un journal.
  assertEquals(r.counts, {
    declared: 0,
    referential: 0,
    unresolved: 0,
    loose: 0,
    off_day: 0,
  });
});

Deno.test("le module est PUR: même entrée, même sortie, entrée intacte", () => {
  const { intakes } = parseFixedIntakes([SHAKER]);
  const avant = JSON.stringify(intakes);
  const a = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: "mon" });
  const b = fixedIntakeSlotKcal({ index: INDEX, intakes, dayToken: "mon" });
  assertEquals([...a.bySlot.entries()], [...b.bySlot.entries()]);
  assertEquals(a.counts, b.counts);
  assertEquals(JSON.stringify(intakes), avant);
});
