/**
 * FF-057 — REVUE ADVERSARIALE. Chaque hypothèse est écrite AVANT d'être testée.
 *
 * ── LES HYPOTHÈSES, DANS L'ORDRE OÙ ELLES ONT ÉTÉ ÉCRITES ─────────────────
 *
 * H1  La charge d'un bouton de formulaire porte un INDEX. Un index désignant le
 *     plat de DEMAIN ferait-il écrire un fait `off_plan` DATÉ DE DEMAIN ?
 *     `writeMealTick` a la garde `isReportable`; `writeOffPlanTapFact` est un
 *     écrivain NEUF, et rien ne dit qu'il l'a. C'est exactement la cicatrice H1
 *     de FF-058, rouverte sur un second écrivain.
 *
 * H2  Le verrou optimiste tient-il ? Si le plan change entre la proposition et
 *     le tap, le glissement doit refuser — pas écraser.
 *
 * H3  Deux taps SIMULTANÉS sur « Oui » font-ils glisser le plan de deux jours ?
 *
 * H4  Le glissement touche-t-il `starts_on` / `duration_days` / `ends_on` ?
 *     S'il le faisait, il traverserait la contrainte d'exclusion des fenêtres
 *     vivantes et casserait un état sans lever d'erreur.
 *
 * H5  La question de session est-elle vraiment posée UNE fois par session, et
 *     jamais par plat ?
 *
 * H6  Une session déclarée FAITE peut-elle encore faire tomber des repas ?
 *
 * H7  La cascade fait-elle DISPARAÎTRE les plats de la bande du soir — c'est-à-
 *     dire le plan cesse-t-il vraiment de mentir ? (le filtre de lecture)
 *
 * H8  Un plat déjà coché reste-t-il annoncé après une session sautée ?
 *
 * H9  Un `Pas encore` sur une vague qui ne sert AUCUNE cuisson propose-t-il
 *     quand même quelque chose ? (il ne doit pas: rien n'est menacé)
 *
 * H10 Le texte du refus peut-il fuir le TITRE d'un plat d'un autre élève ?
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
import { loadEveningStripContext } from "../../../supabase/functions/_shared/keel/evening_strip_io.ts";

const db = admin();
const created: string[] = [];
let pass = 0;
let fail = 0;

function check(id: string, name: string, ok: boolean, proof: string): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "🟢" : "🔴"} [${id}] ${name}\n      ${proof}`);
}

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
const tokenOf = (d: string) =>
  DAY_TOKENS[new Date(`${d}T12:00:00Z`).getUTCDay()];
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const TODAY = localDateIn(new Date().toISOString(), TZ);

let coachPool: Coach | null = null;
let seats = 0;
async function nextCoach(): Promise<Coach> {
  if (!coachPool || seats >= 3) {
    coachPool = await makeCoach({
      displayName: `FF057adv ${nonce()}`,
      country: "GB",
    });
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

async function plant(args: {
  userId: string;
  dishes: Array<{ title: string; slot: string; offset: number; uses?: string[] }>;
  preps?: Array<{ id: string; cookOffset: number; term: string }>;
  sessionOffsets?: number[];
  startsOn?: string;
  durationDays?: number;
}): Promise<string> {
  const startsOn = args.startsOn ?? TODAY;
  const preps = args.preps ?? [];
  const { data, error } = await db.from("student_generated_meals").insert({
    user_id: args.userId,
    scope: "several_days",
    mode: "to_shop",
    servings: 1,
    dishes: args.dishes.map((d) => ({
      title: d.title,
      slot: d.slot,
      day: tokenOf(addDays(startsOn, d.offset)),
      ingredients: [{ term: "adv filler", unit: "g", amount: 100 }],
      method: "Assemble.",
      uses: (d.uses ?? []).map((id) => ({ preparation_id: id, servings: 1 })),
    })),
    preparations: preps.map((p) => ({
      id: p.id,
      title: `Prep ${p.id}`,
      servings_made: 3,
      method: "Roast.",
      cook_on: tokenOf(addDays(startsOn, p.cookOffset)),
      ingredients: [{ term: p.term, unit: "g", amount: 600 }],
    })),
    cooking_sessions: (args.sessionOffsets ?? []).map((off) => ({
      day: tokenOf(addDays(startsOn, off)),
      preparation_ids: preps.filter((p) => p.cookOffset === off).map((p) => p.id),
      run_through: "Oven on.",
    })),
    shopping_list: [
      ...preps.map((p) => ({ term: p.term, aisle: "protein", quantity: "600 g" })),
      { term: `adv rice ${nonce()}`, aisle: "grain", quantity: "500 g" },
    ],
    generated_from: { ff057adv: true },
    content_locale: "en-GB",
    starts_on: startsOn,
    duration_days: args.durationDays ?? 7,
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`plant: ${error.message}`);
  return String((data as { id: string }).id);
}

async function tap(
  student: Student,
  payload: string,
  label: string,
): Promise<{ body: string | null; buttons: Array<{ payload: string; label: string }> }> {
  const before = new Date().toISOString();
  await callAs(student, "chat-inbound-v1", {
    client_message_id: `adv-${nonce()}`,
    kind: "button",
    text: label,
    button_payload: payload,
  });
  const { data, error } = await db
    .from("chat_messages")
    .select("content,metadata")
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
    body: row?.content ?? null,
    buttons: (row?.metadata?.buttons ?? []) as Array<
      { payload: string; label: string }
    >,
  };
}

async function events(userId: string) {
  const { data, error } = await db
    .from("protocol_events")
    .select("source_message_id, local_date, plan_relation, disqualified_reason")
    .eq("user_id", userId);
  if (error) throw new Error(`protocol_events: ${error.message}`);
  return (data ?? []) as Array<
    {
      source_message_id: string;
      local_date: string;
      plan_relation: string | null;
      disqualified_reason: string | null;
    }
  >;
}

async function planRow(mealId: string) {
  const { data, error } = await db
    .from("student_generated_meals")
    .select("dishes, preparations, cooking_sessions, starts_on, duration_days, ends_on")
    .eq("id", mealId)
    .maybeSingle();
  if (error) throw new Error(`plan: ${error.message}`);
  if (!data) throw new Error("plan: no row");
  // deno-lint-ignore no-explicit-any
  return data as any;
}

// ===========================================================================

async function h1FutureOffPlan(): Promise<void> {
  const student = await newStudent("ADV Future");
  const mealId = await plant({
    userId: student.userId,
    dishes: [
      { title: "Today dinner", slot: "dinner", offset: 0 },
      { title: "Tomorrow dinner", slot: "dinner", offset: 1 },
    ],
  });
  // Charge FORGÉE: l'index 1 désigne le plat de DEMAIN.
  const out = await tap(
    student,
    `KEEL_FIX_ORDERED|meal_tick:${mealId}:1`,
    "I ordered or ate out",
  );
  const rows = await events(student.userId);
  const future = rows.filter((r) => r.local_date > TODAY);
  check(
    "H1",
    "une charge citant le plat de DEMAIN n'écrit AUCUN fait daté de demain",
    future.length === 0,
    future.length === 0
      ? `(aucune ligne future) · lignes=${
        rows.map((r) => `${r.source_message_id}|${r.local_date}|${r.plan_relation}`)
          .join(" ; ") || "aucune"
      }`
      : `🔴 PREUVE FABRIQUÉE: ${
        future.map((r) => `${r.source_message_id}|${r.local_date}|${r.plan_relation}`)
          .join(" ; ")
      }`,
  );
  check(
    "H1",
    "…et la personne l'apprend, au lieu d'un « c'est noté » mensonger",
    Boolean(out.body),
    JSON.stringify(out.body),
  );
}

async function h2h3OptimisticLock(): Promise<void> {
  const student = await newStudent("ADV Lock");
  const mealId = await plant({
    userId: student.userId,
    dishes: [
      { title: "Cooked A", slot: "dinner", offset: 4, uses: ["p"] },
      { title: "Cooked B", slot: "dinner", offset: 5, uses: ["p"] },
    ],
    preps: [{ id: "p", cookOffset: 4, term: `adv chicken ${nonce()}` }],
    sessionOffsets: [4],
  });
  const buyOn = addDays(TODAY, 1);
  const proposal = await tap(
    student,
    `KEEL_STRIP_SHOP_LATER|${mealId}|${buyOn}`,
    "Not yet",
  );
  const yes = proposal.buttons.find((b) => b.payload.startsWith("KEEL_FIX_SHIFT_YES"));
  if (!yes) {
    check("H2", "proposition émise", false, JSON.stringify(proposal));
    return;
  }

  // ── H2: le plan CHANGE entre la proposition et le tap ─────────────────
  const before = await planRow(mealId);
  const { error } = await db
    .from("student_generated_meals")
    .update({
      dishes: [
        ...(before.dishes as Array<Record<string, unknown>>),
        {
          title: "Added behind your back",
          slot: "lunch",
          day: tokenOf(addDays(TODAY, 2)),
          ingredients: [],
          uses: [],
        },
      ],
    } as never)
    .eq("id", mealId);
  if (error) throw new Error(`mutate: ${error.message}`);

  const stale = await tap(student, yes.payload, yes.label);
  const after = await planRow(mealId);
  check(
    "H2",
    "plan changé entre la proposition et le tap ⇒ le glissement N'EST PAS appliqué",
    JSON.stringify(
        (after.dishes as Array<Record<string, unknown>>).map((d) => d.day),
      ) ===
      JSON.stringify(
        [
          ...(before.dishes as Array<Record<string, unknown>>).map((d) => d.day),
          tokenOf(addDays(TODAY, 2)),
        ],
      ),
    `jours après tap=${
      (after.dishes as Array<Record<string, unknown>>).map((d) => d.day).join(",")
    } · réponse=${JSON.stringify(stale.body)}`,
  );
  check(
    "H2",
    "…et la personne le sait EN UNE PHRASE",
    Boolean(stale.body) && stale.body!.length < 120,
    JSON.stringify(stale.body),
  );

  // ── H3: deux taps SIMULTANÉS ──────────────────────────────────────────
  const student2 = await newStudent("ADV Race");
  const meal2 = await plant({
    userId: student2.userId,
    dishes: [
      { title: "Cooked A", slot: "dinner", offset: 4, uses: ["p"] },
      { title: "Cooked B", slot: "dinner", offset: 5, uses: ["p"] },
    ],
    preps: [{ id: "p", cookOffset: 4, term: `adv chicken ${nonce()}` }],
    sessionOffsets: [4],
  });
  const prop2 = await tap(
    student2,
    `KEEL_STRIP_SHOP_LATER|${meal2}|${addDays(TODAY, 1)}`,
    "Not yet",
  );
  const yes2 = prop2.buttons.find((b) => b.payload.startsWith("KEEL_FIX_SHIFT_YES"))!;
  const raceBefore = await planRow(meal2);
  await Promise.all([
    tap(student2, yes2.payload, yes2.label),
    tap(student2, yes2.payload, yes2.label),
  ]);
  const raceAfter = await planRow(meal2);
  const expected = (raceBefore.dishes as Array<Record<string, unknown>>).map((d) =>
    tokenOf(addDays(TODAY, d.day === tokenOf(addDays(TODAY, 4)) ? 5 : 6))
  );
  check(
    "H3",
    "deux taps SIMULTANÉS ⇒ le plan glisse d'UN jour, pas de deux",
    JSON.stringify(
        (raceAfter.dishes as Array<Record<string, unknown>>).map((d) => d.day),
      ) === JSON.stringify(expected),
    `avant=${
      (raceBefore.dishes as Array<Record<string, unknown>>).map((d) => d.day).join(",")
    } → après=${
      (raceAfter.dishes as Array<Record<string, unknown>>).map((d) => d.day).join(",")
    } (attendu ${expected.join(",")})`,
  );

  // ── H4: la FENÊTRE est intouchée ──────────────────────────────────────
  check(
    "H4",
    "le glissement ne touche NI starts_on, NI duration_days, NI ends_on",
    raceAfter.starts_on === raceBefore.starts_on &&
      raceAfter.duration_days === raceBefore.duration_days &&
      raceAfter.ends_on === raceBefore.ends_on,
    `starts_on=${raceAfter.starts_on} duration=${raceAfter.duration_days} ends_on=${raceAfter.ends_on}`,
  );
}

async function h5h6SessionQuestion(): Promise<void> {
  const student = await newStudent("ADV Session");
  const mealId = await plant({
    userId: student.userId,
    dishes: [
      { title: "From batch one", slot: "lunch", offset: 0, uses: ["p"] },
      { title: "From batch two", slot: "dinner", offset: 0, uses: ["p"] },
    ],
    preps: [{ id: "p", cookOffset: 0, term: `adv chicken ${nonce()}` }],
    sessionOffsets: [0],
  });

  const first = await tap(
    student,
    `KEEL_FIX_NO_TIME|meal_tick:${mealId}:0`,
    "No time to cook",
  );
  check(
    "H5",
    "le 1er « pas eu le temps » sur un plat de session POSE la question de session",
    first.buttons.length === 2 &&
      first.buttons.every((b) => b.payload.startsWith("KEEL_FIX_SESSION_")),
    `body=${JSON.stringify(first.body)} · boutons=${
      first.buttons.map((b) => b.label).join("/")
    }`,
  );

  // On répond.
  const yes = first.buttons.find((b) => b.payload.startsWith("KEEL_FIX_SESSION_YES"))!;
  await tap(student, yes.payload, yes.label);

  // ⚠️ UNE FOIS PAR SESSION, JAMAIS PAR PLAT: le second plat de la MÊME session
  // ne doit plus la poser.
  const second = await tap(
    student,
    `KEEL_FIX_NO_TIME|meal_tick:${mealId}:1`,
    "No time to cook",
  );
  check(
    "H5",
    "le 2e plat de la MÊME session ne repose PAS la question",
    !second.buttons.some((b) => b.payload.startsWith("KEEL_FIX_SESSION_")),
    `body=${JSON.stringify(second.body)} · boutons=${
      second.buttons.map((b) => b.label).join("/") || "(aucun)"
    }`,
  );

  const { data, error } = await db
    .from("cooking_session_states")
    .select("cook_on, happened")
    .eq("user_id", student.userId);
  if (error) throw new Error(`states: ${error.message}`);
  check(
    "H6",
    "une session déclarée FAITE ne fait tomber aucun repas",
    (data ?? []).length === 1 &&
      (data as Array<{ happened: boolean }>)[0].happened === true,
    JSON.stringify(data),
  );
}

async function h7h8CascadeHidesDishes(): Promise<void> {
  const student = await newStudent("ADV Hide");
  const mealId = await plant({
    userId: student.userId,
    dishes: [
      { title: "Eaten already", slot: "lunch", offset: 0, uses: ["p"] },
      { title: "Never cooked", slot: "dinner", offset: 0, uses: ["p"] },
      { title: "Independent", slot: "breakfast", offset: 0 },
    ],
    preps: [{ id: "p", cookOffset: 0, term: `adv chicken ${nonce()}` }],
    sessionOffsets: [0],
  });

  // Un plat de la session est COCHÉ — il doit survivre.
  await tap(student, `KEEL_STRIP_TICK|meal_tick:${mealId}:0`, "✓ Eaten already");

  const beforeStrip = await loadEveningStripContext(db, {
    userId: student.userId,
    localDate: TODAY,
  });

  // La session n'a pas eu lieu.
  await tap(
    student,
    `KEEL_FIX_SESSION_NO|${mealId}|${TODAY}`,
    "It did not happen",
  );

  // ⚠️ LE FILTRE DE LECTURE — c'est LUI qui fait que le plan cesse de mentir.
  const afterStrip = await loadEveningStripContext(db, {
    userId: student.userId,
    localDate: TODAY,
  });
  const titles = afterStrip.dishes.map((d) => d.title).sort();
  check(
    "H7",
    "après la cascade, la bande du soir NE NOMME PLUS le plat jamais cuisiné",
    !titles.includes("Never cooked"),
    `avant=${beforeStrip.dishes.map((d) => d.title).sort().join(" | ")} → après=${
      titles.join(" | ") || "(aucun)"
    }`,
  );
  check(
    "H8",
    "…mais le plat DÉJÀ COCHÉ de la même session reste annoncé (le fait bat la déclaration)",
    titles.includes("Eaten already"),
    titles.join(" | ") || "(aucun)",
  );
  check(
    "H7",
    "…et le plat indépendant n'est PAS touché (la cascade n'est pas trop large)",
    titles.includes("Independent"),
    titles.join(" | ") || "(aucun)",
  );
}

async function h9h10Misc(): Promise<void> {
  // H9 — une vague qui ne sert AUCUNE cuisson
  const student = await newStudent("ADV NoCook");
  const mealId = await plant({
    userId: student.userId,
    dishes: [{ title: "Salad", slot: "dinner", offset: 0 }],
  });
  const out = await tap(
    student,
    `KEEL_STRIP_SHOP_LATER|${mealId}|${TODAY}`,
    "Not yet",
  );
  check(
    "H9",
    "un `Pas encore` sur une vague qui ne sert aucune cuisson ne propose RIEN",
    out.buttons.length === 0,
    `body=${JSON.stringify(out.body)} · boutons=${out.buttons.length}`,
  );

  // H10 — le refus peut-il citer un plat d'autrui ?
  const victim = await newStudent("ADV Victim");
  const victimMeal = await plant({
    userId: victim.userId,
    dishes: [
      { title: "CONFIDENTIAL victim dish", slot: "dinner", offset: 4, uses: ["p"] },
    ],
    preps: [{ id: "p", cookOffset: 4, term: `adv secret ${nonce()}` }],
    sessionOffsets: [4],
  });
  const attacker = await newStudent("ADV Thief");
  const stolen = await tap(
    attacker,
    `KEEL_FIX_SESSION_NO|${victimMeal}|${addDays(TODAY, 4)}`,
    "It did not happen",
  );
  check(
    "H10",
    "un refus ne peut pas fuir le titre d'un plat d'un autre élève",
    !(stolen.body ?? "").includes("CONFIDENTIAL"),
    JSON.stringify(stolen.body),
  );
}

async function main(): Promise<void> {
  try {
    await h1FutureOffPlan();
    await h2h3OptimisticLock();
    await h5h6SessionQuestion();
    await h7h8CascadeHidesDishes();
    await h9h10Misc();
  } catch (e) {
    fail++;
    console.log(`🔴 RUN INTERROMPU: ${e instanceof Error ? e.stack : e}`);
  } finally {
    console.log(`\n=== ${pass} verts / ${fail} rouges ===`);
    for (const u of created) {
      try {
        await cleanup(u);
      } catch (e) {
        console.log(`nettoyage ${u}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`nettoyé: ${created.length} élèves`);
  }
}

await main();
