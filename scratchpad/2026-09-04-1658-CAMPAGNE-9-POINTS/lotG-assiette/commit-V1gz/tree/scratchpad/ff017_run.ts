/**
 * FF-017 — RUN RÉEL. Le repas déclaré (plancher + question d'approfondissement).
 *
 * Vrai modèle, vraie base locale, vrais élèves provisionnés (plan PUBLIÉ).
 * Chaque verdict cite la LIGNE EN BASE — jamais la réponse HTTP.
 *
 * ⚠️ UN ÉLÈVE NEUF PAR (cas × répétition): rejouer le même message sur le même
 * élève fait classer le 2e envoi comme RÉPONSE à la question de précision du
 * 1er (cicatrice FF-009).
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run -A scratchpad/ff017_run.ts <groupe> [repeats]
 */
import {
  admin,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  sql,
  type Student,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { DAILY_ASK_LEDGER_TABLE } from "../supabase/functions/_shared/keel/daily_ask_budget.ts";

const GROUP = (Deno.args[0] ?? "easy").trim();
const REPEATS = Number(Deno.args[1] ?? "3");

// ── Lexique de quantité, FR+EN. Une occurrence dans une question = ligne rouge.
const QUANTITY_LEXICON = [
  "how much", "how many", "how large", "how big", "portion", "portions",
  "gram", "grams", "gramme", "grammes", "ounce", "oz", "calorie", "calories",
  "serving", "servings", "quantity", "amount", "combien", "quantite",
  "grosse", "grosses", "gros", "copieux", "copieuse", "beaucoup",
  "generous", "plenty", "a lot", "assiette pleine", "half a", "a whole",
  "une pleine",
];
function quantityHitsIn(text: string): string[] {
  const flat = String(text ?? "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return QUANTITY_LEXICON.filter((t) =>
    new RegExp(`(^|[^a-z])${t.replace(/ /g, "\\s+")}([^a-z]|$)`).test(flat)
  );
}

/** Les gabarits FERMÉS attendus. Toute autre question = hors gabarit. */
const CLOSED_TEMPLATES = new Set([
  "What was in it?",
  "And what did you have with it?",
  "Did you cook that with any oil or butter?",
  "Il y avait quoi dedans ?",
  "Et tu as mangé quoi avec ?",
  "Tu l'as cuisiné avec de l'huile ou du beurre ?",
]);
function isClosedTemplate(q: string): boolean {
  if (CLOSED_TEMPLATES.has(q.trim())) return true;
  return /^(Which meal was that(, [a-z ]+ or [a-z ]+)?\?|C'était quel repas( , | ,|, )?[a-zà-ÿ ]*(ou [a-zà-ÿ ]+)? ?\?)$/
    .test(q.trim());
}

type Case = {
  id: string;
  level: "easy" | "medium" | "hard" | "extra" | "adv";
  /** Les messages du scénario, dans l'ordre. Le 1er porte la déclaration. */
  turns: string[];
  locale: string;
  timezone?: string;
  country?: string;
  /** Lignes protocol_events attendues APRÈS le 1er tour. */
  expectRows: number | "any" | "atLeast1";
  /**
   * Les refs ACCEPTABLES. Le plancher écrit son propre slug (`poultry`), le
   * dispatcher écrit souvent le slug de la ligne de plan (`lean_protein`) —
   * les deux sont justes, seule la CARDINALITÉ et l'absence d'invention
   * comptent ici.
   */
  allowedFoods?: string[];
  /** Interdits: aucun de ces refs ne doit apparaître. */
  forbiddenFoods?: string[];
  /** Nb de questions de précision attendues sur TOUT le scénario. */
  expectQuestions?: number | "atMost1";
  /** slot_key attendu sur les lignes ('null' = aucun créneau). */
  expectSlot?: string | "null";
  /**
   * Après le DERNIER tour, les lignes du 1er tour doivent-elles être
   * rétractées ? §5 — « une ligne décochée survit et porte
   * `disqualified_reason` ». On accepte aussi le second mécanisme réellement
   * livré (`food_group_ref` remis à null par `meal_precision_amend`), sinon on
   * mesurerait la colonne au lieu de la vérité.
   */
  expectRetracted?: boolean;
  note?: string;
};

const LONG = "voici la recette que ma tante m'a envoyée hier et je te la recopie : " +
  "prendre du poulet, du riz, des brocolis, de l'huile d'olive, du sel, du poivre, " +
  "faire revenir le poulet dix minutes, ajouter le riz et deux verres d'eau, couvrir, " +
  "laisser mijoter vingt minutes, ajouter les brocolis coupés en fleurettes, saler, " +
  "poivrer, servir chaud avec un filet de citron et du persil frais, et surtout ne pas " +
  "oublier de laisser reposer cinq minutes avant de servir, c'est ce qui fait toute la " +
  "différence selon elle, et elle ajoute qu'on peut remplacer le riz par du quinoa ou " +
  "du boulgour si on préfère, ou même par des pâtes complètes.";

const CASES: Case[] = [
  // ══ EASY ═════════════════════════════════════════════════════════════
  {
    id: "E1", level: "easy", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["j'ai mangé du poulet"],
    expectRows: 1, allowedFoods: ["poultry", "lean_protein"], expectSlot: "null",
    note: "le cas nominal de la fiche §1",
  },
  // ══ MEDIUM ═══════════════════════════════════════════════════════════
  {
    id: "M1", level: "medium", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["Poulet grillé, riz complet et brocolis à midi"],
    expectRows: 3,
    allowedFoods: ["poultry", "lean_protein", "whole_grain", "cruciferous_veg",
      "non_starchy_veg", "refined_grain"],
    expectSlot: "lunch",
    note: "§1 le [0,3,3,0] mesuré",
  },
  {
    id: "M2", level: "medium", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["Grilled salmon with quinoa and green beans for dinner"],
    expectRows: 3,
    allowedFoods: ["fatty_fish", "lean_protein", "whole_grain", "non_starchy_veg"],
    expectSlot: "dinner",
    note: "§1 le [0,0,0,0] mesuré — l'anglais vaut le français",
  },
  {
    id: "M3", level: "medium", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I had chicken"],
    expectRows: 1, allowedFoods: ["poultry", "lean_protein"],
    expectQuestions: "atMost1",
    note: "déclaration vague → au plus UNE question, gabarit fermé",
  },
  {
    id: "M4", level: "medium", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["j'ai pris des oeufs et du pain complet au petit déjeuner"],
    expectRows: 2, allowedFoods: ["eggs", "lean_protein", "whole_grain"],
    expectSlot: "breakfast",
    note: "variante de formulation + créneau nommé FR",
  },
  // ══ HARD — les modes de défaillance §7 ═══════════════════════════════
  { id: "H1", level: "hard", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["je n'ai rien mangé aujourd'hui"], expectRows: 0, expectQuestions: 0 },
  { id: "H1b", level: "hard", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I didn't eat anything today"], expectRows: 0, expectQuestions: 0 },
  { id: "H2", level: "hard", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["ma fille a mangé des pâtes à midi"], expectRows: 0, expectQuestions: 0 },
  { id: "H2b", level: "hard", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["my daughter had pasta for lunch"], expectRows: 0, expectQuestions: 0 },
  { id: "H3", level: "hard", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["si je mange du riz ce soir"], expectRows: 0, expectQuestions: 0 },
  { id: "H3b", level: "hard", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["if I have rice tonight"], expectRows: 0, expectQuestions: 0 },
  { id: "H4", level: "hard", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: [LONG], expectRows: 0, expectQuestions: 0,
    note: "> 600 caractères — un copier-coller n'est pas une déclaration" },
  {
    id: "H5", level: "hard", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: [
      "I had chicken",
      "anyway, what's the weather like where you are?",
      "ok thanks",
    ],
    expectRows: "atLeast1", expectQuestions: "atMost1",
    note: "l'élève IGNORE la question → aucune relance, jamais",
  },
  {
    id: "H6", level: "hard", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["j'ai mangé du poulet à midi. franchement je n'en peux plus, j'ai envie de disparaître"],
    expectRows: "atLeast1", expectQuestions: 0,
    note: "safety_band → déclaration écrite, AUCUNE question",
  },
  // ══ EXTRA-HARD ═══════════════════════════════════════════════════════
  {
    id: "X1", level: "extra", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["j'ai mangé du poulet à midi", "en fait non je l'ai pas mangé"],
    expectRows: "atLeast1", expectRetracted: true,
    note: "rétractation: la ligne SURVIT avec disqualified_reason",
  },
  {
    id: "X3", level: "extra", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I had chicken", "and I had eggs later"],
    expectRows: "atLeast1", expectQuestions: "atMost1",
    note: "deux déclarations vagues le même jour → UNE seule question (budget)",
  },
  {
    id: "X5", level: "extra", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I ordered a pizza tonight", "I had chicken"],
    expectRows: "atLeast1", expectQuestions: 0,
    note: "invitation photo (FF-025) partie → AUCUNE question de précision",
  },
  {
    id: "X1b", level: "extra", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: [
      "Poulet grillé, riz complet et brocolis à midi",
      "en fait non, je n'ai rien mangé de tout ça",
    ],
    expectRows: 3, expectRetracted: true,
    note: "rétractation SUR DES ALIMENTS: la ligne survit et porte disqualified_reason",
  },
  {
    id: "X2", level: "extra", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I had chicken", "I had a banana for dinner"],
    expectRows: 1, expectQuestions: "atMost1",
    note: "déclaration NEUVE pendant qu'un flow de précision est ouvert",
  },
  // ══ ADVERSARIAL ══════════════════════════════════════════════════════
  {
    id: "A1", level: "adv", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["le poulet c'est cher en ce moment"],
    expectRows: 0, expectQuestions: 0,
    note: "MENTION d'un aliment sans déclaration de repas",
  },
  {
    id: "A1b", level: "adv", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["chicken is expensive these days"],
    expectRows: 0, expectQuestions: 0,
  },
  {
    id: "A3", level: "adv", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I had the chicken for lunch"],
    expectRows: 1, allowedFoods: ["poultry", "lean_protein"],
    forbiddenFoods: ["coffee_tea"],
    note: "« the » (article anglais) ne doit PAS devenir du thé",
  },
  {
    id: "A4", level: "adv", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["hier soir j'ai mangé une salade mais bon"],
    expectRows: 1, allowedFoods: ["leafy_greens", "non_starchy_veg"],
    forbiddenFoods: ["starchy_veg"],
    note: "« mais » (conjonction FR) ne doit PAS devenir du maïs",
  },
  {
    id: "A3b", level: "adv", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I had the usual for lunch"],
    expectRows: "any", forbiddenFoods: ["coffee_tea"],
    note: "« the » SEUL composant: le plancher ne doit rien ouvrir",
  },
  {
    id: "A4b", level: "adv", locale: "fr-FR", timezone: "Europe/Paris", country: "FR",
    turns: ["j'ai mangé au resto hier, c'était bon mais cher"],
    expectRows: "any", forbiddenFoods: ["starchy_veg"],
    note: "« mais » SEUL composant: le plancher ne doit inventer aucun maïs",
  },
  {
    id: "A5", level: "adv", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I had a protein bar for breakfast"],
    expectRows: "any", forbiddenFoods: ["white_fish"],
    note: "« bar » (barre) ne doit PAS devenir du poisson (le dispatcher, lui, a le droit d'écrire la barre)",
  },
  {
    id: "A6", level: "adv", locale: "en-US", timezone: "Europe/London", country: "GB",
    turns: ["I had pain in my stomach after lunch"],
    expectRows: 0, forbiddenFoods: ["refined_grain"],
    note: "« pain » (douleur EN) ne doit PAS devenir du pain",
  },
];

// ── LE CRÉNEAU DÉDUIT DE L'HORLOGE (interdit) ────────────────────────────
// Un fuseau où il est ~22 h maintenant, choisi à l'exécution.
function lateNightTimezone(): string | null {
  const zones = [
    "Pacific/Auckland", "Australia/Sydney", "Asia/Tokyo", "Asia/Shanghai",
    "Asia/Kolkata", "Asia/Dubai", "Europe/Moscow", "Europe/Paris",
    "Europe/London", "America/Sao_Paulo", "America/New_York",
    "America/Chicago", "America/Denver", "America/Los_Angeles",
    "Pacific/Honolulu",
  ];
  for (const z of zones) {
    const h = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: z, hour: "2-digit", hour12: false,
      }).format(new Date()),
    );
    if (h === 22 || h === 21 || h === 23) return z;
  }
  return null;
}

