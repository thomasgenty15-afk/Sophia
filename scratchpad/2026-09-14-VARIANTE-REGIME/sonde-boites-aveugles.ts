// SONDE — le partage PAR BOÎTE d'un plat PARTAGÉ, sous `portion_v1`.
// Question: quand le modèle obéit à « The one component that line refuses is
// served PER BOX », où le moteur met-il ce composant ?
import { applySizingForEaters } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "../../supabase/functions/_shared/keel/food_composition.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "refined_grain", label: over.slug, source: "ciqual",
    energyKcal: 350, proteinG: 8, carbsG: 75, fatG: 1, fiberG: 2,
    omega3Marine: false, ironSource: false, calciumSource: false,
    iodineSource: false, zincSource: false, b12Source: false, folateSource: false,
    yieldClass: "neutral", yieldFactor: null, atwaterDiscount: 1.0,
    energyDense: false, unitGrams: null, condimentGrams: null, ...over,
  } as CompositionRef;
}
const INDEX = buildCompositionIndex(
  [
    ref({ slug: "rice", yieldClass: "grain_absorbs" }),
    ref({ slug: "tofu", foodGroupRef: "tofu_tempeh" }),
    ref({ slug: "ham", foodGroupRef: "red_meat" }),
  ],
  [{ alias: "riz", slug: "rice" }, { alias: "tofu", slug: "tofu" }, {
    alias: "jambon",
    slug: "ham",
  }],
);

// Le plat PARTAGÉ tel que le modèle l'écrit quand il obéit au bloc de régime :
// la base végane dans `ingredients`, et le partage annoncé dans `boxes`.
const meal = {
  dishes: [{
    title: "Riz, tofu — et jambon pour qui n'est pas lié",
    day: "wed",
    slot: "dinner",
    method: "Cuire.",
    uses: [],
    ingredients: [
      { term: "riz", quantity: "80 g", amount: 80, unit: "g", state: "raw" },
      { term: "tofu", quantity: "120 g", amount: 120, unit: "g", state: "raw" },
      { term: "jambon", quantity: "100 g", amount: 100, unit: "g", state: "raw" },
    ],
    boxes: [
      { id: "b_lea", memberIds: ["m-lea"], items: [{ term: "tofu", grams: 120 }] },
      { id: "b_max", memberIds: ["m-max"], items: [{ term: "jambon", grams: 100 }] },
    ],
  }],
  preparations: [],
};

const out = applySizingForEaters({
  meal,
  rows: [
    { dishIndex: 0, memberId: "m-max", factor: 1, sized: true, recipeShare: null },
    { dishIndex: 0, memberId: "m-lea", factor: 1, sized: true, recipeShare: null },
  ],
  weighed: new Set(["m-max", "m-lea"]),
  index: INDEX,
});
for (const b of out.dishes[0].boxes) {
  console.log(
    b.memberIds.join(","),
    "→",
    b.items.map((i: { term: string; grams: number }) => `${i.term} ${i.grams} g`)
      .join(" · "),
  );
}
