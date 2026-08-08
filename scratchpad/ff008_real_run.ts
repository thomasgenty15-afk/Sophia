/**
 * FF-008 · LE POIDS ANNONCÉ — SUITE DE TESTS EN CONDITIONS RÉELLES.
 *
 * Vrai modèle, vraie base locale, vrais élèves provisionnés (plan publié +
 * engagements). Chaque verdict cite la LIGNE EN BASE, jamais la réponse HTTP.
 *
 * Quatre niveaux: easy (le cas nominal), medium (variantes/langues/limites),
 * hard (les modes de défaillance de §7), extra-hard (les croisements).
 *
 * Chaque cas est rejoué 3 fois: le dispatcher est stochastique (mesuré
 * `[0,3,3,0]` sur une phrase identique), et 1 échec sur 3 est un RED.
 */
import {
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";

const REPEATS = 3;

type Bio = { weight_kg?: number; waist_cm?: number; source?: string; measured_at?: string };

async function readBio(userId: string): Promise<Array<{ week: string; bio: Bio }>> {
  const { data } = await admin()
    .from("weekly_reviews")
    .select("week_start_date, biofeedback")
    .eq("user_id", userId)
    .order("week_start_date", { ascending: true });
  return ((data ?? []) as Array<{ week_start_date: string; biofeedback: Bio }>)
    .map((r) => ({ week: String(r.week_start_date), bio: (r.biofeedback ?? {}) as Bio }));
}

async function clearWeeks(userId: string): Promise<void> {
  await sql(`delete from weekly_reviews where user_id='${userId}'`);
}

async function countProtocolEvents(userId: string): Promise<number> {
  const { count } = await admin()
    .from("protocol_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

const results: Array<{
  level: string;
  id: string;
  scenario: string;
  verdict: string;
  proof: string;
}> = [];

function record(
  level: string,
  id: string,
  scenario: string,
  verdict: string,
  proof: string,
) {
  results.push({ level, id, scenario, verdict, proof });
  const tag = verdict === "GREEN" ? "\x1b[32mGREEN\x1b[0m" : verdict === "RED" ? "\x1b[31mRED\x1b[0m" : verdict;
  console.log(`[${level}] ${id} ${tag} — ${scenario}\n      ${proof}\n`);
}

/** Rejoue `text` n fois sur une ardoise vierge; rend ce que la BASE porte. */
async function replay(
  userId: string,
  student: Parameters<typeof turn>[0],
  text: string,
  n = REPEATS,
): Promise<Array<{ reply: string | null; rows: Array<{ week: string; bio: Bio }>; owner: unknown }>> {
  const out = [];
  for (let i = 0; i < n; i++) {
    await clearWeeks(userId);
    const r = await turn(student, text);
    out.push({
      reply: r.reply,
      rows: await readBio(userId),
      owner: (r.replyMetadata ?? {})["response_owner"] ?? null,
    });
  }
  return out;
}

function weights(runs: Array<{ rows: Array<{ week: string; bio: Bio }> }>): Array<number | null> {
  return runs.map((r) => r.rows[0]?.bio?.weight_kg ?? null);
}
function waists(runs: Array<{ rows: Array<{ week: string; bio: Bio }> }>): Array<number | null> {
  return runs.map((r) => r.rows[0]?.bio?.waist_cm ?? null);
}
function allEqual<T>(xs: T[], v: T): boolean {
  return xs.length > 0 && xs.every((x) => x === v);
}
/** Un chiffre visible dans la réponse — la garde R8. */
function hasDigit(s: string | null): boolean {
  return /\d/.test(String(s ?? ""));
}

// ───────────────────────────────────────────────────────────────────────────
// PROVISIONNEMENT — plafond 3 élèves par coach, donc deux coachs.
// ───────────────────────────────────────────────────────────────────────────
console.log("=== provisionnement ===");
const coachA = await makeCoach({ displayName: "ff008 coach A" });
const coachB = await makeCoach({ displayName: "ff008 coach B" });

async function student(
  coach: typeof coachA,
  opts: { locale: string; country: string; tz: string; name: string; birth?: string },
) {
  const s = await makeStudent({
    coach,
    locale: opts.locale,
    timezone: opts.tz,
    country: opts.country,
    fullName: opts.name,
  });
  await publishPlanFor(coach, s.userId, {
    timezone: opts.tz,
    contentLocale: opts.locale,
  });
  if (opts.birth) {
    await sql(
      `update profiles set birth_date='${opts.birth}' where id='${s.userId}'`,
    );
  }
  return s;
}

const sFR = await student(coachA, {
  locale: "fr-FR", country: "FR", tz: "Europe/Paris", name: "ff008 fr",
});
const sEN = await student(coachA, {
  locale: "en-US", country: "GB", tz: "Europe/London", name: "ff008 en",
});
const sMinor = await student(coachA, {
  locale: "fr-FR", country: "FR", tz: "Europe/Paris", name: "ff008 minor",
  birth: "2012-05-01",
});
const sGuard = await student(coachB, {
  locale: "fr-FR", country: "FR", tz: "Europe/Paris", name: "ff008 guard",
});
const sMixed = await student(coachB, {
  locale: "fr-FR", country: "FR", tz: "Europe/Paris", name: "ff008 mixed",
});
const sImp = await student(coachB, {
  locale: "en-US", country: "US", tz: "America/New_York", name: "ff008 imperial",
});
await sql(
  `update profiles set display_unit_system='imperial' where id='${sImp.userId}'`,
);

console.log("fr:", sFR.userId, "\nen:", sEN.userId, "\nminor:", sMinor.userId);
console.log("guard:", sGuard.userId, "\nmixed:", sMixed.userId, "\nimp:", sImp.userId);

// ───────────────────────────────────────────────────────────────────────────
// EASY — le cas nominal de la fiche
// ───────────────────────────────────────────────────────────────────────────
console.log("\n=== EASY ===");
{
  const runs = await replay(sFR.userId, sFR, "je suis à 78 kg");
  const w = weights(runs);
  record(
    "easy", "E1", "FR « je suis à 78 kg » ×3",
    allEqual(w, 78) ? "GREEN" : "RED",
    `biofeedback.weight_kg = ${JSON.stringify(w)} ; source=${JSON.stringify(runs.map((r) => r.rows[0]?.bio?.source ?? null))} ; réponse[0]=${JSON.stringify(runs[0].reply)}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// MEDIUM — variantes, langues, données limites
// ───────────────────────────────────────────────────────────────────────────
console.log("\n=== MEDIUM ===");
{
  const runs = await replay(sEN.userId, sEN, "I'm at 172 lbs this morning");
  const w = weights(runs);
  record(
    "medium", "M1", "EN « I'm at 172 lbs this morning » ×3 → converti",
    allEqual(w, 78) ? "GREEN" : "RED",
    `172 lb × 0.45359237 = 78.0 kg attendu ; lu ${JSON.stringify(w)}`,
  );
}
{
  const runs = await replay(sFR.userId, sFR, "je suis à 78,4 kg");
  const w = weights(runs);
  record(
    "medium", "M2", "FR décimale à la virgule « 78,4 kg » ×3",
    allEqual(w, 78.4) ? "GREEN" : "RED",
    `weight_kg = ${JSON.stringify(w)}`,
  );
}
{
  const runs = await replay(sFR.userId, sFR, "mon tour de taille est de 92 cm");
  const wa = waists(runs);
  const w = weights(runs);
  record(
    "medium", "M3", "FR tour de taille « 92 cm » ×3 → colonne waist",
    allEqual(wa, 92) && allEqual(w, undefined as unknown as number | null) === false && w.every((x) => x === null || x === undefined) ? "GREEN" : "RED",
    `waist_cm = ${JSON.stringify(wa)} ; weight_kg = ${JSON.stringify(w)} (doit rester vide)`,
  );
}
{
  // La CORRECTION. Deux tours, une seule ligne de semaine: remplacement.
  await clearWeeks(sFR.userId);
  const r1 = await turn(sFR, "je suis à 87 kg");
  const after1 = await readBio(sFR.userId);
  const r2 = await turn(sFR, "pardon, je suis à 78 kg");
  const after2 = await readBio(sFR.userId);
  const ok = after1[0]?.bio?.weight_kg === 87 && after2.length === 1 &&
    after2[0]?.bio?.weight_kg === 78;
  record(
    "medium", "M4", "FR correction en deux tours → REMPLACE, n'ajoute pas",
    ok ? "GREEN" : "RED",
    `après t1: ${JSON.stringify(after1)} ; après t2: ${JSON.stringify(after2)} (1 seule ligne attendue, 78)`,
  );
}
{
  // Profil IMPÉRIAL, nombre SANS unité: le défaut du profil tranche (R6).
  const runs = await replay(sImp.userId, sImp, "I'm at 172 this morning");
  const w = weights(runs);
  record(
    "medium", "M5", "EN profil impérial, « 172 » sans unité → lb par défaut (R6)",
    allEqual(w, 78) ? "GREEN" : "RED",
    `défaut profil = lb ⇒ 78.0 kg attendu ; lu ${JSON.stringify(w)}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// HARD — les modes de défaillance de §7
// ───────────────────────────────────────────────────────────────────────────
console.log("\n=== HARD ===");
const hardCases: Array<{ id: string; who: "fr" | "en"; text: string; why: string }> = [
  { id: "H1", who: "fr", text: "je veux atteindre 75 kg", why: "CIBLE (R4)" },
  { id: "H1en", who: "en", text: "I want to get down to 75 kg", why: "CIBLE (R4) en anglais" },
  { id: "H2", who: "fr", text: "j'ai perdu 2 kg cette semaine", why: "VARIATION (R3)" },
  { id: "H2en", who: "en", text: "I lost 2 kg this week", why: "VARIATION (R3) en anglais" },
  { id: "H3", who: "fr", text: "ma fille fait 32 kg", why: "TIERS" },
  { id: "H3en", who: "en", text: "my daughter weighs 32 kg", why: "TIERS en anglais" },
  { id: "H4", who: "fr", text: "165", why: "AMBIGU sans unité (R6)" },
  { id: "H5", who: "fr", text: "je suis à 400 kg", why: "HORS BORNES (R5)" },
  { id: "H5en", who: "en", text: "I'm at 400 kg", why: "HORS BORNES (R5) en anglais" },
  { id: "H6", who: "fr", text: "je fais entre 78 et 79 kg", why: "PLAGE" },
  { id: "H6en", who: "en", text: "I'm between 78 and 79 kg", why: "PLAGE en anglais" },
];
for (const c of hardCases) {
  const s = c.who === "fr" ? sFR : sEN;
  const runs = await replay(s.userId, s, c.text);
  const w = weights(runs);
  const wa = waists(runs);
  const nothing = runs.every((r) => r.rows.length === 0 ||
    (r.rows[0]?.bio?.weight_kg === undefined && r.rows[0]?.bio?.waist_cm === undefined));
  record(
    "hard", c.id, `${c.who.toUpperCase()} « ${c.text} » → RIEN (${c.why})`,
    nothing ? "GREEN" : "RED",
    `lignes: ${JSON.stringify(runs.map((r) => r.rows))} ; weight=${JSON.stringify(w)} waist=${JSON.stringify(wa)}`,
  );
  if (c.id === "H2") {
    record(
      "hard", "H2-relance", "FR variation → l'agent demande le chiffre absolu UNE fois (R3)",
      "MANUEL",
      `réponses: ${JSON.stringify(runs.map((r) => r.reply))}`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// EXTRA-HARD — les croisements
// ───────────────────────────────────────────────────────────────────────────
console.log("\n=== EXTRA-HARD ===");

// X1 — LE TEST QUI FAIT LE LOT. Une série de poids qui franchit le seuil de
// perte rapide, dont le DERNIER vient du chat → restriction_guard lève le
// plancher SUR LE CHEMIN RÉEL.
{
  await clearWeeks(sGuard.userId);
  // W-2 = 80 kg (le point du dimanche). W0 = 77,8 dit dans le chat.
  // (80-77.8)/80*100/2 = 1,375 %/sem > 1,2 ⇒ levée attendue.
  const today = (await sql(`select current_date`)).split("\n")[1].trim();
  const monday = new Date(today + "T00:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const w0 = monday.toISOString().slice(0, 10);
  const wm2 = new Date(monday);
  wm2.setUTCDate(wm2.getUTCDate() - 14);
  const wm2s = wm2.toISOString().slice(0, 10);
  await sql(
    `insert into weekly_reviews (user_id, week_start_date, plan_version_id, biofeedback, content_locale)
     values ('${sGuard.userId}', '${wm2s}', null,
             '{"weight_kg": 80, "source": "weekly_form"}'::jsonb, 'fr-FR')`,
  );
  console.log(`   [X1] semaines: ${wm2s} (80 kg, dimanche) → ${w0} (chat)`);
  const r = await turn(sGuard, "je suis à 77,8 kg ce matin");
  const rows = await readBio(sGuard.userId);
  const owner = (r.replyMetadata ?? {})["response_owner"] ?? null;
  const written = rows.find((x) => x.week === w0)?.bio?.weight_kg;
  record(
    "extra-hard", "X1",
    "Poids du CHAT qui franchit le seuil → la ceinture lève le plancher CE TOUR",
    written === 77.8 && owner === "disordered_eating_guard" ? "GREEN" : "RED",
    `semaines en base: ${JSON.stringify(rows)} ; response_owner=${JSON.stringify(owner)} ; réponse=${JSON.stringify(r.reply)}`,
  );

  // X2 — SOUS PLANCHER LEVÉ, l'élève écrit son poids: écrit en base, réponse
  // SANS chiffre, sans progression, sans relance (R8).
  const r2 = await turn(sGuard, "je suis à 77,5 kg");
  const rows2 = await readBio(sGuard.userId);
  const w2 = rows2.find((x) => x.week === w0)?.bio?.weight_kg;
  const owner2 = (r2.replyMetadata ?? {})["response_owner"] ?? null;
  record(
    "extra-hard", "X2",
    "Sous plancher levé: la mesure s'écrit, la RESTITUTION se tait (R8)",
    w2 === 77.5 && !hasDigit(r2.reply) ? "GREEN" : "RED",
    `weight_kg relu = ${w2} ; response_owner=${JSON.stringify(owner2)} ; chiffre dans la réponse = ${hasDigit(r2.reply)} ; réponse=${JSON.stringify(r2.reply)}`,
  );
}

// X3 — ÉLÈVE MINEUR: aucune mesure depuis le chat, aucune mention.
{
  const runs = await replay(sMinor.userId, sMinor, "je suis à 78 kg");
  const nothing = runs.every((r) => r.rows.length === 0 ||
    r.rows[0]?.bio?.weight_kg === undefined);
  record(
    "extra-hard", "X3", "Élève MINEUR → aucune mesure enregistrée depuis le chat",
    nothing ? "GREEN" : "RED",
    `lignes: ${JSON.stringify(runs.map((r) => r.rows))} ; réponses: ${JSON.stringify(runs.map((r) => r.reply))}`,
  );
}

// X4 — POIDS + REPAS DÉCLARÉ dans la même phrase: les deux planchers
// coexistent sans se voler le tour.
{
  await clearWeeks(sMixed.userId);
  await sql(`delete from protocol_events where user_id='${sMixed.userId}'`);
  const before = await countProtocolEvents(sMixed.userId);
  const r = await turn(sMixed, "j'ai mangé du poulet à midi et je suis à 78 kg");
  const rows = await readBio(sMixed.userId);
  const after = await countProtocolEvents(sMixed.userId);
  const w = rows[0]?.bio?.weight_kg;
  record(
    "extra-hard", "X4",
    "Poids + repas déclaré dans la MÊME phrase → les deux planchers coexistent",
    w === 78 && after > before ? "GREEN" : "RED",
    `weight_kg = ${w} ; protocol_events ${before} → ${after} ; réponse=${JSON.stringify(r.reply)}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n=== SYNTHÈSE ===");
for (const r of results) {
  console.log(`${r.verdict.padEnd(7)} [${r.level.padEnd(10)}] ${r.id.padEnd(12)} ${r.scenario}`);
}
const reds = results.filter((r) => r.verdict === "RED");
console.log(`\n${results.length} cas — ${results.filter((r) => r.verdict === "GREEN").length} GREEN, ${reds.length} RED, ${results.filter((r) => r.verdict === "MANUEL").length} à juger.`);

await Deno.writeTextFile(
  "scratchpad/ff008-results.json",
  JSON.stringify(results, null, 2),
);

console.log("\n=== nettoyage ===");
for (const s of [sFR, sEN, sMinor, sGuard, sMixed, sImp]) await cleanup(s.userId);
await cleanup(coachA.userId);
await cleanup(coachB.userId);
console.log("nettoyé.");