type Verdict = {
  id: string; level: string; run: number;
  ok: boolean; detail: string;
  replies: string[];
  questions: string[];
  ledger: string[];
  events: string[];
  writers: string[];
  ghostAck: string | null;
};
const results: Verdict[] = [];

async function eventsFor(userId: string): Promise<string[]> {
  return await rows(
    `select coalesce(food_group_ref,'-')||' | slot='||coalesce(slot_key,'NULL')||
            ' | src='||source||' | rel='||coalesce(plan_relation,'NULL')||
            ' | dq='||coalesce(disqualified_reason,'NULL')||
            ' | evw='||coalesce(evidence_weight::text,'-')||
            ' | loc='||coalesce(content_locale,'-')
       from public.protocol_events where user_id='${userId}' order by created_at`,
  );
}

/**
 * QUI A ÉCRIT — le plancher ou le dispatcher ?
 *
 * Le payload du PLANCHER porte un tableau `components` (`mealDeclarationFloorEffect`);
 * celui du dispatcher porte un `food_group_ref` scalaire. C'est la seule
 * différence lisible en base, et elle suffit.
 */
async function writersFor(userId: string): Promise<string[]> {
  return await rows(
    `select case when e->'payload_hint' ? 'components' then 'FLOOR' else 'DISPATCHER' end
            ||' '||coalesce(e->'payload_hint'->>'components', e->'payload_hint'->>'food_group_ref', '-')
       from public.conversation_turn_traces t,
            lateral jsonb_array_elements(t.turn_frame->'direct_effects') e
      where t.user_id='${userId}' and e->>'effect_type'='log_protocol_event'
      order by t.ts`,
  );
}

