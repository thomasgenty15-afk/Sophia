/**
 * L9 — CYCLE DE VIE DU COMPTE, RGPD.
 *
 * Un élève avec de la donnée dans CHAQUE table du pivot: on demande l'export,
 * on vérifie que rien ne manque, puis on supprime, on restaure, on re-supprime
 * et on purge avec une horloge simulée. À la fin, on compte ce qui survit.
 */
import { admin, callAs, makeCoach, makeStudent, publishPlanFor, rows, scalar, turn } from "./harness.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

/** Les tables du pivot qui portent de la donnée d'élève. */
const PIVOT_TABLES = [
  "protocol_events",
  "chat_messages",
  "student_week_plans",
  "student_daily_checkins",
  "student_safety_constraints",
  "planned_deviations",
  "meal_precision_questions",
  "outbound_messages",
  "inbound_dedup",
  "reengagement_episodes",
  "plan_versions",
  "plan_commitments",
  "coach_clients",
  "contract_change_requests",
  "coach_access_events",
];

function keyColumn(table: string): string {
  if (table === "coach_clients") return "student_user_id";
  if (table === "plan_versions") return "student_id";
  if (table === "coach_access_events") return "student_user_id";
  return "user_id";
}

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB", fullName: "Deletable Sam" });
await publishPlanFor(coach, student.userId, { timezone: "Europe/London" });
say(`élève=${student.userId}  coach=${coach.coachId}`);

// ── De la donnée partout ────────────────────────────────────────────────────
await turn(student, "I'm allergic to peanuts, badly");
await turn(student, "j'ai mangé du poulet");
const db = admin();
await db.from("student_daily_checkins").insert({
  user_id: student.userId,
  local_date: new Date().toISOString().slice(0, 10),
  overall: "good",
  source: "chat",
} as never);

say(`\n▌ donnée avant suppression :`);
const before: Record<string, number> = {};
for (const t of PIVOT_TABLES) {
  before[t] = await scalar(`select count(*) from ${t} where ${keyColumn(t)}='${student.userId}'`).catch(() => -1);
}
say(`  ${JSON.stringify(before)}`);

// ── 1. EXPORT ───────────────────────────────────────────────────────────────
say(`\n${"█".repeat(74)}\n1 — EXPORT (les tables du pivot y sont-elles ?)\n${"█".repeat(74)}`);
// LA RÉ-AUTHENTIFICATION FRAÎCHE EST EXIGÉE, et c'est correct: un export
// RGPD et une suppression sont les deux gestes les plus lourds du produit.
// Le mot de passe passé ici est celui d'un compte JETABLE créé par ce
// harnais sur 127.0.0.1 — aucun compte réel n'est touché, et rien n'est
// tapé dans un formulaire.
const FIXTURE_PASSWORD = "1234567";
const exp = await callAs(student, "account-export-v1", { password: FIXTURE_PASSWORD });
say(`  HTTP ${exp.status}`);
// L'export rend une URL SIGNÉE, pas le bundle: il faut aller le chercher.
say(`  réponse : ${JSON.stringify(Object.keys(exp.json ?? {}))}`);
let payload = "";
if (exp.json?.url) {
  // L'URL signée porte le nom d'hôte INTERNE du réseau Docker (`kong:8000`),
  // que l'hôte ne résout pas. On la réécrit vers l'API locale — c'est un
  // détail de stack, pas un défaut produit (un navigateur d'élève reçoit
  // l'URL publique).
  const url = String(exp.json.url).replace("http://kong:8000", Deno.env.get("SUPABASE_URL") ?? "");
  const bundle = await fetch(url);
  const zip = new Uint8Array(await bundle.arrayBuffer());
  const zipPath = new URL("./L9-export-bundle.zip", import.meta.url);
  await Deno.writeFile(zipPath, zip);
  say(`  bundle téléchargé : HTTP ${bundle.status}, ${zip.length} octets`);
  const listing = new Deno.Command("unzip", { args: ["-l", zipPath.pathname], stdout: "piped" });
  payload = new TextDecoder().decode((await listing.output()).stdout);
  say(`  contenu de l'archive :\n${payload.split("\n").map((l) => "    " + l).join("\n")}`);
} else {
  payload = JSON.stringify(exp.json ?? {});
  say(`  🔴 aucune URL d'export dans la réponse`);
}
try {
  say(`  clés du bundle : ${JSON.stringify(Object.keys(JSON.parse(payload))).slice(0, 700)}`);
} catch { /* pas du JSON */ }
for (const t of PIVOT_TABLES) {
  if (before[t] <= 0) continue;
  const present = payload.includes(`"${t}"`);
  say(`  ${present ? "✅" : "🔴"} ${t.padEnd(28)} (${before[t]} ligne(s) en base)`);
}

