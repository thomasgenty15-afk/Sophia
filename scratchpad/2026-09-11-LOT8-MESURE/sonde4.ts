// Sonde 4 — conservation d'une casserole tirée par des plats à N différents.
import { buildCompositionIndex, type CompositionRef } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { applySizingForEaters, potFactorAcross, standardPortionOf, drawsByPreparation } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { weighedReadyGrams } from "../../supabase/functions/_shared/keel/box_densify.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "refined_grain", label: over.slug, source: "ciqual", energyKcal: 350,
    proteinG: 8, carbsG: 75, fatG: 1, fiberG: 2, omega3Marine: false, ironSource: false,
    calciumSource: false, iodineSource: false, zincSource: false, b12Source: false,
    folateSource: false, yieldClass: "neutral", yieldFactor: null, atwaterDiscount: 1.0,
    energyDense: false, unitGrams: null, condimentGrams: null, ...over,
  } as CompositionRef;
}
const INDEX = buildCompositionIndex([
  ref({ slug: "rice", yieldClass: "grain_absorbs", energyKcal: 350 }),
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0 }),
], []);
const g = (term: string, amount: number) => ({ term, quantity: `${amount} g`, amount, unit: "g", state: "raw" }) as never;

const meal = {
  dishes: [
    { day: "mon", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [] },
    { day: "tue", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [] },
  ],
  preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 400), g("water", 800)] }],
};
const rows = [
  { dishIndex: 0, memberId: "a", factor: 1, sized: true },
  { dishIndex: 1, memberId: "a", factor: 1, sized: true },
  { dishIndex: 1, memberId: "b", factor: 1, sized: true },
  { dishIndex: 1, memberId: "c", factor: 1, sized: true },
];
const out = applySizingForEaters({ meal, rows, weighed: new Set(), index: INDEX });
console.log("facteur attendu", potFactorAcross([[1], [1, 1, 1]]));
console.log("pot après", JSON.stringify(out.preparations[0].ingredients.map((i: { amount: number }) => i.amount)), out.preparations[0].servingsMade);
console.log("prêt après", weighedReadyGrams(out.preparations[0].ingredients, INDEX));
const tire = out.dishes.flatMap((d: { boxes: { memberIds: string[]; items: { grams: number }[] }[] }) => d.boxes).map((b) => ({ ids: b.memberIds, g: b.items.reduce((a, i) => a + i.grams, 0) }));
console.log("boîtes", JSON.stringify(tire), "somme", tire.reduce((a, b) => a + b.g, 0));