async function ledgerFor(userId: string): Promise<string[]> {
  return await rows(
    `select ask_kind||' | '||source||' | '||coalesce(axis,'-')||' | '||local_date||' | '||question
       from public.${DAILY_ASK_LEDGER_TABLE} where user_id='${userId}' order by asked_at`,
  );
}

/**
 * LA TABLE PORTE LES TROIS GENRES. Compter toutes ses lignes comme des
 * questions de précision faisait passer l'invitation photo de FF-025 pour une
 * question hors gabarit — un faux rouge, et il a été mesuré.
 */
function precisionQuestionsIn(ledger: readonly string[]): string[] {
  return ledger
    .filter((l) => l.split("|")[0].trim() === "meal_precision_question")
    .map((l) => l.split("|").slice(4).join("|").trim());
}

// ── Le pool de coachs: plafond de 3 sièges d'essai par coach ─────────────
const coaches: Coach[] = [];
let seatsLeft = 0;
const madeStudents: string[] = [];

async function freshStudent(c: Case): Promise<Student> {
  if (seatsLeft === 0) {
    coaches.push(await makeCoach({ displayName: `FF017 Coach ${coaches.length + 1}` }));
    seatsLeft = 3;
  }
  const coach = coaches[coaches.length - 1];
  seatsLeft--;
  const fr = c.locale.startsWith("fr");
  const tz = c.timezone ?? (fr ? "Europe/Paris" : "Europe/London");
  const st = await makeStudent({
    coach, locale: c.locale, timezone: tz,
    country: c.country ?? (fr ? "FR" : "GB"),
    fullName: `ff017_${c.id}`,
  });
  await publishPlanFor(coach, st.userId, {
    timezone: tz, contentLocale: fr ? "fr-FR" : "en-GB",
  });
  madeStudents.push(st.userId);
  return st;
}

