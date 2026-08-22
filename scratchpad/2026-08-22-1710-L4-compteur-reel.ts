// L4 — LE COMPTEUR À DEUX POPULATIONS, sur les VRAIES lignes de la base.
//
// Reproduit MOT POUR MOT l'expression de `generate-meal-v1/index.ts`
// (après `augmentedIndexFor`), sur les 7 porteurs réels. Aucune génération,
// aucun appel modèle, aucune écriture.
import { augmentedIndexFor, parseFixedIntakes } from "../supabase/functions/_shared/keel/fixed_intakes.ts";
import { declaredIntakeGroupCounts } from "../supabase/functions/_shared/keel/declared_food_group.ts";
import { buildCompositionIndex, type CompositionRef } from "../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../supabase/functions/_shared/keel/tokens.ts";

const raw = JSON.parse(await Deno.readTextFile(new URL("./2026-08-22-1645-L4-refs.json", import.meta.url))) as Record<string, unknown>[];
const n = (v: unknown) => (v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const refs: CompositionRef[] = raw.map((r) => ({
  slug: String(r.slug), foodGroupRef: String(r.food_group_ref) as FoodGroupRef, label: String(r.label ?? r.slug),
  // deno-lint-ignore no-explicit-any
  source: String(r.source ?? "manual") as any, energyKcal: n(r.energy_kcal) ?? 0,
  proteinG: n(r.protein_g), carbsG: n(r.carbs_g), fatG: n(r.fat_g), fiberG: n(r.fiber_g),
  omega3Marine: r.omega3_marine === true, ironSource: r.iron_source === true, calciumSource: r.calcium_source === true,
  iodineSource: r.iodine_source === true, zincSource: r.zinc_source === true, b12Source: r.b12_source === true,
  folateSource: r.folate_source === true,
  // deno-lint-ignore no-explicit-any
  yieldClass: String(r.yield_class) as any, atwaterDiscount: n(r.atwater_discount) ?? 1,
  energyDense: r.energy_dense === true, unitGrams: n(r.unit_grams), condimentGrams: n(r.condiment_grams),
}));
const base = buildCompositionIndex(refs, []);

const porteurs = JSON.parse(await Deno.readTextFile(new URL("./2026-08-22-1710-L4-porteurs.json", import.meta.url))) as
  { user_id: string; fixed_intakes: unknown[] }[];

let totalDeclared = 0, totalDeclares = 0, totalReaches = 0, totalUngrouped = 0, enLeanProtein = 0;
for (const p of porteurs) {
  const fixedIntakesRaw = p.fixed_intakes;
  const fixedIntakes = parseFixedIntakes(fixedIntakesRaw).intakes;
  const composition = augmentedIndexFor(base, fixedIntakes);
  const counts = declaredIntakeGroupCounts(
    Array.isArray(fixedIntakesRaw) ? fixedIntakesRaw : [],
    fixedIntakes.filter((i) => i.nutrition === "declared")
      .map((i) => composition?.bySlug.get(i.foodRef)?.foodGroupRef),
  );
  for (const i of fixedIntakes) {
    if (i.nutrition !== "declared") continue;
    const g = composition.bySlug.get(i.foodRef)?.foodGroupRef as string | undefined;
    if (g === "lean_protein") enLeanProtein++;
  }
  totalDeclared += counts.declared; totalDeclares += counts.declaresGroup;
  totalReaches += counts.reachesIndex; totalUngrouped += counts.ungrouped;
  console.log(JSON.stringify({ tag: "keel.meal.declared_intake_groups", user_id: p.user_id, ...counts }));
}
console.log("");
console.log(`TOTAL sur les porteurs de student_goals — declared=${totalDeclared} declares_group=${totalDeclares} reaches_index=${totalReaches} ungrouped=${totalUngrouped}`);
console.log(`APPORTS DÉCLARÉS RANGÉS EN lean_protein: ${enLeanProtein} / ${totalDeclared}`);
