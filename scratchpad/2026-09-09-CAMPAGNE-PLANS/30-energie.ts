/**
 * ── L'ÉNERGIE D'UN PLAN SOLO, MESURÉE AVEC LES MODULES DE PRODUCTION ──────
 * ⛔ LECTURE DE FICHIERS SEULE. `resolveIngredients`, `planEnergy` et
 * `foldPreparationsIntoDishes` sont IMPORTÉS, jamais recopiés: un instrument
 * recopié mesure l'instrument.
 *
 *   deno run --allow-read 30-energie.ts <ref_dir> <plan.json> <body.json>
 */
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  type CompositionIndex,
  type CompositionInput,
  COMPOSITION_UNITS,
  type CompositionState,
  type CompositionUnit,
  isFriedMethod,
  nutrientsOf,
  resolveIngredients,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import { foldPreparationsIntoDishes } from "../../supabase/functions/_shared/keel/meal_verdict.ts";
import {
  type EnergyDish,
  type EnergyPreparation,
  planEnergy,
} from "../../supabase/functions/_shared/keel/plan_energy.ts";

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
function readIngredient(raw: unknown): CompositionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  const term = String(i.term ?? "").trim();
  if (!term) return null;
  const amount = Number(i.amount);
  const unit = String(i.unit ?? "");
  const state = String(i.state ?? "");
  return {
    term,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    unit: (COMPOSITION_UNITS as readonly string[]).includes(unit) ? (unit as CompositionUnit) : null,
    state: (COMPOSITION_STATES as readonly string[]).includes(state)
      ? (state as CompositionState)
      : null,
    quantity: typeof i.quantity === "string" ? i.quantity : null,
  };
}
const readIngredients = (raw: unknown): CompositionInput[] =>
  Array.isArray(raw) ? raw.map(readIngredient).filter((x): x is CompositionInput => !!x) : [];

// deno-lint-ignore no-explicit-any
const plan = JSON.parse(Deno.readTextFileSync(planFile)) as any;
// deno-lint-ignore no-explicit-any
const body = JSON.parse(Deno.readTextFileSync(bodyFile)) as any;
// deno-lint-ignore no-explicit-any
const rawDishes: any[] = plan.dishes ?? [];
// deno-lint-ignore no-explicit-any
const rawPreps: any[] = plan.preparations ?? [];

const dishes: EnergyDish[] = rawDishes.map((d) => ({
  day: d.day ?? null,
  method: String(d.method ?? ""),
  ingredients: readIngredients(d.ingredients),
  // deno-lint-ignore no-explicit-any
  uses: (d.uses ?? []).map((u: any) => ({
    preparationId: String(u.preparation_id ?? ""),
    servings: Number(u.servings) || 1,
  })).filter((u: { preparationId: string }) => u.preparationId !== ""),
}));
const preps: EnergyPreparation[] = rawPreps.map((p) => ({
  id: String(p.id ?? ""),
  servingsMade: Math.max(1, Number(p.servings_made) || 1),
  ingredients: readIngredients(p.ingredients),
})).filter((p) => p.id !== "");

const index: CompositionIndex = await loadCompositionIndex(fileClient());
const pe = planEnergy({
  index,
  dishes,
  preparations: preps,
  servings: Number(body.servings ?? 1),
  addons: [],
  mealsOutByDay: new Map(),
});

// ── LA PROTÉINE PAR JOUR — après pliage, comme le verdict ────────────────
const folded = foldPreparationsIntoDishes({
  dishes: rawDishes.map((d) => ({
    slot: d.slot ?? null,
    method: String(d.method ?? ""),
    ingredients: readIngredients(d.ingredients),
    // deno-lint-ignore no-explicit-any
    uses: (d.uses ?? []).map((u: any) => ({
      preparationId: String(u.preparation_id ?? ""),
      servings: Number(u.servings) || 1,
    })).filter((u: { preparationId: string }) => u.preparationId !== ""),
  })),
  preparations: preps,
});
const proteinByDay = new Map<string, { g: number; complete: boolean }>();
const fibreByDay = new Map<string, number>();
folded.forEach((d, i) => {
  const day = String(rawDishes[i]?.day ?? "?");
  const r = resolveIngredients(index, [...d.ingredients]);
  const n = nutrientsOf(r.resolved, { friedMethod: isFriedMethod(d.method) });
  const g = n === "unknown" || n.proteinG === null ? 0 : n.proteinG;
  const fib = n === "unknown" || n.fiberG === null ? 0 : n.fiberG;
  const complete = n !== "unknown" && n.proteinG !== null &&
    r.unresolvedTerms.length === 0 && !r.unweighedEnergyDense;
  const cur = proteinByDay.get(day) ?? { g: 0, complete: true };
  proteinByDay.set(day, { g: cur.g + g, complete: cur.complete && complete });
  fibreByDay.set(day, (fibreByDay.get(day) ?? 0) + fib);
});

const allRes = resolveIngredients(index, folded.flatMap((d) => [...d.ingredients]));
console.log(JSON.stringify({
  case: body.case ?? null,
  window: plan.window ?? null,
  resolution: {
    resolved: allRes.resolved.length,
    unresolved_terms: allRes.unresolvedTerms,
    unweighed_terms: allRes.unweighedTerms,
    unweighed_energy_dense: allRes.unweighedEnergyDense,
  },
  days: pe.days.map((d) => ({
    day: d.day,
    kcal: d.kcal === null ? null : Math.round(d.kcal),
    complete: d.complete,
    counted: `${d.dishesCounted}/${d.dishesTotal}`,
    protein_g: proteinByDay.get(String(d.day))
      ? Math.round(proteinByDay.get(String(d.day))!.g)
      : null,
    protein_complete: proteinByDay.get(String(d.day))?.complete ?? null,
    fibre_g: fibreByDay.has(String(d.day)) ? Math.round(fibreByDay.get(String(d.day))!) : null,
  })),
  dish_kcal: pe.dishes.map((d, i) => ({
    day: rawDishes[i]?.day,
    slot: rawDishes[i]?.slot,
    name: rawDishes[i]?.name,
    kcal: d.kcal === null ? null : Math.round(d.kcal),
  })),
}, null, 1));
