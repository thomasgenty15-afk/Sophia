// ══════════════════════════════════════════════════════════════════════════
// L26-0 — UNE BOUCHE, UN CONTENANT. Le DELTA, calculé en UNE passe.
// ══════════════════════════════════════════════════════════════════════════
//
// Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L26-0`.
// Pilote: `scripts/keel_l26_0_un_contenant_par_bouche_20260822.sh`.
//
// ⛔ POURQUOI UN DELTA ET PAS DEUX NIVEAUX. §⑨ n° 55: les niveaux de ce corpus
// ne sont pas reproductibles à la minute — six sessions écrivent dans
// `_shared/keel` en direct. Seul un AVANT et un APRÈS calculés dans le MÊME
// processus, sur les MÊMES lignes, comparent deux règles au lieu de comparer
// deux états de l'arbre.
//
// ⛔ ET LE RECOMPTE EST VÉRIFIÉ CONTRE LA BASE AVANT D'ÊTRE CRU. La colonne
// `generated_from.household.boxes` porte les compteurs écrits à la génération;
// ce script les recompte depuis `dishes` et REFUSE de conclure si les deux ne
// coïncident pas. Un recompte qui dérive silencieusement du parseur mesurerait
// sa propre arithmétique, pas le produit.
//
// ⚠️ AUCUN APPEL DE MODÈLE, AUCUNE ÉCRITURE. Lecture seule.

import { keepOneBoxPerMouth } from "../supabase/functions/_shared/keel/box_one_per_mouth.ts";

type RawBox = { id?: unknown; member_ids?: unknown };
type RawDish = { day?: unknown; slot?: unknown; member_id?: unknown; boxes?: unknown };

type Lid = { id: string; memberIds: string[] };
type Dish = { day: string | null; slot: string | null; memberId: string | null; boxes: Lid[] };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function readDishes(raw: unknown): Dish[] {
  const out: Dish[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const d = (entry ?? {}) as RawDish;
    const boxes: Lid[] = [];
    for (const b of Array.isArray(d.boxes) ? d.boxes : []) {
      const box = (b ?? {}) as RawBox;
      const id = text(box.id);
      if (!id) continue;
      const memberIds: string[] = [];
      for (const m of Array.isArray(box.member_ids) ? box.member_ids : []) {
        const mid = text(m);
        if (mid && !memberIds.includes(mid)) memberIds.push(mid);
      }
      boxes.push({ id, memberIds });
    }
    out.push({
      day: text(d.day),
      slot: text(d.slot),
      memberId: text(d.member_id),
      boxes,
    });
  }
  return out;
}

/** Le recompte, mot pour mot celui de `meal_generation.ts`. */
function census(dishes: readonly Dish[], roster: readonly string[]) {
  const cells = new Map<string, Map<string, number>>();
  let boxes = 0;
  for (const dish of dishes) {
    if (dish.boxes.length === 0) continue;
    boxes += dish.boxes.length;
    const key = `${dish.day ?? "any"}/${dish.slot ?? "any"}`;
    const byMouth = cells.get(key) ?? new Map<string, number>();
    for (const box of dish.boxes) {
      for (const m of new Set(box.memberIds)) byMouth.set(m, (byMouth.get(m) ?? 0) + 1);
    }
    cells.set(key, byMouth);
  }
  let slots = 0;
  let unboxed = 0;
  let double = 0;
  for (const byMouth of cells.values()) {
    slots += roster.length;
    for (const m of roster) {
      const n = byMouth.get(m) ?? 0;
      if (n === 1) continue;
      if (n === 0) unboxed++;
      else double++;
    }
  }
  return { boxes, slots, unboxed, double };
}

const dir = Deno.args[0];
const rows = (await Deno.readTextFile(`${dir}/plans.ndjson`)).trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l) as Record<string, unknown>);
const roster = (await Deno.readTextFile(`${dir}/roster.txt`)).trim().split("\n").filter(Boolean);

