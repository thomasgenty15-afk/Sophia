/**
 * FF-029 — LES PRATIQUES QUOTIDIENNES, EN RUN RÉEL.
 *
 * Vrai cron (`keel-daily-pulse-v1`), vrai modèle, vraie base locale. Chaque
 * verdict est relu dans `chat_messages` / `outbound_messages` /
 * `meal_precision_questions` — jamais dans une réponse HTTP.
 *
 * L'horloge est SIMULÉE et reste ≥ l'heure réelle (règle du dépôt): on avance
 * de 24 h par soirée, ce qui fait tourner `local_date`, la rotation (R6) et la
 * cadence de la question (`PULSE_ASK_INTERVAL_DAYS = 3`) sans jamais estampiller
 * une ligne dans le passé.
 *
 * Fixtures préfixées `ff029_`, nettoyées en fin de run.
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
} from "./harness.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};
const head = (s: string) =>
  say(`\n${"═".repeat(76)}\n▌ ${s}\n${"═".repeat(76)}`);

let PASS = 0;
let FAIL = 0;
function check(ok: boolean, label: string, proof: string) {
  if (ok) PASS++;
  else FAIL++;
  say(`${ok ? "  ✅" : "  ❌"} ${label}\n      ${proof}`);
}

// ── horloge ────────────────────────────────────────────────────────────────
const BASE = new Date(Date.now() + 3 * 60_000);
/** Le soir n° `d`, à 20h30 locale de l'élève. */
function clock(d: number): string {
  return new Date(BASE.getTime() + d * 86_400_000).toISOString();
}
function timezoneWhereEveningNow(iso: string): string {
  const t = new Date(iso);
  const utcHour = t.getUTCHours() + t.getUTCMinutes() / 60;
  let offset = Math.round(20.5 - utcHour);
  while (offset > 12) offset -= 24;
  while (offset < -11) offset += 24;
  if (offset === 0) return "Etc/GMT";
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}
const TZ = timezoneWhereEveningNow(clock(0));
/** La date locale de l'élève au soir n° `d`. */
function localDate(d: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(clock(d)));
}

// ── fabrication ────────────────────────────────────────────────────────────
type PracticeRow = Record<string, unknown>;

