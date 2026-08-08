/**
 * FF-029 — EXTRA-HARD ET REVUE ADVERSARIALE, EN RUN RÉEL.
 *
 * Chaque hypothèse est écrite AVANT d'être jouée, et son verdict est relu en
 * base. Les cinq:
 *
 *   H1  Une pratique ignorée trois semaines continue de sortir (R7 mort).
 *   H2  Le budget de demande ne tient pas entre une surface de jour et la
 *       question du soir (T4 contourné).
 *   H3  Un soir sans matière ne porte AUCUNE pratique, même quand un message
 *       part quand même (§7 de la fiche est faux sur ce point).
 *   H4  Un coach qui DÉLÈGUE à la maison sert quand même SES pratiques —
 *       c'est-à-dire une méthode qu'il a explicitement retirée.
 *   H5  Le tour de chat invente une pratique et l'attribue au coach (§9).
 */
import {
  admin,
  callCron,
  type Coach,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  type Student,
  turn,
} from "./harness.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};
const head = (s: string) => say(`\n${"═".repeat(76)}\n▌ ${s}\n${"═".repeat(76)}`);
let PASS = 0, FAIL = 0;
function check(ok: boolean, label: string, proof: string) {
  ok ? PASS++ : FAIL++;
  say(`${ok ? "  ✅" : "  ❌"} ${label}\n      ${proof}`);
}

const BASE = new Date(Date.now() + 3 * 60_000);
const clock = (d: number) => new Date(BASE.getTime() + d * 86_400_000).toISOString();
function tzEvening(iso: string): string {
  const t = new Date(iso);
  let o = Math.round(20.5 - (t.getUTCHours() + t.getUTCMinutes() / 60));
  while (o > 12) o -= 24;
  while (o < -11) o += 24;
  return o === 0 ? "Etc/GMT" : o > 0 ? `Etc/GMT-${o}` : `Etc/GMT+${-o}`;
}
const TZ = tzEvening(clock(0));
const localDate = (d: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(clock(d)));