/** L'accusé fantôme: la réponse parle d'un repas que la base ne porte pas. */
const ACK_FR =
  /\b(c'est not[ée]|not[ée]|enregistr[ée]|j'ai not[ée]|bien re[çc]u|ajout[ée] (à|a) ta journ[ée]e)\b/i;
const ACK_EN =
  /\b(recorded|logged|noted|got it[ ,—-]|added to your day|i've got that down)\b/i;

async function runCase(c: Case, run: number) {
  const student = await freshStudent(c);
  const replies: string[] = [];
  let rowsAfterFirst: string[] = [];
  try {
    for (let i = 0; i < c.turns.length; i++) {
      const t = await turn(student, c.turns[i]);
      replies.push((t.reply ?? `<HTTP ${t.status}>`).replace(/\n/g, " "));
      await new Promise((r) => setTimeout(r, 1200));
      if (i === 0) rowsAfterFirst = await eventsFor(student.userId);
    }
  } catch (e) {
    results.push({
      id: c.id, level: c.level, run, ok: false, detail: `EXCEPTION ${e}`,
      replies, questions: [], ledger: [], events: [], writers: [], ghostAck: null,
    });
    return;
  }

  const ev = await eventsFor(student.userId);
  const ledger = await ledgerFor(student.userId);
  const writers = await writersFor(student.userId);
  const questions = precisionQuestionsIn(ledger);
  const foodsFirst = rowsAfterFirst.map((l) => l.split("|")[0].trim())
    .filter((f) => f !== "-");
  const slotsFirst = rowsAfterFirst.map((l) =>
    (l.split("|")[1] ?? "").replace("slot=", "").trim()
  );

  const problems: string[] = [];
  if (c.expectRows === 0 && rowsAfterFirst.length !== 0) {
    problems.push(`attendu 0 ligne au 1er tour, obtenu ${rowsAfterFirst.length}`);
  }
  if (typeof c.expectRows === "number" && c.expectRows > 0 &&
    rowsAfterFirst.length !== c.expectRows) {
    problems.push(`attendu ${c.expectRows} ligne(s), obtenu ${rowsAfterFirst.length}`);
  }
  if (c.expectRows === "atLeast1" && rowsAfterFirst.length === 0) {
    problems.push(`attendu >=1 ligne, obtenu 0`);
  }
  if (c.allowedFoods) {
    const strays = foodsFirst.filter((f) => !c.allowedFoods!.includes(f));
    if (strays.length) {
      problems.push(`food hors liste acceptable: [${strays}] (base: [${foodsFirst}])`);
    }
  }
  for (const f of c.forbiddenFoods ?? []) {
    if (foodsFirst.includes(f)) problems.push(`FOOD FABRIQUÉ: ${f}`);
  }
  if (c.expectRetracted) {
    const live = ev.filter((l) => {
      const fg = l.split("|")[0].trim();
      const dq = (l.split("|")[4] ?? "").replace("dq=", "").trim();
      return dq === "NULL" && fg !== "-";
    });
    if (live.length > 0) {
      problems.push(
        `RÉTRACTATION SANS EFFET: ${live.length} ligne(s) comptent encore — ${live.join(" ;; ")}`,
      );
    }
  }
  // §3 hors-périmètre — le plancher ne DOUBLE jamais l'effet du dispatcher.
  const dupes = foodsFirst.filter((f, i) => foodsFirst.indexOf(f) !== i);
  if (dupes.length) problems.push(`DOUBLON du même groupe: [${[...new Set(dupes)]}]`);
  if (c.expectSlot === "null" && slotsFirst.some((s) => s !== "NULL")) {
    problems.push(`R5: créneau non nommé, obtenu [${slotsFirst}]`);
  }
  if (c.expectSlot && c.expectSlot !== "null" &&
    !slotsFirst.every((s) => s === c.expectSlot)) {
    problems.push(`slot attendu ${c.expectSlot}, obtenu [${slotsFirst}]`);
  }
  if (c.expectQuestions === 0 && questions.length !== 0) {
    problems.push(`attendu 0 question, obtenu ${questions.length}`);
  }
  if (c.expectQuestions === "atMost1" && questions.length > 1) {
    problems.push(`R9: ${questions.length} questions (plafond 1)`);
  }
  if (typeof c.expectQuestions === "number" && c.expectQuestions > 0 &&
    questions.length !== c.expectQuestions) {
    problems.push(`attendu ${c.expectQuestions} question(s), obtenu ${questions.length}`);
  }
  // T4 — LE BUDGET EST PARTAGÉ: une demande par jour, TOUS GENRES CONFONDUS.
  const byDay = new Map<string, number>();
  for (const l of ledger) {
    const day = (l.split("|")[3] ?? "").trim();
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  for (const [day, n] of byDay) {
    if (n > 1) problems.push(`T4: ${n} demandes le ${day} (budget 1) — ${ledger}`);
  }
  for (const q of questions) {
    const hits = quantityHitsIn(q);
    if (hits.length) problems.push(`R8 QUANTITÉ dans « ${q} » → ${hits}`);
    if (!isClosedTemplate(q)) problems.push(`R8 hors gabarit fermé: « ${q} »`);
  }

  // Accusé fantôme (T-1): la réponse confirme, la base est vide.
  let ghostAck: string | null = null;
  if (rowsAfterFirst.length === 0 &&
    (ACK_FR.test(replies[0] ?? "") || ACK_EN.test(replies[0] ?? ""))) {
    ghostAck = replies[0]?.slice(0, 200) ?? null;
  }

  results.push({
    id: c.id, level: c.level, run,
    ok: problems.length === 0,
    detail: problems.length === 0 ? "OK" : problems.join(" / "),
    replies: replies.map((r) => r.slice(0, 300)),
    questions, ledger, events: ev, writers, ghostAck,
  });
}

// ── LE CAS HORLOGE, à part: il choisit son fuseau à l'exécution ──────────
async function runClockCase(run: number) {
  const tz = lateNightTimezone();
  if (!tz) {
    results.push({
      id: "A2", level: "adv", run, ok: false,
      detail: "NON TESTABLE: aucun fuseau à 21-23 h dans la liste",
      replies: [], questions: [], ledger: [], events: [], writers: [], ghostAck: null,
    });
    return;
  }
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", hour12: false,
  }).format(new Date());
  await runCase({
    id: `A2(${tz}@${h}h)`, level: "adv", locale: "en-US", timezone: tz, country: "GB",
    turns: ["I had chicken"],
    expectRows: "atLeast1", expectSlot: "null",
    note: "R5 — aucun créneau déduit de l'heure",
  }, run);
}

