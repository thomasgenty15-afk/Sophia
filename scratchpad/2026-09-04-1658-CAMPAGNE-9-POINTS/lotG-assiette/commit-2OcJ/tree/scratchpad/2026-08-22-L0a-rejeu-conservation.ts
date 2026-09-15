/**
 * L0-a — LA MESURE APRÈS, REJOUÉE SUR LE CORPUS.
 *
 * Aucune génération: on relit les 181 plans DÉJÀ écrits et on leur applique la
 * règle RÉELLE (`cookedWindowVerdict`, `rawWindowDaysFor`, `planGroceryWaves`
 * sont IMPORTÉS, jamais recopiés — une copie mesurerait autre chose que le
 * produit).
 *
 *   deno run --allow-read scratchpad/2026-08-22-L0a-rejeu-conservation.ts <dir>
 */

import {
  buildCompositionIndex,
  type CompositionRef,
  resolveIngredient,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import {
  cookedWindowVerdict,
  rawWindowDaysFor,
} from "../supabase/functions/_shared/keel/fridge_window.ts";
import {
  planGroceryWaves,
  rawWindowCounts,
  type WaveItem,
} from "../supabase/functions/_shared/keel/grocery_waves.ts";

const MAX_FRIDGE_DAYS = 3; // littéral: le rejeu ne doit pas suivre la constante
const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const dir = Deno.args[0];
const plans = JSON.parse(Deno.readTextFileSync(`${dir}/plans.json`)) as Plan[];
const refRows = JSON.parse(Deno.readTextFileSync(`${dir}/refs.json`)) as {
  slug: string;
  foodGroupRef: string;
}[];
const aliasRows = JSON.parse(Deno.readTextFileSync(`${dir}/aliases.json`)) as {
  alias: string;
  slug: string;
}[];

interface Plan {
  id: string;
  starts_on: string | null;
  duration_days: number | null;
  preparations: Record<string, unknown>[];
  dishes: Record<string, unknown>[];
  shopping_list: Record<string, unknown>[];
}

const index = buildCompositionIndex(
  refRows as unknown as CompositionRef[],
  aliasRows,
);

function windowOf(p: Plan): string[] {
  if (!p.starts_on || !p.duration_days) return DAY_TOKENS;
  const out: string[] = [];
  const d = new Date(`${p.starts_on}T12:00:00Z`);
  for (let i = 0; i < p.duration_days; i++) {
    out.push(DAY_TOKENS[(d.getUTCDay() + 6) % 7]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function eatAt2(dish: Record<string, unknown>, posOf: (d: string) => number): number {
  const day = String(dish.day ?? "");
  return day ? posOf(day) : -1;
}

let violations = 0, within = 0, notEvaluated = 0, beforeCooking = 0;
let violationsAfterRefusal = 0, plansEmptied = 0;
let plansWithViolation = 0, dishesDropped = 0, dishesTotal = 0;
let routed = 0, unknownGroup = 0;
let wavesBefore = 0, wavesAfter = 0, plansWithMoreWaves = 0, plansWithFewerWaves = 0;
let plansWithWaves = 0;
const perGroup = new Map<string, number>();

for (const p of plans) {
  const win = windowOf(p);
  const posOf = (day: string) => {
    const at = win.indexOf(day);
    return at >= 0 ? at : DAY_TOKENS.indexOf(day);
  };
  const cookOnOf = new Map<string, string | null>();
  for (const prep of p.preparations ?? []) {
    const id = String(prep.id ?? "");
    if (!id) continue;
    const raw = String(prep.cook_on ?? prep.cookOn ?? "");
    cookOnOf.set(id, DAY_TOKENS.includes(raw) ? raw : null);
  }

  let planHasViolation = false;
  let keptDishes = 0;
  let residualViolations = 0;
  for (const dish of p.dishes ?? []) {
    dishesTotal++;
    const day = String(dish.day ?? "");
    if (!day) continue;
    const eatAt = posOf(day);
    const uses = Array.isArray(dish.uses) ? dish.uses : [];
    let drop = false;
    for (const u of uses) {
      const prepId = typeof u === "string"
        ? u
        : String((u as Record<string, unknown>)?.preparation_id ?? "");
      if (!prepId || !cookOnOf.has(prepId)) continue;
      const cookOn = cookOnOf.get(prepId) ?? null;
      const cookAt = cookOn ? posOf(cookOn) : -1;
      if (cookAt < 0 || eatAt < 0) {
        notEvaluated++;
        continue;
      }
      const verdict = cookedWindowVerdict(cookAt, eatAt, MAX_FRIDGE_DAYS);
      if (verdict === "before_cooking") beforeCooking++;
      else if (verdict === "within") within++;
      else {
        violations++;
        drop = true;
      }
    }
    if (drop) {
      dishesDropped++;
      planHasViolation = true;
    } else {
      keptDishes++;
      // LE SEUIL LITTÉRAL: aucun couple hors fenêtre ne SURVIT au refus.
      for (const u of uses) {
        const prepId = typeof u === "string"
          ? u
          : String((u as Record<string, unknown>)?.preparation_id ?? "");
        const cookOn = cookOnOf.get(prepId) ?? null;
        const cookAt = cookOn ? posOf(cookOn) : -1;
        if (cookAt < 0 || eatAt2(dish, posOf) < 0) continue;
        if (cookedWindowVerdict(cookAt, eatAt2(dish, posOf), MAX_FRIDGE_DAYS) === "too_late") {
          residualViolations++;
        }
      }
    }
  }
  violationsAfterRefusal += residualViolations;
  if (planHasViolation) {
    plansWithViolation++;
    if (keptDishes === 0 && (p.dishes ?? []).length > 0) plansEmptied++;
  }

  // ── LA FENÊTRE CRUE: ce que la résolution donne, et ce qu'elle DÉPLACE ──
  const items: WaveItem[] = (p.shopping_list ?? []).map((s) => {
    const term = String(s.term ?? "");
    const group = term ? resolveIngredient(index, term)?.foodGroupRef ?? null : null;
    if (group) perGroup.set(group, (perGroup.get(group) ?? 0) + 1);
    return { term, aisle: String(s.aisle ?? ""), food_group: group };
  });
  const counts = rawWindowCounts(items);
  routed += counts.routed;
  unknownGroup += counts.unknown_group;

  if (p.starts_on && p.duration_days) {
    const preps = (p.preparations ?? []).map((prep) => ({
      id: String(prep.id ?? ""),
      cookOn: cookOnOf.get(String(prep.id ?? "")) ?? null,
      ingredientTerms: (Array.isArray(prep.ingredients) ? prep.ingredients : [])
        .map((ing) => String((ing as Record<string, unknown>)?.term ?? ""))
        .filter((t) => t.length > 0),
    }));
    const args = {
      startsOn: p.starts_on,
      durationDays: p.duration_days,
      preparations: preps,
    };
    const before = planGroceryWaves({
      ...args,
      shoppingList: items.map((i) => ({ term: i.term, aisle: i.aisle })),
    }).length;
    const after = planGroceryWaves({ ...args, shoppingList: items }).length;
    if (before > 0 || after > 0) plansWithWaves++;
    wavesBefore += before;
    wavesAfter += after;
    if (after > before) plansWithMoreWaves++;
    if (after < before) plansWithFewerWaves++;
  }
}

console.log(JSON.stringify(
  {
    plans: plans.length,
    dishes: dishesTotal,
    fridge_window: { violations, within, not_evaluated: notEvaluated },
    before_cooking_autre_regle: beforeCooking,
    plans_touches: plansWithViolation,
    plats_jetes: dishesDropped,
    violations_RESIDUELLES_apres_refus: violationsAfterRefusal,
    plans_entierement_vides_par_le_refus: plansEmptied,
    raw_window: { routed, unknown_group: unknownGroup },
    raw_window_pct_routed: +(100 * routed / (routed + unknownGroup)).toFixed(1),
    vagues: {
      plans_avec_vagues: plansWithWaves,
      avant: wavesBefore,
      apres: wavesAfter,
      plans_avec_PLUS_de_vagues: plansWithMoreWaves,
      plans_avec_MOINS_de_vagues: plansWithFewerWaves,
    },
    groupes_les_plus_frequents: [...perGroup.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g, n]) => `${g}:${n} (fenêtre ${rawWindowDaysFor(g)} j)`),
  },
  null,
  2,
));
