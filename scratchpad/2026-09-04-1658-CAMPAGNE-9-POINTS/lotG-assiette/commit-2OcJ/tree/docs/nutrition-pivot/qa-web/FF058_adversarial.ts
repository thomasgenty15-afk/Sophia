/**
 * FF-058 — REVUE ADVERSARIALE. Les hypothèses sont écrites AVANT d'être testées.
 *
 * H1 · LE JOUR FUTUR FABRIQUÉ. La charge d'un bouton porte des INDEX. Rien
 *      n'oblige l'index à désigner un plat d'AUJOURD'HUI: un payload forgé qui
 *      cite le plat de demain ferait-il écrire une coche datée de demain ?
 *      `isReportable` existe précisément pour interdire ça — « cocher lundi le
 *      dîner de vendredi écrirait un "j'ai mangé" daté de vendredi, dans la
 *      table même qui nourrit la couverture que le coach lit. Ce n'est pas une
 *      imprécision, c'est une preuve fabriquée. »
 *
 * H2 · LE PLAN D'AUTRUI. La charge porte un `mealId`. Un payload forgé qui cite
 *      la composition d'un AUTRE élève écrirait-il une coche chez moi, avec le
 *      titre de SON plat — c'est-à-dire une fuite de sa composition dans ma
 *      bulle et dans ma table de faits ?
 *
 * H3 · LA COCHE PAR PROCURATION. Existe-t-il un chemin, même indirect, par
 *      lequel le tap d'un compte écrirait une ligne attribuée à quelqu'un
 *      d'autre ? Se prouve par l'ABSENCE DE CHEMIN, pas par l'absence
 *      d'intention.
 *
 * H4 · LA CONCURRENCE. Deux taps SIMULTANÉS sur `[✓ Tout comme prévu]`
 *      font-ils deux lignes par plat ?
 *
 * H5 · L'AFFORDANCE QUI REDEVIENT UNE QUESTION par un titre de plat. Un plat
 *      nommé « Did you eat it? » ferait-il lire la bande comme une question ?
 *
 * H6 · LE VERDICT QUI REVIENT. L'accusé du `✓` peut-il porter un compliment, un
 *      score ou une série — par un chemin que les ceintures du soir ne
 *      regardent pas ?
 */

import {
  admin,
  callAs,
  callCron,
  type Coach,
  cleanup,
  makeCoach,
  makeStudent,
  nonce,
  publishPlanFor,
  rows,
  scalar,
  type Student,
} from "./harness.ts";

const db = admin();
const created: string[] = [];
let pass = 0;
let fail = 0;

function say(l: string): void {
  console.log(l);
}
function check(id: string, name: string, ok: boolean, proof: string): void {
  if (ok) pass++;
  else fail++;
  say(`${ok ? "🟢" : "🔴"} ${id} — ${name}\n      ${proof}`);
}

