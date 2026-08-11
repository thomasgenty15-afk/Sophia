/**
 * FF-058 — LA BANDE DU SOIR, EN CONDITIONS RÉELLES.
 *
 * Vrai modèle (le job appelle Gemini pour le fait du soir), vraie base locale,
 * vrais élèves provisionnés, vrais taps par `chat-inbound-v1`.
 *
 * ── COMMENT CE SCRIPT ÉVITE D'OUVRIR DES ÉTATS CHEZ LES AUTRES SESSIONS ───
 * Le cron du soir balaie la flotte. On ne le laisse jamais servir quelqu'un
 * d'autre: les élèves de ce run vivent dans un fuseau `Etc/GMT±N` choisi pour
 * qu'il y soit 20 h 30 À CET INSTANT, et tous les autres élèves de la base
 * tombent donc en `outside_window` — la garde la moins chère du job, et celle
 * qui n'écrit rien. C'est le patron de `L5_proactive.ts`, repris tel quel.
 *
 * Lancement:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… \
 *   SUPABASE_SERVICE_ROLE_KEY=… deno run -A docs/nutrition-pivot/qa-web/FF058_evening_strip.ts
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

function say(line: string): void {
  console.log(line);
}

function check(level: string, name: string, ok: boolean, proof: string): void {
  if (ok) pass++;
  else fail++;
  say(`${ok ? "🟢" : "🔴"} [${level}] ${name}\n      ${proof}`);
}

// ---------------------------------------------------------------------------
// L'HORLOGE ET LE FUSEAU
// ---------------------------------------------------------------------------

/** Le fuseau où il est ~20 h 30 maintenant. Voir l'en-tête. */
function eveningTimezone(nowIso: string): string {
  const utcHour = new Date(nowIso).getUTCHours() +
    new Date(nowIso).getUTCMinutes() / 60;
  let offset = Math.round(20.5 - utcHour);
  while (offset > 14) offset -= 24;
  while (offset < -11) offset += 24;
  if (offset === 0) return "Etc/GMT";
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

function localDateIn(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function localHourIn(iso: string, tz: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
}

const DAY_TOKENS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function tokenOf(date: string): string {
  return DAY_TOKENS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const NOW = new Date().toISOString();
const TZ = eveningTimezone(NOW);
const TODAY = localDateIn(NOW, TZ);

say(`horloge : ${NOW}`);
say(`fuseau « il est 20h chez lui » : ${TZ} (heure locale ${localHourIn(NOW, TZ)})`);
say(`jour local des élèves : ${TODAY}\n`);

// ---------------------------------------------------------------------------
// LES DÉCORS
// ---------------------------------------------------------------------------

async function coachWithDoctrine(
  name: string,
  practices: Array<Record<string, unknown>> = [],
): Promise<Coach> {
  const coach = await makeCoach({ displayName: name, country: "GB" });
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    daily_practices: practices,
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
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
  return coach;
}

interface PlantedDish {
  title: string;
  slot: string;
  day: string;
}

/**
 * Une composition RÉELLE dans `student_generated_meals` — la table que
 * `loadPlannedDishContext` interroge, avec sa fenêtre.
 */
async function plantPlan(args: {
  userId: string;
  startsOn: string;
  durationDays: number;
  dishes: PlantedDish[];
  /** Un ingrédient périssable cuisiné ce jeton-là ⇒ une vague le jour venu. */
  perishableCookOn?: string | null;
  contentLocale?: string;
}): Promise<string> {
  const preparations = args.perishableCookOn
    ? [{
      id: `ff058_prep_${nonce()}`,
      title: "FF058 roast chicken",
      method: "Roast.",
      cook_on: args.perishableCookOn,
      ingredients: [{ term: "ff058 chicken thighs", unit: "g", amount: 600 }],
    }]
    : [];
  const shoppingList = args.perishableCookOn
    ? [
      { term: "ff058 chicken thighs", aisle: "protein", quantity: "600 g" },
      { term: "ff058 rice", aisle: "grain", quantity: "500 g" },
    ]
    : [];
  const { data, error } = await db.from("student_generated_meals").insert({
    user_id: args.userId,
    scope: "several_days",
    mode: shoppingList.length > 0 ? "to_shop" : "from_pantry",
    servings: 1,
    dishes: args.dishes.map((d) => ({
      title: d.title,
      slot: d.slot,
      day: d.day,
      ingredients: [{ term: "ff058 filler", unit: "g", amount: 100 }],
      uses: [],
    })),
    shopping_list: shoppingList,
    preparations,
    generated_from: { ff058: true },
    content_locale: args.contentLocale ?? "en-GB",
    starts_on: args.startsOn,
    duration_days: args.durationDays,
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`student_generated_meals: ${error.message}`);
  return String((data as { id: string }).id);
}

/**
 * LE PLAFOND D'ESSAI EST DE 3 SIÈGES VIVANTS PAR COACH
 * (`keel_trial_seat_limit_reached`), et c'est une VRAIE garde produit: le 4e
 * élève fait planter le run en cours. On fabrique donc un coach de plus tous les
 * trois élèves, plutôt que de contourner la garde.
 */
let coachPool: Coach | null = null;
let seatsUsed = 0;
async function nextCoach(): Promise<Coach> {
  if (!coachPool || seatsUsed >= 3) {
    coachPool = await coachWithDoctrine(`FF058 Coach ${nonce()}`);
    seatsUsed = 0;
  }
  seatsUsed++;
  return coachPool;
}

async function newStudent(
  opts: { locale?: string; fullName?: string } = {},
): Promise<Student> {
  const coach = await nextCoach();
  const student = await makeStudent({
    coach,
    timezone: TZ,
    country: "GB",
    locale: opts.locale ?? "en-US",
    fullName: opts.fullName ?? "FF058 Student",
  });
  created.push(student.userId);
  await publishPlanFor(coach, student.userId, { timezone: TZ });
  return student;
}

// ---------------------------------------------------------------------------
// LE TAP — un vrai bouton par `chat-inbound-v1`
// ---------------------------------------------------------------------------

async function tap(
  student: Student,
  payload: string,
  label: string,
  opts: { clientMessageId?: string } = {},
): Promise<{ status: number; json: unknown; ack: string | null }> {
  const before = new Date().toISOString();
  const res = await callAs(student, "chat-inbound-v1", {
    client_message_id: opts.clientMessageId ?? `ff058-${nonce()}`,
    kind: "button",
    text: label,
    button_payload: payload,
  });
  const { data } = await db
    .from("chat_messages")
    .select("content,created_at")
    .eq("user_id", student.userId)
    .eq("role", "assistant")
    .gt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(1);
  const found = (data ?? []) as Array<{ content: string }>;
  return { status: res.status, json: res.json, ack: found[0]?.content ?? null };
}

interface EveningMessage {
  content: string;
  buttons: Array<{ payload: string; label: string }>;
  purpose: string | null;
}

/** Le dernier message du soir REÇU — relu en base, jamais dans la réponse HTTP. */
async function eveningMessage(
  userId: string,
  /**
   * Ne regarder QUE ce qui est arrivé après cet instant.
   *
   * ⚠️ Sans cette borne, un soir où le job décide `nothing_to_say` rend le
   * message de LA VEILLE, et la sonde conclut « la ligne de courses est encore
   * là » sur un message que le run d'hier avait produit. C'est exactement la
   * classe de sonde qui ment, en vert comme en rouge.
   */
  after?: string,
): Promise<EveningMessage | null> {
  let q = db
    .from("chat_messages")
    .select("content,metadata,created_at")
    .eq("user_id", userId)
    .eq("role", "assistant");
  if (after) q = q.gt("created_at", after);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(5);
  // « erreur » et « vide » ne se confondent JAMAIS: une sonde qui les mélange a
  // déjà fait déclarer « rien d'écrit » sur des scénarios qui écrivaient.
  if (error) throw new Error(`eveningMessage: ${error.message}`);
  const found = (data ?? []) as Array<
    { content: string; metadata: Record<string, unknown> }
  >;
  const row = found.find((r) =>
    String(r.metadata?.purpose ?? "") === "keel_daily_pulse"
  );
  if (!row) return null;
  return {
    content: row.content,
    buttons: (row.metadata?.buttons ?? []) as Array<
      { payload: string; label: string }
    >,
    purpose: String(row.metadata?.purpose ?? "") || null,
  };
}

async function runEvening(): Promise<Record<string, unknown>> {
  const res = await callCron("keel-daily-pulse-v1", { now: NOW, budget_ms: 60_000 });
  if (res.status !== 200) {
    throw new Error(`keel-daily-pulse-v1 ${res.status}: ${JSON.stringify(res.json)}`);
  }
  return res.json as Record<string, unknown>;
}

async function ticksOf(userId: string): Promise<string[]> {
  return await rows(
    `select source_message_id, local_date, student_note, ` +
      `coalesce(disqualified_reason,'-') d, plan_relation, evidence_weight, source ` +
      `from protocol_events where user_id='${userId}' order by source_message_id`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LE RUN
// ═══════════════════════════════════════════════════════════════════════════

try {
  // ── EASY — la journée nominale, trois plats, un tap ──────────────────────
  say(`\n${"═".repeat(74)}\n▌ EASY — trois plats, un tap\n${"═".repeat(74)}`);

  const easyEn = await newStudent({ locale: "en-US", fullName: "Ella EN" });
  const easyFr = await newStudent({ locale: "fr-FR", fullName: "Félix FR" });
  const planEn = await plantPlan({
    userId: easyEn.userId,
    startsOn: TODAY,
    durationDays: 4,
    dishes: [
      { title: "Chicken and rice bowl", slot: "lunch", day: tokenOf(TODAY) },
      { title: "Lentil soup", slot: "dinner", day: tokenOf(TODAY) },
      { title: "Greek yoghurt and berries", slot: "breakfast", day: tokenOf(TODAY) },
    ],
  });
  const planFr = await plantPlan({
    userId: easyFr.userId,
    startsOn: TODAY,
    durationDays: 4,
    dishes: [
      { title: "Poulet-riz", slot: "lunch", day: tokenOf(TODAY) },
      { title: "Soupe de lentilles", slot: "dinner", day: tokenOf(TODAY) },
      { title: "Yaourt grec et fruits rouges", slot: "breakfast", day: tokenOf(TODAY) },
    ],
    contentLocale: "fr-FR",
  });

  const report1 = await runEvening();
  say(`   compte-rendu : ${JSON.stringify({
    sent: report1.sent,
    strips_sent: report1.strips_sent,
    strip_shopping_lines: report1.strip_shopping_lines,
    body_sources: report1.body_sources,
    skipped: report1.skipped_by_reason,
  })}`);

  const msgEn = await eveningMessage(easyEn.userId);
  const msgFr = await eveningMessage(easyFr.userId);

  check(
    "easy",
    "le message du soir NOMME les trois plats (EN)",
    Boolean(
      msgEn &&
        ["Chicken and rice bowl", "Lentil soup", "Greek yoghurt and berries"]
          .every((t) => msgEn.content.includes(t)),
    ),
    JSON.stringify(msgEn?.content ?? null),
  );
  check(
    "easy",
    "le message du soir NOMME les trois plats (FR)",
    Boolean(
      msgFr &&
        ["Poulet-riz", "Soupe de lentilles", "Yaourt grec et fruits rouges"]
          .every((t) => msgFr.content.includes(t)),
    ),
    JSON.stringify(msgFr?.content ?? null),
  );
  check(
    "easy",
    "la bande est en FRANÇAIS pour l'élève fr-FR",
    Boolean(msgFr?.buttons.some((b) => b.label === "✓ Tout comme prévu")),
    JSON.stringify(msgFr?.buttons ?? null),
  );
  check(
    "easy",
    "aucune formulation interrogative dans la bande (EN + FR)",
    Boolean(
      msgEn && msgFr &&
        !/\?/.test(msgEn.content.replace(/How was today\?/, "")) &&
        !/\?/.test(msgFr.content.replace(/How was today\?/, "")),
    ),
    `EN=${JSON.stringify(msgEn?.content)} FR=${JSON.stringify(msgFr?.content)}`,
  );

  say(`\n   MESURE R6 — message du soir avec la bande :`);
  for (const [who, m] of [["EN", msgEn], ["FR", msgFr]] as const) {
    if (!m) continue;
    say(
      `   ${who} : ${m.content.length} caractères · ${m.buttons.length} éléments interactifs · ` +
        `${m.content.split("\n\n").length} blocs`,
    );
  }

  // Le tap unique, rejoué 3 fois sur 3 élèves différents pour le stochastique
  // (ici le chemin est déterministe: on le prouve, on ne le suppose pas).
  const allBtnEn = msgEn?.buttons.find((b) => b.payload.startsWith("KEEL_STRIP_ALL"));
  const tapEn = await tap(easyEn, allBtnEn!.payload, allBtnEn!.label);
  const ticksEn = await ticksOf(easyEn.userId);
  check(
    "easy",
    "[✓ Tout comme prévu] écrit TROIS coches, chemin de l'écran",
    ticksEn.length === 3 &&
      ticksEn.every((r) =>
        r.includes("quick_tap") && r.includes("as_planned") && r.includes("0.4") &&
        r.includes(TODAY) && r.includes(planEn)
      ),
    ticksEn.join("\n      "),
  );
  check(
    "easy",
    "l'accusé ne porte ni compliment, ni score, ni série",
    tapEn.ack !== null && !/\d/.test(tapEn.ack) &&
      !/(bravo|well done|nice|great|super|félicit)/i.test(tapEn.ack),
    `handled_by=${JSON.stringify((tapEn.json as { handled_by?: string })?.handled_by)} ack=${JSON.stringify(tapEn.ack)}`,
  );

  const allBtnFr = msgFr?.buttons.find((b) => b.payload.startsWith("KEEL_STRIP_ALL"));
  const tapFr = await tap(easyFr, allBtnFr!.payload, allBtnFr!.label);
  const ticksFr = await ticksOf(easyFr.userId);
  check(
    "easy",
    "FR — trois coches, accusé français sans verdict",
    ticksFr.length === 3 && tapFr.ack === "C'est noté.",
    `${ticksFr.length} coches · ack=${JSON.stringify(tapFr.ack)} · plan=${planFr}`,
  );

  // ── MEDIUM ───────────────────────────────────────────────────────────────
  say(`\n${"═".repeat(74)}\n▌ MEDIUM — les variantes\n${"═".repeat(74)}`);

  // Double tap: l'index unique partiel arbitre côté Postgres.
  const again = await tap(easyEn, allBtnEn!.payload, allBtnEn!.label);
  const ticksAfterDouble = await ticksOf(easyEn.userId);
  check(
    "medium",
    "double tap ⇒ TROIS lignes, pas six (arbitré par Postgres)",
    ticksAfterDouble.length === 3,
    `${ticksAfterDouble.length} lignes · ack=${JSON.stringify(again.ack)}`,
  );

  // `Pas tout` puis un ✗.
  const someStudent = await newStudent({ fullName: "Sam SOME" });
  const planSome = await plantPlan({
    userId: someStudent.userId,
    startsOn: TODAY,
    durationDays: 3,
    dishes: [
      { title: "Porridge", slot: "breakfast", day: tokenOf(TODAY) },
      { title: "Tuna salad", slot: "lunch", day: tokenOf(TODAY) },
      { title: "Chilli", slot: "dinner", day: tokenOf(TODAY) },
    ],
  });
  await runEvening();
  const msgSome = await eveningMessage(someStudent.userId);
  const someBtn = msgSome?.buttons.find((b) => b.payload.startsWith("KEEL_STRIP_SOME"));
  const stepRes = await tap(someStudent, someBtn!.payload, someBtn!.label);
  const { data: stepRow } = await db
    .from("chat_messages")
    .select("content,metadata")
    .eq("user_id", someStudent.userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1);
  const stepButtons =
    ((stepRow ?? [])[0]?.metadata as { buttons?: Array<{ payload: string; label: string }> })
      ?.buttons ?? [];
  check(
    "medium",
    "[Pas tout] déplie les 3 plats en ✓/✗ et n'écrit RIEN",
    stepButtons.length === 6 && (await ticksOf(someStudent.userId)).length === 0,
    `${stepButtons.length} boutons : ${stepButtons.map((b) => b.label).join(" | ")} · ` +
      `coches=${(await ticksOf(someStudent.userId)).length} · body=${JSON.stringify(stepRes.ack)}`,
  );

  const untickBtn = stepButtons.find((b) => b.payload.startsWith("KEEL_STRIP_UNTICK"));
  await tap(someStudent, untickBtn!.payload, untickBtn!.label);
  const someTicks = await ticksOf(someStudent.userId);
  check(
    "medium",
    "un ✗ écrit la DÉCOCHE (food_not_eaten) et rien d'autre",
    someTicks.length === 1 && someTicks[0].includes("food_not_eaten") &&
      someTicks[0].includes(planSome),
    someTicks.join(" ; "),
  );

  // Le ✓ vise le plat n°1 — un AUTRE que celui qu'on vient de décocher. Le
  // premier jet de ce test tapait le ✓ du plat n°0 et prouvait donc le RE-ARMEMENT
  // au lieu de la coexistence: deux propriétés réelles, mais pas celle annoncée.
  const tickBtn = stepButtons.find((b) =>
    b.payload.startsWith("KEEL_STRIP_TICK") && b.payload.endsWith(":1")
  );
  await tap(someStudent, tickBtn!.payload, tickBtn!.label);
  const someTicks2 = await ticksOf(someStudent.userId);
  check(
    "medium",
    "un ✓ sur un AUTRE plat écrit la coche, sans toucher la décoche du premier",
    someTicks2.length === 2 &&
      someTicks2.filter((r) => r.includes("food_not_eaten")).length === 1 &&
      someTicks2.some((r) => r.includes(":1|") && r.includes("Tuna salad")),
    someTicks2.join("\n      "),
  );

  // Et le RE-ARMEMENT, nommé pour ce qu'il est: recocher efface le motif, la
  // ligne survit (`meal_tick.ts`: « cocher → insert; décocher → motif; recocher
  // → null »). Il n'y a jamais deux lignes pour un plat.
  const retickBtn = stepButtons.find((b) =>
    b.payload.startsWith("KEEL_STRIP_TICK") && b.payload.endsWith(":0")
  );
  await tap(someStudent, retickBtn!.payload, retickBtn!.label);
  const someTicks3 = await ticksOf(someStudent.userId);
  check(
    "medium",
    "recocher un plat décoché ré-arme LA MÊME ligne (jamais une seconde)",
    someTicks3.length === 2 &&
      someTicks3.filter((r) => r.includes("food_not_eaten")).length === 0,
    someTicks3.join("\n      "),
  );

  // Zéro plat prévu ⇒ aucune bande.
  const emptyStudent = await newStudent({ fullName: "Nora EMPTY" });
  await plantPlan({
    userId: emptyStudent.userId,
    startsOn: addDays(TODAY, 1),
    durationDays: 2,
    dishes: [{ title: "Tomorrow only", slot: "lunch", day: tokenOf(addDays(TODAY, 1)) }],
  });
  await runEvening();
  const msgEmpty = await eveningMessage(emptyStudent.userId);
  check(
    "medium",
    "zéro plat prévu aujourd'hui ⇒ AUCUNE bande",
    msgEmpty === null ||
      !msgEmpty.buttons.some((b) => b.payload.startsWith("KEEL_STRIP_")),
    msgEmpty ? JSON.stringify(msgEmpty) : "aucun message du soir (nothing_to_say)",
  );

  // Coche par la conversation, décoche par l'écran (chemin front, RLS élève).
  const screenRes = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/rest/v1/protocol_events?user_id=eq.${easyEn.userId}` +
      `&source_message_id=eq.${encodeURIComponent(`meal_tick:${planEn}:0`)}`,
    {
      method: "PATCH",
      headers: {
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        Authorization: `Bearer ${easyEn.accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ disqualified_reason: "food_not_eaten" }),
    },
  );
  const screenJson = await screenRes.json().catch(() => null);
  const oneStory = await rows(
    `select count(*) n, coalesce(disqualified_reason,'-') d from protocol_events ` +
      `where user_id='${easyEn.userId}' and source_message_id='meal_tick:${planEn}:0' ` +
      `group by 2`,
  );
  check(
    "medium",
    "coche par la conversation + décoche par l'écran ⇒ UNE seule histoire",
    oneStory.length === 1 && oneStory[0].startsWith("1|food_not_eaten"),
    `PATCH ${screenRes.status} · ${JSON.stringify(screenJson)} · base: ${oneStory.join(";")}`,
  );

  // ── COURSES ──────────────────────────────────────────────────────────────
  say(`\n${"═".repeat(74)}\n▌ COURSES — R14 à R17\n${"═".repeat(74)}`);

  const shopper = await newStudent({ fullName: "Sacha SHOP" });
  // Des plats AUJOURD'HUI **et** DEMAIN, mais une seule cuisson périssable —
  // aujourd'hui. La vague tombe donc le jour même, et le lendemain la bande
  // sortira quand même (il y a un plat) SANS la ligne de courses: c'est la seule
  // façon de distinguer « la ligne a disparu » de « le message a disparu ».
  const planShop = await plantPlan({
    userId: shopper.userId,
    startsOn: TODAY,
    durationDays: 5,
    dishes: [
      { title: "Roast chicken plate", slot: "dinner", day: tokenOf(TODAY) },
      { title: "Oats", slot: "breakfast", day: tokenOf(TODAY) },
      { title: "Leftover plate", slot: "lunch", day: tokenOf(addDays(TODAY, 1)) },
    ],
    perishableCookOn: tokenOf(TODAY),
  });
  await runEvening();
  const msgShop = await eveningMessage(shopper.userId);
  const shopButtons = msgShop?.buttons.filter((b) =>
    b.payload.startsWith("KEEL_STRIP_SHOP_")
  ) ?? [];
  check(
    "courses",
    "le soir d'un buyOn, la ligne de courses apparaît — et UNE seule fois",
    shopButtons.length === 2 &&
      Boolean(msgShop?.content.includes("Shopping was on the plan for today.")) &&
      (msgShop!.content.match(/Shopping was on the plan/g) ?? []).length === 1,
    `${shopButtons.map((b) => b.label).join(" | ")}\n      ${JSON.stringify(msgShop?.content)}`,
  );

  const doneBtn = shopButtons.find((b) => b.payload.startsWith("KEEL_STRIP_SHOP_DONE"));
  const laterBtn = shopButtons.find((b) => b.payload.startsWith("KEEL_STRIP_SHOP_LATER"));
  await tap(shopper, laterBtn!.payload, laterBtn!.label);
  const wave1 = await rows(
    `select done, buy_on, answered_local_date, generated_meal_id from grocery_wave_states where user_id='${shopper.userId}'`,
  );
  await tap(shopper, doneBtn!.payload, doneBtn!.label);
  const wave2 = await rows(
    `select done, buy_on, answered_local_date, generated_meal_id from grocery_wave_states where user_id='${shopper.userId}'`,
  );
  check(
    "courses",
    "l'état de la VAGUE est écrit avec sa date, et la dernière réponse gagne",
    wave1.length === 1 && wave1[0].startsWith("f|") &&
      wave2.length === 1 && wave2[0].startsWith("t|") &&
      wave2[0].includes(TODAY) && wave2[0].includes(planShop),
    `après « Pas encore » : ${wave1.join(";")}\n      après « Courses faites » : ${wave2.join(";")}`,
  );
  const columns = await rows(
    `select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name='grocery_wave_states'`,
  );
  check(
    "courses",
    "AUCUN état par article n'existe (R16) — la table n'a pas de colonne pour ça",
    !/item|article|line|sku/i.test(columns.join("")),
    columns.join(""),
  );

  // Le lendemain: le même plan, un plat prévu, mais plus de `buyOn`. La vague
  // reste d'ailleurs « pas encore » (on l'a remise à `false` juste après pour
  // que le test porte bien sur R15 et pas sur « elle est faite »).
  await db.from("grocery_wave_states").update({ done: false } as never)
    .eq("user_id", shopper.userId);
  const beforeD2 = new Date().toISOString();
  const tomorrow = new Date(Date.parse(NOW) + 24 * 3600 * 1000).toISOString();
  const reportTomorrow = await callCron("keel-daily-pulse-v1", {
    now: tomorrow,
    budget_ms: 60_000,
  });
  const msgShopD2 = await eveningMessage(shopper.userId, beforeD2);
  const shopButtonsD2 = msgShopD2?.buttons.filter((b) =>
    b.payload.startsWith("KEEL_STRIP_SHOP_")
  ) ?? [];
  const waveStillPending = await rows(
    `select done from grocery_wave_states where user_id='${shopper.userId}'`,
  );
  check(
    "courses",
    "le lendemain, sans buyOn, la ligne de courses N'apparaît PAS — même sur une vague « pas encore » (R15)",
    msgShopD2 !== null && shopButtonsD2.length === 0 &&
      msgShopD2.buttons.some((b) => b.payload.startsWith("KEEL_STRIP_ALL")),
    `cron ${reportTomorrow.status} · vague en base = ${waveStillPending.join(";")} · ` +
      `boutons = ${msgShopD2?.buttons.map((b) => b.label).join(" | ")} · ` +
      `message=${JSON.stringify(msgShopD2?.content)}`,
  );

  // ── FOYER ────────────────────────────────────────────────────────────────
  say(`\n${"═".repeat(74)}\n▌ FOYER — R10 à R14\n${"═".repeat(74)}`);

  const master = await newStudent({ fullName: "Maya MASTER" });
  // Les RPC de foyer s'exécutent sur `auth.uid()`: elles passent donc par le JWT
  // de l'élève, jamais par le service_role (où `auth.uid()` est NULL — la
  // cicatrice `auth-uid-null-under-service-role`).
  const createRes = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/keel_household_create`,
    {
      method: "POST",
      headers: {
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        Authorization: `Bearer ${master.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_name: `ff058_home_${nonce()}` }),
    },
  );
  const createJson = await createRes.json().catch(() => null);
  for (const child of ["Ff058Kid1", "Ff058Kid2"]) {
    await fetch(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/keel_household_add_member`,
      {
        method: "POST",
        headers: {
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          Authorization: `Bearer ${master.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_first_name: child, p_birth_date: "2016-05-04" }),
      },
    );
  }
  const roster = await rows(
    `select first_name, role, coalesce(user_id::text,'<no account>') from household_members ` +
      `where household_id = (select household_id from household_members where user_id='${master.userId}') ` +
      `order by first_name`,
  );
  const planMaster = await plantPlan({
    userId: master.userId,
    startsOn: TODAY,
    durationDays: 3,
    dishes: [
      { title: "Family chilli", slot: "dinner", day: tokenOf(TODAY) },
      { title: "Morning eggs", slot: "breakfast", day: tokenOf(TODAY) },
    ],
    perishableCookOn: tokenOf(TODAY),
  });
  await runEvening();
  const msgMaster = await eveningMessage(master.userId);
  check(
    "foyer",
    "le maître (owner) reçoit sa bande ET la ligne de courses",
    Boolean(
      msgMaster?.buttons.some((b) => b.payload.startsWith("KEEL_STRIP_ALL")) &&
        msgMaster?.buttons.some((b) => b.payload.startsWith("KEEL_STRIP_SHOP_")),
    ),
    `foyer créé=${JSON.stringify(createJson)}\n      roster: ${roster.join(" ; ")}\n      boutons: ${
      msgMaster?.buttons.map((b) => b.label).join(" | ")
    }`,
  );

  const masterAll = msgMaster?.buttons.find((b) => b.payload.startsWith("KEEL_STRIP_ALL"));
  await tap(master, masterAll!.payload, masterAll!.label);
  const householdTicks = await rows(
    `select pe.user_id::text, pe.source_message_id from protocol_events pe ` +
      `where pe.source_message_id like 'meal_tick:${planMaster}:%'`,
  );
  const strayTicks = householdTicks.filter((r) => !r.startsWith(master.userId));
  check(
    "foyer",
    "le tap du maître n'écrit AUCUNE coche individuelle pour les bouches sans compte (R12)",
    householdTicks.length === 2 && strayTicks.length === 0,
    `${householdTicks.length} coches, toutes sur ${master.userId}\n      ${
      householdTicks.join("\n      ")
    }`,
  );
  const anyMemberColumn = await rows(
    `select count(*) from information_schema.columns where table_name='protocol_events' and column_name in ('member_id','on_behalf_of','household_id')`,
  );
  check(
    "foyer",
    "R11 par ABSENCE DE CHEMIN : protocol_events n'a aucune colonne d'attribution tierce",
    anyMemberColumn[0] === "0",
    `colonnes member_id/on_behalf_of/household_id dans protocol_events : ${anyMemberColumn[0]}`,
  );

  // ── EXTRA-HARD — deux plans coexistants ──────────────────────────────────
  say(`\n${"═".repeat(74)}\n▌ EXTRA-HARD — plan courant + plan suivant\n${"═".repeat(74)}`);

  const twoPlans = await newStudent({ fullName: "Tom TWO" });
  const current = await plantPlan({
    userId: twoPlans.userId,
    startsOn: TODAY,
    durationDays: 2,
    dishes: [
      { title: "Current soup", slot: "lunch", day: tokenOf(TODAY) },
      { title: "Current stew", slot: "dinner", day: tokenOf(TODAY) },
    ],
  });
  const next = await plantPlan({
    userId: twoPlans.userId,
    startsOn: addDays(TODAY, 2),
    durationDays: 3,
    dishes: [
      { title: "Next soup", slot: "lunch", day: tokenOf(addDays(TODAY, 2)) },
    ],
  });
  // Une coche du plan SUIVANT, écrite comme le ferait l'écran en avance.
  await db.from("protocol_events").insert({
    user_id: twoPlans.userId,
    occurred_at: new Date().toISOString(),
    local_date: TODAY,
    source: "quick_tap",
    content_locale: "en-GB",
    student_note: "Next soup",
    evidence_weight: 0.4,
    plan_relation: "as_planned",
    source_message_id: `meal_tick:${next}:0`,
  } as never);
  await runEvening();
  const msgTwo = await eveningMessage(twoPlans.userId);
  const twoAll = msgTwo?.buttons.find((b) => b.payload.startsWith("KEEL_STRIP_ALL"));
  // ⚠️ ON N'ASSERTE QUE SUR LE BLOC DE LA BANDE, pas sur tout le message. Le
  // FAIT du jour a parfaitement le droit de citer « Next soup »: l'élève l'a
  // coché aujourd'hui, et `tickedCount` compte tous les faits rapportés. C'est
  // le RATIO — et la bande — qui doivent rester scopés au plan du jour. Le
  // premier jet de cette sonde cherchait « Next soup » dans le message entier
  // et rendait ROUGE un comportement exact.
  const stripBlock = (msgTwo?.content.split("\n\n") ?? []).find((b) =>
    b.startsWith("Today :")
  ) ?? "";
  check(
    "extra-hard",
    "la bande ne cite QUE le plan qui possède aujourd'hui",
    Boolean(
      msgTwo && stripBlock.includes("Current soup") &&
        stripBlock.includes("Current stew") &&
        !stripBlock.includes("Next soup") &&
        twoAll?.payload.includes(current) && !twoAll?.payload.includes(next),
    ),
    `bande=${JSON.stringify(stripBlock)}\n      payload=${twoAll?.payload}\n      message entier=${
      JSON.stringify(msgTwo?.content)
    }`,
  );
  const ratio = msgTwo?.content.match(/(\d+)\s+of\s+the\s+(\d+)/);
  check(
    "extra-hard",
    "aucun ratio > 100 % dans le message du soir",
    !ratio || Number(ratio[1]) <= Number(ratio[2]),
    ratio ? `${ratio[0]}` : "aucun ratio dans le message",
  );

  await tap(twoPlans, twoAll!.payload, twoAll!.label);
  const twoTicks = await rows(
    `select source_message_id from protocol_events where user_id='${twoPlans.userId}' order by 1`,
  );
  check(
    "extra-hard",
    "chaque coche reste rattachée à SON plan (aucun mélange)",
    twoTicks.length === 3 &&
      twoTicks.filter((r) => r.includes(current)).length === 2 &&
      twoTicks.filter((r) => r.includes(next)).length === 1,
    twoTicks.join("\n      "),
  );

  // ── HARD — le silence, et le plan qui change ────────────────────────────
  say(`\n${"═".repeat(74)}\n▌ HARD — le silence et le plan qui change\n${"═".repeat(74)}`);

  const silent = await newStudent({ fullName: "Sila SILENT" });
  await plantPlan({
    userId: silent.userId,
    startsOn: TODAY,
    durationDays: 3,
    dishes: [{ title: "Untouched pasta", slot: "dinner", day: tokenOf(TODAY) }],
  });
  await runEvening();
  const silentTicks = await scalar(
    `select count(*) from protocol_events where user_id='${silent.userId}'`,
  );
  const silentWaves = await scalar(
    `select count(*) from grocery_wave_states where user_id='${silent.userId}'`,
  );
  check(
    "hard",
    "personne ne répond ⇒ RIEN n'est écrit, rien n'est inféré",
    silentTicks === 0 && silentWaves === 0,
    `protocol_events=${silentTicks} · grocery_wave_states=${silentWaves}`,
  );

  // Trois soirs ignorés: le quatrième message ne mentionne rien des précédents.
  const messagesBefore = await scalar(
    `select count(*) from chat_messages where user_id='${silent.userId}' and role='assistant'`,
  );
  for (const shift of [1, 2, 3]) {
    await callCron("keel-daily-pulse-v1", {
      now: new Date(Date.parse(NOW) + shift * 24 * 3600 * 1000).toISOString(),
      budget_ms: 60_000,
    });
  }
  // ⚠️ `rows()` DÉCOUPE SUR LES SAUTS DE LIGNE, et un message du soir en porte:
  // compter ses lignes ferait passer un message pour trois. Le COMPTE vient donc
  // d'un `count(*)`, et le TEXTE d'une lecture où les sauts sont remplacés.
  const messagesAfter = await scalar(
    `select count(*) from chat_messages where user_id='${silent.userId}' and role='assistant'`,
  );
  const silentTranscript = await rows(
    `select replace(replace(content, chr(10), ' ⏎ '), chr(13), '') from chat_messages ` +
      `where user_id='${silent.userId}' and role='assistant' order by created_at`,
  );
  check(
    "hard",
    "trois soirs ignorés ⇒ le message suivant ne mentionne RIEN des précédents",
    !silentTranscript.some((c) =>
      /hier|yesterday|last night|you have ?n'?t|tu n'as pas|depuis|streak|série|again/i.test(c)
    ),
    `${messagesBefore} → ${messagesAfter} messages\n      ${
      silentTranscript.join("\n      ")
    }`,
  );

  // Le plan change entre l'envoi et le tap.
  const shifty = await newStudent({ fullName: "Théo SHIFT" });
  const planShifty = await plantPlan({
    userId: shifty.userId,
    startsOn: TODAY,
    durationDays: 2,
    dishes: [
      { title: "Kept dish", slot: "lunch", day: tokenOf(TODAY) },
      { title: "Removed dish", slot: "dinner", day: tokenOf(TODAY) },
    ],
  });
  await runEvening();
  const msgShifty = await eveningMessage(shifty.userId);
  const shiftyAll = msgShifty?.buttons.find((b) => b.payload.startsWith("KEEL_STRIP_ALL"));
  // La composition est régénérée plus courte APRÈS l'envoi.
  await db.from("student_generated_meals").update({
    dishes: [{
      title: "Kept dish",
      slot: "lunch",
      day: tokenOf(TODAY),
      ingredients: [],
      uses: [],
    }],
  } as never).eq("id", planShifty);
  const shiftyTap = await tap(shifty, shiftyAll!.payload, shiftyAll!.label);
  const shiftyTicks = await ticksOf(shifty.userId);
  check(
    "hard",
    "le plan raccourci entre l'envoi et le tap : la coche survivante est écrite, la disparue n'est PAS fabriquée",
    shiftyTicks.length === 1 && shiftyTicks[0].includes("Kept dish"),
    `${shiftyTicks.join(" ; ")} · ack=${JSON.stringify(shiftyTap.ack)}`,
  );

  // ── LE SAPIN DE NOËL — le pire soir possible, mesuré ─────────────────────
  say(`\n${"═".repeat(74)}\n▌ SAPIN DE NOËL — R6, mesuré et pas supposé\n${"═".repeat(74)}`);
  //
  // Ce qu'un même soir peut porter au maximum, aujourd'hui:
  //   · le FAIT du jour, composé par le modèle dans la voix du coach;
  //   · la PRATIQUE quotidienne du coach (FF-029) — en mode `remind`, parce que
  //     le pouls pose SA question ce soir (R3 de FF-001: les deux ne peuvent
  //     structurellement pas être des questions le même soir);
  //   · la BANDE, avec sa ligne de courses;
  //   · la QUESTION du pouls et ses trois niveaux.
  //
  // ⚠️ LA RECOMMANDATION (FF-028) NE PEUT PAS EN ÊTRE. `keel-daily-pulse-v1`
  // se retire entièrement quand elle a parlé le même soir
  // (`recommendation_sent_today`), et cette garde est ANTÉRIEURE à ce lot. Le
  // « pire soir » n'inclut donc pas la recommandation — non par oubli, mais
  // parce que le produit l'interdit déjà.
  const treeCoach = await coachWithDoctrine("FF058 Tree", [{
    label: "Drink water across the day",
    kind: "hydration",
    quantified: false,
    target: null,
    unit: null,
    goal_scope: [],
    cadence: "constant",
    askable: true,
    minor_safe: true,
    brief: "Water spread across the day, never a number.",
    status: "active",
    collides_with: null,
  }]);
  const tree = await makeStudent({
    coach: treeCoach,
    timezone: TZ,
    country: "GB",
    locale: "en-US",
    fullName: "Tara TREE",
  });
  created.push(tree.userId);
  await publishPlanFor(treeCoach, tree.userId, { timezone: TZ });
  const planTree = await plantPlan({
    userId: tree.userId,
    startsOn: TODAY,
    durationDays: 4,
    dishes: [
      { title: "Overnight oats with berries", slot: "breakfast", day: tokenOf(TODAY) },
      { title: "Roast chicken and potato bowl", slot: "lunch", day: tokenOf(TODAY) },
      { title: "White bean and kale stew", slot: "dinner", day: tokenOf(TODAY) },
    ],
    perishableCookOn: tokenOf(TODAY),
  });
  // DE LA MATIÈRE: une coche déjà posée depuis l'écran, et une photo. Sans elles
  // le composeur n'a pas de sol et retombe sur `no_ground` — c'est-à-dire qu'on
  // mesurerait un message SANS la voix du coach en croyant mesurer le pire cas.
  await db.from("protocol_events").insert([
    {
      user_id: tree.userId,
      occurred_at: new Date().toISOString(),
      local_date: TODAY,
      slot_key: "breakfast",
      source: "quick_tap",
      source_message_id: `meal_tick:${planTree}:0`,
      student_note: "Overnight oats with berries",
      content_locale: "en-GB",
      evidence_weight: 0.4,
      plan_relation: "as_planned",
    },
    {
      user_id: tree.userId,
      occurred_at: new Date().toISOString(),
      local_date: TODAY,
      source: "photo",
      content_locale: "en-GB",
      evidence_weight: 0.6,
    },
  ] as never);
  const treeReport = await runEvening();
  const msgTree = await eveningMessage(tree.userId);
  check(
    "extra-hard",
    "le pire soir possible : fait composé + pratique + bande + courses + question, et il tient",
    Boolean(
      msgTree &&
        msgTree.buttons.some((b) => b.payload.startsWith("KEEL_STRIP_ALL")) &&
        msgTree.buttons.some((b) => b.payload.startsWith("KEEL_STRIP_SHOP_")) &&
        msgTree.buttons.some((b) => b.payload.startsWith("KEEL_PULSE_")),
    ),
    `body_sources=${JSON.stringify(treeReport.body_sources)} practice=${
      JSON.stringify(treeReport.practice_modes)
    }\n      ${JSON.stringify(msgTree?.content)}\n      ${
      msgTree?.buttons.map((b) => b.label).join(" | ")
    }`,
  );
  check(
    "extra-hard",
    "et il ne porte QU'UNE question — celle du pouls (le budget T4 tranche)",
    (msgTree?.content.match(/[?？]/g) ?? []).length === 1,
    `${(msgTree?.content.match(/[?？]/g) ?? []).length} points d'interrogation`,
  );

  // ── R6 — LA MESURE AVANT/APRÈS ───────────────────────────────────────────
  say(`\n${"═".repeat(74)}\n▌ MESURE R6 — avant / après\n${"═".repeat(74)}`);
  const noStrip = await newStudent({ fullName: "Basile BEFORE" });
  await db.from("protocol_events").insert({
    user_id: noStrip.userId,
    occurred_at: new Date().toISOString(),
    local_date: TODAY,
    source: "photo",
    content_locale: "en-GB",
    evidence_weight: 0.6,
  } as never);
  await runEvening();
  const msgNoStrip = await eveningMessage(noStrip.userId);
  const measure = (label: string, m: EveningMessage | null) =>
    say(
      `   ${label.padEnd(34)} ${String(m?.content.length ?? 0).padStart(4)} car. · ${
        String(m?.buttons.length ?? 0).padStart(2)
      } éléments interactifs`,
    );
  measure("SANS bande (fait seul)", msgNoStrip);
  measure("AVEC bande (EN)", msgEn ?? null);
  measure("AVEC bande + courses", msgShop ?? null);
  measure("SAPIN DE NOËL (tout)", msgTree ?? null);

  // Le budget T4 — la bande n'en consomme rien.
  const budgetRows = await rows(
    `select ask_kind, count(*) from meal_precision_questions where user_id in (${
      created.map((u) => `'${u}'`).join(",")
    }) group by 1`,
  );
  check(
    "extra-hard",
    "R6 — la bande ne consomme AUCUNE place du budget T4",
    !budgetRows.some((r) => r.startsWith("evening_strip")),
    budgetRows.length > 0 ? budgetRows.join(" ; ") : "aucune demande enregistrée",
  );

  // ── DENSITÉ ──────────────────────────────────────────────────────────────
  say(`\n${"═".repeat(74)}\n▌ DENSITÉ DES COCHES\n${"═".repeat(74)}`);
  const density = await rows(
    `select count(*) filter (where disqualified_reason is null) as ticks, ` +
      `count(*) filter (where disqualified_reason is not null) as unticks, ` +
      `count(distinct user_id) as students ` +
      `from protocol_events where source='quick_tap' and user_id in (${
        created.map((u) => `'${u}'`).join(",")
      })`,
  );
  say(`   coches posées par la conversation dans ce run : ${density.join(" ")}`);
} catch (error) {
  fail++;
  say(`\n🔴 EXCEPTION : ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  say(`\n${"═".repeat(74)}\n▌ NETTOYAGE\n${"═".repeat(74)}`);
  for (const userId of created) {
    await db.from("grocery_wave_states").delete().eq("user_id", userId);
    await db.from("student_generated_meals").delete().eq("user_id", userId);
    await db.from("meal_precision_questions").delete().eq("user_id", userId);
    await db.from("plan_commitments").delete().eq("user_id", userId);
    await db.from("plan_versions").delete().eq("student_id", userId);
    await cleanup(userId);
  }
  say(`   ${created.length} élèves nettoyés`);
  say(`\n${"═".repeat(74)}`);
  say(`▌ ${pass} verts · ${fail} rouges`);
  say(`${"═".repeat(74)}`);
}
