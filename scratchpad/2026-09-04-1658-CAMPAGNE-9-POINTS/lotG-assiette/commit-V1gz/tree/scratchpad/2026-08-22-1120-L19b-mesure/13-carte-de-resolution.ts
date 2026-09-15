/**
 * L19b — LA CARTE DE RÉSOLUTION, pour pouvoir DIFFÉRER deux états.
 *
 * Un lot qui touche le résolveur ET la table d'alias ne se juge pas sur les
 * termes qu'il visait: il se juge sur TOUT ce que le corpus écrit. Ce script
 * rend, pour chaque chaîne d'ingrédient réellement écrite par un modèle dans
 * les 182 plans, le slug qu'elle atteint — une ligne par chaîne, triée.
 *
 * Deux exécutions et un `diff` disent alors, sans interprétation:
 *   • ce qui a été GAGNÉ   (∅ → un slug),
 *   • ce qui a été PERDU   (un slug → ∅),
 *   • ce qui a été DÉPLACÉ (un slug → un autre) — la seule colonne dangereuse.
 *
 *   deno run --allow-read 13-carte-de-resolution.ts <dir>
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

type T = { raw: string; norm: string; source: string };
const rows = JSON.parse(Deno.readTextFileSync(`${dir}/terms.json`)) as T[];
const core = rows.filter((r) => r.source === "dish" || r.source === "preparation");

// UNE ligne par chaîne BRUTE distincte, avec son nombre d'occurrences: c'est la
// chaîne brute que le modèle écrit, pas sa forme normalisée, qui est l'entrée
// réelle du résolveur.
const byRaw = new Map<string, number>();
for (const r of core) byRaw.set(r.raw, (byRaw.get(r.raw) ?? 0) + 1);

const out: string[] = [];
let resolues = 0;
let occResolues = 0;
for (const raw of [...byRaw.keys()].sort()) {
  const got = resolveIngredient(index, raw);
  if (got) { resolues++; occResolues += byRaw.get(raw)!; }
  out.push(`${byRaw.get(raw)}\t${raw}\t${got ? got.slug : "∅"}`);
}
console.log(`# chaînes brutes distinctes : ${byRaw.size}`);
console.log(`# résolues (distinctes)     : ${resolues}`);
console.log(`# occurrences               : ${core.length}`);
console.log(`# occurrences résolues      : ${occResolues}`);
for (const l of out) console.log(l);
