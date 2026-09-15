/**
 * FF-010 — LA PURGE. La base locale est PARTAGÉE avec d'autres sessions: une
 * fixture qui reste fait mentir le run suivant.
 *
 * On retire, dans cet ordre: les plans du foyer, les restrictions, les membres,
 * les foyers, puis les comptes (élèves, remplissage, coachs) par
 * `auth.admin.deleteUser`, qui emporte en cascade tout ce qui pend dessus.
 *
 * usage: deno run -A scratchpad/ff010_cleanup.ts
 */
import { admin, cleanup } from "../docs/nutrition-pivot/qa-web/harness.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff010_fixture.json", import.meta.url)),
);
const db = admin();

const householdIds: string[] = Object.values(fixture.households)
  .map((h) => (h as { id: string }).id);

for (const id of householdIds) {
  await db.from("student_generated_meals").delete().eq("household_id", id);
  await db.from("household_food_restrictions").delete().eq("household_id", id);
  await db.from("household_members").delete().eq("household_id", id);
  const { error } = await db.from("households").delete().eq("id", id);
  if (error) console.warn(`households(${id}): ${error.message}`);
}

const studentIds: string[] = Object.values(fixture.students)
  .map((s) => (s as { userId: string }).userId);
for (const userId of studentIds) {
  await db.from("student_generated_meals").delete().eq("user_id", userId);
  await db.from("student_goals").delete().eq("user_id", userId);
  await db.from("contract_change_requests").delete().eq("user_id", userId);
  await db.from("conversation_turn_traces").delete().eq("user_id", userId);
  await db.from("turn_summary_logs").delete().eq("user_id", userId);
  await db.from("plan_commitments").delete().eq("user_id", userId);
  await db.from("plan_versions").delete().eq("student_id", userId);
  await cleanup(userId);
}

const fillerIds: string[] = (fixture.households.big.fillers ?? [])
  .map((f: { userId: string }) => f.userId);
for (const userId of fillerIds) {
  await db.auth.admin.deleteUser(userId).catch(() => {});
}

for (const coach of Object.values(fixture.coaches) as Array<{ coachId: string; userId: string }>) {
  await db.from("coach_timing_rules").delete().eq("coach_id", coach.coachId);
  await db.from("coach_food_rules").delete().eq("coach_id", coach.coachId);
  await db.from("coach_protocols").delete().eq("coach_id", coach.coachId);
  await db.from("coach_doctrines").delete().eq("coach_id", coach.coachId);
  await db.from("coach_clients").delete().eq("coach_id", coach.coachId);
  await db.from("coaches").delete().eq("id", coach.coachId);
  await db.auth.admin.deleteUser(coach.userId).catch(() => {});
}

const left = await db.from("households").select("id").in("id", householdIds);
console.log(
  `foyers restants: ${((left.data ?? []) as unknown[]).length} (attendu 0)`,
);
console.log("purge ff010_ terminée");