function eveningTimezone(nowIso: string): string {
  const d = new Date(nowIso);
  const utcHour = d.getUTCHours() + d.getUTCMinutes() / 60;
  let offset = Math.round(20.5 - utcHour);
  while (offset > 14) offset -= 24;
  while (offset < -11) offset += 24;
  if (offset === 0) return "Etc/GMT";
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}
function localDateIn(iso: string, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
const DAY_TOKENS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const tokenOf = (d: string) =>
  DAY_TOKENS[new Date(`${d}T12:00:00Z`).getUTCDay()];
function addDays(d: string, n: number): string {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

const NOW = new Date().toISOString();
const TZ = eveningTimezone(NOW);
const TODAY = localDateIn(NOW, TZ);
say(`horloge ${NOW} · fuseau ${TZ} · jour local ${TODAY}\n`);

let coachPool: Coach | null = null;
let seats = 0;
async function nextCoach(): Promise<Coach> {
  if (!coachPool || seats >= 3) {
    coachPool = await makeCoach({ displayName: `FF058adv ${nonce()}`, country: "GB" });
    const { error } = await db.from("coach_doctrines").insert({
      coach_id: coachPool.coachId,
      version: 1,
      beliefs: [{ claim: "Protein anchors every meal.", rationale: null }],
      forbidden: [],
      vocabulary: [],
      arbitrations: [],
      voice: { tone: "Direct." },
      foods: { recommended: [], discouraged: [] },
      content_locale: "en",
      published_at: new Date().toISOString(),
      published_by: coachPool.userId,
    } as never);
    if (error) throw new Error(error.message);
    seats = 0;
  }
  seats++;
  return coachPool;
}

async function newStudent(name: string): Promise<Student> {
  const coach = await nextCoach();
  const s = await makeStudent({
    coach,
    timezone: TZ,
    country: "GB",
    locale: "en-US",
    fullName: name,
  });
  created.push(s.userId);
  await publishPlanFor(coach, s.userId, { timezone: TZ });
  return s;
}

async function plantPlan(args: {
  userId: string;
  dishes: Array<{ title: string; slot: string; day: string }>;
  startsOn?: string;
  durationDays?: number;
}): Promise<string> {
  const { data, error } = await db.from("student_generated_meals").insert({
    user_id: args.userId,
    scope: "several_days",
    mode: "from_pantry",
    servings: 1,
    dishes: args.dishes.map((d) => ({ ...d, ingredients: [], uses: [] })),
    shopping_list: [],
    preparations: [],
    generated_from: { ff058adv: true },
    content_locale: "en-GB",
    starts_on: args.startsOn ?? TODAY,
    duration_days: args.durationDays ?? 4,
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`plan: ${error.message}`);
  return String((data as { id: string }).id);
}

async function tap(
  student: Student,
  payload: string,
): Promise<{ status: number; json: unknown; ack: string | null }> {
  const before = new Date().toISOString();
  const res = await callAs(student, "chat-inbound-v1", {
    client_message_id: `ff058adv-${nonce()}`,
    kind: "button",
    text: "tap",
    button_payload: payload,
  });
  const { data } = await db
    .from("chat_messages")
    .select("content")
    .eq("user_id", student.userId)
    .eq("role", "assistant")
    .gt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(1);
  const found = (data ?? []) as Array<{ content: string }>;
  return { status: res.status, json: res.json, ack: found[0]?.content ?? null };
}

try {
  // ══ H1 — LE JOUR FUTUR FABRIQUÉ ═════════════════════════════════════════
  say(`${"═".repeat(74)}\n▌ H1 — un index forgé qui désigne le plat de DEMAIN\n${"═".repeat(74)}`);
  const forger = await newStudent("Fay FORGE");
  const planForge = await plantPlan({
    userId: forger.userId,
    dishes: [
      { title: "Today lunch", slot: "lunch", day: tokenOf(TODAY) },
      { title: "Tomorrow dinner", slot: "dinner", day: tokenOf(addDays(TODAY, 1)) },
    ],
  });
  // Index 1 = le plat de DEMAIN. La bande ne l'a jamais montré: on forge.
  const forged = `KEEL_STRIP_ALL|${planForge}|0,1`;
  const forgeRes = await tap(forger, forged);
  const forgeRows = await rows(
    `select source_message_id, local_date, student_note from protocol_events ` +
      `where user_id='${forger.userId}' order by source_message_id`,
  );
  const futureRows = forgeRows.filter((r) => r.includes(addDays(TODAY, 1)));
  check(
    "H1",
    "une charge forgée qui cite le plat de DEMAIN écrit-elle un fait daté de demain ?",
    futureRows.length === 0,
    `handled=${JSON.stringify((forgeRes.json as { handled_by?: string })?.handled_by)}\n      ` +
      forgeRows.join("\n      ") +
      `\n      lignes datées de demain : ${futureRows.length}`,
  );

  // ══ H2 — LE PLAN D'AUTRUI ═══════════════════════════════════════════════
  say(`\n${"═".repeat(74)}\n▌ H2 — une charge qui cite la composition d'un AUTRE élève\n${"═".repeat(74)}`);
  const victim = await newStudent("Vera VICTIM");
  const planVictim = await plantPlan({
    userId: victim.userId,
    dishes: [{ title: "SECRET private dish of Vera", slot: "lunch", day: tokenOf(TODAY) }],
  });
  const attacker = await newStudent("Alex ATTACK");
  await plantPlan({
    userId: attacker.userId,
    dishes: [{ title: "Attacker own dish", slot: "lunch", day: tokenOf(TODAY) }],
  });
  const stolen = `KEEL_STRIP_ALL|${planVictim}|0`;
  const stolenRes = await tap(attacker, stolen);
  const attackerRows = await rows(
    `select source_message_id, student_note from protocol_events where user_id='${attacker.userId}'`,
  );
  const victimRows = await rows(
    `select source_message_id, student_note from protocol_events where user_id='${victim.userId}'`,
  );
  const leaked = attackerRows.some((r) => r.includes("SECRET"));
  check(
    "H2",
    "une charge qui cite le plan d'un AUTRE élève fait-elle fuir son plat ?",
    !leaked,
    `ack=${JSON.stringify(stolenRes.ack)}\n      attaquant : ${
      attackerRows.join(" ; ") || "(aucune ligne)"
    }\n      victime : ${victimRows.join(" ; ") || "(aucune ligne)"}`,
  );
  check(
    "H2b",
    "…et rien n'est écrit chez la VICTIME",
    victimRows.length === 0,
    `${victimRows.length} lignes chez la victime`,
  );

  // ══ H3 — LA COCHE PAR PROCURATION ═══════════════════════════════════════
  say(`\n${"═".repeat(74)}\n▌ H3 — écrire chez quelqu'un d'autre\n${"═".repeat(74)}`);
  const foreign = await rows(
    `select count(*) from protocol_events pe ` +
      `where pe.source_message_id like 'meal_tick:${planVictim}:%' and pe.user_id <> '${victim.userId}'`,
  );
  check(
    "H3",
    "aucune ligne n'est jamais écrite sur un user_id autre que le porteur du JWT",
    foreign[0] === "0",
    `lignes du plan de Vera portées par quelqu'un d'autre : ${foreign[0]}`,
  );
  const waveForeign = await scalar(
    `select count(*) from grocery_wave_states g ` +
      `join student_generated_meals m on m.id = g.generated_meal_id ` +
      `where g.user_id <> m.user_id`,
  );
  check(
    "H3b",
    "aucun état de vague n'est écrit sur le plan d'un autre compte",
    waveForeign === 0,
    `états de vague croisés en base : ${waveForeign}`,
  );

  // ══ H4 — LA CONCURRENCE ═════════════════════════════════════════════════
  say(`\n${"═".repeat(74)}\n▌ H4 — deux taps SIMULTANÉS\n${"═".repeat(74)}`);
  const racer = await newStudent("Remi RACE");
  const planRace = await plantPlan({
    userId: racer.userId,
    dishes: [
      { title: "Race one", slot: "lunch", day: tokenOf(TODAY) },
      { title: "Race two", slot: "dinner", day: tokenOf(TODAY) },
    ],
  });
  const racePayload = `KEEL_STRIP_ALL|${planRace}|0,1`;
  // `client_message_id` DIFFÉRENTS: `inbound_dedup` ne doit PAS être ce qui
  // sauve — on veut éprouver l'index unique de `protocol_events`, pas la dedup.
  await Promise.all([tap(racer, racePayload), tap(racer, racePayload)]);
  const raceRows = await rows(
    `select source_message_id, count(*) from protocol_events where user_id='${racer.userId}' group by 1 order by 1`,
  );
  check(
    "H4",
    "deux taps simultanés ⇒ UNE ligne par plat (arbitré par Postgres)",
    raceRows.length === 2 && raceRows.every((r) => r.endsWith("|1")),
    raceRows.join("\n      "),
  );

  // Et la même course sur l'état de vague (upsert, dernière réponse gagne).
  const wavePayloadDone = `KEEL_STRIP_SHOP_DONE|${planRace}|${TODAY}`;
  const wavePayloadLater = `KEEL_STRIP_SHOP_LATER|${planRace}|${TODAY}`;
  await Promise.all([tap(racer, wavePayloadDone), tap(racer, wavePayloadLater)]);
  const waveRows = await rows(
    `select count(*) from grocery_wave_states where user_id='${racer.userId}' and generated_meal_id='${planRace}'`,
  );
  check(
    "H4b",
    "deux réponses simultanées sur la vague ⇒ UNE ligne (un état, pas un journal)",
    waveRows[0] === "1",
    `${waveRows[0]} ligne(s)`,
  );

  // ══ H5 — L'AFFORDANCE QUI REDEVIENT UNE QUESTION ════════════════════════
  say(`\n${"═".repeat(74)}\n▌ H5 — un titre de plat interrogatif\n${"═".repeat(74)}`);
  const tricky = await newStudent("Tia TRICK");
  await plantPlan({
    userId: tricky.userId,
    dishes: [
      { title: "Did you eat it?", slot: "lunch", day: tokenOf(TODAY) },
      { title: "Comment ça va soup", slot: "dinner", day: tokenOf(TODAY) },
    ],
  });
  await callCron("keel-daily-pulse-v1", { now: NOW, budget_ms: 60_000 });
  const trickyMsg = await rows(
    `select replace(content, chr(10), ' ⏎ ') from chat_messages ` +
      `where user_id='${tricky.userId}' and role='assistant' order by created_at desc limit 1`,
  );
  const trickyBody = trickyMsg[0] ?? "";
  const stripPart = trickyBody.split("How was today?")[0] ?? "";
  check(
    "H5",
    "un titre interrogatif ne fait pas lire la bande comme une question",
    !stripPart.includes("?"),
    JSON.stringify(trickyBody),
  );

  // ══ H6 — LE VERDICT QUI REVIENT ═════════════════════════════════════════
  say(`\n${"═".repeat(74)}\n▌ H6 — tous les accusés du chemin, relus en base\n${"═".repeat(74)}`);
  const acks = await rows(
    `select distinct content from chat_messages ` +
      `where role='assistant' and metadata->>'purpose'='keel_evening_strip_ack' ` +
      `and user_id in (${created.map((u) => `'${u}'`).join(",")})`,
  );
  const badAck = acks.filter((a) =>
    /\d/.test(a) ||
    /(bravo|well done|nice (work|going|job)|great|super|f[ée]licit|keep it up|continue comme|série|streak)/i
      .test(a)
  );
  check(
    "H6",
    "aucun accusé de la bande ne porte de chiffre, de compliment ou de série",
    badAck.length === 0,
    `${acks.length} accusés distincts : ${acks.join(" | ")}`,
  );
} catch (error) {
  fail++;
  say(`\n🔴 EXCEPTION : ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  for (const u of created) {
    await db.from("grocery_wave_states").delete().eq("user_id", u);
    await db.from("student_generated_meals").delete().eq("user_id", u);
    await db.from("meal_precision_questions").delete().eq("user_id", u);
    await db.from("plan_commitments").delete().eq("user_id", u);
    await db.from("plan_versions").delete().eq("student_id", u);
    await cleanup(u);
  }
  say(`\n${"═".repeat(74)}\n▌ ${pass} verts · ${fail} rouges — ${created.length} élèves nettoyés\n${"═".repeat(74)}`);
}
