/**
 * PASSE TRANSVERSE — DEUX COCHES DU JOUR, DANS LA FORME EXACTE DE LA PRODUCTION.
 *
 * Copiée ligne à ligne de `frontend/src/keel/api/mealTicks.ts::tickMeal` (le
 * SEUL écrivain de `quick_tap`): `source_message_id = meal_tick:<mealId>:<i>`,
 * `evidence_weight = 0.4`, `plan_relation = 'as_planned'`. Sans cette forme,
 * `loadDayFacts` ne compte rien et `supportGround` reste sur la semaine — c'est
 * T-15 appliqué à ma propre sonde.
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
const fixture = JSON.parse(await Deno.readTextFile(new URL("./ffx_fixture.json", import.meta.url)));
const db = admin();
const mealId = fixture.household.mealId as string;
const rows = [6, 7].map((i) => ({
  user_id: fixture.student.userId,
  occurred_at: new Date().toISOString(),
  local_date: fixture.today,
  slot_key: i % 2 === 0 ? "lunch" : "dinner",
  source: "quick_tap",
  student_note: i % 2 === 0
    ? "Day 4 lunch: seared salmon, quinoa and greens"
    : "Day 4 dinner: slow-braised beef with root vegetables",
  content_locale: "en",
  evidence_weight: 0.4,
  plan_relation: "as_planned",
  source_message_id: `meal_tick:${mealId}:${i}`,
}));
const { error } = await db.from("protocol_events").insert(rows as never);
if (error) throw new Error(error.message);
console.log("2 coches écrites");
