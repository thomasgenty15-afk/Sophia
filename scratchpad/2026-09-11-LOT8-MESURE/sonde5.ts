import { buildCompositionIndex, type CompositionRef } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { applySizing, drawsByPreparation, splitPlateWithComplement, standardPortionOf } from "../../supabase/functions/_shared/keel/portion_sizing.ts";

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
  ref({ slug: "oil", foodGroupRef: "olive_oil", energyKcal: 900 }),
], []);
const g = (term: string, amount: number) => ({ term, quantity: `${amount} g`, amount, unit: "g", state: "raw" }) as never;
const plan = () => ({
  dishes: [{ day: "mon", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [g("oil", 10)] }],
  preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 100)] }],
});
const mesure = (m: ReturnType<typeof plan>) =>
  standardPortionOf({ index: INDEX, dish: m.dishes[0], uses: m.dishes[0].uses, preparations: m.preparations, drawsByPrep: drawsByPreparation(m.dishes) });

for (const f of [1 / 3, 0.37, 0.91, 2.13]) {
  const out = applySizing({ meal: plan(), memberId: "m", rows: [{ dishIndex: 0, factor: f, sized: true }], index: INDEX });
  const apres = mesure({ dishes: out.dishes, preparations: out.preparations } as never);
  const items = out.dishes[0].boxes[0].items as { grams: number }[];
  const somme = items.reduce((a, i) => a + i.grams, 0);
  console.log(f.toFixed(4), "kcal", apres.kcal, "attendu", 440 * f, "masse", apres.cookedG, "boîte", somme, "entiers", items.every((i) => Number.isInteger(i.grams)));
}

const DILUE = { kcal: 450, cookedG: 500, densityPer100G: 90, pots: [], gaps: [] };
const entree = { kcal: 300, cookedG: 100, densityPer100G: 300, pots: [], gaps: [] };
let pire = 0, nuls = 0;
for (let t = 640; t <= 1400; t++) {
  const s = splitPlateWithComplement({ shared: DILUE, complement: entree, targetKcal: t / 1.7, bounds: { min: 250, max: 700 } as never, verdict: "over_max" });
  if (!s) { nuls++; continue; }
  pire = Math.max(pire, Math.abs(s.sharedG + s.complementG - 700));
}
console.log("complément: pire écart à la borne", pire, "nuls", nuls);
