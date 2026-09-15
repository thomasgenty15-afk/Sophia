/**
 * ── L'ANALYSEUR D'UN PLAN D'ÉVALUATION — 2026-08-23 ────────────────────────
 * ⛔ IL NE LIT QUE DES FICHIERS. Aucune écriture, aucun appel de modèle.
 * Le résolveur, l'enveloppe et le verdict sont ceux de la PRODUCTION, importés
 * depuis `supabase/functions/_shared/keel/` — jamais recopiés.
 *
 *   deno run --allow-read analyse.ts <ref_dir> <plan.json> <corps.json>
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
import {
  foldPreparationsIntoDishes,
  verdictFor,
} from "../../supabase/functions/_shared/keel/meal_verdict.ts";
import {
  type EnergyDish,
  type EnergyPreparation,
  planEnergy,
} from "../../supabase/functions/_shared/keel/plan_energy.ts";
import { envelopeFor } from "../../supabase/functions/_shared/keel/meal_envelope.ts";
import { maintenanceRange } from "../../supabase/functions/_shared/keel/energy_target.ts";
import { uncoverableSentinelsFor } from "../../supabase/functions/_shared/keel/dietary_regime.ts";

const [refDir, planFile, bodyFile] = Deno.args;

function readNdjson(file: string): Record<string, unknown>[] {
  return Deno.readTextFileSync(file).split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
function fileClient() {
  const cache = new Map<string, Record<string, unknown>[]>();
  const rowsOf = (t: string) => {
    const hit = cache.get(t);
    if (hit) return hit;
    const rows = readNdjson(`${refDir}/${t}.ndjson`);
    cache.set(t, rows);
    return rows;
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

// ⚠️ RECOPIÉ de `meal-energy-v1/index.ts` comme le fait `keel_v0e_resolveur`.
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
    state: (COMPOSITION_STATES as readonly string[]).includes(state) ? (state as CompositionState) : null,
    // ⟳ LOT `L-1-b` — la copie EN PROSE, transmise comme le fait
    // `meal-energy-v1/index.ts:216`. Sans elle, « 150 g de lentilles » écrit
    // en clair mais non structuré serait compté « sans quantité ».
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

// ── ① L'ÉNERGIE PAR JOUR, sur les quantités du plan ──────────────────────
const pe = planEnergy({
  index,
  dishes,
  preparations: preps,
  servings: Number(body.servings ?? 1),
  addons: [],
  mealsOutByDay: new Map(),
});

// ── ② L'ENVELOPPE — ce que le produit vise pour CE corps et CET objectif ──
const env = envelopeFor(
  body.goal,
  {
    heightCm: body.heightCm ?? null,
    ageBand: body.ageBand ?? null,
    gender: body.gender ?? null,
    latestWeight: body.weightKg ? { value: body.weightKg, weekStart: body.weekStart ?? null } : null,
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
const maint = maintenanceRange({
  weightKg: body.weightKg ?? null,
  weightWeekStart: null,
  activityLevel: body.activityLevel ?? null,
});

// ── ③ LE VERDICT DE COMPOSITION — celui du produit ───────────────────────
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
const uncoverable = body.regime ? uncoverableSentinelsFor(body.regime) : [];
const verdict = verdictFor({
  dishes: folded,
  envelope: env,
  index,
  daysCovered: Number(plan.window?.duration_days ?? 1),
  uncoverableSentinels: uncoverable,
  fixedIntakeInputs: [],
});

// ── ④ LA PROTÉINE PAR JOUR, en grammes ───────────────────────────────────
// Le verdict rend « met/under »; le rapport a besoin du NOMBRE. On additionne
// par le MÊME résolveur, plat par plat (déjà plié), et l'on s'abstient dès
// qu'un ingrédient dense n'est pas pesé — comme le fait `verdictFor`.
const proteinByDay = new Map<string, { g: number; complete: boolean }>();
folded.forEach((d, i) => {
  const day = String(rawDishes[i]?.day ?? "?");
  const r = resolveIngredients(index, [...d.ingredients]);
  const n = nutrientsOf(r.resolved, { friedMethod: isFriedMethod(d.method) });
  const g = n === "unknown" || n.proteinG === null ? 0 : n.proteinG;
  const complete = n !== "unknown" && n.proteinG !== null &&
    r.unresolvedTerms.length === 0 && !r.unweighedEnergyDense;
  const cur = proteinByDay.get(day) ?? { g: 0, complete: true };
  proteinByDay.set(day, { g: cur.g + g, complete: cur.complete && complete });
});

const allRes = resolveIngredients(index, folded.flatMap((d) => [...d.ingredients]));
console.log(JSON.stringify({
  unresolved_terms: allRes.unresolvedTerms,
  unweighed_terms: allRes.unweighedTerms,
  case: body.case ?? null,
  window: plan.window,
  suggested_window: plan.suggested_window,
  envelope: env,
  maintenance_range: maint.range,
  verdict,
  days: pe.days.map((d) => ({
    day: d.day,
    kcal: d.kcal === null ? null : Math.round(d.kcal),
    complete: d.complete,
    counted: `${d.dishesCounted}/${d.dishesTotal}`,
    boundedKcal: Math.round(d.boundedKcal),
    protein_g: proteinByDay.get(String(d.day)) ? Math.round(proteinByDay.get(String(d.day))!.g) : null,
    protein_complete: proteinByDay.get(String(d.day))?.complete ?? null,
  })),
  dish_kcal: pe.dishes.map((d, i) => ({
    day: rawDishes[i]?.day,
    slot: rawDishes[i]?.slot,
    name: rawDishes[i]?.name,
    kcal: d.kcal === null ? null : Math.round(d.kcal),
  })),
}, null, 1));
