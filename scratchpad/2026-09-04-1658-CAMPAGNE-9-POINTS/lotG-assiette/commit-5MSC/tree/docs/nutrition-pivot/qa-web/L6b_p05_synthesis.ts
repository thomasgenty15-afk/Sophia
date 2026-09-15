/**
 * AGENT-16 P0-5, tranché : un élève ACTIF apparaît-il « 0 of 7 days » ?
 *
 * La première tentative n'était pas concluante: l'élève avait des faits mais
 * aucun message, et ses faits tombaient hors de la fenêtre de la synthèse.
 * Ici, l'élève a les deux, DANS la fenêtre.
 */
import { ANON, URL_BASE, admin, makeCoach, makeStudent, publishPlanFor, rows } from "./harness.ts";

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
await admin().from("coach_doctrines").insert({
  coach_id: coach.coachId, version: 1,
  beliefs: [{ claim: "Every meal is built on a protein anchor.", rationale: null }],
  forbidden: [], vocabulary: [], arbitrations: [], voice: {},
  foods: { recommended: [], discouraged: [] },
  content_locale: "en", published_at: new Date().toISOString(), published_by: coach.userId,
} as never);
const s = await makeStudent({ coach, timezone: "Europe/London", country: "GB", fullName: "Active Alice" });
await publishPlanFor(coach, s.userId, { timezone: "Europe/London" });

// LA FENÊTRE de la synthèse du lundi = la semaine PRÉCÉDENTE. On date donc les
// faits dedans, plutôt que sur aujourd'hui — c'est ce que la première
// tentative avait raté.
const now = new Date();
const dow = (now.getUTCDay() + 6) % 7;               // lundi = 0
const thisMonday = new Date(now.getTime() - dow * 86400_000);
const lastMonday = new Date(thisMonday.getTime() - 7 * 86400_000);
const dayIn = (i: number) => new Date(lastMonday.getTime() + i * 86400_000);
const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);

console.log(`fenêtre visée: ${ymd(lastMonday)} → ${ymd(new Date(lastMonday.getTime() + 6 * 86400_000))}`);

const db = admin();
// SIX jours actifs sur sept: un élève exemplaire.
const EVENTS_PER_DAY = Number(Deno.args[0] ?? 1);
console.log(`faits par jour: ${EVENTS_PER_DAY} (seuil LOGGED_DAY_MIN_EVENTS = 2)`);
for (let i = 0; i < 6; i += 1) {
  for (let k = 0; k < EVENTS_PER_DAY; k += 1) {
    await db.from("protocol_events").insert({
      user_id: s.userId, occurred_at: iso(new Date(dayIn(i).getTime() + k * 3600_000)),
      local_date: ymd(dayIn(i)),
      source: "chat", food_group_ref: k === 0 ? "lean_protein" : "non_starchy_veg",
      portion_band: "moderate", content_locale: "en-GB", recognized: {},
    } as never);
  }
  await db.from("student_daily_checkins").insert({
    user_id: s.userId, local_date: ymd(dayIn(i)),
    overall: i % 3 === 0 ? "hard" : "good", axis: i % 3 === 0 ? "sleep" : null, source: "chat",
  } as never);
  await db.from("chat_messages").insert({
    user_id: s.userId, scope: "app", role: "user",
    content: `day ${i} report`, created_at: iso(dayIn(i)),
    metadata: { channel: "in_app" },
  } as never);
}
console.log(`faits: ${JSON.stringify(await rows(`select count(*)::text from protocol_events where user_id='${s.userId}'`))}`);
console.log(`checkins: ${JSON.stringify(await rows(`select count(*)::text from student_daily_checkins where user_id='${s.userId}'`))}`);
console.log(`messages: ${JSON.stringify(await rows(`select count(*)::text from chat_messages where user_id='${s.userId}'`))}`);

const res = await fetch(`${URL_BASE}/functions/v1/coach-synthesis-v1`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json", apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    "x-internal-secret": (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim(),
  },
  body: JSON.stringify({ now: new Date(Date.now() + 60_000).toISOString(), limit: 800 }),
});
console.log(`cron → ${JSON.stringify(await res.json()).slice(0, 200)}`);

const synth = await rows(
  `select left(row_to_json(t)::text, 2000) from (select period_start, period_end, metrics, flagged_students, narrative from coach_syntheses where coach_id='${coach.coachId}' order by created_at desc limit 1) t`,
);
console.log(`\nSYNTHÈSE:\n${synth[0] ?? "<aucune>"}`);
