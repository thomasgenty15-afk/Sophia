/**
 * PASSE TRANSVERSE ② — UN COMPTEUR, PAS QUATRE.
 *
 * ── CE QUI N'AVAIT JAMAIS ÉTÉ MESURÉ ───────────────────────────────────────
 * FF-017 a prouvé que l'invitation photo ferme la question de précision du même
 * jour (3/3). Deux genres sur quatre. Ici: LES QUATRE, sur le MÊME élève, le
 * MÊME jour local, dans PLUSIEURS ORDRES.
 *
 *   meal_precision_question  FF-017  tour de chat, repas vague déclaré
 *   photo_invitation         FF-025  tour de chat, repas HORS PLAN déclaré
 *   daily_recommendation     FF-028  `runRecommendationStep` (19h-20h local)
 *   practice_question        FF-029  `composeRecapBody`      (20h-22h local)
 *
 * ── POURQUOI LES DEUX GENRES DU SOIR SONT APPELÉS SANS HTTP ─────────────────
 * `keel-daily-recommendation-v1` et `keel-daily-pulse-v1` PAGINENT `profiles`
 * (`PAGE = 200`) et balaient toute la flotte. La base locale est PARTAGÉE avec
 * un autre agent: un balayage enverrait des messages du soir à ses élèves et
 * fausserait son travail autant que le mien (cicatrice
 * `qa-concurrent-run-reminder-purge`).
 *
 * On appelle donc les MÊMES fonctions de décision et le MÊME écrivain que les
 * crons, scopés à un élève. `runRecommendationStep` est conçue pour ça (son
 * en-tête le dit: « joignable sans HTTP — ce qui est la condition pour que la
 * logique du soir soit éprouvée EN CONDITIONS RÉELLES »).
 *
 * ── L'HORLOGE ──────────────────────────────────────────────────────────────
 * Fuseau `Asia/Bangkok` (UTC+7): l'heure RÉELLE tombe dans la fenêtre 19h-20h
 * de la recommandation. Le soir (21h local) est passé explicitement, et il est
 * dans le FUTUR de l'heure réelle — jamais dans le passé (cicatrice
 * `qa-simulated-clock-cron`). Les deux tombent sur la MÊME date locale.
 *
 * usage: deno run -A scratchpad/ffx_asks.ts <A|B|C|all>
 */
import {
  admin,
  callAs,
  type Coach,
  makeCoach,
  makeStudent,
  mondayOf,
  nonce,
  publishPlanFor,
  rows,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { writeHungerReport } from "../supabase/functions/_shared/keel/hunger_signal_io.ts";
import { runRecommendationStep } from "../supabase/functions/_shared/keel/daily_recommendation_engine.ts";
import { composeRecapBody, loadDayFacts } from "../supabase/functions/_shared/keel/daily_recap_io.ts";
import { decideAskCadence } from "../supabase/functions/_shared/keel/daily_pulse.ts";
import { resolveArtifactLocale } from "../supabase/functions/_shared/keel/locale.ts";
import { DAILY_ASK_LEDGER_TABLE } from "../supabase/functions/_shared/keel/daily_ask_budget.ts";

const ONLY = (Deno.args[0] ?? "all").trim();
const db = admin();
const TZ = "Asia/Bangkok";

const out: string[] = [];
const say = (s: string) => {
  console.log(s);
  out.push(s);
};

function localDateIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function localHourIn(tz: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false })
      .format(new Date()),
  );
}
function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = localDateIn(TZ);
const HOUR = localHourIn(TZ);
say(`horloge: ${new Date().toISOString()} — ${TZ} = ${TODAY} ${HOUR}h`);
if (HOUR < 19 || HOUR >= 20) {
  say(
    `⚠️ HORS FENÊTRE 19h-20h (${HOUR}h): la recommandation rendra ` +
      `\`outside_window\`. Choisir un autre fuseau ou attendre.`,
  );
}
// 21h locale = fenêtre du tap du soir, et DANS LE FUTUR de l'heure réelle.
const EVENING_NOW = new Date(Date.parse(`${TODAY}T21:15:00+07:00`));
say(
  `soir simulé: ${EVENING_NOW.toISOString()} (21h15 ${TZ}) — ` +
    `≥ réel: ${EVENING_NOW.getTime() >= Date.now()}`,
);

// La cadence du pulse: `pulseAsks = false` est-il un état ATTEIGNABLE ?
// C'est la précondition de la question de pratique (§R3: l'alternance tombe de
// la décision du pulse). On ne le suppose pas, on le calcule.
const cadenceProof = decideAskCadence({
  daysSinceLastAsk: 1,
  lastAnsweredLevel: null,
  unansweredStreak: 0,
});
say(
  `decideAskCadence({daysSinceLastAsk:1}) → ask=${cadenceProof.ask} ` +
    `(${cadenceProof.reason}) — la question de pratique est atteignable: ${!cadenceProof.ask}`,
);

