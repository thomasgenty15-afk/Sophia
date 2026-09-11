/**
 * FF-038 — LE REJEU : la couverture de résolution sur les repas déjà générés.
 *
 * C'est LE chiffre du chantier. Sous 80 % de couverture MÉDIANE, la phase II
 * (boucle de correction, steering coach, foyer) ne démarre pas: corriger un
 * plan sur des ingrédients qui ne résolvent pas, ce serait le corriger sur du
 * bruit.
 *
 * Ce script ne touche à rien. Il lit trois extractions JSON produites par
 * `docker exec psql` (voir la commande dans le rapport de phase) et rend:
 *   - la couverture médiane et sa distribution,
 *   - la part de repas dont l'énergie serait calculable,
 *   - la WORKLIST d'alias: les termes non résolus, par fréquence.
 *
 *   deno run --allow-read replay_composition.ts <dir>
 */

import {
  buildCompositionIndex,
  type CompositionRef,
  looksEnergyDense,
  resolveIngredients,
  type YieldClass,
} from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/tokens.ts";

const dir = Deno.args[0] ?? ".";
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));

const refRows = read("refs.json") as Record<string, unknown>[];
const aliasRows = read("aliases.json") as { alias: string; slug: string }[];
const meals = read("meals.json") as Array<{
  id: string;
  prompt_version: string | null;
  dishes: Array<{
    title?: string;
    slot?: string | null;
    ingredients?: Array<{ term?: string }>;
    method?: string;
  }>;
  preparations: Array<{ ingredients?: Array<{ term?: string }> }>;
}>;

const refs: CompositionRef[] = refRows.map((r) => ({
  slug: String(r.slug),
  foodGroupRef: String(r.food_group_ref) as FoodGroupRef,
  label: String(r.label),
  energyKcal: Number(r.energy_kcal),
  proteinG: r.protein_g === null ? null : Number(r.protein_g),
  carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
  fatG: r.fat_g === null ? null : Number(r.fat_g),
  fiberG: r.fiber_g === null ? null : Number(r.fiber_g),
  omega3Marine: r.omega3_marine === true,
  ironSource: r.iron_source === true,
  calciumSource: r.calcium_source === true,
  iodineSource: r.iodine_source === true,
  zincSource: r.zinc_source === true,
  b12Source: r.b12_source === true,
  folateSource: r.folate_source === true,
  yieldClass: String(r.yield_class) as YieldClass,
  // ⟳ 2026-09-07 — le rendement par aliment. Un rejeu hors ligne relit la
  // colonne comme le loader: la poser à `null` en dur ferait rejouer un plan
  // avec le facteur de CLASSE pendant que la production utilise le sien.
  yieldFactor: r.yield_factor === null || r.yield_factor === undefined
    ? null
    : Number(r.yield_factor),
  atwaterDiscount: Number(r.atwater_discount),
  energyDense: r.energy_dense === true,
}));

const index = buildCompositionIndex(refs, aliasRows);

const perDish: number[] = [];
const perMeal: number[] = [];
const unresolved = new Map<string, number>();
let dishCount = 0;
let computable = 0;
let denseBlocked = 0;

for (const meal of meals) {
  const dishes = Array.isArray(meal.dishes) ? meal.dishes : [];
  const preps = Array.isArray(meal.preparations) ? meal.preparations : [];
  let mealResolved = 0;
  let mealTotal = 0;
  const lists = [
    ...dishes.map((d) => ({ ings: d.ingredients ?? [], dish: true })),
    ...preps.map((p) => ({ ings: p.ingredients ?? [], dish: false })),
  ];
  for (const { ings, dish } of lists) {
    const inputs = ings
      .map((i) => ({ term: String(i?.term ?? "").trim() }))
      .filter((i) => i.term);
    if (inputs.length === 0) continue;
    const r = resolveIngredients(index, inputs);
    for (const t of r.unresolvedTerms) unresolved.set(t, (unresolved.get(t) ?? 0) + 1);
    mealResolved += r.total - r.unresolvedTerms.length;
    mealTotal += r.total;
    if (dish) {
      dishCount++;
      perDish.push(r.coverage);
      // « L'énergie serait-elle calculable ? » — la règle d'abstention de
      // FF-039: 80 % des ingrédients résolus ET aucun inconnu de classe dense.
      if (r.coverage >= 0.8 && !r.unresolvedEnergyDense) computable++;
      else if (r.coverage >= 0.8 && r.unresolvedEnergyDense) denseBlocked++;
    }
  }
  if (mealTotal > 0) perMeal.push(mealResolved / mealTotal);
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

console.log("=== COUVERTURE DE RÉSOLUTION ===");
console.log(`repas rejoués            ${meals.length}`);
console.log(`plats rejoués            ${dishCount}`);
console.log(`médiane PAR REPAS        ${pct(median(perMeal))}   <- LA GATE (seuil 80 %)`);
console.log(`médiane PAR PLAT         ${pct(median(perDish))}`);
console.log(`p10 / p25 par repas      ${pct(quantile(perMeal, 0.1))} / ${pct(quantile(perMeal, 0.25))}`);
console.log(`p75 / p90 par repas      ${pct(quantile(perMeal, 0.75))} / ${pct(quantile(perMeal, 0.9))}`);
console.log(`repas sous 80 %          ${perMeal.filter((c) => c < 0.8).length} / ${perMeal.length}`);
console.log("");
console.log("=== CE QUE LE VERDICT POURRAIT CALCULER (règle FF-039 R6) ===");
console.log(`plats calculables        ${computable} / ${dishCount} (${pct(computable / dishCount)})`);
console.log(`plats bloqués par un DENSE non résolu  ${denseBlocked}`);
console.log("");

const worklist = [...unresolved.entries()].sort((a, b) => b[1] - a[1]);
console.log(`=== WORKLIST D'ALIAS — ${worklist.length} termes distincts non résolus ===`);
console.log(`occurrences totales      ${worklist.reduce((s, [, n]) => s + n, 0)}`);
for (const [term, n] of worklist.slice(0, 60)) {
  console.log(`  ${String(n).padStart(4)}  ${term}${looksEnergyDense(term) ? "   [DENSE]" : ""}`);
}
Deno.writeTextFileSync(
  `${dir}/worklist.json`,
  JSON.stringify(worklist.map(([term, n]) => ({ term, n, dense: looksEnergyDense(term) })), null, 2),
);
console.log(`\n(worklist complète -> ${dir}/worklist.json)`);