/** `practiceKey` du module — recopié ici pour lire les clés sans importer edge. */
function practiceKey(label: string): string {
  const folded = String(label ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < folded.length; i++) {
    h = (h ^ folded.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

type Row = Record<string, unknown>;
function p(over: Row = {}): Row {
  return {
    label: "Drink water across the day",
    kind: "hydration",
    quantified: false,
    target: null,
    unit: null,
    goal_scope: [],
    cadence: "rotating",
    askable: true,
    minor_safe: true,
    brief: "Water spread across the day, never a number.",
    status: "active",
    collides_with: null,
    ...over,
  };
}

async function coachWith(name: string, practices: Row[], opts: { delegate?: boolean } = {}) {
  const coach = await makeCoach({ displayName: name, country: "GB" });
  const { error } = await admin().from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [{
      key: "protein_anchor",
      claim: "Every meal is built on a protein anchor.",
      rationale: "It keeps the next three hours quiet.",
    }],
    forbidden: [],
    vocabulary: [],
    arbitrations: [],
    qa: [],
    daily_practices: practices,
    voice: { tone: "Direct, warm.", length: "short" },
    foods: { recommended: [], discouraged: [] },
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw new Error(`doctrine ${name}: ${error.message}`);
  if (opts.delegate) {
    const { error: e2 } = await admin().from("coaches")
      .update({ doctrine_source: "house" } as never).eq("id", coach.coachId);
    if (e2) throw new Error(`delegate: ${e2.message}`);
  }
  return coach;
}

async function tick(userId: string, day: string) {
  const { error } = await admin().from("protocol_events").insert({
    user_id: userId,
    local_date: day,
    source: "quick_tap",
    source_message_id: `meal_tick:ff029adv-${day}:0`,
    student_note: "Chicken and rice",
    content_locale: "en-GB",
    occurred_at: new Date(`${day}T18:00:00Z`).toISOString(),
  } as never);
  if (error) throw new Error(`tick: ${error.message}`);
}

async function evening(userId: string, day: string) {
  const { data } = await admin().from("outbound_messages")
    .select("metadata, content_preview")
    .eq("user_id", userId).eq("status", "sent")
    .filter("metadata->>purpose", "eq", "keel_daily_pulse")
    .filter("metadata->>local_date", "eq", day);
  const rows = (data ?? []) as Row[];
  const m = (rows[0]?.metadata ?? {}) as Row;
  return {
    n: rows.length,
    body: rows[0] ? String(rows[0].content_preview ?? "") : null,
    mode: rows[0] ? (String(m.keel_practice_mode ?? "") || null) : null,
    key: rows[0] ? ((m.keel_practice_key as string | null) ?? null) : null,
    ask: rows[0] ? m.pulse_asked === true : null,
  };
}

const ids: string[] = [];
say(`horloge soir 0 : ${clock(0)} (réelle ${new Date().toISOString()}) · tz ${TZ}`);

// ═══════════════════════════════════════════════════════════════════════════
head("H1 · EXTRA-HARD — une pratique ignorée trois semaines");
// La fixture écrit dans le LEDGER trois soirs où la pratique « eau » a été
// QUESTIONNÉE, sans aucun message de l'élève après. C'est exactement ce que la
// production écrit; on ne fabrique aucun score, on rejoue des faits.
const WATER = "Drink water across the day";
const WALK = "Walk after dinner when you can";
const coachH1 = await coachWith("Ignored", [
  p({ label: WATER, kind: "hydration", brief: "Water spread across the day, never a number." }),
  // ⚠️ LE BRIEF DOIT SUIVRE LE LABEL. Le premier jet laissait le brief « eau »
  // par défaut sur la pratique « marche »: le modèle parlait des DEUX dans la
  // même bulle, et le test lisait une fuite qui venait de la fixture.
  p({ label: WALK, kind: "movement", brief: "A short walk after dinner. Never a duration." }),
]);
const eva: Student = await makeStudent({
  coach: coachH1,
  timezone: TZ,
  country: "GB",
  fullName: "Eva Ffxx",
  locale: "en-US",
});
ids.push(eva.userId, coachH1.userId);
await publishPlanFor(coachH1, eva.userId, { timezone: TZ });

// ⚠️ LA FENÊTRE EST GLISSANTE (21 jours depuis LE JOUR COURANT). Le premier jet
// semait à J-21/-18/-15: dès le deuxième soir simulé, la plus ancienne sortait
// de la fenêtre, le compte retombait à 2, et la pratique redevenait servable —
// comportement CORRECT du produit, fixture fausse. On sème donc au milieu.
for (let back = 9; back >= 3; back -= 3) {
  const day = localDate(-back);
  const at = new Date(BASE.getTime() - back * 86_400_000).toISOString();
  const { error } = await admin().from("outbound_messages").insert({
    user_id: eva.userId,
    message_type: "text",
    content_preview: "…",
    status: "sent",
    delivery_channel: "in_app",
    created_at: at,
    metadata: {
      purpose: "keel_daily_pulse",
      local_date: day,
      pulse_asked: false,
      keel_practice_mode: "ask",
      keel_practice_key: practiceKey(WATER),
    },
  } as never);
  if (error) say(`  ⚠️ seed ledger: ${error.message}`);
}
say(`  ledger semé : 3 questions « eau » ignorées (clé ${practiceKey(WATER)})`);

const h1: string[] = [];
for (let d = 0; d < 3; d++) {
  const day = localDate(d);
  await tick(eva.userId, day);
  await callCron("keel-daily-pulse-v1", { now: clock(d), limit: 500 });
  const e = await evening(eva.userId, day);
  h1.push(`${day} mode=${e.mode} key=${e.key}`);
  say(`  soir ${d}: mode=${e.mode} key=${e.key} « ${e.body} »`);
}
check(
  h1.every((l) => !l.includes(practiceKey(WATER))),
  "R7: la pratique ignorée trois semaines n'est PLUS servie",
  `${h1.join(" | ")} — clé décrochée ${practiceKey(WATER)} (eau), attendue ${practiceKey(WALK)} (marche)`,
);
{
  const texts = h1.join(" ");
  const bodies: string[] = [];
  for (let d = 0; d < 3; d++) bodies.push((await evening(eva.userId, localDate(d))).body ?? "");
  const reproach =
    /didn'?t|haven'?t|still not|you missed|forgot|again|days? in a row|streak/i;
  const hit = bodies.filter((b) => reproach.test(b));
  check(hit.length === 0, "aucun reproche, aucune relance", hit.join(" | ") || `${texts.length} chars relus, 0 formule de reproche`);
}

// ═══════════════════════════════════════════════════════════════════════════
head("H2 · EXTRA-HARD — 7 pratiques + le fait du soir + le budget déjà pris");
const coachH2 = await coachWith(
  "Seven",
  Array.from({ length: 7 }, (_, i) =>
    p({
      label: `Daily habit number ${"abcdefg"[i]}`,
      kind: "other",
      brief: `Habit ${"abcdefg"[i]}. Plain, no number.`,
    })),
);
const finn: Student = await makeStudent({
  coach: coachH2,
  timezone: TZ,
  country: "GB",
  fullName: "Finn Ffxx",
  locale: "en-US",
});
ids.push(finn.userId, coachH2.userId);
await publishPlanFor(coachH2, finn.userId, { timezone: TZ });

const dayH2 = localDate(0);
await tick(finn.userId, dayH2);
// LA DEMANDE DU JOUR EST DÉJÀ PARTIE — une invitation photo (FF-025), à midi.
{
  const { error } = await admin().from("meal_precision_questions").insert({
    user_id: finn.userId,
    local_date: dayH2,
    source: "chat",
    ask_kind: "photo_invitation",
    axis: null,
    question: "If you have a photo of that, send it over.",
    asked_for_message_id: `ff029adv-noon-${dayH2}`,
  } as never);
  if (error) say(`  ⚠️ seed budget: ${error.message}`);
}
await callCron("keel-daily-pulse-v1", { now: clock(0), limit: 500 });
{
  const e = await evening(finn.userId, dayH2);
  say(`  soir: n=${e.n} mode=${e.mode} ask=${e.ask} « ${e.body} »`);
  check(e.n === 1, "UN seul message, avec 7 pratiques publiées", `outbound sent = ${e.n}`);
  check(
    e.mode === "remind",
    "T4: la demande du jour étant prise, la pratique est un RAPPEL",
    `mode = ${e.mode}`,
  );
  const { data } = await admin().from("meal_precision_questions")
    .select("ask_kind").eq("user_id", finn.userId).eq("local_date", dayH2);
  const kinds = ((data ?? []) as Row[]).map((r) => r.ask_kind);
  check(
    kinds.length === 1,
    "T4: UNE seule demande inscrite pour la journée, tous genres confondus",
    `meal_precision_questions = ${JSON.stringify(kinds)}`,
  );
  // Le plafond de 7 tient à la lecture: la 8e serait comptée et lâchée.
  const { data: doc } = await admin().from("coach_doctrines")
    .select("daily_practices").eq("coach_id", coachH2.coachId).maybeSingle();
  check(
    ((doc as Row)?.daily_practices as Row[]).length === 7,
    "R2: sept pratiques stockées, et le message n'en porte qu'une",
    `stockées = ${((doc as Row)?.daily_practices as Row[]).length}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
head("H3 · EXTRA-HARD — un soir SANS matière");
const coachH3 = await coachWith("Empty", [p({ label: "Drink water across the day" })]);
const gil: Student = await makeStudent({
  coach: coachH3,
  timezone: TZ,
  country: "GB",
  fullName: "Gil Ffxx",
  locale: "en-US",
});
ids.push(gil.userId, coachH3.userId);
await publishPlanFor(coachH3, gil.userId, { timezone: TZ });

// Aucune coche: pas de sol. La question du pulse, elle, est DUE (jamais posée).
await callCron("keel-daily-pulse-v1", { now: clock(0), limit: 500 });
{
  const e = await evening(gil.userId, localDate(0));
  say(`  soir sans matière, question due : n=${e.n} mode=${e.mode} « ${e.body} »`);
  check(
    e.n === 1 && e.mode === "none",
    "🔴 CONSTAT: un message part, et il ne porte AUCUNE pratique",
    `n=${e.n} mode=${e.mode} body=${JSON.stringify(e.body)} — §7 de la fiche dit l'inverse`,
  );
}
// Deuxième soir: pas de coche, et la question n'est plus due → silence total.
await callCron("keel-daily-pulse-v1", { now: clock(1), limit: 500 });
{
  const e = await evening(gil.userId, localDate(1));
  check(
    e.n === 0,
    "un soir sans matière ET sans question due ne produit AUCUN message",
    `outbound sent = ${e.n} (skip nothing_to_say)`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
head("H4 · ADVERSARIAL — un coach qui DÉLÈGUE à la maison");
const coachH4 = await coachWith(
  "Delegating",
  [p({ label: "Sprint up a hill every morning", kind: "movement" })],
  { delegate: true },
);
const hana: Student = await makeStudent({
  coach: coachH4,
  timezone: TZ,
  country: "GB",
  fullName: "Hana Ffxx",
  locale: "en-US",
});
ids.push(hana.userId, coachH4.userId);
await publishPlanFor(coachH4, hana.userId, { timezone: TZ });
await tick(hana.userId, localDate(0));
await callCron("keel-daily-pulse-v1", { now: clock(0), limit: 500 });
{
  const e = await evening(hana.userId, localDate(0));
  const houseKeys = [
    practiceKey("Drink water across the day, not all at once."),
    practiceKey("Move a little every day, even when it is only a walk."),
    practiceKey("Eat at roughly the same times each day."),
  ];
  say(`  soir: mode=${e.mode} key=${e.key} « ${e.body} »`);
  check(
    e.key !== null && houseKeys.includes(e.key) &&
      e.key !== practiceKey("Sprint up a hill every morning"),
    "un coach qui délègue sert les pratiques de la MAISON, pas les siennes",
    `clé servie ${e.key} ∈ maison ${JSON.stringify(houseKeys)}`,
  );
  check(
    !/sprint|hill/i.test(e.body ?? ""),
    "la pratique retirée avec la doctrine ne fuit pas par la porte à côté",
    `body = ${JSON.stringify(e.body)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
head("H5 · ADVERSARIAL — le tour de chat invente-t-il une pratique ?");
// §9: « un modèle serviable proposera "tu pourrais aussi…" en pleine
// conversation. C'est FF-028 qui propose, le soir, sous doctrine — jamais le
// tour de chat. » Trois tours, trois formulations, deux langues.
{
  const probes = [
    "What should I be doing every day, besides the food?",
    "Give me a daily habit to work on this week.",
    "Est-ce que mon coach me demande de faire quelque chose tous les jours ?",
  ];
  const replies: string[] = [];
  // ⚠️ ON RELIT LA BULLE PAR SON IDENTIFIANT, PAS PAR `r.reply`.
  // Premier jet: `r.reply` valait `null` sur les trois tours (le repérage « le
  // dernier message d'assistant après » du harnais n'accroche pas ici), et
  // l'assertion « 0 mention » passait donc sur trois chaînes vides — un VERT
  // qui ne prouvait rien. `chat_message_id` est rendu par la fonction; c'est
  // lui qui désigne la ligne à lire.
  for (const q of probes) {
    const r = await turn(hana, q);
    const id = String(r.json?.chat_message_id ?? "");
    let text = String(r.reply ?? "");
    if (!text && id) {
      const { data } = await admin().from("chat_messages")
        .select("content").eq("id", id).maybeSingle();
      text = String((data as Row)?.content ?? "");
    }
    if (!text) throw new Error(`tour sans texte relu: ${q} (HTTP ${r.status})`);
    replies.push(text);
    say(`\n  Q « ${q} »\n  R « ${text} »`);
  }
  // On ne peut pas interdire au modèle de conseiller — c'est son métier. Ce
  // qu'on interdit, c'est de PRESCRIRE AU NOM DU COACH une pratique que la
  // méthode ne porte pas. Le coach délègue: sa pratique « sprint » n'existe plus.
  const fabricated = replies.filter((r) => /sprint|hill/i.test(r));
  check(
    fabricated.length === 0,
    "le chat n'exhume pas une pratique retirée par la délégation",
    fabricated.join(" | ") || `${replies.length} tours, 0 mention`,
  );
  const streak = replies.filter((r) => /streak|days? in a row|de suite|série/i.test(r));
  check(
    streak.length === 0,
    "§9: aucune gamification n'apparaît en conversation",
    streak.join(" | ") || `${replies.length} tours, 0 série`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
head("NETTOYAGE");
for (const id of ids) await cleanup(id).catch(() => {});
say(`comptes nettoyés : ${ids.length}`);
say(`\n${"═".repeat(76)}\nPASS ${PASS} · FAIL ${FAIL}\n${"═".repeat(76)}`);
await Deno.writeTextFile(
  new URL("./FF029-adversarial.txt", import.meta.url),
  lines.join("\n") + "\n",
);
