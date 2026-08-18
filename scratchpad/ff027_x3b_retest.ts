// CONTRÔLE X3b — la préférence anti-féculents tient-elle SANS signal de faim ?
// Si le témoin échoue aussi, l'écart n'est pas de FF-027.
import { admin, callAs, type Coach, makeCoach, makeStudent, publishPlanFor } from "../docs/nutrition-pivot/qa-web/harness.ts";
const db = admin();
const DOCTRINE = {
  beliefs: [
    { claim: "Every meal is built on a protein anchor.", rationale: "it holds the day together" },
    { claim: "Vegetables are the volume of the plate, not the garnish.", rationale: null },
    { claim: "Whole starches over refined ones, every time.", rationale: null },
  ],
  forbidden: [], vocabulary: [], arbitrations: [],
  voice: { tone: "Direct, warm, never preachy." },
  foods: { recommended: [], discouraged: [] },
};
async function coachWithDoctrine(): Promise<Coach> {
  const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId, version: 1, ...DOCTRINE, content_locale: "en",
    published_at: new Date().toISOString(), published_by: coach.userId,
  } as never);
  if (error) throw error;
  return coach;
}
function todayParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function nextMonday(): string {
  const d = new Date(`${todayParis()}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 7);
  return d.toISOString().slice(0, 10);
}
const REFUSED = /\b(pasta|rice|bread|potato(es)?|spaghetti|baguette)\b/i;
const coach = await coachWithDoctrine();
const created: string[] = [];
for (const run of [0, 1, 2]) {
  const s = await makeStudent({ coach, fullName: `ff027x3b_${run}`, country: "FR", timezone: "Europe/Paris", locale: "en-US" });
  created.push(s.userId);
  await publishPlanFor(coach, s.userId);
  await db.from("student_goals").upsert({
    user_id: s.userId, goal: "fat_loss", situation: "I cook at home most nights.", content_locale: "en",
    practical_constraints: { food_preferences: [{ text: "I do not eat pasta, rice, bread or potatoes.", seen_at: todayParis() }] },
  } as never, { onConflict: "user_id" });
  await db.from("student_daily_checkins").insert([-1,-2,-4].map((k)=>{const d=new Date(`${todayParis()}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+k);return {user_id:s.userId,local_date:d.toISOString().slice(0,10),overall:"hard",axis:"hunger",source:"app"};}) as never);
  const res = await callAs(s, "generate-week-plan-v1", { local_date: nextMonday() });
  const { data } = await db.from("student_week_plans").select("items, generated_from").eq("user_id", s.userId).eq("week_start", nextMonday()).maybeSingle();
  const items = JSON.stringify((data as any)?.items ?? []);
  const hit = REFUSED.test(items);
  console.log(`run ${run}: HTTP ${res.status} · satiety=${((data as any)?.generated_from ?? {}).satiety_priority} days=${((data as any)?.generated_from ?? {}).hunger_days} · aliment refusé ${hit ? "PRÉSENT ❌" : "absent ✅"}`);
  if (hit) console.log("   ", (items.match(/[^"]*(pasta|rice|bread|potato)[^"]*/i) ?? [""])[0].slice(0, 200));
}
console.log("fixtures:", created.join(" "));
