/**
 * L19b — SONDE: ce qu'un terme atteint AUJOURD'HUI, avec le résolveur de
 * production. Aucun chiffre recopié: chaque ligne est rendue par le module.
 *
 *   deno run --allow-read 11-sonde-termes.ts <dir> <terme> [<terme> …]
 */
import {
  buildCompositionIndex, type CompositionRef, resolveIngredient, type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";
const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));
const refs: CompositionRef[] = (read("refs.json") as Record<string, any>[]).map((r) => ({
  slug: String(r.slug), foodGroupRef: String(r.food_group_ref) as FoodGroupRef, label: String(r.label),
  energyKcal: Number(r.energy_kcal),
  proteinG: r.protein_g === null ? null : Number(r.protein_g), carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
  fatG: r.fat_g === null ? null : Number(r.fat_g), fiberG: r.fiber_g === null ? null : Number(r.fiber_g),
  omega3Marine: !!r.omega3_marine, ironSource: !!r.iron_source, calciumSource: !!r.calcium_source,
  iodineSource: !!r.iodine_source, zincSource: !!r.zinc_source, b12Source: !!r.b12_source, folateSource: !!r.folate_source,
  yieldClass: String(r.yield_class) as YieldClass, atwaterDiscount: Number(r.atwater_discount), energyDense: !!r.energy_dense,
  unitGrams: r.unit_grams === null ? null : Number(r.unit_grams),
  condimentGrams: r.condiment_grams === null ? null : Number(r.condiment_grams),
}));
const index = buildCompositionIndex(refs, read("aliases.json"));
for (const t of Deno.args.slice(1)) {
  const got = resolveIngredient(index, t);
  console.log(
    `${t.padEnd(34)} → ${got ? got.slug.padEnd(24) : "∅ RIEN".padEnd(24)}` +
      (got ? ` | ${got.label} | ${got.foodGroupRef} | ${got.energyKcal} kcal | unit_grams=${got.unitGrams ?? "—"}` : ""),
  );
}
