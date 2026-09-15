/**
 * PURGE DU RUN AVORTÉ. La première exécution de `ffx_fixture.ts` a échoué APRÈS
 * avoir créé coach, élève, foyer et plan (la colonne `plan_version_id` n'existe
 * pas sur `protocol_events`). Ces comptes n'étaient dans aucun fichier de
 * résultats: ils se retrouvent par le foyer resté en base.
 */
import { sql } from "../docs/nutrition-pivot/qa-web/harness.ts";
const HOUSEHOLD = "f3663735-6c38-4560-9ead-5c4a26d795c5";
const IDS = [
  "1c984c5e-f217-4c0f-b202-4c70dfa992e5",
  "c3210d5e-0634-4f9e-a499-11fce16ac447",
  "b376cd61-d41e-4569-9f32-b1fddc986bbd",
  "d572e315-f8fe-4503-853a-03c366a64c98",
  "157d434d-9009-4548-9d58-55495051465a",
  "24f6e1da-4739-4384-a2e5-b29ab80de7b3",
  "56a07955-f657-4a27-89db-f58fe16bc1ea",
];
await sql(`delete from student_generated_meals where household_id = '${HOUSEHOLD}';
           delete from household_food_restrictions where household_id = '${HOUSEHOLD}';
           delete from household_members where household_id = '${HOUSEHOLD}';
           delete from households where id = '${HOUSEHOLD}';`);
for (const id of IDS) {
  await sql(
    `delete from weekly_reviews where user_id = '${id}';
     delete from protocol_events where user_id = '${id}';
     delete from student_hunger_reports where user_id = '${id}';
     delete from meal_precision_questions where user_id = '${id}';
     delete from chat_messages where user_id = '${id}';
     delete from inbound_dedup where user_id = '${id}';
     delete from user_chat_states where user_id = '${id}';
     delete from student_generated_meals where user_id = '${id}';
     delete from student_week_plans where user_id = '${id}';
     delete from student_goals where user_id = '${id}';
     delete from plan_commitments where user_id = '${id}';
     delete from coach_clients where student_user_id = '${id}';
     delete from plan_versions where student_id = '${id}';
     delete from auth.users where id = '${id}';`,
  ).catch((e) => console.warn(`${id}: ${e.message}`));
}
console.log(await sql(`select count(*) from auth.users where id in (${IDS.map((i)=>`'${i}'`).join(",")})`));
