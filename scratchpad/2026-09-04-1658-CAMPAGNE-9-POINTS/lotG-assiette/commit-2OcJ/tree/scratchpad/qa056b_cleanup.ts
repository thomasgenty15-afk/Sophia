import { admin, cleanup } from "../docs/nutrition-pivot/qa-web/harness.ts";
const db = admin();
const files = ["qa056b_personas_fr-FR.json","qa056b_personas_B.json","qa056b_personas_C.json","qa056b_personas_D.json","qa056b_personas_E.json"];
let n = 0;
for (const f of files) {
  let raw: string;
  try { raw = await Deno.readTextFile(new URL(`./${f}`, import.meta.url)); } catch { continue; }
  for (const p of JSON.parse(raw)) {
    for (const t of ["student_weight_divergence_episodes","student_daily_recommendations","student_body_measures","student_generated_meals","student_goals","meal_precision_questions"]) {
      const r = await db.from(t).delete().eq("user_id", p.user_id);
      if (r.error) console.warn(`${t}: ${r.error.message}`);
    }
    await cleanup(p.user_id);
    await db.auth.admin.deleteUser(p.user_id).catch(() => {});
    n++;
  }
}
console.log(`${n} personas nettoyées`);
