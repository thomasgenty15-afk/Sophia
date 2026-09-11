// Sonde 2 — contenants partagés, N = 1/2/4/12, conservation des tirages.
import { buildCompositionIndex, type CompositionRef } from "../../supabase/functions/_shared/keel/food_composition.ts";
import {
  applySizingForEaters,
  clampToBounds,
  drawsByPreparation,
  lidPlanFor,
  plateBoundsFor,
  potFactorAcross,
  sizeDishForEaters,
  sizeDishForMouth,
  standardPortionOf,
} from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { weighedReadyGrams } from "../../supabase/functions/_shared/keel/box_densify.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "refined_grain",
    label: over.slug,
    source: "ciqual",
    energyKcal: 350,
    proteinG: 8,
    carbsG: 75,
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
    atwaterDiscount: 1.0,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const INDEX = buildCompositionIndex([
  ref({ slug: "rice", yieldClass: "grain_absorbs", energyKcal: 350 }),
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0 }),
  ref({ slug: "oil", foodGroupRef: "olive_oil", energyKcal: 900 }),
  ref({ slug: "courgette", foodGroupRef: "non_starchy_veg", energyKcal: 20, yieldClass: "veg_shrinks" }),
], []);

const g = (term: string, amount: number, state: "raw" | "cooked" | null = "raw") => ({
  term,
  quantity: `${amount} g`,
  amount,
  unit: "g",
  state,
  // deno-lint-ignore no-explicit-any
}) as any;

const BORNES = plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: 700, light: false, appetite: null });
console.log("bornes 700 kcal", BORNES.min, BORNES.max);

// ── LE BAC DE QUATRE ─────────────────────────────────────────────────────
const repas = () => ({
  dishes: [{ day: "mon", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [] }],
  preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 100), g("water", 200)] }],
});
const mouths = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ dishIndex: 0, memberId: `m${i}`, factor: 1, sized: true }));

for (const n of [1, 2, 4, 12]) {
  const out = applySizingForEaters({ meal: repas(), rows: mouths(n), weighed: new Set(), index: INDEX });
  const boxes = out.dishes[0].boxes;
  const total = boxes.reduce(
    (a: number, b: { items: { grams: number }[] }) => a + b.items.reduce((x, i) => x + i.grams, 0),
    0,
  );
  console.log(`N=${n}`, JSON.stringify(boxes.map((b: { memberIds: string[]; items: { grams: number }[] }) => ({ ids: b.memberIds, g: b.items.map((i) => i.grams) }))), "total", total, "pot", JSON.stringify(out.preparations[0].ingredients.map((i: { amount: number }) => i.amount)));
}

// ── CONSERVATION: trois plats tirent la même casserole ───────────────────
const trois = {
  dishes: [
    { day: "mon", slot: "lunch", uses: [{ preparationId: "pot" }], ingredients: [] },
    { day: "tue", slot: "lunch", uses: [{ preparationId: "pot" }], ingredients: [] },
    { day: "wed", slot: "lunch", uses: [{ preparationId: "pot" }], ingredients: [] },
  ],
  preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 300)] }],
};
const outc = applySizingForEaters({
  meal: trois,
  rows: [0, 1, 2].map((i) => ({ dishIndex: i, memberId: "m", factor: 1, sized: true })),
  weighed: new Set(),
  index: INDEX,
});
console.log("conservation pot", JSON.stringify(outc.preparations[0].ingredients.map((i: { amount: number }) => i.amount)), "servings", outc.preparations[0].servingsMade);
console.log("boites", JSON.stringify(outc.dishes.map((d: { boxes: { items: { grams: number }[] }[] }) => d.boxes[0].items.map((i) => i.grams))));

// ── LE CLAMP, REMESURÉ ───────────────────────────────────────────────────
const soupe = standardPortionOf({
  index: INDEX,
  dish: { method: "mijoter", ingredients: [g("courgette", 300), g("water", 500)] },
  uses: [],
  preparations: [],
  drawsByPrep: new Map(),
});
console.log("soupe", soupe);
const sized = sizeDishForMouth({ standard: soupe, targetKcal: 700, bounds: BORNES });
console.log("sized soupe", sized);
const clamped = clampToBounds({ sized, standard: soupe, bounds: BORNES });
console.log("clamped soupe", clamped);
const dense = standardPortionOf({
  index: INDEX,
  dish: { method: "servir", ingredients: [g("oil", 100)] },
  uses: [],
  preparations: [],
  drawsByPrep: new Map(),
});
const sd = sizeDishForMouth({ standard: dense, targetKcal: 700, bounds: BORNES });
console.log("dense", dense, sd, clampToBounds({ sized: sd, standard: dense, bounds: BORNES }));