function p(over: PracticeRow = {}): PracticeRow {
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

async function coachWithPractices(
  name: string,
  practices: PracticeRow[],
): Promise<Coach> {
  const coach = await makeCoach({ displayName: name, country: "GB" });
  const { error } = await admin().from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [{
      key: "protein_anchor",
      claim: "Every meal is built on a protein anchor.",
      rationale: "It is what makes the next three hours quiet.",
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
  return coach;
}

/** Un fait du jour: une coche, exactement comme `tickMeal` l'écrit. */
async function tick(userId: string, day: string, title: string) {
  const { error } = await admin().from("protocol_events").insert({
    user_id: userId,
    local_date: day,
    source: "quick_tap",
    source_message_id: `meal_tick:ff029-${day}:0`,
    student_note: title,
    content_locale: "en-GB",
    occurred_at: new Date(`${day}T18:00:00Z`).toISOString(),
  } as never);
  if (error) throw new Error(`tick: ${error.message}`);
}

type Evening = {
  localDate: string;
  body: string | null;
  practiceMode: string | null;
  practiceKey: string | null;
  pulseAsked: boolean | null;
  bodySource: string | null;
  messages: number;
};

/** Ce que l'élève a VRAIMENT reçu ce soir-là, relu en base. */
async function eveningOf(userId: string, day: string): Promise<Evening> {
  const { data } = await admin()
    .from("outbound_messages")
    .select("metadata, content_preview, status")
    .eq("user_id", userId)
    .eq("status", "sent")
    .filter("metadata->>purpose", "eq", "keel_daily_pulse")
    .filter("metadata->>local_date", "eq", day);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const row = rows[0];
  const m = (row?.metadata ?? {}) as Record<string, unknown>;
  return {
    localDate: day,
    body: row ? String(row.content_preview ?? "") : null,
    practiceMode: row ? String(m.keel_practice_mode ?? "") || null : null,
    practiceKey: row ? (m.keel_practice_key as string | null) ?? null : null,
    pulseAsked: row ? m.pulse_asked === true : null,
    bodySource: row ? String(m.body_source ?? "") || null : null,
    messages: rows.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
const cleanupIds: string[] = [];
say(`horloge simulée soir 0 : ${clock(0)} (réelle ${new Date().toISOString()})`);
say(`fuseau « il est 20h30 chez lui » : ${TZ}`);
say(`dates locales : ${[0, 1, 2, 3, 4, 5, 6].map(localDate).join(" ")}`);

// ── A · EASY — un coach avec des pratiques publiées ────────────────────────
head("A · EASY — coach avec 3 pratiques, 7 soirs consécutifs");

const coachA = await coachWithPractices("Marlow", [
  p({ label: "Drink water across the day", kind: "hydration", cadence: "constant" }),
  p({
    label: "Move a little every day, even when it is only a walk",
    kind: "movement",
    brief: "A walk counts. Never a duration, never a step count.",
  }),
  p({
    label: "Eat at roughly the same times each day",
    kind: "meal_timing",
    brief: "Steady meal times, never a clock time.",
  }),
]);
const alice: Student = await makeStudent({
  coach: coachA,
  timezone: TZ,
  country: "GB",
  fullName: "Alice Ffxx",
  locale: "en-US",
});
cleanupIds.push(alice.userId, coachA.userId);
await publishPlanFor(coachA, alice.userId, { timezone: TZ });

// ── B · MEDIUM — un élève B2C, servi par la MÉTHODE MAISON ────────────────
const { data: houseRow } = await admin()
  .from("coaches")
  .select("id, display_name")
  .eq("coach_kind", "house")
  .eq("status", "active")
  .maybeSingle();
const houseId = String((houseRow as Record<string, unknown>)?.id ?? "");
say(`coach maison : ${houseId} (${(houseRow as Record<string, unknown>)?.display_name})`);

const bob: Student = await makeStudent({
  timezone: TZ,
  country: "GB",
  fullName: "Bob Ffxx",
  locale: "en-US",
});
cleanupIds.push(bob.userId);
// Le chemin de production de l'inscription libre: un `coach_clients` actif vers
// le coach maison. Aucune exception nulle part — c'est toute l'astuce (R3).
{
  const { error } = await admin().from("coach_clients").insert({
    coach_id: houseId,
    student_user_id: bob.userId,
    invited_email: bob.email,
    status: "active",
    consent_granted_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  } as never);
  if (error) throw new Error(`coach_clients maison: ${error.message}`);
  const { error: pvErr } = await admin().from("plan_versions").insert({
    coach_id: houseId,
    student_id: bob.userId,
    version: 1,
    status: "published",
    title: "ff029 house",
    content_locale: "en-GB",
    timezone: TZ,
    published_at: new Date().toISOString(),
  } as never);
  if (pvErr) throw new Error(`plan_versions maison: ${pvErr.message}`);
}

// ── C · HARD — la pratique « pèse-toi », le mineur, le plancher ────────────
const coachC = await coachWithPractices("Vance", [
  // Elle ne doit JAMAIS sortir (R9 / weight_readout). Écrite en français exprès.
  p({
    label: "Pèse-toi chaque matin, à jeun",
    kind: "other",
    brief: "La balance chaque matin.",
    status: "active",
  }),
  // Chiffrée: c'est elle que `minor_quantity` doit retenir, et que le plancher
  // doit faire taire.
  p({
    label: "4 glasses of water across the day",
    kind: "hydration",
    quantified: true,
    target: 4,
    unit: "glasses",
    brief: "Four glasses, spread out. The figure matters to this coach.",
  }),
  p({
    label: "Walk after dinner when you can",
    kind: "movement",
    brief: "A short walk after dinner. No duration.",
  }),
]);
// Mineur: 15 ans au jour local du run.
const minorBirth = new Date(BASE.getTime() - 15 * 365.25 * 86_400_000)
  .toISOString().slice(0, 10);
const chloe: Student = await makeStudent({
  coach: coachC,
  timezone: TZ,
  country: "GB",
  fullName: "Chloe Ffxx",
  locale: "en-US",
});
cleanupIds.push(chloe.userId, coachC.userId);
await publishPlanFor(coachC, chloe.userId, { timezone: TZ });
await admin().from("profiles").update({ birth_date: minorBirth } as never)
  .eq("id", chloe.userId);

// Élève sous plancher de restriction, même coach (le plafond est de 3 sièges).
const dana: Student = await makeStudent({
  coach: coachC,
  timezone: TZ,
  country: "GB",
  fullName: "Dana Ffxx",
  locale: "en-US",
});
cleanupIds.push(dana.userId);
await publishPlanFor(coachC, dana.userId, { timezone: TZ });

const students = [
  { name: "Alice (coach humain)", s: alice },
  { name: "Bob (B2C maison)", s: bob },
  { name: "Chloe (mineure)", s: chloe },
  { name: "Dana (plancher TCA)", s: dana },
];

// LE PLANCHER DE DANA, POSÉ LÀ OÙ LE PRODUIT LE LIT.
// `isRestrictionFlagged` — l'unique lecteur du dépôt — interroge
// `weekly_reviews.risk_band`, PAS `student_safety_constraints`. Une fixture
// posée à côté rendrait ce test vert et faux (T-15).
{
  const monday = (() => {
    const c = new Date(`${localDate(0)}T00:00:00Z`);
    c.setUTCDate(c.getUTCDate() - ((c.getUTCDay() + 6) % 7));
    return c.toISOString().slice(0, 10);
  })();
  const { error } = await admin().from("weekly_reviews").insert({
    user_id: dana.userId,
    week_start_date: monday,
    risk_band: "restriction_flag",
    content_locale: "en-GB",
  } as never);
  if (error) say(`  ⚠️ plancher Dana non posé: ${error.message}`);
}

// ── LE RUN — 7 soirs ───────────────────────────────────────────────────────
const journal: Record<string, Evening[]> = {};
for (const { s } of students) journal[s.userId] = [];

for (let d = 0; d < 7; d++) {
  const day = localDate(d);
  for (const { s } of students) await tick(s.userId, day, "Chicken and rice");
  const res = await callCron("keel-daily-pulse-v1", { now: clock(d), limit: 500 });
  const j = res.json ?? {};
  say(
    `\nsoir ${d} (${day}) → sent=${j.sent} asked=${j.asked} ` +
      `practice_modes=${JSON.stringify(j.practice_modes)} ` +
      `body_sources=${JSON.stringify(j.body_sources)} ` +
      `fallbacks=${JSON.stringify(j.body_fallback_reasons)}`,
  );
  if ((j.failures ?? []).length > 0) say(`  failures: ${JSON.stringify(j.failures)}`);
  for (const { name, s } of students) {
    const e = await eveningOf(s.userId, day);
    journal[s.userId].push(e);
    say(
      `  ${name.padEnd(24)} msgs=${e.messages} mode=${e.practiceMode ?? "-"} ` +
        `key=${e.practiceKey ?? "-"} ask=${e.pulseAsked} src=${e.bodySource ?? "-"}`,
    );
    if (e.body) say(`      « ${e.body} »`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
head("VERDICTS");

// --- A1: jamais plus d'un message par soir --------------------------------
for (const { name, s } of students) {
  const worst = Math.max(...journal[s.userId].map((e) => e.messages));
  check(
    worst <= 1,
    `${name}: JAMAIS deux messages le même soir`,
    `max messages/soir = ${worst} (outbound_messages, purpose=keel_daily_pulse)`,
  );
}

// --- A2: au plus UNE pratique, en alternance rappel/question ---------------
{
  const modes = journal[alice.userId].map((e) => e.practiceMode).filter(Boolean);
  const asks = journal[alice.userId].filter((e) => e.practiceMode === "ask");
  const collide = journal[alice.userId].filter((e) =>
    e.practiceMode === "ask" && e.pulseAsked === true
  );
  check(
    modes.length > 0 && modes.every((m) => m === "remind" || m === "ask"),
    "Alice: chaque soir porte au plus UNE pratique",
    `modes = ${JSON.stringify(modes)}`,
  );
  check(
    asks.length > 0 && collide.length === 0,
    "R3: une question de pratique et la question du pulse ne coexistent JAMAIS",
    `soirs en ask = ${asks.length}, collisions = ${collide.length}`,
  );
}

// --- A3: une seule question dans la bulle ---------------------------------
{
  const bad: string[] = [];
  for (const { name, s } of students) {
    for (const e of journal[s.userId]) {
      if (!e.body) continue;
      const qs = (e.body.match(/[?？]/g) ?? []).length;
      const allowed = (e.practiceMode === "ask" ? 1 : 0) + (e.pulseAsked ? 1 : 0);
      if (qs > allowed) bad.push(`${name}/${e.localDate}: ${qs} > ${allowed}`);
    }
  }
  check(bad.length === 0, "jamais plus de questions que la bulle n'en autorise", bad.join(" | ") || "0 dépassement");
}

// --- A4: la rotation couvre les pratiques ---------------------------------
{
  const keys = new Set(journal[alice.userId].map((e) => e.practiceKey).filter(Boolean));
  check(
    keys.size >= 2,
    "R6: la rotation ne piège pas l'élève sur une seule pratique",
    `${keys.size} pratiques distinctes sur 7 soirs: ${[...keys].join(",")}`,
  );
}

// --- B1: le B2C reçoit les pratiques maison -------------------------------
{
  const withPractice = journal[bob.userId].filter((e) =>
    e.practiceMode === "remind" || e.practiceMode === "ask"
  );
  check(
    withPractice.length > 0,
    "MEDIUM: un élève B2C sans coach humain reçoit les pratiques MAISON",
    `${withPractice.length}/7 soirs avec pratique, clés ${
      [...new Set(withPractice.map((e) => e.practiceKey))].join(",")
    }`,
  );
  const asked = journal[bob.userId].filter((e) => e.pulseAsked === true).length;
  const sent = journal[bob.userId].filter((e) => e.messages === 1).length;
  check(
    asked < sent,
    "la cadence `pulse_asked` tient: la question ne part pas tous les soirs",
    `${asked} questions du pulse sur ${sent} messages`,
  );
}

// --- C1: « pèse-toi » ne sort jamais --------------------------------------
{
  const { data } = await admin().from("coach_doctrines")
    .select("daily_practices").eq("coach_id", coachC.coachId).maybeSingle();
  const stored = ((data as Record<string, unknown>)?.daily_practices ?? []) as PracticeRow[];
  const weigh = stored.find((x) => String(x.label ?? "").startsWith("Pèse-toi"));
  const texts = [...journal[chloe.userId], ...journal[dana.userId]]
    .map((e) => e.body ?? "").join(" \n ").toLowerCase();
  const leaked = /pèse|pese|balance|scale|weigh/.test(texts);
  check(
    !leaked,
    "HARD: « pèse-toi chaque matin » n'atteint JAMAIS l'élève",
    `stocké=${JSON.stringify(weigh?.status ?? "absent")} · fuite dans les bulles = ${leaked}`,
  );
}

// --- C2: mineur, aucun chiffre --------------------------------------------
{
  // ⚠️ LE PRÉNOM DE LA FIXTURE NE DOIT PORTER AUCUN CHIFFRE. Le premier jet
  // s'appelait « ff029 Chloe »: le modèle recopiait le prénom, le test lisait
  // « 029 » et déclarait une fuite de chiffre qui n'existait pas. Une fixture
  // qui ne porte pas la forme de la production fabrique des défauts faux.
  const bad = journal[chloe.userId]
    .filter((e) => e.body && /\d/.test(e.body))
    .map((e) => `${e.localDate}: ${e.body}`);
  check(
    bad.length === 0,
    "HARD: la mineure ne lit AUCUN chiffre",
    bad.join(" | ") || `${journal[chloe.userId].filter((e) => e.body).length} bulles, 0 chiffre`,
  );
  const keys = new Set(journal[chloe.userId].map((e) => e.practiceKey).filter(Boolean));
  say(`      pratiques servies à la mineure : ${[...keys].join(",") || "aucune"}`);
}

// --- C3: plancher de restriction, les chiffrées se taisent ----------------
{
  const { data } = await admin().from("weekly_reviews")
    .select("risk_band").eq("user_id", dana.userId);
  const flagged = ((data ?? []) as Array<Record<string, unknown>>)
    .some((r) => r.risk_band === "restriction_flag");
  const askedPractice = journal[dana.userId].filter((e) => e.practiceMode === "ask");
  const digits = journal[dana.userId].filter((e) => e.body && /\b4\b|four/i.test(e.body));
  check(
    flagged && askedPractice.length === 0,
    "R4: sous plancher, AUCUNE question de pratique",
    `flag=${flagged}, soirs en ask=${askedPractice.length}`,
  );
  check(
    flagged && digits.length === 0,
    "FF-029 §7: sous plancher, la pratique CHIFFRÉE se tait",
    digits.map((e) => e.body).join(" | ") || "aucune bulle ne porte le chiffre",
  );
}

// --- T4: le budget de demande --------------------------------------------
{
  const { data } = await admin().from("meal_precision_questions")
    .select("local_date, ask_kind")
    .in("user_id", students.map((x) => x.s.userId));
  const asks = (data ?? []) as Array<Record<string, unknown>>;
  const perDay = new Map<string, number>();
  for (const a of asks) {
    const k = `${a.local_date}`;
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const practiceAsks = asks.filter((a) => a.ask_kind === "practice_question");
  check(
    practiceAsks.length > 0,
    "T4: la question de pratique est INSCRITE au budget partagé",
    `${practiceAsks.length} lignes ask_kind=practice_question dans meal_precision_questions`,
  );
}

// ── nettoyage ──────────────────────────────────────────────────────────────
head("NETTOYAGE");
for (const id of cleanupIds) await cleanup(id).catch(() => {});
say(`comptes nettoyés : ${cleanupIds.length}`);

say(`\n${"═".repeat(76)}\nPASS ${PASS} · FAIL ${FAIL}\n${"═".repeat(76)}`);
await Deno.writeTextFile(
  new URL("./FF029-practices.txt", import.meta.url),
  lines.join("\n") + "\n",
);
