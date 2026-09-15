/**
 * FF-057 — LA PROCÉDURE ACCIDENT, EN CONDITIONS RÉELLES.
 *
 * Vraie base locale, vrais élèves provisionnés (plan publié + engagements),
 * vrais taps par `chat-inbound-v1`, vraies lignes relues en base.
 *
 * ── LA VÉRITÉ EST EN BASE, JAMAIS DANS LA RÉPONSE HTTP ────────────────────
 * Chaque verdict cite la ligne qu'il a relue. Une réponse « c'est noté » sans
 * ligne relue est un accusé fantôme — le défaut le plus cher de ce dépôt.
 *
 * ── ON N'APPELLE AUCUN CRON ───────────────────────────────────────────────
 * Le cron du soir balaie la flotte et ouvrirait des états chez les fixtures des
 * autres sessions (incident « batch fantôme »). On tape donc les charges de
 * boutons DIRECTEMENT — ce sont exactement celles que la bande du soir émet,
 * `stripUntickId` / `stripShoppingId`, et le chemin traversé est le même.
 *
 * Lancement:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… \
 *   SUPABASE_SERVICE_ROLE_KEY=… deno run -A docs/nutrition-pivot/qa-web/FF057_accident.ts
 */

import {
  admin,
  callAs,
  type Coach,
  cleanup,
  makeCoach,
  makeStudent,
  nonce,
  publishPlanFor,
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
// L'HORLOGE
// ---------------------------------------------------------------------------

const TZ = "Europe/Paris";
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
const TODAY = localDateIn(NOW, TZ);
say(`horloge : ${NOW} · fuseau ${TZ} · jour local ${TODAY}\n`);

// ---------------------------------------------------------------------------
// LES CHARGES — celles que la bande du soir émet, mot pour mot
// ---------------------------------------------------------------------------

const stripUntick = (mealId: string, i: number) =>
  `KEEL_STRIP_UNTICK|meal_tick:${mealId}:${i}`;
const stripTick = (mealId: string, i: number) =>
  `KEEL_STRIP_TICK|meal_tick:${mealId}:${i}`;
const shopLater = (mealId: string, buyOn: string) =>
  `KEEL_STRIP_SHOP_LATER|${mealId}|${buyOn}`;

// ---------------------------------------------------------------------------
// LE DÉCOR
// ---------------------------------------------------------------------------

let coachPool: Coach | null = null;
let seatsUsed = 0;
/**
 * LE PLAFOND D'ESSAI EST DE 3 SIÈGES VIVANTS PAR COACH, et c'est une VRAIE
 * garde produit: le 4e élève fait planter le run. On fabrique un coach de plus
 * tous les trois élèves plutôt que de contourner la garde.
 */
async function nextCoach(): Promise<Coach> {
  if (!coachPool || seatsUsed >= 3) {
    coachPool = await makeCoach({
      displayName: `FF057 Coach ${nonce()}`,
      country: "GB",
    });
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
    // ⚠️ `profiles.locale` vaut `fr-FR` par DÉFAUT en base: une fixture qui ne
    // l'écrit pas ment sur la langue de la moitié du run.
    locale: opts.locale ?? "en-US",
    fullName: opts.fullName ?? "FF057 Student",
  });
  created.push(student.userId);
  await publishPlanFor(coach, student.userId, { timezone: TZ });
  return student;
}

interface PlantDish {
  title: string;
  slot: string;
  /** Décalage en jours depuis `startsOn`. */
  offset: number;
  /** Les préparations que ce plat consomme. */
  uses?: string[];
}

interface PlantPrep {
  id: string;
  title: string;
  /** Décalage en jours depuis `startsOn`. */
  cookOffset: number;
  terms: string[];
}

/**
 * Une composition RÉELLE dans `student_generated_meals`, avec ses SESSIONS —
 * c'est le champ que FF-058 n'utilisait pas et que toute cette fiche lit.
 */
async function plantPlan(args: {
  userId: string;
  startsOn: string;
  durationDays: number;
  dishes: PlantDish[];
  preparations?: PlantPrep[];
  /** Les décalages des jours de session. */
  sessionOffsets?: number[];
  contentLocale?: string;
}): Promise<string> {
  const preps = args.preparations ?? [];
  const shoppingList = preps.flatMap((p) =>
    p.terms.map((t) => ({ term: t, aisle: "protein", quantity: "600 g" }))
  );
  shoppingList.push({ term: `ff057 rice ${nonce()}`, aisle: "grain", quantity: "500 g" });

  const sessions = (args.sessionOffsets ?? []).map((off) => ({
    day: tokenOf(addDays(args.startsOn, off)),
    preparation_ids: preps
      .filter((p) => p.cookOffset === off)
      .map((p) => p.id),
    run_through: "Oven on, rice on the side.",
    total_minutes: 60,
  }));

  const { data, error } = await db.from("student_generated_meals").insert({
    user_id: args.userId,
    scope: "several_days",
    mode: "to_shop",
    servings: 1,
    dishes: args.dishes.map((d) => ({
      title: d.title,
      slot: d.slot,
      day: tokenOf(addDays(args.startsOn, d.offset)),
      ingredients: [{ term: "ff057 filler", unit: "g", amount: 100 }],
      method: `Assemble ${d.title}.`,
      uses: (d.uses ?? []).map((id) => ({ preparation_id: id, servings: 1 })),
    })),
    preparations: preps.map((p) => ({
      id: p.id,
      title: p.title,
      servings_made: 3,
      method: "Roast.",
      active_minutes: 10,
      total_minutes: 50,
      cook_on: tokenOf(addDays(args.startsOn, p.cookOffset)),
      ingredients: p.terms.map((t) => ({ term: t, unit: "g", amount: 600 })),
    })),
    cooking_sessions: sessions,
    shopping_list: shoppingList,
    generated_from: { ff057: true },
    content_locale: args.contentLocale ?? "en-GB",
    starts_on: args.startsOn,
    duration_days: args.durationDays,
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`student_generated_meals: ${error.message}`);
  return String((data as { id: string }).id);
}

// ---------------------------------------------------------------------------
// LE TAP — un vrai bouton par `chat-inbound-v1`
// ---------------------------------------------------------------------------

interface TapResult {
  status: number;
  /** Le corps relu en base, jamais celui de la réponse HTTP. */
  body: string | null;
  buttons: Array<{ payload: string; label: string }>;
  purpose: string | null;
}

async function tap(
  student: Student,
  payload: string,
  label: string,
): Promise<TapResult> {
  const before = new Date().toISOString();
  const res = await callAs(student, "chat-inbound-v1", {
    client_message_id: `ff057-${nonce()}`,
    kind: "button",
    text: label,
    button_payload: payload,
  });
  // ⚠️ « erreur » et « vide » ne se confondent JAMAIS: une sonde qui les mélange
  // a déjà fait déclarer « rien d'écrit » sur des scénarios qui écrivaient trois
  // lignes. On teste `error` avant de lire `data`.
  const { data, error } = await db
    .from("chat_messages")
    .select("content,metadata,created_at")
    .eq("user_id", student.userId)
    .eq("role", "assistant")
    .gt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`tap reread: ${error.message}`);
  const row = ((data ?? []) as Array<
    { content: string; metadata: Record<string, unknown> }
  >)[0];
  return {
    status: res.status,
    body: row?.content ?? null,
    buttons: (row?.metadata?.buttons ?? []) as Array<
      { payload: string; label: string }
    >,
    purpose: String(row?.metadata?.purpose ?? "") || null,
  };
}

