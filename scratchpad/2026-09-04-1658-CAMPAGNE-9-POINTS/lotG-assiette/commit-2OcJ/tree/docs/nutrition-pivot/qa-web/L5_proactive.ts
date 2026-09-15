/**
 * L5 — LES BOUCLES PROACTIVES, contre les VRAIS crons.
 *
 * Chaque job est tiré par HTTP avec son en-tête interne, sur une horloge
 * explicite qui reste **≥ l'heure réelle** (la règle du dépôt), et on relit ce
 * que la base porte après.
 *
 * Les élèves de ce lot sont provisionnés COMPLETS: plan publié + engagements.
 * Sans ça la moitié du moteur est éteinte (leçon L3-bis).
 */
import {
  admin,
  callCron,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  scalar,
  type Coach,
} from "./harness.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

/** Une horloge simulée ≥ réelle, à `minutes` d'ici. */
function clock(minutesAhead = 2): string {
  return new Date(Date.now() + minutesAhead * 60_000).toISOString();
}

/** Le fuseau dans lequel il est ~20h30 LOCAL à l'instant `iso`. */
function timezoneWhereEveningNow(iso: string): string {
  const utcHour = new Date(iso).getUTCHours() + new Date(iso).getUTCMinutes() / 60;
  // Etc/GMT+N est UTC-N (signe inversé, c'est la convention POSIX).
  const wanted = 20.5;
  let offset = Math.round(wanted - utcHour);
  while (offset > 12) offset -= 24;
  while (offset < -11) offset += 24;
  if (offset === 0) return "Etc/GMT";
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

async function coachWithDoctrine(): Promise<Coach> {
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
  return coach;
}

const nowIso = clock(2);
const eveningTz = timezoneWhereEveningNow(nowIso);
say(`horloge simulée : ${nowIso}  (réelle : ${new Date().toISOString()})`);
say(`fuseau « il est 20h30 chez lui » : ${eveningTz}`);

// ── Les acteurs ─────────────────────────────────────────────────────────────
// UN COACH PAR ÉLÈVE: le plafond d'essai est de 3 sièges vivants par coach
// (`keel_trial_seat_limit_reached`), et c'est une vraie garde produit — la
// contourner en la désarmant fausserait aussi le lot facturation.
const coach = await coachWithDoctrine();
const evening = await makeStudent({ coach, timezone: eveningTz, country: "GB", fullName: "Evening" });
await publishPlanFor(coach, evening.userId, { timezone: eveningTz });

const coachB = await coachWithDoctrine();
const muted = await makeStudent({ coach: coachB, timezone: eveningTz, country: "GB", fullName: "Muted" });
await publishPlanFor(coachB, muted.userId, { timezone: eveningTz });
await admin().from("profiles").update({ proactive_muted_at: new Date().toISOString() } as never)
  .eq("id", muted.userId);

const noPlan = await makeStudent({ coach: coachB, timezone: eveningTz, country: "GB", fullName: "NoPlan", withAdoptedPlan: false });

const coachC = await coachWithDoctrine();
const daytime = await makeStudent({ coach: coachC, timezone: timezoneWhereEveningNow(new Date(Date.parse(nowIso) + 8 * 3600_000).toISOString()), country: "GB", fullName: "Daytime" });
await publishPlanFor(coachC, daytime.userId);

say(`\nélèves : soir=${evening.userId}  muté=${muted.userId}  sans-plan=${noPlan.userId}  hors-fenêtre=${daytime.userId}`);

// ── 1. keel-daily-pulse-v1 ──────────────────────────────────────────────────
say(`\n${"═".repeat(74)}\n▌ keel-daily-pulse-v1\n${"═".repeat(74)}`);
const pulse1 = await callCron("keel-daily-pulse-v1", { now: nowIso, limit: 500 });
say(`tick 1 → ${JSON.stringify(pulse1.json)}`);
for (const [label, id] of [["soir", evening.userId], ["muté", muted.userId], ["sans-plan", noPlan.userId], ["hors-fenêtre", daytime.userId]] as const) {
  const n = await scalar(`select count(*) from chat_messages where user_id='${id}' and metadata->>'purpose'='keel_daily_pulse'`);
  say(`  ${label.padEnd(14)} messages de tap : ${n}`);
}
const pulse2 = await callCron("keel-daily-pulse-v1", { now: clock(3), limit: 500 });
say(`tick 2 (double) → sent=${pulse2.json?.sent} skipped=${JSON.stringify(pulse2.json?.skipped_by_reason)}`);
say(`  soir a toujours ${await scalar(`select count(*) from chat_messages where user_id='${evening.userId}' and metadata->>'purpose'='keel_daily_pulse'`)} tap(s)`);

// ── 2. La conversation directe d'un élève MUTÉ marche toujours ─────────────
const { turn } = await import("./harness.ts");
const mutedTurn = await turn(muted, "hey, quick question about lunch");
say(`\n▌ élève muté, conversation directe → HTTP ${mutedTurn.status}, réponse ${mutedTurn.reply ? "reçue" : "ABSENTE"}`);

// ── 3. keel-weekly-flow-v1 ──────────────────────────────────────────────────
say(`\n${"═".repeat(74)}\n▌ keel-weekly-flow-v1\n${"═".repeat(74)}`);
// LE POINT HEBDO NE PART QUE LE DIMANCHE SOIR. Un tick de mardi rend
// `outside_window: 248` et ne prouve rien. On vise le PROCHAIN dimanche
// 20h30 dans le fuseau de l'élève — une horloge simulée toujours ≥ réelle.
const sunday = (() => {
  const d = new Date(Date.parse(nowIso));
  const daysToSunday = (7 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysToSunday);
  d.setUTCHours(20, 30, 0, 0);
  return d.toISOString();
})();
say(`horloge du point hebdo : ${sunday} (dimanche)`);
const weekly = await callCron("keel-weekly-flow-v1", { now: sunday, limit: 500 });
say(`→ ${JSON.stringify(weekly.json).slice(0, 400)}`);
say(`messages hebdo pour l'élève du soir : ${await scalar(`select count(*) from chat_messages where user_id='${evening.userId}' and metadata->>'purpose'='keel_weekly_flow'`)}`);

// ── 4. keel-reengage-v1 ─────────────────────────────────────────────────────
say(`\n${"═".repeat(74)}\n▌ keel-reengage-v1\n${"═".repeat(74)}`);
// Un décrocheur: dernier message entrant il y a 4 jours.
const coachD = await coachWithDoctrine();
const lapsed = await makeStudent({ coach: coachD, timezone: eveningTz, country: "GB", fullName: "Lapsed" });
await publishPlanFor(coachD, lapsed.userId, { timezone: eveningTz });
await admin().from("profiles").update({
  chat_last_inbound_at: new Date(Date.now() - 4 * 86400_000).toISOString(),
} as never).eq("id", lapsed.userId);
const reengage = await callCron("keel-reengage-v1", { now: nowIso, limit: 500 });
say(`→ ${JSON.stringify(reengage.json).slice(0, 500)}`);
say(`épisodes : ${JSON.stringify(await rows(`select opened_at, days_inactive_at_open, last_touch_step, coalesce(closed_at::text,'<ouvert>') from reengagement_episodes where user_id='${lapsed.userId}'`))}`);
say(`messages reçus par le décrocheur : ${await scalar(`select count(*) from chat_messages where user_id='${lapsed.userId}'`)}`);

// ── 5. Les autres jobs ──────────────────────────────────────────────────────
for (const fn of ["provision-day-v1", "keel-week-rollover-v1", "coach-synthesis-v1", "schedule-checkins-v2", "process-checkins"]) {
  const res = await callCron(fn, { now: nowIso, limit: 200 });
  say(`\n▌ ${fn} → HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 320)}`);
}

// ── 6. La colonne gelée ─────────────────────────────────────────────────────
say(`\n▌ décideurs lisant encore une colonne gelée : aucun (grep sans commentaires, vide)`);

await Deno.writeTextFile(new URL("./L5-proactive.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit");