// ── 2. SUPPRESSION → RESTAURATION → SUPPRESSION ─────────────────────────────
say(`\n${"█".repeat(74)}\n2 — SUPPRESSION / RESTAURATION\n${"█".repeat(74)}`);
const prep = await callAs(student, "account-deletion-v1", { action: "prepare", password: FIXTURE_PASSWORD });
say(`  prepare → HTTP ${prep.status} ${JSON.stringify(prep.json).slice(0, 160)}`);
const del = await callAs(student, "account-deletion-v1", {
  action: "confirm",
  typed_confirmation: "DELETE",
  token: prep.json?.token,
});
say(`  suppression → HTTP ${del.status} ${JSON.stringify(del.json).slice(0, 200)}`);
say(`  profil : ${JSON.stringify(await rows(
  `select coalesce(account_status,'-') || ' | ' || coalesce(deletion_requested_at::text,'-') || ' | ' || coalesce(purge_at::text,'-') from profiles where id='${student.userId}'`,
))}`);
const blocked = await turn(student, "hello?");
say(`  l'élève supprimé poste → HTTP ${blocked.status} ${blocked.status === 410 || blocked.status === 401 ? "✅ refus propre" : "🔴 tour fantôme ?"}`);
say(`  message écrit malgré tout ? ${await scalar(`select count(*) from chat_messages where user_id='${student.userId}' and content='hello?'`)} ${
  (await scalar(`select count(*) from chat_messages where user_id='${student.userId}' and content='hello?'`)) === 0 ? "✅" : "🔴"
}`);

// LA SESSION EST RÉVOQUÉE À LA SUPPRESSION — c'est voulu, et c'est pour ça
// que le parcours de restauration passe par une reconnexion.
const { createClient: cc } = await import("jsr:@supabase/supabase-js@2");
const anonC = cc(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
const signIn = await anonC.auth.signInWithPassword({ email: student.email, password: FIXTURE_PASSWORD });
say(`  reconnexion → ${signIn.error ? `ERREUR ${signIn.error.message}` : "✅ session obtenue"}`);
if (signIn.data.session) {
  student.accessToken = signIn.data.session.access_token;
  student.refreshToken = signIn.data.session.refresh_token;
}
const restore = await callAs(student, "account-restore-v1", {});
say(`  restauration → HTTP ${restore.status} ${JSON.stringify(restore.json).slice(0, 200)}`);
say(`  profil : ${JSON.stringify(await rows(
  `select coalesce(account_status,'-') || ' | ' || coalesce(deletion_requested_at::text,'-') from profiles where id='${student.userId}'`,
))}`);
const afterRestore = await turn(student, "am I back?");
say(`  l'élève restauré poste → HTTP ${afterRestore.status} ${afterRestore.reply ? "✅ réponse reçue" : "🔴 muet"}`);

// ── 3. PURGE J+7 ────────────────────────────────────────────────────────────
say(`\n${"█".repeat(74)}\n3 — PURGE J+7 (horloge simulée)\n${"█".repeat(74)}`);
const signIn2 = await anonC.auth.signInWithPassword({ email: student.email, password: FIXTURE_PASSWORD });
if (signIn2.data.session) student.accessToken = signIn2.data.session.access_token;
const prep2 = await callAs(student, "account-deletion-v1", { action: "prepare", password: FIXTURE_PASSWORD });
await callAs(student, "account-deletion-v1", {
  action: "confirm",
  typed_confirmation: "DELETE",
  token: prep2.json?.token,
});
const purgeAt = await rows(`select purge_at::text from profiles where id='${student.userId}'`);
say(`  purge_at : ${JSON.stringify(purgeAt)}`);
const simulated = new Date(Date.now() + 8 * 86400_000).toISOString();
const purge = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/purge-deleted-accounts`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`,
    "x-internal-secret": (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim(),
  },
  body: JSON.stringify({ simulated_now: simulated, limit: 200 }),
});
say(`  cron purge (now=${simulated}) → HTTP ${purge.status} ${JSON.stringify(await purge.json()).slice(0, 300)}`);

say(`\n▌ ce qui SURVIT à la purge :`);
const after: Record<string, number> = {};
for (const t of PIVOT_TABLES) {
  after[t] = await scalar(`select count(*) from ${t} where ${keyColumn(t)}='${student.userId}'`).catch(() => -1);
}
for (const t of PIVOT_TABLES) {
  if (before[t] <= 0) continue;
  say(`  ${after[t] === 0 ? "✅" : "🔴"} ${t.padEnd(28)} ${before[t]} → ${after[t]}`);
}
say(`  profil : ${JSON.stringify(await rows(`select coalesce(full_name,'<null>') || ' | ' || coalesce(email,'<null>') from profiles where id='${student.userId}'`))}`);
say(`  auth   : ${await scalar(`select count(*) from auth.users where id='${student.userId}'`)}`);

// Le prénom de l'élève survit-il dans la synthèse de son coach ?
say(`\n▌ le prénom dans coach_syntheses :`);
say(`  ${JSON.stringify(await rows(
  `select left(row_to_json(t)::text, 400) from (select narrative, flagged_students from coach_syntheses where coach_id='${coach.coachId}' order by created_at desc limit 1) t`,
).catch((e) => [`<${e.message}>`]))}`);
say(`  occurrences de « Deletable Sam » : ${await scalar(
  `select count(*) from coach_syntheses where coach_id='${coach.coachId}' and (narrative ilike '%Deletable Sam%' or flagged_students::text ilike '%Deletable Sam%')`,
)}`);

await Deno.writeTextFile(new URL("./L9-lifecycle.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit");
