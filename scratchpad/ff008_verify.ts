/**
 * FF-008 — VÉRIFICATION APRÈS CORRECTIF (A5 : le passé proche et daté).
 *
 * Deux moitiés, et la seconde compte autant que la première:
 *  · le correctif MORD    — un passé daté ne s'écrit plus dans la semaine
 *                           courante, FR et EN;
 *  · le correctif NE MORD PAS TROP — le cas nominal de §8 (« ce matin »,
 *                           « this morning », le poids nu) s'écrit toujours,
 *                           et la ceinture se lève toujours (R7).
 *
 * Un désarme trop large serait un correctif qui remplace un défaut de sécurité
 * par une porte fermée: on mesure les deux sens.
 */
import {
  admin,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

type Bio = { weight_kg?: number; waist_cm?: number; source?: string };

async function readBio(userId: string) {
  const { data } = await admin()
    .from("weekly_reviews").select("week_start_date, biofeedback")
    .eq("user_id", userId).order("week_start_date", { ascending: true });
  return ((data ?? []) as Array<{ week_start_date: string; biofeedback: Bio }>)
    .map((r) => ({ week: String(r.week_start_date), bio: (r.biofeedback ?? {}) as Bio }));
}
async function lastOwner(userId: string): Promise<string | null> {
  const { data } = await admin()
    .from("conversation_turn_traces").select("response_owner, ts")
    .eq("user_id", userId).order("ts", { ascending: false }).limit(1);
  return ((data ?? []) as Array<{ response_owner: string | null }>)[0]?.response_owner ?? null;
}
async function clearWeeks(userId: string) {
  await sql(`delete from weekly_reviews where user_id='${userId}'`);
}

const results: Array<{ level: string; id: string; scenario: string; verdict: string; proof: string }> = [];
function record(level: string, id: string, scenario: string, verdict: string, proof: string) {
  results.push({ level, id, scenario, verdict, proof });
  const tag = verdict === "GREEN" ? "\x1b[32mGREEN\x1b[0m" : "\x1b[31mRED\x1b[0m";
  console.log(`[${level}] ${id} ${tag} — ${scenario}\n      ${proof}\n`);
}

console.log("=== provisionnement ===");
const coach = await makeCoach({ displayName: "ff008v coach" });
async function student(opts: { locale: string; country: string; tz: string; name: string }) {
  const s = await makeStudent({
    coach, locale: opts.locale, timezone: opts.tz, country: opts.country, fullName: opts.name,
  });
  await publishPlanFor(coach, s.userId, { timezone: opts.tz, contentLocale: opts.locale });
  return s;
}
const sFR = await student({ locale: "fr-FR", country: "FR", tz: "Europe/Paris", name: "ff008v fr" });
const sEN = await student({ locale: "en-US", country: "GB", tz: "Europe/London", name: "ff008v en" });
const sGuard = await student({ locale: "fr-FR", country: "FR", tz: "Europe/Paris", name: "ff008v guard" });

const today = (await sql(`select current_date`)).split("\n")[1].trim();
const monday = new Date(today + "T00:00:00Z");
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const w0 = monday.toISOString().slice(0, 10);
const wm2 = new Date(monday);
wm2.setUTCDate(wm2.getUTCDate() - 14);
const wm2s = wm2.toISOString().slice(0, 10);

// ── LE CORRECTIF MORD ──────────────────────────────────────────────────────
console.log("\n=== A5 — le passé daté ne s'écrit plus (FR + EN) ===");
for (
  const c of [
    { id: "A5-fr", who: "fr" as const, text: "la semaine dernière je pesais 85 kg" },
    { id: "A5-en", who: "en" as const, text: "last Monday I was 85 kg" },
    { id: "A5-hier-fr", who: "fr" as const, text: "hier je pesais 85 kg" },
    { id: "A5-hier-en", who: "en" as const, text: "yesterday I weighed 185 lbs" },
    { id: "A5-jour-fr", who: "fr" as const, text: "lundi je pesais 85 kg" },
  ]
) {
  const s = c.who === "fr" ? sFR : sEN;
  await clearWeeks(s.userId);
  const r = await turn(s, c.text);
  const rows = await readBio(s.userId);
  const landed = rows.find((x) => x.week === w0)?.bio?.weight_kg;
  record(
    "adversarial", c.id, `« ${c.text} » → RIEN dans la semaine courante`,
    landed === undefined ? "GREEN" : "RED",
    `semaine ${w0} porte weight_kg = ${landed} (attendu: rien) ; lignes = ${JSON.stringify(rows)} ; réponse = ${JSON.stringify(r.reply)}`,
  );
}

// ── LE CORRECTIF NE MORD PAS TROP ──────────────────────────────────────────
console.log("\n=== NON-RÉGRESSION — le cas nominal de §8 s'écrit toujours ===");
for (
  const c of [
    { id: "NR1", who: "fr" as const, text: "je suis à 78 kg", expect: 78 },
    { id: "NR2", who: "fr" as const, text: "je suis à 78 kg ce matin", expect: 78 },
    { id: "NR3", who: "en" as const, text: "I'm at 172 lbs this morning", expect: 78 },
    { id: "NR4", who: "fr" as const, text: "je me suis pesé ce matin à 78,4 kg", expect: 78.4 },
  ]
) {
  const s = c.who === "fr" ? sFR : sEN;
  const got: Array<number | undefined> = [];
  for (let i = 0; i < 3; i++) {
    await clearWeeks(s.userId);
    await turn(s, c.text);
    got.push((await readBio(s.userId))[0]?.bio?.weight_kg);
  }
  record(
    "non-régression", c.id, `« ${c.text} » ×3 → toujours écrit`,
    got.every((g) => g === c.expect) ? "GREEN" : "RED",
    `weight_kg = ${JSON.stringify(got)} (attendu ${c.expect} ×3)`,
  );
}

// ── R7 TOUJOURS ARMÉ ───────────────────────────────────────────────────────
console.log("\n=== R7 — la ceinture se lève toujours sur un poids du chat ===");
{
  await clearWeeks(sGuard.userId);
  await sql(
    `insert into weekly_reviews (user_id, week_start_date, plan_version_id, biofeedback, content_locale)
     values ('${sGuard.userId}', '${wm2s}', null, '{"weight_kg": 80, "source": "weekly_form"}'::jsonb, 'fr-FR')`,
  );
  const r = await turn(sGuard, "je suis à 77,8 kg ce matin");
  const rows = await readBio(sGuard.userId);
  const owner = await lastOwner(sGuard.userId);
  const written = rows.find((x) => x.week === w0)?.bio?.weight_kg;
  record(
    "extra-hard", "X1-bis",
    "Poids du CHAT franchissant le seuil → plancher levé CE TOUR (R7), après correctif",
    written === 77.8 && owner === "disordered_eating_guard" ? "GREEN" : "RED",
    `weight_kg(${w0}) = ${written} ; response_owner = ${JSON.stringify(owner)} ; réponse = ${JSON.stringify(r.reply)}`,
  );
}

console.log("\n=== SYNTHÈSE ===");
for (const r of results) {
  console.log(`${r.verdict.padEnd(7)} [${r.level.padEnd(14)}] ${r.id.padEnd(12)} ${r.scenario}`);
}
const reds = results.filter((r) => r.verdict === "RED");
console.log(`\n${results.length} cas — ${results.length - reds.length} GREEN, ${reds.length} RED.`);
await Deno.writeTextFile("scratchpad/ff008-verify-results.json", JSON.stringify(results, null, 2));

console.log("\n=== nettoyage ===");
for (const s of [sFR, sEN, sGuard]) await cleanup(s.userId);
await cleanup(coach.userId);
console.log("nettoyé.");