const DOCTRINE = {
  beliefs: [{ claim: "Every meal is built on a protein anchor.", rationale: null }],
  forbidden: [{
    token: "count_calories",
    surface_forms: ["count calories", "counting calories"],
    reason: "numbers turn food into a score",
    instead: "We build the plate: a protein anchor, vegetables for volume.",
  }],
  vocabulary: [],
  arbitrations: [],
  foods: { recommended: [], discouraged: [] },
  qa: [],
  // FF-029 — UNE pratique servable, non chiffrée, askable, minor_safe.
  // Les clés sont celles que `parseDailyPractices` lit (`goal_scope`,
  // `minor_safe`), pas du camelCase inventé.
  daily_practices: [{
    label: "Sit down to eat, away from a screen.",
    kind: "other",
    quantified: false,
    target: null,
    unit: null,
    goal_scope: [],
    cadence: "constant",
    askable: true,
    minor_safe: true,
    brief: "Ask, in one short sentence, whether they managed to sit down for a meal today.",
    status: "active",
  }],
  voice: { address: "tu", length: "short", emojis: "none", language: "en" },
};

async function makeCoachWithDoctrine(): Promise<Coach> {
  const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    ...DOCTRINE,
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
  return coach;
}

/**
 * Un élève sur qui LES QUATRE genres peuvent partir.
 *
 * `student_week_plans.generated_from.satiety_priority = true` DEUX FOIS: c'est
 * ce que `countSatietyAdaptations` compte, et le seuil de FF-028 est 2. Sans
 * elles, la recommandation rend `nothing_significant` — un genre qui ne part
 * jamais ne prouve rien du compteur.
 */
async function makeBudgetStudent(coach: Coach, label: string): Promise<Student> {
  const student = await makeStudent({
    coach,
    fullName: `Bud ${label}`,
    country: "GB",
    locale: "en-US",
    timezone: TZ,
  });
  await db.from("student_goals").upsert({
    user_id: student.userId,
    goal: "fat_loss",
    situation: "I cook at home.",
    content_locale: "en",
  } as never, { onConflict: "user_id" });
  await publishPlanFor(coach, student.userId, { timezone: TZ });

  const thisMonday = mondayOf(new Date());
  await db.from("student_week_plans").update({
    generated_from: { satiety_priority: true, prompt_version: "ffx" },
  } as never).eq("user_id", student.userId).eq("week_start", thisMonday);
  await db.from("student_week_plans").insert({
    user_id: student.userId,
    week_start: shift(thisMonday, -7),
    status: "adopted",
    adopted_at: new Date().toISOString(),
    items: [],
    content_locale: "en-GB",
    generated_from: { satiety_priority: true, prompt_version: "ffx" },
  } as never);

  // FF-027 — faim RÉCURRENTE (2 jours distincts dans la fenêtre de 7).
  for (const daysAgo of [1, 3]) {
    await writeHungerReport(db, {
      userId: student.userId,
      localDate: shift(TODAY, -daysAgo),
      matched: "still hungry after dinner",
      studentNote: "still hungry an hour after dinner",
      contentLocale: "en",
    });
  }

  // LE SOL DU MESSAGE DU SOIR: deux coches, forme de `mealTicks.tickMeal`.
  const { data: meal } = await db.from("student_meals")
    .select("id").eq("user_id", student.userId).limit(1);
  const mealId = ((meal ?? []) as Array<{ id: string }>)[0]?.id ?? crypto.randomUUID();
  await db.from("protocol_events").insert([0, 1].map((i) => ({
    user_id: student.userId,
    occurred_at: new Date().toISOString(),
    local_date: TODAY,
    slot_key: i === 0 ? "lunch" : "dinner",
    source: "quick_tap",
    student_note: i === 0 ? "chicken and greens" : "beef and root vegetables",
    content_locale: "en",
    evidence_weight: 0.4,
    plan_relation: "as_planned",
    source_message_id: `meal_tick:${mealId}:${i}`,
  })) as never);
  return student;
}

async function ledger(userId: string): Promise<string[]> {
  return await rows(
    // ⚠️ `asked_at`, PAS `created_at`: la table n'a pas de `created_at`
    // (10 colonnes relues en `psql`). Deuxième faux départ de mes propres
    // sondes — T-15 encore, et encore trouvé par la base.
    `select ask_kind, local_date, source, coalesce(axis,'-'), left(question, 60)
       from ${DAILY_ASK_LEDGER_TABLE} where user_id='${userId}'
       order by asked_at`,
  );
}

