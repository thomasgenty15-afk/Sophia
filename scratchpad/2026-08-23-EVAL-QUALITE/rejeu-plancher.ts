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
// ═══════════════════════════════════════════════════════════════════════════
// REJEU DU PLANCHER PROTÉINE — 2026-09-04
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI UN REJEU ET PAS UNE GÉNÉRATION. La branche à prouver demande un
// plan où l'énergie est DANS la zone morte ET la protéine SOUS le plancher de
// moins de 12 % — une fenêtre de 15,7 g. Aucun levier de fixture ne l'atteint:
// le poids du corps déplace le plancher ET la bande d'énergie ensemble (mesuré,
// sonde du 03:42). On ne peut pas forcer ce cas, mais on l'a DÉJÀ RENCONTRÉ:
// deux plans réels y sont tombés. On les rejoue.
//
// ⚠️ LES MODULES SONT CEUX DE LA PRODUCTION, IMPORTÉS. Rien n'est recopié: le
// seuil testé est celui du fichier, et si quelqu'un le rechange ce rejeu le dit.
import {
  scaleFactorsFor,
  SCALE_DEAD_ZONE,
} from "../../supabase/functions/_shared/keel/portion_scaling.ts";
import {
  proteinFoodPredicate,
  scalingInputsFor,
} from "../../supabase/functions/_shared/keel/portion_scaling_inputs.ts";

const days = Number(plan.window?.duration_days ?? 1);
// ⛔ LE PRÉDICAT DE LA PRODUCTION, IMPORTÉ. Ma première version le réécrivait à
// la main et rendait `false` partout — d'où deux facteurs identiques là où le
// run réel en donnait deux différents. Un instrument recopié mesure l'instrument.
const isProteinFood = proteinFoodPredicate(index);
const inputs = scalingInputsFor({ index, dishes: folded, isProteinFood });
const floor = env.mode === "per_kg" ? env.proteinFloorG : 0;
const perDay = (inputs.computedProteinG ?? 0) / days;

console.log(`\n══ ${planFile.split("/").pop()}`);
console.log(`   protéine servie   ${perDay.toFixed(1)} g/j   plancher ${floor} g   écart ${(perDay - floor).toFixed(1)} g`);
console.log(`   énergie servie    ${((inputs.computedKcal ?? 0) / days).toFixed(0)} kcal/j`);
console.log(`   dans l'ancienne bande morte ? ${perDay < floor && perDay >= floor * (1 - SCALE_DEAD_ZONE) ? "OUI" : "non"}`);

const args = {
  computedKcal: inputs.computedKcal,
  computedProteinG: inputs.computedProteinG,
  proteinFoodKcal: inputs.proteinFoodKcal,
  otherScalableKcal: inputs.otherScalableKcal,
  proteinFoodProteinG: inputs.proteinFoodProteinG,
  envelope: env,
  daysCovered: days,
  resolvedShare: inputs.resolvedShare,
};
const now = scaleFactorsFor(args);

// L'ANCIEN COMPORTEMENT, REJOUÉ À L'IDENTIQUE: on retire au plan juste ce qu'il
// faut de protéine pour qu'il tombe SOUS l'ancien seuil — non. On ne peut pas
// simuler l'ancien code sans le recopier. On le DÉDUIT de son unique différence:
// l'ancien renonçait quand `base === null` et `perDay >= floor*(1-DZ)`.
const base = scaleFactorsFor({ ...args, computedProteinG: floor * days * 2 }); // protéine hors de cause
const oldWouldAbstain = base === null && perDay >= floor * (1 - SCALE_DEAD_ZONE) && perDay < floor;

console.log(`   AVANT (seuil à ${(floor * (1 - SCALE_DEAD_ZONE)).toFixed(1)} g) : ${oldWouldAbstain ? "ABSTENTION — plan livré sous son plancher" : "aurait agi"}`);
if (now === null) {
  console.log(`   APRÈS (seuil à ${floor} g)     : abstention`);
} else {
  const after = (inputs.proteinFoodProteinG * now.protein +
    ((inputs.computedProteinG ?? 0) - inputs.proteinFoodProteinG)) / days;
  console.log(`   APRÈS (seuil à ${floor} g)     : AGIT · protéine ×${now.protein} · autre ×${now.other}`);
  console.log(`   ⇒ protéine après mise à l'échelle : ${after.toFixed(1)} g/j  (${after >= floor ? "AU-DESSUS du plancher ✓" : "encore dessous ✗"})`);
}
