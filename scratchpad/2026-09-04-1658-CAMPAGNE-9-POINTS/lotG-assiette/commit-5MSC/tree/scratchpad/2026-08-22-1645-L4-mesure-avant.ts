// L4 — MESURE AVANT. Ce que `foodGroupRef: "lean_protein"` en dur coûte,
// chiffré sur le référentiel réel de la base locale et sur les 7 apports
// DÉCLARÉS qui existent en base le 2026-08-22.
//
// Le dump du référentiel N'EST PAS COMMITÉ (410 Ko d'une table). Le refaire:
//
//   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -A -t \
//     -c "select json_agg(t) from (select slug, food_group_ref, label, source,
//         energy_kcal, protein_g, carbs_g, fat_g, fiber_g, omega3_marine,
//         iron_source, calcium_source, iodine_source, zinc_source, b12_source,
//         folate_source, yield_class, atwater_discount, energy_dense,
//         unit_grams, condiment_grams from food_composition_refs) t;" \
//     > scratchpad/2026-08-22-1645-L4-refs.json
//
// Lancer: deno run -A scratchpad/2026-08-22-1645-L4-mesure-avant.ts
//
// Aucune écriture. Lecture d'un dump JSON du référentiel + constantes.

import {
  buildCompositionIndex,
  type CompositionRef,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import type { CompositionIndex } from "../supabase/functions/_shared/keel/food_composition.ts";
import { groupBandsFrom } from "../supabase/functions/_shared/keel/composition_fill.ts";
import { sentinelCarriersOf } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import {
  augmentedIndexFor,
  type FixedIntake,
} from "../supabase/functions/_shared/keel/fixed_intakes.ts";
import type { FoodGroupRef } from "../supabase/functions/_shared/keel/tokens.ts";

const raw = JSON.parse(
  await Deno.readTextFile(
    new URL("./2026-08-22-1645-L4-refs.json", import.meta.url),
  ),
) as Record<string, unknown>[];

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const refs: CompositionRef[] = raw.map((r) => ({
  slug: String(r.slug),
  foodGroupRef: String(r.food_group_ref) as FoodGroupRef,
  label: String(r.label ?? r.slug),
  // deno-lint-ignore no-explicit-any
  source: String(r.source ?? "manual") as any,
  energyKcal: num(r.energy_kcal) ?? 0,
  proteinG: num(r.protein_g),
  carbsG: num(r.carbs_g),
  fatG: num(r.fat_g),
  fiberG: num(r.fiber_g),
  omega3Marine: r.omega3_marine === true,
  ironSource: r.iron_source === true,
  calciumSource: r.calcium_source === true,
  iodineSource: r.iodine_source === true,
  zincSource: r.zinc_source === true,
  b12Source: r.b12_source === true,
  folateSource: r.folate_source === true,
  // deno-lint-ignore no-explicit-any
  yieldClass: String(r.yield_class) as any,
  atwaterDiscount: num(r.atwater_discount) ?? 1.0,
  energyDense: r.energy_dense === true,
  unitGrams: num(r.unit_grams),
  condimentGrams: num(r.condiment_grams),
}));

const base: CompositionIndex = buildCompositionIndex(refs, []);

// LES SEPT APPORTS DÉCLARÉS RÉELLEMENT EN BASE le 2026-08-22 (requête D).
const declared: FixedIntake[] = [
  ["declared_shaker_du_soir", "shaker du soir", 30, 24, 120],
  ["declared_vanilla_whey_shake", "Vanilla whey shake", 31, 24, 118],
  ["declared_barleycup_malt_drink", "Barleycup malt drink", 44, 7, 152],
  ["declared_whey_shaker_after_training", "whey shaker after training", 30, 24, 120],
  ["declared_zorbax_morning_shake", "Zorbax morning shake", 47, 29, 187],
  ["declared_the_evening_tub", "the evening tub", 32, 24, 128],
].map(([slug, label, g, p, k]) => ({
  foodRef: String(slug),
  label: String(label),
  amount: Number(g),
  unit: "g" as const,
  days: [],
  nutrition: "declared" as const,
  servingGrams: Number(g),
  proteinGPerServing: Number(p),
  energyKcalPerServing: Number(k),
  placement: "loose" as const,
}));

// Le cas du lot: une Danette (dessert lacté du commerce), déclarée.
const danette: FixedIntake = {
  foodRef: "declared_danette_chocolat",
  label: "ma Danette",
  amount: 125,
  unit: "g",
  days: [],
  nutrition: "declared",
  servingGrams: 125,
  proteinGPerServing: 4,
  energyKcalPerServing: 150,
  placement: "loose",
};

function band(idx: CompositionIndex, g: string) {
  return groupBandsFrom(idx).get(g as FoodGroupRef);
}

function show(title: string, idx: CompositionIndex) {
  const b = band(idx, "lean_protein");
  const carriers = sentinelCarriersOf(idx);
  const flags: string[] = [];
  for (const [flag, set] of carriers) {
    if (set.has("lean_protein" as FoodGroupRef)) flags.push(flag);
  }
  console.log(`--- ${title}`);
  console.log(
    `    lean_protein: refs=${b?.refs} energy=[${b?.energyLow.toFixed(1)}, ${
      b?.energyHigh.toFixed(1)
    }] kcal/100g  protein=[${b?.proteinLow?.toFixed(1)}, ${
      b?.proteinHigh?.toFixed(1)
    }] g/100g`,
  );
  console.log(`    lean_protein sentinelle de: ${flags.join(", ") || "(aucune)"}`);
  return b;
}

console.log(`référentiel: ${refs.length} lignes`);
const b0 = show("① index de BASE (aucun apport fixe)", base);
const b1 = show("② + les 6 apports DÉCLARÉS de la base (whey/malt)", augmentedIndexFor(base, declared));
const b2 = show("③ + les 6 + UNE Danette déclarée", augmentedIndexFor(base, [...declared, danette]));

console.log("");
console.log("⛔ LE CAS RÉEL D'UNE GÉNÉRATION — chaque porteur n'a QU'UN apport:");
const b3 = show(
  "④ + UN SEUL whey (Zorbax, 398 kcal/100g) — le cas de 6 porteurs sur 7",
  augmentedIndexFor(base, [declared[4]]),
);
const b4 = show("⑤ + UNE SEULE Danette", augmentedIndexFor(base, [danette]));
const b5 = show(
  "⑥ + UN SEUL Barleycup (le NON-protéique DÉJÀ en base)",
  augmentedIndexFor(base, [declared[2]]),
);

// LE COÛT EN ÉNERGIE: ce qu'un terme INCONNU déclaré `lean_protein` a le droit
// de peser, avant / après. C'est très exactement la borne de `plan_energy.ts`.
const GRAMS = 150;
function bounded(b: { energyLow: number; energyHigh: number } | undefined) {
  if (!b) return "inbornable";
  return `haut=${((GRAMS * b.energyHigh) / 100).toFixed(0)} kcal · mid=${
    ((GRAMS * (b.energyLow + b.energyHigh)) / 200).toFixed(0)
  } kcal`;
}
console.log("");
console.log(`LA BORNE D'UN TERME INCONNU DÉCLARÉ lean_protein, à ${GRAMS} g:`);
console.log(`  base .................. ${bounded(b0)}`);
console.log(`  + 6 déclarés .......... ${bounded(b1)}`);
console.log(`  + 6 déclarés + Danette  ${bounded(b2)}`);
console.log(`  + 1 whey (cas réel) ... ${bounded(b3)}`);
console.log(`  + 1 Danette (cas réel)  ${bounded(b4)}`);
console.log(`  + 1 Barleycup (en base) ${bounded(b5)}`);

// LE VERDICT PROTÉIQUE: ce que la Danette apporte au compteur `lean_protein`.
console.log("");
console.log("CE QUE LA DANETTE DÉCLARE, RAMENÉ À 100 g:");
console.log(
  `  protéines ${(danette.proteinGPerServing * 100 / danette.servingGrams).toFixed(1)} g/100g · énergie ${
    (danette.energyKcalPerServing * 100 / danette.servingGrams).toFixed(0)
  } kcal/100g · part protéique de l'énergie ${
    ((danette.proteinGPerServing * 4 / danette.energyKcalPerServing) * 100).toFixed(1)
  } %`,
);
const malt = declared.find((d) => d.foodRef.includes("barleycup"))!;
console.log(
  `  Barleycup (DÉJÀ EN BASE): protéines ${
    (malt.proteinGPerServing * 100 / malt.servingGrams).toFixed(1)
  } g/100g · part protéique ${
    ((malt.proteinGPerServing * 4 / malt.energyKcalPerServing) * 100).toFixed(1)
  } %`,
);

// Les groupes du vocabulaire fermé qui ont une bande, pour situer.
console.log("");
console.log("POUR SITUER — bandes d'énergie de quelques groupes (index de base):");
for (const g of ["lean_protein", "dairy", "sweetened_drink", "ultra_processed", "nuts_seeds", "poultry"]) {
  const b = band(base, g);
  console.log(
    `  ${g.padEnd(18)} ${
      b ? `refs=${String(b.refs).padStart(3)} [${b.energyLow.toFixed(0)}, ${b.energyHigh.toFixed(0)}]` : "(pas de bande)"
    }`,
  );
}
