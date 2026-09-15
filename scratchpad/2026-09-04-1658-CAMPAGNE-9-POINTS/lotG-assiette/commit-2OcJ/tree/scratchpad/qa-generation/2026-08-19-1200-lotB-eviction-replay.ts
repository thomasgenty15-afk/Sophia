import { dishBudgetFor, parseGeneratedMeal } from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/meal_generation.ts";
const ROOT = "/Users/ahmedamara/Dev/Sophia 2/scratchpad/qa-generation/03-foyer-modes/";
const RUNS = ["one_session/run-1", "one_session/run-D1", "separate_sessions/run-1", "separate_sessions/run-2"];
const BEARERS = ["c278b5dc-680f-43f1-b54f-f9da630fcb2f", "f5c81e2b-7f57-4fac-a30f-067fa587262d", "c9656ee5-6b39-4fd0-95f2-3f4bf70899d7"];
const NAMES: Record<string,string> = { [BEARERS[0]]: "Aurele", [BEARERS[1]]: "Marceline", [BEARERS[2]]: "Solveig" };
const RHYTHM = [{ slot: "lunch" as const, size: null }, { slot: "dinner" as const, size: null }];
const CELLS = [{ day: "wed", slot: "lunch" }, { day: "wed", slot: "dinner" }];
// LE PLAFOND HISTORIQUE EST 4 (base 2 + bonus 2). On CHERCHE le `asked` qui le
// rend avec le code d'aujourd'hui, pour que ce rejeu mesure l'ÉVICTION seule et
// pas le lot du budget, qui est en vol dans une autre lane.
let asked = 0;
for (let a = 0; a <= 12; a++) {
  const merge = { shape: "one_session" as const, ownDishesShown: 0, dedicatedDishesAsked: a, dedicatedCells: CELLS, dishBearerIds: BEARERS };
  if (dishBudgetFor({ scope: "day", rhythm: RHYTHM, daysToFill: 1, merge }) === 4) { asked = a; break; }
}
const merge = { shape: "one_session" as const, ownDishesShown: 0, dedicatedDishesAsked: asked, dedicatedCells: CELLS, dishBearerIds: BEARERS };
console.log("plafond rejoué:", dishBudgetFor({ scope: "day", rhythm: RHYTHM, daysToFill: 1, merge }), "(asked =", asked, ")");
const BASE = {
  doctrine: null, safetyConstraints: [], mode: "to_shop" as const, scope: "day" as const,
  pantry: [], beliefKeys: [], eatingRhythm: RHYTHM, daysToFill: ["wed"], awayDays: [],
  cookingTimeMin: null, composition: null, fixedIntakes: [], dayProperties: [],
  merge, boxMemberIds: [] as readonly string[], boxMemberDiets: [] as readonly { memberId: string; regime: null }[],
};
for (const run of RUNS) {
  const dump = JSON.parse(Deno.readTextFileSync(ROOT + run + "/dump/output.json"));
  const r = dump.result;
  let j: Record<string, unknown>;
  try { j = r.output_text_json ?? JSON.parse(r.output_text); } catch { console.log(run, "| sortie illisible"); continue; }
  // deno-lint-ignore no-explicit-any
  const meal = parseGeneratedMeal({ ...(j as any), preparations: [] }, BASE as never);
  const tally: Record<string, number> = { Aurele: 0, Marceline: 0, Solveig: 0 };
  for (const d of meal.dishes) if (d.memberId) tally[NAMES[d.memberId]]++;
  console.log(
    run.padEnd(26), "plats gardés", meal.dishes.length,
    "| attribués", meal.dish_owner_counts.attributed,
    "| Aurèle", tally.Aurele, "Marceline", tally.Marceline, "Solveig", tally.Solveig,
  );
}
