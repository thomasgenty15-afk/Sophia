// Sonde jetable — confirme à la main les nombres du banc « Mesure/service ».
import { buildCompositionIndex, type CompositionRef } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { standardPortionOf, drawsByPreparation, applySizing, applySizingForEaters, sizeDishForMouth, clampToBounds, plateBoundsFor, lidPlanFor } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
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
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0, yieldClass: "neutral" }),
  ref({ slug: "oil", foodGroupRef: "olive_oil", energyKcal: 900, yieldClass: "neutral" }),
  ref({ slug: "courgette", foodGroupRef: "non_starchy_veg", energyKcal: 20, yieldClass: "veg_shrinks" }),
  ref({ slug: "chicken", foodGroupRef: "poultry", energyKcal: 165, yieldClass: "meat_shrinks" }),
], []);

const g = (term: string, amount: number, state: "raw" | "cooked" | null = "raw") => ({
  term,
  quantity: `${amount} g`,
  amount,
  unit: "g",
  state,
  // deno-lint-ignore no-explicit-any
}) as any;

const sp = (ings: unknown[], uses: unknown[] = [], preps: unknown[] = [], draws = new Map<string, number>()) =>
  standardPortionOf({
    index: INDEX,
    // deno-lint-ignore no-explicit-any
    dish: { method: "bouillir", ingredients: ings as any },
    // deno-lint-ignore no-explicit-any
    uses: uses as any,
    // deno-lint-ignore no-explicit-any
    preparations: preps as any,
    drawsByPrep: draws,
  });

console.log("riz cru 100", sp([g("rice", 100)]));
console.log("riz cuit 260", sp([g("rice", 260, "cooked")]));
console.log("riz sans etat", sp([g("rice", 260, null)]));
console.log("riz + eau", sp([g("rice", 100), g("water", 200)]));
console.log("soupe courgette+eau", sp([g("courgette", 300), g("water", 500)]));
console.log("huile 100", sp([g("oil", 100)]));
console.log("poulet 100 cru", sp([g("chicken", 100)]));
console.log("weighed rice+water", weighedReadyGrams([g("rice", 100), g("water", 200)], INDEX));

// tirages
const dishes3 = [
  { uses: [{ preparationId: "pot" }] },
  { uses: [{ preparationId: "pot" }] },
  { uses: [{ preparationId: "pot" }] },
];
const draws3 = drawsByPreparation(dishes3);
console.log("draws3", [...draws3]);
console.log("part sur 3 tirages", sp([], [{ preparationId: "pot" }], [{ id: "pot", ingredients: [g("rice", 300), g("water", 600)] }], draws3));

// même pot tiré deux fois par LE MÊME plat
const dishesTwice = [{ uses: [{ preparationId: "pot" }, { preparationId: "pot" }] }];
const drawsTwice = drawsByPreparation(dishesTwice);
console.log("drawsTwice", [...drawsTwice]);
console.log("part tirée deux fois", sp([], [{ preparationId: "pot" }, { preparationId: "pot" }], [{ id: "pot", ingredients: [g("rice", 300)] }], drawsTwice));

// apply — arrondi à zéro sur le frais
const meal = {
  dishes: [{ day: "mon", slot: "dinner", uses: [{ preparationId: "pot" }], ingredients: [g("oil", 1)] }],
  preparations: [{ id: "pot", servingsMade: 1, ingredients: [g("rice", 100)] }],
};
const out = applySizing({ meal, memberId: "m", rows: [{ dishIndex: 0, factor: 0.2, sized: true }], index: INDEX });
console.log("apply f=0.2", JSON.stringify(out.dishes[0].boxes), JSON.stringify(out.counts));

const out1 = applySizing({ meal, memberId: "m", rows: [{ dishIndex: 0, factor: 1, sized: true }], index: INDEX });
console.log("apply f=1", JSON.stringify(out1.dishes[0].boxes));

// bornes
console.log("bounds adulte dinner 800", plateBoundsFor({ ageYears: 35, slot: "dinner", slotTargetKcal: 800, light: false, appetite: null }));