// ---------------------------------------------------------------------------
// LES SONDES — chacune distingue « erreur » de « vide »
// ---------------------------------------------------------------------------

async function protocolRows(
  userId: string,
): Promise<
  Array<
    {
      source_message_id: string;
      plan_relation: string | null;
      disqualified_reason: string | null;
      food_group_ref: string | null;
      substance_ref: string | null;
      local_date: string;
      source: string;
      student_note: string | null;
    }
  >
> {
  const { data, error } = await db
    .from("protocol_events")
    .select(
      "source_message_id, plan_relation, disqualified_reason, food_group_ref, substance_ref, local_date, source, student_note",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`protocol_events: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  return (data ?? []) as any;
}

async function sessionStates(
  userId: string,
): Promise<Array<{ cook_on: string; happened: boolean }>> {
  const { data, error } = await db
    .from("cooking_session_states")
    .select("cook_on, happened")
    .eq("user_id", userId);
  if (error) throw new Error(`cooking_session_states: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  return (data ?? []) as any;
}

async function planPayload(
  mealId: string,
): Promise<
  {
    dishes: Array<Record<string, unknown>>;
    preparations: Array<Record<string, unknown>>;
    cooking_sessions: Array<Record<string, unknown>>;
  }
> {
  const { data, error } = await db
    .from("student_generated_meals")
    .select("dishes, preparations, cooking_sessions")
    .eq("id", mealId)
    .maybeSingle();
  if (error) throw new Error(`plan reread: ${error.message}`);
  if (!data) throw new Error("plan reread: no row");
  // deno-lint-ignore no-explicit-any
  return data as any;
}

async function askLedger(
  userId: string,
): Promise<Array<{ ask_kind: string; local_date: string; question: string }>> {
  const { data, error } = await db
    .from("meal_precision_questions")
    .select("ask_kind, local_date, question")
    .eq("user_id", userId);
  if (error) throw new Error(`meal_precision_questions: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  return (data ?? []) as any;
}

// ---------------------------------------------------------------------------
// LA CEINTURE DE TEXTE — cherchée dans TOUT ce que le run produit
// ---------------------------------------------------------------------------

const ALL_REPLIES: string[] = [];
function collect(text: string | null): string | null {
  if (text) ALL_REPLIES.push(text);
  return text;
}

// ===========================================================================
// EASY — le cas nominal
// ===========================================================================

async function easyOrdered(locale: "en-US" | "fr-FR", run: number): Promise<void> {
  const student = await newStudent({ locale, fullName: `FF057 Easy ${run}` });
  const mealId = await plantPlan({
    userId: student.userId,
    startsOn: TODAY,
    durationDays: 7,
    dishes: [{ title: "Sheet-pan dinner", slot: "dinner", offset: 0 }],
  });

  const untick = collect(
    (await tap(student, stripUntick(mealId, 0), "✗ Sheet-pan dinner")).body,
  );
  const form = await tap(student, stripUntick(mealId, 0), "✗ Sheet-pan dinner");
  collect(form.body);

  const lang = locale === "fr-FR" ? "FR" : "EN";
  check(
    "easy",
    `${lang} run${run} — le ✗ ouvre le formulaire à TROIS boutons`,
    form.buttons.length === 3 &&
      form.buttons.every((b) => b.payload.startsWith("KEEL_FIX_")),
    `body=${JSON.stringify(form.body)} boutons=${
      form.buttons.map((b) => b.label).join(" | ")
    }`,
  );

  const ordered = form.buttons.find((b) => b.payload.startsWith("KEEL_FIX_ORDERED"));
  if (!ordered) {
    check("easy", `${lang} run${run} — bouton « commandé » présent`, false, "absent");
    return;
  }
  const answer = await tap(student, ordered.payload, ordered.label);
  collect(answer.body);

  const rows = await protocolRows(student.userId);
  const untickRow = rows.find((r) =>
    r.source_message_id === `meal_tick:${mealId}:0`
  );
  const offPlan = rows.find((r) =>
    r.source_message_id === `accident_off_plan:${mealId}:0`
  );

  check(
    "easy",
    `${lang} run${run} — la décoche est écrite`,
    untickRow?.disqualified_reason === "food_not_eaten",
    untickRow
      ? `${untickRow.source_message_id}|${untickRow.local_date}|${untickRow.disqualified_reason}|${untickRow.plan_relation}`
      : "AUCUNE LIGNE",
  );
  check(
    "easy",
    `${lang} run${run} — le fait hors plan est écrit`,
    offPlan?.plan_relation === "off_plan",
    offPlan
      ? `${offPlan.source_message_id}|${offPlan.local_date}|${offPlan.plan_relation}|${offPlan.source}`
      : "AUCUNE LIGNE",
  );
  check(
    "easy",
    `${lang} run${run} — AUCUN aliment inventé sur le fait hors plan`,
    offPlan?.food_group_ref === null && offPlan?.substance_ref === null &&
      !offPlan?.student_note,
    offPlan
      ? `food_group_ref=${offPlan.food_group_ref} substance_ref=${offPlan.substance_ref} note=${JSON.stringify(offPlan.student_note)}`
      : "AUCUNE LIGNE",
  );

  const ledger = await askLedger(student.userId);
  const invites = ledger.filter((l) => l.ask_kind === "photo_invitation");
  check(
    "easy",
    `${lang} run${run} — l'invitation photo part, budget libre`,
    invites.length === 1 && Boolean(answer.body) &&
      answer.body!.length > 20,
    `ledger=${invites.length} · réponse=${JSON.stringify(answer.body)}`,
  );

  // La décoche PRÉCÈDE le formulaire: le premier tap l'avait déjà écrite.
  check(
    "easy",
    `${lang} run${run} — le premier ✗ avait déjà écrit, sans formulaire manquant`,
    Boolean(untick),
    `premier ✗ → ${JSON.stringify(untick)}`,
  );
}

// ===========================================================================
// MEDIUM — chaque bouton avec sa bonne écriture
// ===========================================================================

async function mediumButtons(): Promise<void> {
  const student = await newStudent({ fullName: "FF057 Buttons" });
  const mealId = await plantPlan({
    userId: student.userId,
    startsOn: TODAY,
    durationDays: 7,
    dishes: [
      { title: "Dish A", slot: "breakfast", offset: 0 },
      { title: "Dish B", slot: "lunch", offset: 0 },
      { title: "Dish C", slot: "dinner", offset: 0 },
    ],
  });

  // ── « Pas eu le temps » ⇒ décoche SEULE ────────────────────────────────
  await tap(student, stripUntick(mealId, 0), "✗ Dish A");
  const noTime = await tap(
    student,
    `KEEL_FIX_NO_TIME|meal_tick:${mealId}:0`,
    "No time to cook",
  );
  collect(noTime.body);
  let rows = await protocolRows(student.userId);
  check(
    "medium",
    "« Pas eu le temps » ⇒ décoche SEULE, aucun fait hors plan",
    rows.some((r) =>
      r.source_message_id === `meal_tick:${mealId}:0` &&
      r.disqualified_reason === "food_not_eaten"
    ) &&
      !rows.some((r) => r.source_message_id === `accident_off_plan:${mealId}:0`),
    rows.map((r) => `${r.source_message_id}|${r.plan_relation}|${r.disqualified_reason}`)
      .join(" ; "),
  );

  // ── « J'ai mangé autre chose » ⇒ décoche + off_plan, SANS aliment ──────
  const ateOther = await tap(
    student,
    `KEEL_FIX_ATE_OTHER|meal_tick:${mealId}:1`,
    "I ate something else",
  );
  collect(ateOther.body);
  rows = await protocolRows(student.userId);
  const other = rows.find((r) =>
    r.source_message_id === `accident_off_plan:${mealId}:1`
  );
  check(
    "medium",
    "« mangé autre chose » ⇒ off_plan écrit, AUCUN food_group_ref inventé",
    other?.plan_relation === "off_plan" && other?.food_group_ref === null,
    other
      ? `${other.source_message_id}|${other.plan_relation}|fgr=${other.food_group_ref}`
      : "AUCUNE LIGNE",
  );
  check(
    "medium",
    "« mangé autre chose » ⇒ décoche AUSSI écrite (le bouton est autonome)",
    rows.some((r) =>
      r.source_message_id === `meal_tick:${mealId}:1` &&
      r.disqualified_reason === "food_not_eaten"
    ),
    rows.filter((r) => r.source_message_id.startsWith("meal_tick"))
      .map((r) => `${r.source_message_id}|${r.disqualified_reason}`).join(" ; "),
  );
  check(
    "medium",
    "« mangé autre chose » ⇒ RIEN DE PLUS: aucun bouton, aucune invitation",
    ateOther.buttons.length === 0,
    `boutons=${ateOther.buttons.length} · ${JSON.stringify(ateOther.body)}`,
  );

  // ── DOUBLE TAP: la ligne hors plan reste UNIQUE ────────────────────────
  await tap(student, `KEEL_FIX_ATE_OTHER|meal_tick:${mealId}:1`, "I ate something else");
  rows = await protocolRows(student.userId);
  check(
    "medium",
    "double tap ⇒ une seule ligne hors plan (arbitré par Postgres)",
    rows.filter((r) =>
      r.source_message_id === `accident_off_plan:${mealId}:1`
    ).length === 1,
    `lignes=${
      rows.filter((r) => r.source_message_id === `accident_off_plan:${mealId}:1`).length
    }`,
  );
}

// ===========================================================================
// EXTRA-HARD — deux accidents le même jour ⇒ UNE invitation photo
// ===========================================================================

async function twoAccidentsOneDay(): Promise<void> {
  const student = await newStudent({ fullName: "FF057 Budget" });
  const mealId = await plantPlan({
    userId: student.userId,
    startsOn: TODAY,
    durationDays: 7,
    dishes: [
      { title: "Lunch out", slot: "lunch", offset: 0 },
      { title: "Dinner out", slot: "dinner", offset: 0 },
    ],
  });
  const first = await tap(
    student,
    `KEEL_FIX_ORDERED|meal_tick:${mealId}:0`,
    "I ordered or ate out",
  );
  const second = await tap(
    student,
    `KEEL_FIX_ORDERED|meal_tick:${mealId}:1`,
    "I ordered or ate out",
  );
  collect(first.body);
  collect(second.body);
  const ledger = await askLedger(student.userId);
  const invites = ledger.filter((l) => l.ask_kind === "photo_invitation");
  check(
    "extra-hard",
    "deux accidents le même jour ⇒ UNE seule invitation photo (budget T4)",
    invites.length === 1,
    `ledger=${invites.length} · 1er=${JSON.stringify(first.body)} · 2e=${
      JSON.stringify(second.body)
    }`,
  );
  const rows = await protocolRows(student.userId);
  check(
    "extra-hard",
    "…mais les DEUX faits hors plan sont écrits (le budget borne la parole, pas le fait)",
    rows.filter((r) => r.plan_relation === "off_plan").length === 2,
    rows.filter((r) => r.plan_relation === "off_plan")
      .map((r) => r.source_message_id).join(" ; "),
  );
}

// ===========================================================================
// COURSES — le décalage calculé, et ses trois motifs de refus
// ===========================================================================

/**
 * Le décor des courses: une cuisson à J+4, deux repas qui en vivent (J+4, J+5).
 * `planGroceryWaves` place donc le périssable à J+1 (`cookOn - MAX_FRIDGE_DAYS`)
 * et la vague ANNONCE la cuisson qu'elle sert.
 */
async function plantShoppingPlan(
  userId: string,
  opts: { extraDishOffset?: number; cookOffset?: number } = {},
): Promise<{ mealId: string; buyOn: string; cookOn: string }> {
  const cookOffset = opts.cookOffset ?? 4;
  const term = `ff057 chicken ${nonce()}`;
  const dishes: PlantDish[] = [
    { title: "Cooked meal one", slot: "dinner", offset: cookOffset, uses: ["ff057_prep"] },
    { title: "Cooked meal two", slot: "dinner", offset: cookOffset + 1, uses: ["ff057_prep"] },
  ];
  if (opts.extraDishOffset !== undefined) {
    dishes.push({
      title: "Cooked meal three",
      slot: "lunch",
      offset: opts.extraDishOffset,
      uses: ["ff057_prep"],
    });
  }
  const mealId = await plantPlan({
    userId,
    startsOn: TODAY,
    durationDays: 7,
    dishes,
    preparations: [{
      id: "ff057_prep",
      title: "Roast chicken",
      cookOffset,
      terms: [term],
    }],
    sessionOffsets: [cookOffset],
  });
  return {
    mealId,
    buyOn: addDays(TODAY, cookOffset - 3),
    cookOn: addDays(TODAY, cookOffset),
  };
}

async function coursesNominal(locale: "en-US" | "fr-FR"): Promise<void> {
  const lang = locale === "fr-FR" ? "FR" : "EN";
  const student = await newStudent({ locale, fullName: `FF057 Shop ${lang}` });
  const { mealId, buyOn, cookOn } = await plantShoppingPlan(student.userId);

  const proposal = await tap(
    student,
    shopLater(mealId, buyOn),
    lang === "FR" ? "Pas encore" : "Not yet",
  );
  collect(proposal.body);

  check(
    "courses",
    `${lang} — « Pas encore » ⇒ un décalage CALCULÉ en DEUX boutons`,
    proposal.buttons.length === 2 &&
      proposal.buttons.some((b) => b.payload.startsWith("KEEL_FIX_SHIFT_YES")) &&
      proposal.buttons.some((b) => b.payload.startsWith("KEEL_FIX_SHIFT_NO")),
    `body=${JSON.stringify(proposal.body)} · boutons=${
      proposal.buttons.map((b) => b.label).join(" | ")
    }`,
  );
  check(
    "courses",
    `${lang} — AUCUNE question ouverte sur le futur dans le texte`,
    !/\?/.test(proposal.body ?? "") &&
      !/when|quand|what time|quel jour/i.test(proposal.body ?? ""),
    JSON.stringify(proposal.body),
  );

  // ── L'état de vague EST écrit par FF-058, même quand FF-057 enchaîne ───
  const { data: waves, error: waveErr } = await db
    .from("grocery_wave_states")
    .select("buy_on, done")
    .eq("user_id", student.userId);
  if (waveErr) throw new Error(`grocery_wave_states: ${waveErr.message}`);
  check(
    "courses",
    `${lang} — l'état de la vague est écrit (done=false), FF-058 intact`,
    (waves ?? []).some((w) =>
      (w as { buy_on: string; done: boolean }).buy_on === buyOn &&
      (w as { done: boolean }).done === false
    ),
    JSON.stringify(waves),
  );

  // ── « Oui » ⇒ la session ET ses repas glissent ─────────────────────────
  const before = await planPayload(mealId);
  const yes = proposal.buttons.find((b) =>
    b.payload.startsWith("KEEL_FIX_SHIFT_YES")
  )!;
  const applied = await tap(student, yes.payload, yes.label);
  collect(applied.body);
  const after = await planPayload(mealId);

  const newCookOn = addDays(cookOn, 1);
  check(
    "courses",
    `${lang} — « Oui » ⇒ la CUISSON glisse d'un jour`,
    after.cooking_sessions[0]?.day === tokenOf(newCookOn) &&
      after.preparations[0]?.cook_on === tokenOf(newCookOn),
    `avant session=${before.cooking_sessions[0]?.day} prep=${
      before.preparations[0]?.cook_on
    } → après session=${after.cooking_sessions[0]?.day} prep=${
      after.preparations[0]?.cook_on
    }`,
  );
  check(
    "courses",
    `${lang} — les repas qu'elle nourrit glissent du MÊME delta`,
    after.dishes.map((d) => String(d.day)).join(",") ===
      [tokenOf(newCookOn), tokenOf(addDays(newCookOn, 1))].join(","),
    `avant=${before.dishes.map((d) => d.day).join(",")} → après=${
      after.dishes.map((d) => d.day).join(",")
    }`,
  );
  check(
    "courses",
    `${lang} — V3 FERMÉ: titres, ingrédients et \`uses\` inchangés`,
    JSON.stringify(before.dishes.map((d) => [d.title, d.ingredients, d.uses])) ===
      JSON.stringify(after.dishes.map((d) => [d.title, d.ingredients, d.uses])) &&
      JSON.stringify(before.preparations.map((p) => [p.title, p.ingredients, p.method])) ===
        JSON.stringify(after.preparations.map((p) => [p.title, p.ingredients, p.method])),
    `plats: ${after.dishes.map((d) => d.title).join(" | ")} · méthode prep: ${
      after.preparations[0]?.method
    }`,
  );

  // ── DOUBLE TAP: l'empreinte a changé, rien ne bouge une seconde fois ───
  const replay = await tap(student, yes.payload, yes.label);
  collect(replay.body);
  const afterReplay = await planPayload(mealId);
  check(
    "hard",
    `${lang} — double tap sur la MÊME bulle ⇒ le plan ne glisse pas deux fois`,
    JSON.stringify(afterReplay.dishes.map((d) => d.day)) ===
      JSON.stringify(after.dishes.map((d) => d.day)),
    `après 2e tap=${afterReplay.dishes.map((d) => d.day).join(",")} · réponse=${
      JSON.stringify(replay.body)
    }`,
  );
}

async function coursesDecline(): Promise<void> {
  const student = await newStudent({ fullName: "FF057 Decline" });
  const { mealId, buyOn } = await plantShoppingPlan(student.userId);
  const proposal = await tap(student, shopLater(mealId, buyOn), "Not yet");
  const before = await planPayload(mealId);
  const no = proposal.buttons.find((b) => b.payload.startsWith("KEEL_FIX_SHIFT_NO"));
  if (!no) {
    check("courses", "« Non, je gère » — bouton présent", false, "absent");
    return;
  }
  const declined = await tap(student, no.payload, no.label);
  collect(declined.body);
  const after = await planPayload(mealId);
  check(
    "courses",
    "« Non, je gère » ⇒ RIEN ne change dans le plan",
    JSON.stringify(before) === JSON.stringify(after),
    `dishes=${after.dishes.map((d) => d.day).join(",")} · session=${
      after.cooking_sessions[0]?.day
    }`,
  );
  const states = await sessionStates(student.userId);
  check(
    "courses",
    "« Non, je gère » ⇒ AUCUN état écrit (pas de mécanisme de relance)",
    states.length === 0,
    `cooking_session_states=${JSON.stringify(states)}`,
  );
}

async function coursesRefusals(): Promise<void> {
  // ── `perishables_at_risk`, DEPUIS LA DATE D'ACHAT RÉELLE ──────────────
  //
  // ⚠️ LE DÉCLENCHEUR EST LA SESSION SAUTÉE, PAS LE `Pas encore` DE COURSES —
  // et ce n'est pas un choix de commodité. Par la porte des courses, la vague
  // qui nourrit la session EST celle qu'on vient de déclarer non faite: rien
  // n'est au frigo, donc rien ne peut pourrir. Le « frigo plein » du §9 n'existe
  // que quand les courses ONT été faites et que la CUISSON est tombée. C'est ce
  // décor-là qu'on monte, et c'est le seul qui soit atteignable. Voir le rapport.
  {
    const student = await newStudent({ fullName: "FF057 Rot" });
    const { mealId, buyOn, cookOn } = await plantShoppingPlan(student.userId);
    // Les courses ONT été faites, le jour même du `buyOn`. Le frais est au frigo
    // depuis ce jour-là, et il attend la cuisson.
    const { error } = await db.from("grocery_wave_states").insert({
      user_id: student.userId,
      generated_meal_id: mealId,
      buy_on: buyOn,
      done: true,
      answered_at: new Date().toISOString(),
      answered_local_date: buyOn,
    } as never);
    if (error) throw new Error(`wave fixture: ${error.message}`);

    // La cuisson n'a pas eu lieu. Décaler la mettrait à J+4 depuis l'achat,
    // au-delà de MAX_FRIDGE_DAYS = 3.
    const out = await tap(
      student,
      `KEEL_FIX_SESSION_NO|${mealId}|${cookOn}`,
      "It did not happen",
    );
    collect(out.body);
    check(
      "courses",
      "courses faites + cuisson tombée ⇒ `perishables_at_risk`, motif DIT",
      out.buttons.length === 0 && /fridge|frigo/i.test(out.body ?? ""),
      `body=${JSON.stringify(out.body)} · achat réel=${buyOn} · cuisson=${cookOn} → ${
        addDays(cookOn, 1)
      }`,
    );
    const after = await planPayload(mealId);
    check(
      "courses",
      "…et le plan n'a PAS bougé (aucun glissement appliqué)",
      after.cooking_sessions[0]?.day === tokenOf(cookOn),
      `session=${after.cooking_sessions[0]?.day} (attendu ${tokenOf(cookOn)})`,
    );
  }

  // ── LE CAS QUI PASSE: mêmes courses faites, mais AUCUN périssable au frigo
  //    ⇒ le glissement EST proposé. Sans lui, la garde pourrait être bloquante
  //    à tort et ressembler à une garde qui marche.
  {
    const student = await newStudent({ fullName: "FF057 NoRot" });
    const { mealId, cookOn } = await plantShoppingPlan(student.userId);
    const out = await tap(
      student,
      `KEEL_FIX_SESSION_NO|${mealId}|${cookOn}`,
      "It did not happen",
    );
    collect(out.body);
    check(
      "courses",
      "LE CAS QUI PASSE — rien au frigo ⇒ le glissement EST proposé",
      out.buttons.length === 2 &&
        out.buttons.some((b) => b.payload.startsWith("KEEL_FIX_SHIFT_YES")),
      `body=${JSON.stringify(out.body)} · boutons=${
        out.buttons.map((b) => b.label).join(" | ")
      }`,
    );
  }

  // ── `outside_plan_window` ──────────────────────────────────────────────
  {
    const student = await newStudent({ fullName: "FF057 Window" });
    // Cuisson à J+5, repas J+5 et J+6. ends_on = J+6 ⇒ +1 sortirait de la fenêtre.
    const { mealId, buyOn } = await plantShoppingPlan(student.userId, {
      cookOffset: 5,
    });
    const out = await tap(student, shopLater(mealId, buyOn), "Not yet");
    collect(out.body);
    check(
      "courses",
      "décalage au-delà d'ends_on ⇒ `outside_plan_window`, motif DIT",
      out.buttons.length === 0 && /end of this plan|fin de ce plan/i.test(out.body ?? ""),
      JSON.stringify(out.body),
    );
  }

  // ── `already_cooked` ──────────────────────────────────────────────────
  {
    const student = await newStudent({ fullName: "FF057 Cooked" });
    const { mealId, buyOn, cookOn } = await plantShoppingPlan(student.userId);
    // Quelqu'un a COCHÉ un repas qui puise dans cette préparation: la casserole
    // a donc tourné. Le tap de coche est le vrai chemin.
    await db.from("protocol_events").insert({
      user_id: student.userId,
      occurred_at: new Date().toISOString(),
      local_date: TODAY,
      source: "quick_tap",
      evidence_weight: 0.4,
      plan_relation: "as_planned",
      content_locale: "en-GB",
      source_message_id: `meal_tick:${mealId}:0`,
    } as never);

    const out = await tap(student, shopLater(mealId, buyOn), "Not yet");
    collect(out.body);
    check(
      "courses",
      "une préparation déjà cuisinée ⇒ `already_cooked`, motif DIT",
      out.buttons.length === 0 && /already cooked|déjà cuisinée/i.test(out.body ?? ""),
      `body=${JSON.stringify(out.body)} · preuve: coche vivante sur meal_tick:${mealId}:0 · cuisson=${cookOn}`,
    );
  }
}

// ===========================================================================
// EXTRA-HARD — la cascade
// ===========================================================================

async function cascadeRun(): Promise<void> {
  const student = await newStudent({ fullName: "FF057 Cascade" });
  // Une session à J+0 qui nourrit QUATRE repas étalés sur quatre jours, plus
  // une seconde session à J+2 avec son propre repas, plus un repas libre.
  const mealId = await plantPlan({
    userId: student.userId,
    startsOn: TODAY,
    durationDays: 7,
    dishes: [
      { title: "A day0", slot: "dinner", offset: 0, uses: ["prep_a"] },
      { title: "A day1", slot: "dinner", offset: 1, uses: ["prep_a"] },
      { title: "A day2", slot: "lunch", offset: 2, uses: ["prep_a"] },
      { title: "A day3", slot: "lunch", offset: 3, uses: ["prep_a"] },
      { title: "B day2", slot: "dinner", offset: 2, uses: ["prep_b"] },
      { title: "Free day1", slot: "breakfast", offset: 1 },
    ],
    preparations: [
      { id: "prep_a", title: "Batch A", cookOffset: 0, terms: [`ff057 a ${nonce()}`] },
      { id: "prep_b", title: "Batch B", cookOffset: 2, terms: [`ff057 b ${nonce()}`] },
    ],
    sessionOffsets: [0, 2],
  });

  // ⚠️ UN REPAS DE CETTE SESSION EST DÉJÀ COCHÉ. Il doit SURVIVRE.
  const ticked = await tap(student, stripTick(mealId, 0), "✓ A day0");
  collect(ticked.body);

  // On déclare la session de J+0 non faite.
  const answer = await tap(
    student,
    `KEEL_FIX_SESSION_NO|${mealId}|${TODAY}`,
    "It did not happen",
  );
  collect(answer.body);

  const states = await sessionStates(student.userId);
  check(
    "extra-hard",
    "le marqueur de session est écrit, daté, et il vaut `false`",
    states.length === 1 && states[0].cook_on === TODAY &&
      states[0].happened === false,
    JSON.stringify(states),
  );

  // La cascade est DÉRIVÉE: on la lit par son effet observable, la bande.
  const rows = await protocolRows(student.userId);
  const live = rows.filter((r) =>
    r.source_message_id.startsWith("meal_tick:") &&
    r.disqualified_reason === null
  );
  check(
    "extra-hard",
    "le repas DÉJÀ COCHÉ de la session survit — aucune ligne n'est retirée",
    live.some((r) => r.source_message_id === `meal_tick:${mealId}:0`),
    live.map((r) => `${r.source_message_id}|${r.disqualified_reason}`).join(" ; "),
  );
  check(
    "extra-hard",
    "la cascade N'ÉCRIT RIEN: aucune décoche fabriquée sur les 3 autres",
    !rows.some((r) =>
      r.disqualified_reason === "food_not_eaten" &&
      r.source_message_id.startsWith(`meal_tick:${mealId}:`)
    ),
    rows.map((r) => `${r.source_message_id}|${r.disqualified_reason ?? "null"}`)
      .join(" ; "),
  );
  check(
    "extra-hard",
    "la réponse NOMME ce qui tombe (3 repas), et rien de plus",
    /3 meals|3 repas/.test(answer.body ?? ""),
    JSON.stringify(answer.body),
  );

  // ── L'AUTRE SESSION EST INTACTE ────────────────────────────────────────
  const answer2 = await tap(
    student,
    `KEEL_FIX_SESSION_YES|${mealId}|${addDays(TODAY, 2)}`,
    "✓ It happened",
  );
  collect(answer2.body);
  const states2 = await sessionStates(student.userId);
  check(
    "extra-hard",
    "les deux sessions ont des états indépendants",
    states2.length === 2 &&
      states2.some((s) => s.cook_on === TODAY && !s.happened) &&
      states2.some((s) => s.cook_on === addDays(TODAY, 2) && s.happened),
    JSON.stringify(states2),
  );
}

// ===========================================================================
// EXTRA-HARD — les deux entrées le MÊME soir (R12: une seule chose à la fois)
// ===========================================================================

async function sameEveningBothEntries(): Promise<void> {
  const student = await newStudent({ fullName: "FF057 Both" });
  const { mealId, buyOn } = await plantShoppingPlan(student.userId, {
    extraDishOffset: 0,
  });

  // Le `✗` d'un plat de CE SOIR, puis le `Pas encore` des courses.
  const untick = await tap(student, stripUntick(mealId, 2), "✗ Cooked meal three");
  collect(untick.body);
  const shop = await tap(student, shopLater(mealId, buyOn), "Not yet");
  collect(shop.body);

  // ⚠️ CHAQUE ÉCHANGE NE PORTE QU'UNE CHOSE. Le `✗` ouvre le formulaire (3
  // boutons), le `Pas encore` propose le décalage (2 boutons). Aucun des deux
  // n'en porte deux, et l'invitation photo ne voyage avec aucun.
  check(
    "extra-hard",
    "`✗` et `Pas encore` le même soir ⇒ UNE seule chose par échange",
    untick.buttons.length === 3 &&
      untick.buttons.every((b) => b.payload.startsWith("KEEL_FIX_")) &&
      shop.buttons.length === 2 &&
      shop.buttons.every((b) => b.payload.startsWith("KEEL_FIX_SHIFT_")),
    `✗ → ${untick.buttons.length} boutons (${
      untick.buttons.map((b) => b.label).join("/")
    }) · Pas encore → ${shop.buttons.length} boutons (${
      shop.buttons.map((b) => b.label).join("/")
    })`,
  );
  const ledger = await askLedger(student.userId);
  check(
    "extra-hard",
    "…et AUCUNE invitation photo n'accompagne la proposition de décalage (R12)",
    ledger.filter((l) => l.ask_kind === "photo_invitation").length === 0,
    `ledger=${JSON.stringify(ledger.map((l) => l.ask_kind))} · réponse courses=${
      JSON.stringify(shop.body)
    }`,
  );

  // ── FF-056 (la divergence) CONSOMME LE MÊME BUDGET T4 ─────────────────
  // Deux fiches qui proposent le même soir ne doivent pas produire deux
  // demandes. On simule la place déjà prise par FF-056, puis on ouvre un
  // accident: l'invitation photo doit se taire.
  const { error } = await db.from("meal_precision_questions").insert({
    user_id: student.userId,
    local_date: TODAY,
    source: "chat",
    ask_kind: "weight_divergence_question",
    axis: null,
    question: "FF-056 fixture",
    asked_for_message_id: `ff057-divergence-${nonce()}`,
  } as never);
  if (error) throw new Error(`ledger fixture: ${error.message}`);

  // ⚠️ L'INDEX 2, PAS 0. Les index 0 et 1 sont les repas de la CUISSON, quatre
  // et cinq jours dans le futur: la garde `isReportable` refuse de les déclarer,
  // et c'est elle qui a fait tomber ce test la première fois. L'index 2 est le
  // plat d'AUJOURD'HUI (`extraDishOffset: 0`), le seul déclarable.
  const ordered = await tap(
    student,
    `KEEL_FIX_ORDERED|meal_tick:${mealId}:2`,
    "I ordered or ate out",
  );
  collect(ordered.body);
  const after = await askLedger(student.userId);
  check(
    "extra-hard",
    "accident + FF-056 le même jour ⇒ le budget T4 est PARTAGÉ, pas doublé",
    after.filter((l) => l.ask_kind === "photo_invitation").length === 0 &&
      after.length === 1,
    `ledger=${JSON.stringify(after.map((l) => l.ask_kind))} · réponse=${
      JSON.stringify(ordered.body)
    }`,
  );
  const rows = await protocolRows(student.userId);
  check(
    "extra-hard",
    "…mais le FAIT hors plan est écrit quand même (le budget borne la parole)",
    rows.some((r) =>
      r.source_message_id === `accident_off_plan:${mealId}:2` &&
      r.plan_relation === "off_plan"
    ),
    rows.filter((r) => r.plan_relation === "off_plan")
      .map((r) => r.source_message_id).join(" ; ") || "AUCUNE",
  );
}

// ===========================================================================
// HARD — le formulaire sans plan, et la charge forgée
// ===========================================================================

async function hardCases(): Promise<void> {
  const victim = await newStudent({ fullName: "FF057 Victim" });
  const attacker = await newStudent({ fullName: "FF057 Attacker" });
  const victimMeal = await plantPlan({
    userId: victim.userId,
    startsOn: TODAY,
    durationDays: 7,
    dishes: [{ title: "SECRET private dish of the victim", slot: "dinner", offset: 0 }],
  });

  // ── LA CHARGE FORGÉE CITANT LE PLAN D'UN AUTRE ────────────────────────
  const forged = await tap(
    attacker,
    `KEEL_FIX_ORDERED|meal_tick:${victimMeal}:0`,
    "I ordered or ate out",
  );
  collect(forged.body);
  const attackerRows = await protocolRows(attacker.userId);
  const victimRows = await protocolRows(victim.userId);
  check(
    "hard",
    "charge forgée sur le plan d'autrui ⇒ RIEN chez l'attaquant",
    attackerRows.length === 0,
    attackerRows.length === 0
      ? "(aucune ligne)"
      : attackerRows.map((r) => `${r.source_message_id}|${r.student_note}`).join(" ; "),
  );
  check(
    "hard",
    "…et RIEN chez la victime",
    victimRows.length === 0,
    victimRows.length === 0 ? "(aucune ligne)" : JSON.stringify(victimRows),
  );
  check(
    "hard",
    "…et le titre du plat de la victime NE FUIT PAS dans la réponse",
    !(forged.body ?? "").includes("SECRET"),
    JSON.stringify(forged.body),
  );

  // ── UN PLAN INEXISTANT ────────────────────────────────────────────────
  const ghost = await tap(
    attacker,
    `KEEL_FIX_ORDERED|meal_tick:00000000-0000-0000-0000-000000000000:0`,
    "I ordered or ate out",
  );
  collect(ghost.body);
  check(
    "hard",
    "formulaire sans plan courant ⇒ il se referme sans rien écrire",
    (await protocolRows(attacker.userId)).length === 0 && Boolean(ghost.body),
    JSON.stringify(ghost.body),
  );

  // ── UNE CHARGE FORGÉE SUR L'ÉTAT DE SESSION D'AUTRUI ──────────────────
  await tap(
    attacker,
    `KEEL_FIX_SESSION_NO|${victimMeal}|${TODAY}`,
    "It did not happen",
  );
  const victimStates = await sessionStates(victim.userId);
  const attackerStates = await sessionStates(attacker.userId);
  check(
    "hard",
    "charge forgée sur la session d'autrui ⇒ aucun état écrit, ni chez l'un ni chez l'autre",
    victimStates.length === 0 && attackerStates.length === 0,
    `victime=${JSON.stringify(victimStates)} attaquant=${JSON.stringify(attackerStates)}`,
  );

  // ── UN INDEX QUI DÉSIGNE UN JOUR FUTUR ────────────────────────────────
  const future = await newStudent({ fullName: "FF057 Future" });
  const futureMeal = await plantPlan({
    userId: future.userId,
    startsOn: TODAY,
    durationDays: 7,
    dishes: [
      { title: "Today dish", slot: "dinner", offset: 0 },
      { title: "Tomorrow dish", slot: "dinner", offset: 1 },
    ],
  });
  const forgedFuture = await tap(
    future,
    `KEEL_FIX_NO_TIME|meal_tick:${futureMeal}:1`,
    "No time to cook",
  );
  collect(forgedFuture.body);
  const futureRows = await protocolRows(future.userId);
  check(
    "hard",
    "une charge citant le plat de DEMAIN n'écrit aucune preuve fabriquée",
    !futureRows.some((r) => r.local_date > TODAY),
    futureRows.length === 0
      ? "(aucune ligne)"
      : futureRows.map((r) => `${r.source_message_id}|${r.local_date}`).join(" ; "),
  );
}

// ===========================================================================
// LA CEINTURE GLOBALE — cherchée dans TOUT ce que le run a produit
// ===========================================================================

function globalBelt(): void {
  const all = ALL_REPLIES.join("\n---\n");
  const prospective =
    /when can you|when will you|what time|quand est-ce que|y aller quand|prévu pour quand|dis-moi quand|quel jour/i;
  check(
    "adversarial",
    `AUCUNE question ouverte sur le futur dans les ${ALL_REPLIES.length} réponses du run`,
    !prospective.test(all),
    prospective.test(all)
      ? `TROUVÉ: ${all.match(prospective)?.[0]}`
      : "(aucune occurrence)",
  );
  const judgement =
    /cheat meal|cheat day|slipped up|make up for|back on track|écart|craquage|rattrapage|compenser/i;
  check(
    "adversarial",
    "AUCUN jugement de vocabulaire dans les réponses du run, FR + EN",
    !judgement.test(all),
    judgement.test(all)
      ? `TROUVÉ: ${all.match(judgement)?.[0]}`
      : "(aucune occurrence)",
  );
  const obligation =
    /you must|you need to|il faut choisir|tu dois|maintenant il faut|required/i;
  check(
    "adversarial",
    "RIEN ne lie le signalement à une obligation (contre-mesure §10)",
    !obligation.test(all),
    obligation.test(all)
      ? `TROUVÉ: ${all.match(obligation)?.[0]}`
      : "(aucune occurrence)",
  );
}

// ===========================================================================
// LE RUN
// ===========================================================================

async function main(): Promise<void> {
  try {
    say("── EASY ─────────────────────────────────────────────────────────");
    for (let run = 1; run <= 3; run++) await easyOrdered("en-US", run);
    await easyOrdered("fr-FR", 1);

    say("\n── MEDIUM ───────────────────────────────────────────────────────");
    await mediumButtons();

    say("\n── COURSES ──────────────────────────────────────────────────────");
    await coursesNominal("en-US");
    await coursesNominal("fr-FR");
    await coursesDecline();
    await coursesRefusals();

    say("\n── EXTRA-HARD ───────────────────────────────────────────────────");
    await twoAccidentsOneDay();
    await cascadeRun();
    await sameEveningBothEntries();

    say("\n── HARD ─────────────────────────────────────────────────────────");
    await hardCases();

    say("\n── CEINTURES GLOBALES ───────────────────────────────────────────");
    globalBelt();
  } catch (error) {
    fail++;
    say(`🔴 RUN INTERROMPU: ${error instanceof Error ? error.stack : error}`);
  } finally {
    say(`\n=== ${pass} verts / ${fail} rouges ===`);
    for (const userId of created) {
      try {
        await cleanup(userId);
      } catch (e) {
        say(`nettoyage ${userId}: ${e instanceof Error ? e.message : e}`);
      }
    }
    say(`nettoyé: ${created.length} élèves`);
  }
}

await main();
