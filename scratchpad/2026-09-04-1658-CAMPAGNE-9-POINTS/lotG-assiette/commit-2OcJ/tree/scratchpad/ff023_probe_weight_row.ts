/**
 * Sonde ciblée : la 3e ligne `protocol_events` vue en X6 (sans
 * `food_group_ref`) vient-elle du tour de POIDS, et est-elle antérieure à
 * FF-023 ? On rejoue les deux mêmes tours et on relit la ligne ENTIÈRE.
 */
import {
  admin,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
await admin().from("coach_doctrines").insert({
  coach_id: coach.coachId,
  version: 1,
  beliefs: [{ claim: "Every meal is built on a protein anchor.", rationale: null }],
  forbidden: [],
  vocabulary: [],
  arbitrations: [],
  voice: { tone: "Direct, warm." },
  foods: { recommended: [], discouraged: [] },
  content_locale: "en",
  published_at: new Date().toISOString(),
  published_by: coach.userId,
} as never);
const student = await makeStudent({
  coach,
  timezone: "Europe/London",
  country: "GB",
  locale: "en-US",
  fullName: "Sam",
});
await publishPlanFor(coach, student.userId);

if (Deno.args[0] !== "solo") {
  console.log("T1:", (await turn(student, "I had grilled chicken and broccoli for lunch.")).reply);
}
console.log("après T1:", await rows(
  `select created_at, coalesce(food_group_ref,'NULL'), coalesce(source,'?'), coalesce(substance_ref,'-'), coalesce(student_note,'-'), coalesce(plan_relation,'-')
     from protocol_events where user_id='${student.userId}' order by created_at`,
).catch((e) => [`<${e.message}>`]));

console.log("T2:", (await turn(student, "I weighed myself this morning, 78 kg.")).reply);
console.log("après T2:", await rows(
  `select created_at, coalesce(food_group_ref,'NULL'), coalesce(source,'?'), coalesce(substance_ref,'-'), coalesce(student_note,'-'), coalesce(plan_relation,'-')
     from protocol_events where user_id='${student.userId}' order by created_at`,
).catch((e) => [`<${e.message}>`]));
console.log("colonnes:", await rows(
  `select string_agg(column_name, ', ' order by ordinal_position)
     from information_schema.columns where table_name='protocol_events'`,
));

await cleanup(student.userId);
await cleanup(coach.userId).catch(() => {});
