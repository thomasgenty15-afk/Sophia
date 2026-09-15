/**
 * ── L'ANALYSEUR D'UN PLAN FOYER — 2026-08-23 ──────────────────────────────
 * ⛔ LECTURE DE FICHIERS SEULE. `mouthDayEnergy` et `maintenanceEnvelopeFromBody`
 * sont ceux de la PRODUCTION, importés — jamais recopiés.
 *   deno run --allow-read analyse-foyer.ts <ref> <plan.json> <roster.json>
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
  type EnergyIngredient,
  type EnergyPreparation,
} from "../../supabase/functions/_shared/keel/plan_energy.ts";
import {
  type MouthEnergyDish,
  mouthDayEnergy,
} from "../../supabase/functions/_shared/keel/mouth_energy.ts";
import {
  childEnvelopeFromBody,
  maintenanceEnvelopeFromBody,
} from "../../supabase/functions/_shared/keel/meal_envelope.ts";

const [refDir, planFile, rosterFile] = Deno.args;
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
function readIng(raw: unknown): EnergyIngredient | null {
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
    quantity: typeof i.quantity === "string" ? i.quantity : null,
  };
}
const readIngs = (r: unknown): EnergyIngredient[] =>
  Array.isArray(r) ? r.map(readIng).filter((x): x is EnergyIngredient => !!x) : [];

// deno-lint-ignore no-explicit-any
const plan = JSON.parse(Deno.readTextFileSync(planFile)) as any;
// deno-lint-ignore no-explicit-any
const roster = JSON.parse(Deno.readTextFileSync(rosterFile)) as any[];
const nameOf = new Map<string, string>(roster.map((r) => [r.member_id, r.first_name]));

const dishes: MouthEnergyDish[] = (plan.dishes ?? []).map((
  // deno-lint-ignore no-explicit-any
  d: any,
) => ({
  day: d.day ?? null,
  slot: d.slot ?? null,
  method: String(d.method ?? ""),
  ingredients: readIngs(d.ingredients),
  // deno-lint-ignore no-explicit-any
  uses: (d.uses ?? []).map((u: any) => ({
    preparationId: String(u.preparation_id ?? ""),
    servings: Number(u.servings) || 1,
  })).filter((u: { preparationId: string }) => u.preparationId !== ""),
  // deno-lint-ignore no-explicit-any
  boxes: (d.boxes ?? []).map((b: any) => ({
    memberIds: (b.member_ids ?? []).map(String),
    // deno-lint-ignore no-explicit-any
    items: (b.items ?? []).map((it: any) => ({ grams: Number(it.grams) || 0 })),
    legacyTotalGrams: b.total_grams === undefined || b.total_grams === null
      ? null
      : Number(b.total_grams),
  })),
}));
// deno-lint-ignore no-explicit-any
const preps: EnergyPreparation[] = (plan.preparations ?? []).map((p: any) => ({
  id: String(p.id ?? ""),
  servingsMade: Math.max(1, Number(p.servings_made) || 1),
  ingredients: readIngs(p.ingredients),
})).filter((p) => p.id !== "");

const index: CompositionIndex = await loadCompositionIndex(fileClient());
const rows = mouthDayEnergy({ index, dishes, preparations: preps });

const cibles = roster.map((r) => {
  const b = {
    heightCm: r.height_cm ?? null,
    weightKg: r.weight_kg ?? null,
    gender: r.gender ?? null,
    ageYears: r.age_years ?? null,
    activityLevel: r.activity_level ?? null,
    activityAxes: {
      day: r.day_activity ?? null,
      sport: r.sport_frequency ?? null,
      asked: !!(r.day_activity && r.sport_frequency),
    },
    appetite: r.appetite ?? null,
  };
  const env = (r.age_years !== null && r.age_years < 18)
    ? childEnvelopeFromBody(b)
    : maintenanceEnvelopeFromBody(b);
  return {
    name: r.first_name,
    member_id: r.member_id,
    goal: r.goal,
    diet: r.diet,
    minor: r.age_years !== null && r.age_years < 18,
    envelope: env,
  };
});

console.log(JSON.stringify({
  cibles,
  par_bouche: rows.map((x) => ({
    name: nameOf.get(x.memberId) ?? x.memberId,
    day: x.day,
    kcal: x.kcal,
    complete: x.complete,
    counted: `${x.dishesCounted}/${x.dishesTotal}`,
    unattributed: x.unattributedDishes,
    slots: x.slots,
    grams: Math.round(x.grams),
    maxMealGrams: Math.round(x.maxMealGrams),
    gaps: x.gaps,
  })),
}, null, 1));
