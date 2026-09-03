/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'ANCRAGE, REJOUÉ SUR UN PLAN DÉJÀ RENDU — ⛔ AUCUN APPEL DE MODÈLE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read rejeu-ancrage.ts <ref_dir> <plan.json> <corps.json>
 *
 * ⛔ POURQUOI UN REJEU, ET PAS UN SECOND RUN RÉEL. Un niveau absolu n'est pas
 * reproductible d'une génération à l'autre — mesuré: la MÊME fixture S1 a rendu
 * 0,65–0,72 de sa bande le 2026-08-23 et `within` le 2026-08-24, sans qu'une
 * ligne de composition ait changé. Un AVANT et un APRÈS calculés sur les MÊMES
 * lignes dans la MÊME passe, eux, le sont.
 *
 * ⛔ LES MODULES SONT CEUX DE LA PRODUCTION, importés — jamais recopiés. Ce
 * fichier n'est qu'un appelant: il fait ce que `generate-meal-v1` fait entre la
 * boucle de correction et l'écriture, et rien d'autre.
 */
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  type CompositionIndex,
  COMPOSITION_UNITS,
  type CompositionState,
  type CompositionUnit,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import {
  foldPreparationsIntoDishes,
  verdictFor,
} from "../../supabase/functions/_shared/keel/meal_verdict.ts";
import { envelopeFor } from "../../supabase/functions/_shared/keel/meal_envelope.ts";
import {
  scaleFactorsFor,
  scaleIngredients,
  scaleShoppingList,
} from "../../supabase/functions/_shared/keel/portion_scaling.ts";
import {
  proteinFoodPredicate,
  scalingInputsFor,
} from "../../supabase/functions/_shared/keel/portion_scaling_inputs.ts";

const [refDir, planFile, bodyFile] = Deno.args;
const readNd = (f: string) =>
  Deno.readTextFileSync(f).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
function fileClient() {
  const cache = new Map<string, unknown[]>();
  const rowsOf = (t: string) => {
    if (!cache.has(t)) cache.set(t, readNd(`${refDir}/${t}.ndjson`));
    return cache.get(t)!;
  };
  return {
    from(table: string) {
      return {
        select(_c: string) {
          return {
            range(a: number, b: number) {
              return Promise.resolve({ data: rowsOf(table).slice(a, b + 1), error: null });
            },
          };
        },
      };
    },
  };
}

// deno-lint-ignore no-explicit-any
function readIng(raw: any) {
  const amount = Number(raw?.amount);
  const unit = String(raw?.unit ?? "");
  const state = String(raw?.state ?? "");
  return {
    term: String(raw?.term ?? ""),
    quantity: typeof raw?.quantity === "string" ? raw.quantity : null,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    unit: (COMPOSITION_UNITS as readonly string[]).includes(unit) ? (unit as CompositionUnit) : null,
    state: (COMPOSITION_STATES as readonly string[]).includes(state)
      ? (state as CompositionState)
      : null,
    gramsRaw: null as number | null,
  };
}

// deno-lint-ignore no-explicit-any
const plan = JSON.parse(Deno.readTextFileSync(planFile)) as any;
// deno-lint-ignore no-explicit-any
const body = JSON.parse(Deno.readTextFileSync(bodyFile)) as any;
const index: CompositionIndex = await loadCompositionIndex(fileClient());
const isProteinFood = proteinFoodPredicate(index);

// deno-lint-ignore no-explicit-any
const dishes = (plan.dishes ?? []).map((d: any) => ({
  day: d.day ?? null,
  slot: d.slot ?? null,
  method: String(d.method ?? ""),
  ingredients: (d.ingredients ?? []).map(readIng),
  // deno-lint-ignore no-explicit-any
  uses: (d.uses ?? []).map((u: any) => ({
    preparationId: String(u.preparation_id ?? ""),
    servings: Number(u.servings) || 1,
  })).filter((u: { preparationId: string }) => u.preparationId !== ""),
}));
// deno-lint-ignore no-explicit-any
const preps = (plan.preparations ?? []).map((p: any) => ({
  id: String(p.id ?? ""),
  servingsMade: Math.max(1, Number(p.servings_made) || 1),
  ingredients: (p.ingredients ?? []).map(readIng),
}));
// deno-lint-ignore no-explicit-any
let shopping = (plan.shopping_list ?? []).map((s: any) => ({
  term: String(s?.term ?? ""),
  quantity: s?.quantity === null || s?.quantity === undefined ? null : String(s.quantity),
}));

