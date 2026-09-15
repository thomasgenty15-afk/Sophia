/**
 * PASSE TRANSVERSE — LA PURGE. Base PARTAGÉE: on ne laisse rien derrière.
 *
 * Les identifiants viennent des fichiers de résultats, jamais d'un motif de nom
 * (`delete ... like 'ffx%'` toucherait le travail de l'autre agent le jour où
 * il choisit le même préfixe).
 */
import { admin, sql } from "../docs/nutrition-pivot/qa-web/harness.ts";

const db = admin();
const ids = new Set<string>();

const fx = JSON.parse(await Deno.readTextFile(new URL("./ffx_fixture.json", import.meta.url)));
ids.add(fx.coach.userId);
ids.add(fx.student.userId);
for (const f of fx.household.fillers) ids.add(f.userId);

for (const order of ["A", "B", "C", "D"]) {
  try {
    const j = JSON.parse(
      await Deno.readTextFile(new URL(`./ffx_asks_${order}.json`, import.meta.url)),
    );
    for (const id of j.created ?? []) ids.add(id);
  } catch { /* ordre non joué */ }
}
try {
  const j = JSON.parse(
    await Deno.readTextFile(new URL("./ffx_floor_sample.json", import.meta.url)),
  );
  ids.add(j.userId);
  ids.add(j.coachId);
} catch { /* pas joué */ }

console.log(`${ids.size} compte(s) à purger`);

// Les foyers créés par ces comptes, avec leurs membres (pas de cascade fiable).
for (const id of ids) {
  const { data } = await db.from("households").select("id").eq("created_by", id);
  for (const h of (data ?? []) as Array<{ id: string }>) {
    // `student_generated_meals.household_id` est un FK RESTRICT: le plan du
    // foyer part AVANT le foyer. Trouvé par la base, pas par un test.
    await sql(`delete from student_generated_meals where household_id = '${h.id}'`);
    await sql(`delete from household_members where household_id = '${h.id}'`);
    await sql(`delete from households where id = '${h.id}'`);
  }
}

for (const id of ids) {
  await sql(
    `delete from commitment_evaluations where user_id = '${id}';
     delete from weekly_reviews where user_id = '${id}';
     delete from protocol_events where user_id = '${id}';
     delete from planned_deviations where user_id = '${id}';
     delete from student_hunger_reports where user_id = '${id}';
     delete from meal_precision_questions where user_id = '${id}';
     delete from student_daily_recommendations where user_id = '${id}';
     delete from student_daily_checkins where user_id = '${id}';
     delete from chat_messages where user_id = '${id}';
     delete from inbound_dedup where user_id = '${id}';
     delete from outbound_messages where user_id = '${id}';
     delete from user_chat_states where user_id = '${id}';
     delete from household_members where user_id = '${id}';
     delete from student_generated_meals where user_id = '${id}';
     delete from student_week_plans where user_id = '${id}';
     delete from student_goals where user_id = '${id}';
     delete from plan_commitments where user_id = '${id}';
     delete from coach_clients where student_user_id = '${id}';
     delete from plan_versions where student_id = '${id}';
     delete from auth.users where id = '${id}';`,
  ).catch((e) => console.warn(`  ${id}: ${e.message}`));
}

const remaining = await sql(
  `select count(*) from auth.users where id in (${
    [...ids].map((i) => `'${i}'`).join(",")
  })`,
);
console.log(`auth.users restants: ${remaining.split("\n").slice(1).join("")}`);