async function chatTurn(student: Student, text: string): Promise<string> {
  const before = new Date().toISOString();
  const cmid = `ffx-ask-${nonce()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await callAs(student, "chat-inbound-v1", {
      client_message_id: cmid,
      kind: "text",
      text,
    });
    if (res.status !== 502) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 1200));
  const { data } = await db.from("chat_messages")
    .select("content").eq("user_id", student.userId).eq("role", "assistant")
    .gt("created_at", before).order("created_at", { ascending: false }).limit(1);
  return ((data ?? []) as Array<{ content: string }>)[0]?.content ?? "‼️ RIEN";
}

// ---------------------------------------------------------------------------
// LES QUATRE PROVOCATIONS
// ---------------------------------------------------------------------------
type Step = { id: string; label: string; run: (s: Student) => Promise<string> };

const STEP_PRECISION: Step = {
  id: "precision",
  label: "FF-017 · repas vague déclaré (chat)",
  run: (s) => chatTurn(s, "I had chicken for lunch."),
};
const STEP_PHOTO: Step = {
  id: "photo",
  label: "FF-025 · repas HORS PLAN déclaré (chat)",
  run: (s) => chatTurn(s, "I had a takeaway pizza for dinner."),
};
const STEP_RECO: Step = {
  id: "reco",
  label: "FF-028 · runRecommendationStep (19h-20h local)",
  run: async (s) => {
    const step = await runRecommendationStep(db, {
      userId: s.userId,
      timezone: TZ,
      optedOut: false,
      now: new Date(),
      dryRun: false,
      requestId: `ffx-${nonce()}`,
      onDoctrineRemoved: () => {},
    });
    return JSON.stringify(step);
  },
};
const STEP_PRACTICE: Step = {
  id: "practice",
  label: "FF-029 · composeRecapBody (21h local, pulseAsks=false)",
  run: async (s) => {
    const facts = await loadDayFacts(db, { userId: s.userId, localDate: TODAY });
    const recap = await composeRecapBody(db, {
      userId: s.userId,
      firstName: "Bud",
      facts,
      contentLocale: resolveArtifactLocale({
        studentProfile: "en-US",
        tenantDefault: null,
      }),
      practiceContext: {
        localDate: TODAY,
        isMinor: false,
        restrictionFlag: false,
        // Atteignable: `decideAskCadence({daysSinceLastAsk:1}).ask === false`,
        // prouvé en tête de ce script.
        pulseAsks: false,
      },
      requestId: `ffx-${nonce()}`,
    });
    return JSON.stringify({
      source: recap.source,
      reason: recap.reason ?? null,
      practiceMode: recap.practiceMode,
      body: recap.body,
    });
  },
};

const ORDERS: Record<string, Step[]> = {
  A: [STEP_PHOTO, STEP_PRECISION, STEP_RECO, STEP_PRACTICE],
  B: [STEP_RECO, STEP_PRACTICE, STEP_PHOTO, STEP_PRECISION],
  C: [STEP_PRECISION, STEP_PHOTO, STEP_PRACTICE, STEP_RECO],
  // ⚠️ ORDRE D — LE TROU DE MA PROPRE COUVERTURE, trouvé en relisant A/B/C.
  // Dans les trois premiers ordres, `practice_question` arrive TOUJOURS après
  // qu'une autre surface a pris la place: il rend donc `remind` à chaque fois,
  // et je n'aurais prouvé que trois genres sur quatre capables de consommer le
  // budget. Ici la pratique passe en TÊTE.
  D: [STEP_PRACTICE, STEP_RECO, STEP_PHOTO, STEP_PRECISION],
};

const results: Record<string, unknown[]> = {};
const created: string[] = [];

for (const order of Object.keys(ORDERS)) {
  if (ONLY !== "all" && ONLY !== order) continue;
  results[order] = [];
  for (let run = 1; run <= 3; run++) {
    // UN COACH PAR ÉLÈVE: le harnais plafonne à 3 élèves par coach, et un
    // 4e siège fait planter le run en cours.
    const coach = await makeCoachWithDoctrine();
    const student = await makeBudgetStudent(coach, `${order}${run}`);
    created.push(student.userId, coach.userId);
    say(`\n${"=".repeat(76)}\n▌ ORDRE ${order} · run ${run} — élève ${student.userId}\n${"=".repeat(76)}`);

    const trace: Array<{ step: string; out: string; ledgerAfter: number }> = [];
    for (const step of ORDERS[order]) {
      const outText = await step.run(student);
      const after = await ledger(student.userId);
      trace.push({ step: step.id, out: outText, ledgerAfter: after.length });
      say(`— ${step.label}`);
      say(`  → ${outText.slice(0, 260).replace(/\n/g, " ")}`);
      say(`  ledger: ${after.length} ligne(s)`);
    }

    const finalLedger = await ledger(student.userId);
    say(`\nLEDGER FINAL (${finalLedger.length} ligne(s)):`);
    for (const l of finalLedger) say(`  ${l}`);
    say(`VERDICT ordre ${order} run ${run}: ${finalLedger.length <= 1 ? "GREEN" : "🔴 RED"}`);

    (results[order] as unknown[]).push({
      run,
      userId: student.userId,
      trace,
      finalLedger,
      verdict: finalLedger.length <= 1 ? "GREEN" : "RED",
    });
  }
}

await Deno.writeTextFile(
  new URL(`./ffx_asks_${ONLY}.json`, import.meta.url),
  JSON.stringify({ today: TODAY, timezone: TZ, created, results }, null, 2),
);
await Deno.writeTextFile(
  new URL(`./ffx_asks_${ONLY}.txt`, import.meta.url),
  out.join("\n") + "\n",
);
console.log(`\n→ scratchpad/ffx_asks_${ONLY}.{json,txt}`);
