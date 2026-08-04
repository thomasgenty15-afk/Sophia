/**
 * L6 — LES ÉCRANS COACH: tenancy, et chaque chiffre recalculable en SQL.
 *
 * La tenancy se prouve SOUS L'IDENTITÉ de chaque coach (JWT, donc RLS armée),
 * jamais en service_role — une vue interrogée en service_role ne prouve rien.
 */
import { ANON, URL_BASE, admin, makeCoach, makeStudent, publishPlanFor, rows, scalar, type Coach } from "./harness.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

function asCoach(coach: Coach) {
  return createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${coach.accessToken}` } },
  });
}

// ── Deux coachs, un élève chacun ────────────────────────────────────────────
const coachA = await makeCoach({ displayName: "Alpha", country: "GB" });
const coachB = await makeCoach({ displayName: "Beta", country: "FR" });
const studentA = await makeStudent({ coach: coachA, timezone: "Europe/London", country: "GB", fullName: "Anna Alpha" });
const studentB = await makeStudent({ coach: coachB, timezone: "Europe/Paris", country: "FR", fullName: "Bruno Beta" });
await publishPlanFor(coachA, studentA.userId, { timezone: "Europe/London" });
await publishPlanFor(coachB, studentB.userId, { timezone: "Europe/Paris" });

say(`coachA=${coachA.coachId} élèveA=${studentA.userId}`);
say(`coachB=${coachB.coachId} élèveB=${studentB.userId}`);

// ── Un historique CONNU pour l'élève A ──────────────────────────────────────
// 4 jours actifs sur 7, 3 photos dont 1 disqualifiée, 2 checkins.
const db = admin();
const today = new Date();
const day = (offset: number) =>
  new Date(today.getTime() - offset * 86400_000).toISOString().slice(0, 10);
const ts = (offset: number) =>
  new Date(today.getTime() - offset * 86400_000).toISOString();

const planVersionId = (await rows(
  `select id from plan_versions where student_id='${studentA.userId}' limit 1`,
))[0];

const events = [
  { d: 0, photo: true, disq: null, fg: "lean_protein", band: "moderate" },
  { d: 0, photo: false, disq: null, fg: "non_starchy_veg", band: "small" },
  { d: 1, photo: true, disq: null, fg: "lean_protein", band: "large" },
  { d: 2, photo: true, disq: "not_food", fg: null, band: null },
  { d: 4, photo: false, disq: null, fg: "whole_grain", band: "moderate" },
];
for (const e of events) {
  const { error } = await db.from("protocol_events").insert({
    user_id: studentA.userId,
    occurred_at: ts(e.d),
    local_date: day(e.d),
    source: e.photo ? "photo" : "text",
    food_group_ref: e.fg,
    portion_band: e.band,
    disqualified_reason: e.disq,
    media_path: e.photo ? `qa/${e.d}.jpg` : null,
    content_locale: "en-GB",
    recognized: {},
  } as never);
  if (error) say(`  [warn] protocol_events: ${error.message}`);
}
for (const [d, overall] of [[0, "good"], [1, "hard"]] as const) {
  const { error } = await db.from("student_daily_checkins").insert({
    user_id: studentA.userId,
    local_date: day(d),
    overall,
    axis: overall === "hard" ? "sleep" : null,
    source: "chat",
  } as never);
  if (error) say(`  [warn] checkins: ${error.message}`);
}

// ── 1. TENANCY: chaque coach ne voit QUE ses élèves ─────────────────────────
say(`\n${"█".repeat(74)}\n1 — TENANCY (sous le JWT de chaque coach)\n${"█".repeat(74)}`);
for (const [label, coach, mine, theirs] of [
  ["coach A", coachA, studentA.userId, studentB.userId],
  ["coach B", coachB, studentB.userId, studentA.userId],
] as const) {
  const client = asCoach(coach);
  for (const view of ["coach_student_directory", "coach_student_events"]) {
    const { data, error } = await client.from(view).select("*");
    const ids = new Set(
      ((data ?? []) as Array<Record<string, unknown>>).map((r) =>
        String(r.id ?? r.student_user_id ?? r.student_id ?? r.user_id ?? "")
      ),
    );
    say(
      `  ${label} · ${view.padEnd(24)} → ${error ? `ERREUR ${error.message}` : `${ids.size} élève(s)`} ` +
        `${ids.has(mine) ? "✅ voit le sien" : "🔴 ne voit PAS le sien"} ` +
        `${ids.has(theirs) ? "🔴 VOIT CELUI DE L'AUTRE" : "✅ ne voit pas l'autre"}`,
    );
  }
  const { data: rpc } = await client.rpc("coached_student_ids");
  const list = (Array.isArray(rpc) ? rpc : []).map(String);
  say(`  ${label} · coached_student_ids() → ${JSON.stringify(list)} ${
    list.includes(mine) && !list.includes(theirs) ? "✅" : "🔴"
  }`);
}

// ── 2. LES CHIFFRES, RECALCULÉS EN SQL ──────────────────────────────────────
say(`\n${"█".repeat(74)}\n2 — LES CHIFFRES DE LA FICHE, RECALCULÉS\n${"█".repeat(74)}`);
const truth = {
  joursActifs: await scalar(
    `select count(distinct local_date) from protocol_events where user_id='${studentA.userId}' and disqualified_reason is null and local_date > current_date - 7`,
  ),
  photosComptees: await scalar(
    `select count(*) from protocol_events where user_id='${studentA.userId}' and media_path is not null and disqualified_reason is null`,
  ),
  photosDisqualifiees: await scalar(
    `select count(*) from protocol_events where user_id='${studentA.userId}' and media_path is not null and disqualified_reason is not null`,
  ),
  checkins: await scalar(`select count(*) from student_daily_checkins where user_id='${studentA.userId}'`),
};
say(`  VÉRITÉ SQL : ${JSON.stringify(truth)}`);
say(`  distribution des portions : ${JSON.stringify(await rows(
  `select coalesce(portion_band,'<null>') || '=' || count(*)::text as v from protocol_events where user_id='${studentA.userId}' and disqualified_reason is null group by portion_band order by 1`,
))}`);

const clientA = asCoach(coachA);
const { data: dir } = await clientA.from("coach_student_directory").select("*").eq("id", studentA.userId);
say(`\n  coach_student_directory (ligne de l'élève A) :`);
say(`  ${JSON.stringify((dir ?? [])[0] ?? null)}`);

const { data: evts } = await clientA.from("coach_student_events").select("*");
const evRows = (evts ?? []) as Array<Record<string, unknown>>;
say(`\n  coach_student_events → ${evRows.length} ligne(s)`);
say(`  colonnes : ${JSON.stringify(Object.keys(evRows[0] ?? {}))}`);
const disqualifiedVisible = evRows.filter((r) => r.disqualified_reason !== null && r.disqualified_reason !== undefined).length;
say(`  dont disqualifiées visibles : ${disqualifiedVisible}`);
say(`  🔎 les photos disqualifiées ne doivent pas COMPTER dans l'activité: ` +
  `${evRows.length === truth.photosComptees + 2 ? "à vérifier écran" : `${evRows.length} lignes vs ${truth.photosComptees} photos comptées`}`);

// ── 3. LA SYNTHÈSE DU LUNDI ─────────────────────────────────────────────────
say(`\n${"█".repeat(74)}\n3 — SYNTHÈSE COACH (P0-5: « 0 of 7 days » pour un élève actif)\n${"█".repeat(74)}`);
const res = await fetch(`${URL_BASE}/functions/v1/coach-synthesis-v1`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    "x-internal-secret": (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim(),
  },
  body: JSON.stringify({ now: new Date(Date.now() + 60_000).toISOString(), limit: 500 }),
});
say(`  cron → ${JSON.stringify(await res.json()).slice(0, 240)}`);
const synth = await rows(
  `select left(row_to_json(t)::text, 1500) from (select * from coach_syntheses where coach_id='${coachA.coachId}' order by created_at desc limit 1) t`,
);
say(`  synthèse du coach A :\n  ${(synth[0] ?? "<aucune>").slice(0, 1400)}`);

// ── 4. LE JOURNAL D'ACCÈS ───────────────────────────────────────────────────
say(`\n${"█".repeat(74)}\n4 — log_coach_student_access\n${"█".repeat(74)}`);
const { data: logged, error: logErr } = await clientA.rpc("log_coach_student_access", {
  p_student_id: studentA.userId,
});
say(`  appel → ${logErr ? `ERREUR ${logErr.message}` : JSON.stringify(logged)}`);
say(`  lignes : ${JSON.stringify(await rows(
  `select coach_id::text || ' → ' || student_user_id::text from coach_student_access_log where student_user_id='${studentA.userId}'`,
).catch((e) => [`<${e.message}>`]))}`);
// Contre-factuel: le coach B ne doit pas pouvoir journaliser un accès à l'élève A.
const { error: crossErr } = await asCoach(coachB).rpc("log_coach_student_access", {
  p_student_id: studentA.userId,
});
say(`  contre-factuel (coach B sur élève A) → ${crossErr ? `✅ refusé: ${crossErr.message.slice(0, 90)}` : "🔴 ACCEPTÉ"}`);

// ── 5. ÉTATS VIDES ──────────────────────────────────────────────────────────
say(`\n${"█".repeat(74)}\n5 — ÉTATS VIDES\n${"█".repeat(74)}`);
const lonely = await makeCoach({ displayName: "Solo", country: "GB" });
const lonelyClient = asCoach(lonely);
for (const view of ["coach_student_directory", "coach_student_events"]) {
  const { data, error } = await lonelyClient.from(view).select("*");
  say(`  coach sans élève · ${view.padEnd(24)} → ${error ? `ERREUR ${error.message}` : `${(data ?? []).length} ligne(s) ✅`}`);
}

await Deno.writeTextFile(new URL("./L6-coach.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit");