console.log(`roster: ${roster.length} bouches`);
console.log(
  "plan     | loc   |    boxes    |  mouth_slots |   unboxed   |    double   | base(d/u/s/b)",
);
console.log(
  "---------+-------+-------------+--------------+-------------+-------------+---------------",
);

let mismatch = 0;
const tot = {
  boxesBefore: 0,
  boxesAfter: 0,
  unboxedBefore: 0,
  unboxedAfter: 0,
  doubleBefore: 0,
  doubleAfter: 0,
  slotsBefore: 0,
  slotsAfter: 0,
  namesRemoved: 0,
  dropped: 0,
};

for (const row of rows) {
  const dishes = readDishes(row.dishes);
  const before = census(dishes, roster);
  const outcome = keepOneBoxPerMouth(dishes);
  const after = census(
    dishes.map((d, i) => ({ ...d, boxes: outcome.boxesByDish[i] })),
    roster,
  );
  const base = (row.base ?? {}) as Record<string, unknown>;
  const bd = Number(base.mouths_double ?? -1);
  const bu = Number(base.mouths_unboxed ?? -1);
  const bs = Number(base.mouth_slots ?? -1);
  const bb = Number(base.boxes ?? -1);
  const ok = bd === before.double && bu === before.unboxed && bs === before.slots &&
    bb === before.boxes;
  if (!ok) mismatch++;
  const cell = (a: number, b: number) => `${String(a).padStart(4)} → ${String(b).padEnd(4)}`;
  console.log(
    `${String(row.plan).padEnd(8)} | ${String(row.locale).padEnd(5)} | ${
      cell(before.boxes, after.boxes)
    } | ${cell(before.slots, after.slots).padEnd(12)} | ${cell(before.unboxed, after.unboxed)} | ${
      cell(before.double, after.double)
    } | ${bd}/${bu}/${bs}/${bb} ${ok ? "✓" : "✗ DIVERGE"}`,
  );
  tot.boxesBefore += before.boxes;
  tot.boxesAfter += after.boxes;
  tot.slotsBefore += before.slots;
  tot.slotsAfter += after.slots;
  tot.unboxedBefore += before.unboxed;
  tot.unboxedAfter += after.unboxed;
  tot.doubleBefore += before.double;
  tot.doubleAfter += after.double;
  tot.namesRemoved += outcome.namesRemoved;
  tot.dropped += outcome.dropped.length;
}

console.log("");
console.log(`plans                : ${rows.length}`);
console.log(`recompte ≠ base      : ${mismatch}  ${mismatch === 0 ? "✓" : "⛔"}`);
console.log(`mouths_double        : ${tot.doubleBefore} → ${tot.doubleAfter}`);
console.log(`mouths_unboxed       : ${tot.unboxedBefore} → ${tot.unboxedAfter}`);
console.log(`mouth_slots          : ${tot.slotsBefore} → ${tot.slotsAfter}`);
console.log(`boxes                : ${tot.boxesBefore} → ${tot.boxesAfter}`);
console.log(`noms retirés         : ${tot.namesRemoved}`);
console.log(`couvercles tombés    : ${tot.dropped}`);
console.log("");
// ⛔ LE SEUIL, LES DEUX MOITIÉS, ET ELLES SE LISENT ENSEMBLE.
const seuilA = tot.doubleAfter === 0;
const seuilB = tot.unboxedAfter <= tot.unboxedBefore;
console.log(`SEUIL ① mouths_double → 0            : ${seuilA ? "ATTEINT" : "MANQUÉ"}`);
console.log(
  `SEUIL ② mouths_unboxed NE MONTE PAS  : ${seuilB ? "ATTEINT" : "MANQUÉ"} ` +
    `(${tot.unboxedBefore} → ${tot.unboxedAfter})`,
);
if (mismatch > 0) console.log("⛔ le recompte diverge de la base — le delta n'est pas crédible");
