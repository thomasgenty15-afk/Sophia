// Index MINIMAL, monté à la main avec les lignes réelles de la base locale,
// pour éprouver la RÉDUCTION — pas le contenu du référentiel.
import { buildCompositionIndex, resolveIngredient } from "../../supabase/functions/_shared/keel/food_composition.ts";
const ref = (slug: string, group: string, kcal: number) => ({
  slug, foodGroupRef: group, label: slug, source: "ciqual",
  energyKcal: kcal, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0,
  omega3Marine: false, ironSource: false, calciumSource: false, iodineSource: false,
  zincSource: false, b12Source: false, folateSource: false,
  yieldClass: "as_served", atwaterDiscount: 100, energyDense: false,
  unitGrams: null, condimentGrams: null,
  // deno-lint-ignore no-explicit-any
} as any);
const index = buildCompositionIndex(
  [ref("pate", "red_meat", 325), ref("white_pasta", "refined_grain", 351),
   ref("wholewheat_pasta", "whole_grain", 348), ref("pate_crust", "red_meat", 292)],
  [{ alias: "pates", slug: "white_pasta" },
   { alias: "pates completes", slug: "wholewheat_pasta" },
   { alias: "pates au ble complet", slug: "wholewheat_pasta" },
   { alias: "pate de campagne", slug: "pate" },
   { alias: "pate en croute", slug: "pate_crust" }],
);
for (const t of ["pâtes", "pâtes complètes", "pâte", "pâte brisée", "pâte feuilletée",
                 "pâte à tarte", "pâté", "pâté de campagne", "pâtes fraîches"]) {
  const r = resolveIngredient(index, t);
  console.log(`${t.padEnd(20)} → ${r === null ? "NON RÉSOLU" : `${String(r.slug).padEnd(18)} ${String(r.foodGroupRef).padEnd(14)} ${r.energyKcal} kcal`}`);
}
