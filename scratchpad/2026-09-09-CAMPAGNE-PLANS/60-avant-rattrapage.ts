/**
 * ── LE PLAN TEL QUE LE MODÈLE L'A ÉCRIT, RECONSTRUIT PAR L'INVERSE DU RATTRAPAGE ──
 * `scaleIngredients` (production) est appliqué au plan SERVI avec les facteurs
 * inverses de ceux du journal (`keel.meal.portion_scaling`). Même prédicat
 * protéine (`proteinFoodPredicate`), même module. Le plafond d'ingrédient ne
 * mord pas à l'inverse (les facteurs inverses sont < 1 côté protéine ou > 1
 * côté autre mais rendent des grammes d'origine ≤ plafond). L'arrondi est la
 * seule approximation.
 *   deno run --allow-read 60-avant-rattrapage.ts <ref> <plan.json> <body.json> <pf> <of> <lo> <hi>
 */
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES, type CompositionIndex, type CompositionInput, COMPOSITION_UNITS,
  type CompositionState, type CompositionUnit,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import { type EnergyDish, type EnergyPreparation, planEnergy } from "../../supabase/functions/_shared/keel/plan_energy.ts";
import { scaleIngredients } from "../../supabase/functions/_shared/keel/portion_scaling.ts";
import { proteinFoodPredicate } from "../../supabase/functions/_shared/keel/portion_scaling_inputs.ts";
import { SLOT_DAY_WEIGHT } from "../../supabase/functions/_shared/keel/mouth_anchor.ts";

const [refDir, planFile, bodyFile, pfS, ofS, loS, hiS] = Deno.args;
const pf = Number(pfS), of = Number(ofS), lo = Number(loS), hi = Number(hiS);
const readNd = (f: string) => Deno.readTextFileSync(f).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
function fileClient() {
  const c = new Map<string, unknown[]>();
  const rows = (t: string) => { if (!c.has(t)) c.set(t, readNd(`${refDir}/${t}.ndjson`)); return c.get(t)!; };
  return { from(t: string) { return { select(_c: string) { return { range(a: number, b: number) {
    return Promise.resolve({ data: rows(t).slice(a, b + 1), error: null }); } }; } }; } };
}
function readIng(raw: unknown): CompositionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  const term = String(i.term ?? "").trim(); if (!term) return null;
  const amount = Number(i.amount), unit = String(i.unit ?? ""), state = String(i.state ?? "");
  return { term, amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    unit: (COMPOSITION_UNITS as readonly string[]).includes(unit) ? unit as CompositionUnit : null,
    state: (COMPOSITION_STATES as readonly string[]).includes(state) ? state as CompositionState : null,
    quantity: typeof i.quantity === "string" ? i.quantity : null };
}
const readIngs = (r: unknown): CompositionInput[] => Array.isArray(r) ? r.map(readIng).filter((x): x is CompositionInput => !!x) : [];
// deno-lint-ignore no-explicit-any
const plan = JSON.parse(Deno.readTextFileSync(planFile)) as any;
// deno-lint-ignore no-explicit-any
const body = JSON.parse(Deno.readTextFileSync(bodyFile)) as any;
const index: CompositionIndex = await loadCompositionIndex(fileClient());
const isProt = proteinFoodPredicate(index);
const inverse = { protein: 1 / pf, other: 1 / of };

// deno-lint-ignore no-explicit-any
const mkDish = (d: any, ings: CompositionInput[]): EnergyDish => ({
  day: d.day ?? null, method: String(d.method ?? ""), ingredients: ings,
  // deno-lint-ignore no-explicit-any
  uses: (d.uses ?? []).map((u: any) => ({ preparationId: String(u.preparation_id ?? ""), servings: Number(u.servings) || 1 }))
    .filter((u: { preparationId: string }) => u.preparationId !== ""),
});
// deno-lint-ignore no-explicit-any
const mkPrep = (p: any, ings: CompositionInput[]): EnergyPreparation => ({
  id: String(p.id ?? ""), servingsMade: Math.max(1, Number(p.servings_made) || 1), ingredients: ings,
});
const scalable = (ings: CompositionInput[]) => ings.map((i) => ({ ...i, quantity: i.quantity }));

// deno-lint-ignore no-explicit-any
const served = { dishes: plan.dishes.map((d: any) => mkDish(d, readIngs(d.ingredients))),
  // deno-lint-ignore no-explicit-any
  preps: (plan.preparations ?? []).map((p: any) => mkPrep(p, readIngs(p.ingredients))).filter((p: EnergyPreparation) => p.id) };
// deno-lint-ignore no-explicit-any
const before = { dishes: plan.dishes.map((d: any) => mkDish(d, scaleIngredients(scalable(readIngs(d.ingredients)), inverse, isProt, 1e9).items as CompositionInput[])),
  // deno-lint-ignore no-explicit-any
  preps: (plan.preparations ?? []).map((p: any) => mkPrep(p, scaleIngredients(scalable(readIngs(p.ingredients)), inverse, isProt, 1e9).items as CompositionInput[])).filter((p: EnergyPreparation) => p.id) };

const run = (x: { dishes: EnergyDish[]; preps: EnergyPreparation[] }) =>
  planEnergy({ index, dishes: x.dishes, preparations: x.preps, servings: Number(body.servings ?? 1), addons: [], mealsOutByDay: new Map() });
const eS = run(served), eB = run(before);

// Par plat: la part du jour que ce moment porte (SLOT_DAY_WEIGHT / somme des
// moments composés ce jour-là) × la bande. Un plat est « au-dessus » si son
// énergie dépasse la part du PLAFOND, « sous » s'il est sous la part du plancher.
// deno-lint-ignore no-explicit-any
const slotsByDay = new Map<string, number>();
// deno-lint-ignore no-explicit-any
for (const d of plan.dishes as any[]) {
  const w = (SLOT_DAY_WEIGHT as Record<string, number>)[String(d.slot)] ?? 0.1;
  slotsByDay.set(String(d.day), (slotsByDay.get(String(d.day)) ?? 0) + w);
}
const dishes = eS.dishes.map((s, i) => {
  // deno-lint-ignore no-explicit-any
  const d = (plan.dishes as any[])[i];
  const w = ((SLOT_DAY_WEIGHT as Record<string, number>)[String(d.slot)] ?? 0.1) / (slotsByDay.get(String(d.day)) ?? 1);
  const b = eB.dishes[i];
  const verdict = (k: number | null) => k === null ? "?" : k > hi * w ? "au-dessus" : k < lo * w ? "sous" : "dans";
  return { day: d.day, slot: d.slot, name: d.name, part_lo: Math.round(lo * w), part_hi: Math.round(hi * w),
    modele: b.kcal === null ? null : Math.round(b.kcal), servi: s.kcal === null ? null : Math.round(s.kcal),
    v_modele: verdict(b.kcal), v_servi: verdict(s.kcal) };
});
console.log(JSON.stringify({
  case: body.case, bande: [lo, hi], facteurs: { protein: pf, other: of },
  jours: eS.days.map((d, i) => ({ day: d.day, complete: d.complete,
    modele: eB.days[i].kcal === null ? null : Math.round(eB.days[i].kcal),
    servi: d.kcal === null ? null : Math.round(d.kcal) })),
  plats: dishes,
}, null, 1));