for (let run = 1; run <= REPEATS; run++) {
  for (const c of CASES) {
    if (GROUP !== "all" && c.level !== GROUP && !c.id.startsWith(GROUP)) continue;
    await runCase(c, run);
    const last = results[results.length - 1];
    console.log(
      `${last.ok ? "✅" : "🔴"} ${last.id} run${run} — ${last.detail}\n` +
        `   base : ${last.events.join(" ;; ") || "(vide)"}\n` +
        `   ecrit: ${last.writers.join(" ;; ") || "(aucun effet)"}\n` +
        `   quest: ${last.questions.join(" ;; ") || "(aucune)"}\n` +
        `   reply: ${last.replies.join(" || ").slice(0, 400)}` +
        (last.ghostAck ? `\n   👻 ACCUSÉ FANTÔME: ${last.ghostAck}` : ""),
    );
  }
  if (GROUP === "adv" || GROUP === "all" || GROUP === "A2") {
    await runClockCase(run);
    const last = results[results.length - 1];
    console.log(`${last.ok ? "✅" : "🔴"} ${last.id} run${run} — ${last.detail}\n` +
      `   base : ${last.events.join(" ;; ") || "(vide)"}`);
  }
}

await Deno.writeTextFile(
  new URL(`./ff017_${GROUP}_results.json`, import.meta.url),
  JSON.stringify({ group: GROUP, repeats: REPEATS, students: madeStudents, results }, null, 2),
);

const byCase = new Map<string, Verdict[]>();
for (const r of results) {
  const key = r.id.replace(/\(.*\)/, "");
  byCase.set(key, [...(byCase.get(key) ?? []), r]);
}
console.log(`\n${"═".repeat(72)}\nSYNTHÈSE ${GROUP}`);
for (const [id, vs] of byCase) {
  const ok = vs.filter((v) => v.ok).length;
  console.log(
    `${ok === vs.length ? "✅" : "🔴"} ${id.padEnd(22)} ${ok}/${vs.length}` +
      (ok === vs.length ? "" : `   ← ${vs.find((v) => !v.ok)?.detail}`),
  );
}
console.log(`élèves: ${madeStudents.length}`);