const envelope = envelopeFor(
  body.goal,
  {
    heightCm: body.heightCm ?? null,
    ageBand: body.ageBand ?? null,
    gender: body.gender ?? null,
    latestWeight: { value: body.weightKg, weekStart: null },
    declaredWeightKg: null,
    latestWaist: null,
    restrictionFlag: false,
    activityLevel: body.activityLevel ?? null,
    // deno-lint-ignore no-explicit-any
  } as any,
  body.ageBand ?? null,
  false,
  null,
  body.activityLevel ?? null,
  { day: null, sport: null, asked: false },
  null,
  null,
);
const days = Number(plan.window?.duration_days ?? 1);

// deno-lint-ignore no-explicit-any
const foldOf = (ds: any[]) =>
  foldPreparationsIntoDishes({
    // deno-lint-ignore no-explicit-any
    dishes: ds.map((d: any) => ({
      slot: d.slot,
      method: d.method,
      ingredients: d.ingredients,
      uses: d.uses,
    })),
    preparations: preps,
  });

// deno-lint-ignore no-explicit-any
const snapshot = (label: string, ds: any[]) => {
  const folded = foldOf(ds);
  const inputs = scalingInputsFor({ index, dishes: folded, isProteinFood });
  const v = verdictFor({
    dishes: folded,
    envelope,
    index,
    daysCovered: days,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  return {
    label,
    kcal_par_jour: Math.round(inputs.computedKcal / days),
    proteine_par_jour: Math.round(inputs.computedProteinG / days),
    verdict_energie: v.energy,
    verdict_proteine: v.protein,
  };
};

const avant = snapshot("AVANT", dishes);

const inputs = scalingInputsFor({ index, dishes: foldOf(dishes), isProteinFood });
const factors = inputs.unweighedDense ? null : scaleFactorsFor({
  computedKcal: inputs.computedKcal,
  computedProteinG: inputs.computedProteinG,
  proteinFoodKcal: inputs.proteinFoodKcal,
  otherScalableKcal: inputs.otherScalableKcal,
  proteinFoodProteinG: inputs.proteinFoodProteinG,
  envelope,
  daysCovered: days,
  resolvedShare: inputs.resolvedShare,
});

let apres = avant;
let shoppingChanged = 0;
let shoppingRefused: string[] = [];
if (factors) {
  // deno-lint-ignore no-explicit-any
  const d = scaleIngredients(dishes.flatMap((x: any) => x.ingredients), factors, isProteinFood);
  // deno-lint-ignore no-explicit-any
  const p = scaleIngredients(preps.flatMap((x: any) => x.ingredients), factors, isProteinFood);
  let di = 0;
  // deno-lint-ignore no-explicit-any
  for (const dish of dishes) dish.ingredients = dish.ingredients.map(() => d.items[di++]);
  let pi = 0;
  // deno-lint-ignore no-explicit-any
  for (const prep of preps) prep.ingredients = prep.ingredients.map(() => p.items[pi++]);
  const shop = scaleShoppingList(shopping, factors, isProteinFood);
  shopping = shop.items;
  shoppingChanged = shop.changed;
  shoppingRefused = shop.unrewritable;
  apres = snapshot("APRÈS", dishes);
}

console.log(JSON.stringify({
  plan: planFile.split("/").pop(),
  cible: envelope.mode === "per_kg" ? envelope.energy : null,
  plancher_proteine: envelope.mode === "per_kg" ? envelope.proteinFloorG : null,
  facteurs: factors
    ? {
      proteine: Number(factors.protein.toFixed(3)),
      autre: Number(factors.other.toFixed(3)),
    }
    : null,
  abstention: inputs.unweighedDense ? "unweighed_dense" : (factors ? null : "no_factor"),
  avant,
  apres,
  courses: { reecrites: shoppingChanged, non_reecrites: shoppingRefused.length },
}, null, 1));
