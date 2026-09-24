/**
 * LES À-CÔTÉS SONT BRANCHÉS AU BON ENDROIT — ⟳ 2026-09-23, chantier
 * « assiettes normales » (plan `lexical-gliding-lamport.md`, vague 2).
 *
 * ⛔ `side_courses.ts`, `slot_nutrition_contract.ts` et `side_courses_prompt.ts`
 * sont purs et testés; ça ne dit RIEN de l'endroit où ils tournent. Ce fichier
 * épingle les jonctions du générateur du foyer, et chaque épingle a sa moitié
 * qui mord: la même lecture, sur la source MUTÉE, doit nommer la jonction
 * coupée — et elle seule.
 *
 * AVANT LE MODÈLE (vague 2, première moitié):
 *   ① le réglage des à-côtés est lu avec les habitudes (`parseMemberSideCourses`);
 *   ② `planSideCourses` tourne DANS la boucle des contrats, avant
 *      `slotContractsFor`, avec le réglage de la personne, ses moments légers,
 *      l'ordre des jours de la fenêtre et ce qu'aucun secours ne peut servir
 *      (`impossibleKindsFor`: exclusions de la MÉMOIRE SEULE, règles de
 *      maison, régime, allergies);
 *   ② bis ⟳ 2026-09-23 (W2e) — LE 202 N'ATTEND PAS LE CLASSIFIEUR DE LA NOTE.
 *      Ni son lancement ni aucun `await draftNoteEarly` ne précèdent
 *      `ctx.respondEarly(`. Le planificateur lit donc `sidePlanExclusionTerms`
 *      (mémoire seule + règles de maison), jamais `memberExclusionTerms`; la
 *      note fraîche mord APRÈS le modèle, au juge des à-côtés (⑨ ter);
 *   ③ chaque `ContractDay` reçoit `sides` (une `Map`, jamais `null`);
 *   ④ les demandes (`sideCourseAsks`) partent à la consigne, et ses compteurs
 *      reviennent sous `generated_from.household.side_courses`;
 *   ⑤ une direction PAR PERSONNE, muette sous plancher TCA;
 *   ⑥ l'objectif gaté atteint la protéine d'une bouche sans compte, et l'âge
 *      exact atteint l'équation d'entretien;
 *   ⑦ le brief des contrats: `memberId`, plus de `gramsAim`, et le minimum
 *      protéique réservé aux repas;
 *   ⑧ les protéines des à-côtés entrent dans le brief du jour À CÔTÉ des
 *      apports fixes, jamais dedans;
 *   ⑤ bis ⟳ 2026-09-23 (contrôle W2d) — le sens du plan et la rotation des
 *      à-côtés lisent l'objectif GATÉ (`gatedGoalOf`), retenu à la seule
 *      écriture de la porte — jamais le jeton brut `m.goal` —, et la
 *      rotation se tait sous plancher TCA comme le sens du plan;
 *   ⑨ bis ⟳ 2026-09-23 (contrôle W2d) — le bloc de langue de la composition
 *      nomme les champs de la clé `side_courses` (`sideCoursesLanguageFields`),
 *      et celui de la réparation, qui n'écrit pas la clé, ne les nomme pas.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE
 * (`caller-audit-must-strip-comments`): un commentaire ne câble rien.
 */
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const RAW = await sourceFamily(
  new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
);
const SRC = stripComments(RAW);

// ---------------------------------------------------------------------------
// LA LECTURE — parenthèses équilibrées, chaînes et gabarits sautés
// ---------------------------------------------------------------------------

/**
 * L'indice de la parenthèse (crochet, accolade) qui ferme celle ouverte en
 * `open`, ou -1. Les chaînes '…' et "…" sont sautées; un gabarit `…` aussi,
 * sauf ses `${…}`, qui sont du code.
 */
function closingOf(src: string, open: number): number {
  const stack: string[] = [];
  let i = open;
  while (i < src.length) {
    const c = src[i];
    const top = stack[stack.length - 1];
    if (top === "`") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") stack.pop();
      else if (c === "$" && src[i + 1] === "{") {
        stack.push("${");
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') {
      i += 1;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === "`") {
      stack.push("`");
    } else if (c === "(" || c === "[" || c === "{") {
      stack.push(c);
    } else if (c === ")" || c === "]" || c === "}") {
      const popped = stack.pop();
      if (popped !== "${" && stack.length === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** Le texte de l'appel ou du littéral qui s'ouvre au PREMIER `anchor` (qui finit par `(` ou `{`). */
function blockAt(src: string, anchor: string, from = 0): string {
  const at = src.indexOf(anchor, from);
  if (at < 0) return "";
  const open = at + anchor.length - 1;
  const close = closingOf(src, open);
  return close < 0 ? "" : src.slice(at, close + 1);
}

/** L'instruction qui commence au premier `anchor` (à partir de `from`), jusqu'au premier `;`. */
function statementAt(src: string, anchor: string, from = 0): string {
  const at = src.indexOf(anchor, from);
  if (at < 0) return "";
  const end = src.indexOf(";", at);
  return end < 0 ? "" : src.slice(at, end + 1);
}

/** Les arguments de premier niveau de l'appel `callee(` trouvé à partir de `from`. */
function argsOf(src: string, callee: string, from = 0): string[] {
  const at = src.indexOf(`${callee}(`, from);
  if (at < 0) return [];
  const open = at + callee.length;
  const close = closingOf(src, open);
  if (close < 0) return [];
  const inner = src.slice(open + 1, close);
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < inner.length) {
    const c = inner[i];
    if (c === "(" || c === "[" || c === "{" || c === "`" || c === "'" || c === '"') {
      if (c === "'" || c === '"') {
        i += 1;
        while (i < inner.length && inner[i] !== c) i += inner[i] === "\\" ? 2 : 1;
        i += 1;
        continue;
      }
      if (c === "`") {
        const end = closingOf(`(${inner.slice(i)})`, 0);
        i += Math.max(1, end - 1);
        continue;
      }
      const end = closingOf(inner, i);
      i = end < 0 ? inner.length : end + 1;
      continue;
    }
    if (c === ",") {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  const last = inner.slice(start);
  if (last.trim() !== "") out.push(last);
  return out.map((a) => a.trim());
}

// ---------------------------------------------------------------------------
// LES ANCRES
// ---------------------------------------------------------------------------

const HABITS_READ = "sideCourses: parseMemberSideCourses(row.slots),";
const CONTRACTS = "const contracts = slotContractsFor({";
const LOOP = "for (const m of platedMembers) {";
const PLAN = "const sidePlan = planSideCourses({";
const IMPOSSIBLE = "impossibleKindsFor({";
// ② bis — ⟳ 2026-09-23 (W2e): le 202 d'abord, le classifieur ensuite.
const RESPOND_EARLY = "ctx.respondEarly(";
const NOTE_LAUNCH = "classifyDraftNoteEarly({";
const NOTE_AWAIT = "await draftNoteEarly";
const SIDE_TERMS = "const sideTerms: readonly ForbiddenTerm[] =";
const SIDE_TERMS_READ = "sidePlanExclusionTerms.get(m.memberId) ?? sidePlanTableTerms;";
const SIDE_PLAN_ITEMS = "const sidePlanMemoryItems: readonly RetainedItem[] = routedRetained.composition;";
const SIDE_PLAN_TABLE = "const sidePlanTableTerms: readonly ForbiddenTerm[] = [";
const SIDE_PLAN_TERMS = "const sidePlanExclusionTerms = new Map<string, readonly ForbiddenTerm[]>(";
/** Ce que le planificateur ne doit JAMAIS lire: tout ce qui attend la note fraîche. */
const FRESH_NOTE_READERS = /\b(memberExclusionTerms|householdExclusionTerms|beltItems|noteBelt|draftNoteEarly)\b/;
const SIDES_FIELD = "sides: sidePlan.get(dayToken) ??";
const ASKS_PUSH = "sideCourseAsks.push({";
const PROMPT_INPUT = "const householdPromptInput = {";
const PROMPT_FIELD = "sideCourses: sideCourseAsks,";
const HOUSEHOLD = "const household = useV34";
const PROMPT_COUNTS = "sideCoursesTrace.prompt = { ...household.sideCourses };";
const PROMPT_TRACE = "const promptTrace = {";
const TRACE_FIELD = "side_courses: sideCoursesTrace,";
const CONTRACT_COUNT = "sideCoursesTrace.contract.side_slots += contracts.counters.side_slots;";
const DECIDED = "decided: {";
const DIRECTIONS = "directions: platedMembers.map(";
const BRIEF = "const slotContract = slotContractBrief({";
const BRIEF_PROTEIN = 'proteinMinG: plateSlotClassOf(c.slot) === "meal" ? proteinMinG : null,';
const PROTEIN_DAYS = "proteinBriefDays.set(";
const SIDE_PROTEIN = "sideProteinG: sideProteinByMouthDay.get(m.memberId)?.get(first.dayToken) ?? 0,";
const FIXED_PROTEIN = "fixedProteinG: vus === 0 ? null : somme,";
// ⑤ bis / ⑨ bis — ⟳ 2026-09-23, contrôle W2d.
const GATED_RETAINED = "gatedGoalByMember.set(m.memberId, gatedGoal);";
const GATED_DIRECTION = "gatedDirectionOf(m.memberId),";
const SIDE_GOAL = ": gatedGoalOf(m.memberId),";
const LANG_FIELDS = "const sideLanguageFields = sideCoursesLanguageFields(household.sideCourses);";
const LANG_TRANSLATABLE =
  '[...MEAL_TRANSLATABLE_FIELDS, "explanation[]", ...sideLanguageFields.translatable],';
const LANG_TOKENS = "[...MEAL_TOKEN_FIELDS, ...sideLanguageFields.tokens],";
const USER_MESSAGE = "const householdUserMessage = (extra: string): string =>";
const HARD_CEILING_PUSH = "hardCeilingCells.push({";
const HARD_CEILING_TRACE = "hard_ceiling_cells: hardCeilingCells,";

/** Le bloc de langue de la RÉPARATION: l'appel qui enveloppe `c4Composed.text`. */
function repairLanguageBlock(code: string): string {
  const text = code.indexOf("c4Composed.text,");
  if (text < 0) return "";
  const at = code.lastIndexOf("appendContentLanguageBlock(", text);
  return at < 0 ? "" : blockAt(code, "appendContentLanguageBlock(", at);
}

/** L'indice de la boucle des contrats: le dernier `for (… platedMembers)` avant `slotContractsFor`. */
function contractLoopOf(code: string): { loop: number; contracts: number } {
  const contracts = code.indexOf(CONTRACTS);
  return { loop: contracts < 0 ? -1 : code.lastIndexOf(LOOP, contracts), contracts };
}

/**
 * CE QUI MANQUE, par jonction. `[]` = tout est branché. Chaque nom est une
 * jonction et une seule, pour qu'un rouge désigne ce qui a été coupé.
 */
function verdict(code: string): string[] {
  const missing: string[] = [];
  // ① le réglage lu avec les habitudes
  if (!code.includes(HABITS_READ)) missing.push("habits_not_read");
  // ② le planificateur, dans la boucle des contrats, avant le contrat
  const { loop, contracts } = contractLoopOf(code);
  const plan = code.indexOf(PLAN, Math.max(0, loop));
  if (loop < 0 || plan < 0 || plan > contracts) missing.push("plan_outside_contract_loop");
  const planBlock = plan < 0 ? "" : blockAt(code, PLAN, plan);
  if (!planBlock.includes("prefsBySlot: rawHabits.get(m.memberId)?.sideCourses")) {
    missing.push("settings_not_passed");
  }
  if (!planBlock.includes("lightSlots: new Set(m.lightSlots)")) missing.push("light_not_passed");
  if (
    !planBlock.includes("days: sideDays") ||
    !code.includes("dayIndex: sideDayIndexOf(dayToken)") ||
    !code.includes("windowDays.map((day, i) => [day as string, i])")
  ) missing.push("window_order_not_used");
  const impossible = code.indexOf(IMPOSSIBLE, Math.max(0, loop));
  const impossibleBlock = impossible < 0 ? "" : blockAt(code, IMPOSSIBLE, impossible);
  if (
    impossible < 0 || impossible > plan ||
    !impossibleBlock.includes("exclusionTerms: sideTerms") ||
    !impossibleBlock.includes("regime: m.diet") ||
    !impossibleBlock.includes("allergens: constraints") ||
    !impossibleBlock.includes("index: composition")
  ) missing.push("impossible_not_judged");
  // ② bis ⟳ 2026-09-23 (W2e) — LE 202 N'ATTEND PAS LE CLASSIFIEUR DE LA NOTE.
  // ⛔ Ni son lancement ni aucun `await draftNoteEarly` avant `ctx.respondEarly(`:
  // l'attendre avant les contrats retenait le 202 jusqu'à 25-50 s, et un refus
  // pris avant le modèle payait le classifieur. Absents, ils rougissent aussi:
  // une garde qui passe sur du vide ne garde rien.
  const early = code.indexOf(RESPOND_EARLY);
  const noteLaunch = code.indexOf(NOTE_LAUNCH);
  const noteAwait = code.indexOf(NOTE_AWAIT);
  if (early < 0 || noteLaunch < early || noteAwait < early) {
    missing.push("note_classifier_before_202");
  }
  // Avant le modèle, les à-côtés lisent la MÉMOIRE SEULE (+ règles de maison),
  // jamais ce qui attend la note fraîche.
  const sideTerms = statementAt(code, SIDE_TERMS, Math.max(0, loop));
  const planTable = blockAt(code, SIDE_PLAN_TABLE);
  const planTerms = blockAt(code, SIDE_PLAN_TERMS);
  if (
    !sideTerms.includes(SIDE_TERMS_READ) || FRESH_NOTE_READERS.test(sideTerms) ||
    !code.includes(SIDE_PLAN_ITEMS) || planTable === "" || planTerms === "" ||
    FRESH_NOTE_READERS.test(planTable) || FRESH_NOTE_READERS.test(planTerms) ||
    !planTable.includes("items: sidePlanMemoryItems,") ||
    !planTerms.includes("items: sidePlanMemoryItems,")
  ) missing.push("side_terms_not_memory_only");
  // …et la même règle que la ceinture: la table rejoint chaque bouche, et les
  // règles de maison sont là.
  if (
    !planTable.includes("subject: HOUSEHOLD_SUBJECT,") || !planTable.includes("...houseRuleForbidden") ||
    !planTerms.includes('subject: memberSubject(m.memberId) ?? "",') ||
    !planTerms.includes("...sidePlanTableTerms,")
  ) missing.push("side_terms_incomplete");
  // ③ `sides` dans chaque jour du contrat, jamais `null`
  const contractBlock = contracts < 0 ? "" : blockAt(code, CONTRACTS, contracts);
  if (!contractBlock.includes(SIDES_FIELD) || /sides:\s*null/.test(contractBlock)) {
    missing.push("sides_not_passed");
  }
  // ④ les demandes, la consigne, les compteurs
  const push = code.indexOf(ASKS_PUSH);
  if (push < 0 || push < contracts) missing.push("asks_not_built");
  if (!blockAt(code, PROMPT_INPUT).includes(PROMPT_FIELD)) missing.push("asks_not_prompted");
  const household = code.indexOf(HOUSEHOLD);
  const counts = code.indexOf(PROMPT_COUNTS);
  if (household < 0 || counts < household) missing.push("prompt_counts_dropped");
  if (!blockAt(code, PROMPT_TRACE).includes(TRACE_FIELD)) missing.push("trace_not_written");
  if (!code.includes(CONTRACT_COUNT)) missing.push("contract_counters_dropped");
  // ⟳ 2026-09-23 (contrôle W2d) — SOUS PLANCHER TCA, les kcal du contrat ne
  // sont pas sommées dans la trace: la bouche est comptée, ses kcal non.
  // ⟳ 2026-09-23 — ET LA BOUCHE EST NOMMÉE AU REGISTRE (`sideKcalWithheldIds`),
  // pour que `variety.fruit_capped_kcal` ne somme pas ses kcal non plus.
  if (
    !/const sideKcalWithheld = [^;]*restrictionOf\(m\) === "raised" \|\| restrictionOf\(m\) === "unreadable";/
      .test(code) ||
    !/if \(sideKcalWithheld\) \{\s*sideCoursesTrace\.contract\.kcal_withheld_mouths \+= 1;\s*sideKcalWithheldIds\.add\(m\.memberId\);\s*\} else \{\s*sideCoursesTrace\.contract\.side_base_kcal \+=/
      .test(code)
  ) missing.push("side_kcal_under_floor");
  // ④ bis ⟳ 2026-09-23 (contrôle W2d) — les cases du repli à 700 g, nommées
  // sans aucun chiffre, pour que la grille tolère 700 g là et seulement là.
  const ceiling = blockAt(code, HARD_CEILING_PUSH);
  if (
    code.indexOf(HARD_CEILING_PUSH) < contracts || !ceiling.includes("member_id: m.memberId,") ||
    /kcal|grams/i.test(ceiling) || !blockAt(code, PROMPT_TRACE).includes(HARD_CEILING_TRACE) ||
    // ⛔ JAMAIS DANS `sideCoursesTrace`, qui porte des sommes de kcal.
    /sideCoursesTrace\.[a-z_.]*hard_ceiling/.test(code)
  ) missing.push("hard_ceiling_cells_missing");
  // ⑤ une direction par personne, muette sous plancher TCA
  const decided = blockAt(code, DECIDED, Math.max(0, code.indexOf(PROMPT_INPUT)));
  const directions = blockAt(decided, DIRECTIONS);
  if (directions === "" || /direction:\s*ownerDirection/.test(decided)) {
    missing.push("directions_missing");
  }
  if (directions !== "" && !/restrictionOf\(m\) === "raised"/.test(directions)) {
    missing.push("directions_speak_under_floor");
  }
  // ⑤ bis l'objectif GATÉ: retenu à la porte, relu par le sens et les à-côtés
  const retained = code.indexOf(GATED_RETAINED);
  if (retained < 0 || retained > code.indexOf("toHouseholdMember(")) {
    missing.push("gated_goal_not_retained");
  }
  if (directions !== "" && (!directions.includes(GATED_DIRECTION) || /\bm\.goal\b/.test(directions))) {
    missing.push("directions_ungated");
  }
  const sideGoalCall = blockAt(code, "sideCourseGoalFor({", Math.max(0, loop));
  if (!sideGoalCall.includes(SIDE_GOAL) || /\bm\.goal\b/.test(sideGoalCall)) {
    missing.push("side_goal_ungated");
  }
  // ⛔ SOUS PLANCHER TCA, LA ROTATION DES À-CÔTÉS N'A PAS D'OBJECTIF: la consigne
  // écrirait « ONLY a fruit … nothing sweeter » à côté du prénom.
  if (!/goal: restrictionOf\(m\) === "raised" \|\| restrictionOf\(m\) === "unreadable"\s*\?\s*null/.test(sideGoalCall)) {
    missing.push("side_goal_speaks_under_floor");
  }
  // ⑨ bis la langue de la clé `side_courses`: la composition oui, la réparation non
  const userMessage = blockAt(code, "appendContentLanguageBlock(", Math.max(0, code.indexOf(USER_MESSAGE)));
  if (
    !code.includes(LANG_FIELDS) || code.indexOf(LANG_FIELDS) > code.indexOf(USER_MESSAGE) ||
    !userMessage.includes(LANG_TRANSLATABLE) || !userMessage.includes(LANG_TOKENS)
  ) missing.push("language_fields_missing");
  const repairLanguage = repairLanguageBlock(code);
  if (repairLanguage === "" || repairLanguage.includes("sideLanguageFields")) {
    missing.push("language_fields_on_repair");
  }
  // ⑥ l'objectif gaté vers la protéine, l'âge exact vers l'équation
  const member = argsOf(code, "toHouseholdMember");
  if (member.length !== 4 || member[3] !== "gatedGoal") missing.push("gated_goal_missing");
  const envelope = argsOf(code, "envelopeFor");
  if (envelope.length !== 11 || !/^bodyOfMouth\(m\.memberId\)\?\.ageYears/.test(envelope[10])) {
    missing.push("exact_age_missing");
  }
  // ⑦ le brief des contrats
  const brief = blockAt(code, BRIEF);
  if (!brief.includes("memberId: m.memberId,") || brief.includes("gramsAim")) {
    missing.push("brief_shape");
  }
  if (!brief.includes(BRIEF_PROTEIN)) missing.push("snack_protein_floor");
  // ⑧ les protéines des à-côtés, à côté des apports fixes
  const days = blockAt(code, PROTEIN_DAYS);
  if (!days.includes(SIDE_PROTEIN) || !days.includes(FIXED_PROTEIN)) {
    missing.push("side_protein_missing");
  }
  return missing;
}

// ---------------------------------------------------------------------------
// LES ÉPINGLES
// ---------------------------------------------------------------------------

Deno.test("CÂBLAGE — la lecture elle-même lit ce qu'elle croit lire", () => {
  // ⚠️ UNE GARDE A BESOIN D'UN CAS QUI PASSE, ET SON OUTIL AUSSI. Sans ces
  // nombres, un `argsOf` cassé rendrait `[]` et chaque épingle rougirait pour
  // une raison qui n'est pas la sienne — ou, pire, passerait sur du vide.
  assertEquals(argsOf("f(a, g(b, c), { d: [e, f] }, `x${h(1, 2)}y`)", "f").length, 4);
  assertEquals(argsOf("f(a, 'b,c', \"d,e\")", "f"), ["a", "'b,c'", '"d,e"']);
  assertEquals(blockAt("x = { a: { b: 1 }, c: '}' } + 1", "x = {"), "x = { a: { b: 1 }, c: '}' }");
  assertEquals(argsOf(SRC, "toHouseholdMember").length, 4);
  assertEquals(argsOf(SRC, "envelopeFor").length, 11);
  assert(blockAt(SRC, PROMPT_INPUT).length > 1_000, "le littéral de la consigne est lu en entier");
});

Deno.test("CÂBLAGE — les à-côtés et l'avant-modèle sont branchés", () => {
  assertEquals(verdict(SRC), []);
});

Deno.test("CÂBLAGE — chaque jonction coupée fait ROUGIR, elle seule", () => {
  const cuts: Array<[string, (s: string) => string]> = [
    ["habits_not_read", (s) => s.replace(HABITS_READ, "sideCourses: {},")],
    [
      "plan_outside_contract_loop",
      (s) => {
        // Le planificateur déplacé APRÈS le contrat: il ne nourrit plus rien.
        const at = s.indexOf(PLAN);
        const end = closingOf(s, at + PLAN.length - 1) + ");".length;
        const call = s.slice(at, end);
        const without = s.slice(0, at) + s.slice(end);
        const contracts = without.indexOf(CONTRACTS);
        const after = closingOf(without, contracts + CONTRACTS.length - 1) + ");".length;
        return without.slice(0, after) + "\n" + call + without.slice(after);
      },
    ],
    [
      "settings_not_passed",
      (s) => s.replace("prefsBySlot: rawHabits.get(m.memberId)?.sideCourses ?? {}", "prefsBySlot: {}"),
    ],
    ["light_not_passed", (s) => s.replace("lightSlots: new Set(m.lightSlots)", "lightSlots: new Set()")],
    [
      "window_order_not_used",
      (s) => s.replace("windowDays.map((day, i) => [day as string, i])", "[].map((day, i) => [day, i])"),
    ],
    [
      "impossible_not_judged",
      (s) => {
        const loop = contractLoopOf(s).loop;
        const at = s.indexOf("exclusionTerms: sideTerms", loop);
        return s.slice(0, at) + "exclusionTerms: []" + s.slice(at + "exclusionTerms: sideTerms".length);
      },
    ],
    // ② bis ⟳ 2026-09-23 (W2e) — trois façons de refaire attendre le 202.
    [
      "note_classifier_before_202",
      (s) => {
        // ① LA FORME DE LA VAGUE 2: lancement ET ceinture (avec son `await`)
        // hissés juste avant les à-côtés, donc avant le 202.
        const launchFrom = s.indexOf("const draftNoteMembers = composedMembers.map(");
        const launchTo = s.indexOf("});", s.indexOf(NOTE_LAUNCH)) + "});".length;
        const beltFrom = s.indexOf("const noteBelt = draftNoteEarly === null");
        const beltTo = s.indexOf("}));", s.indexOf("const memberExclusionTerms = members.map(")) + "}));".length;
        const launch = s.slice(launchFrom, launchTo);
        const belt = s.slice(beltFrom, beltTo);
        const without = s.slice(0, launchFrom) + s.slice(launchTo, beltFrom) + s.slice(beltTo);
        const at = without.indexOf("const sideDayIndex");
        return without.slice(0, at) + launch + "\n" + belt + "\n" + without.slice(at);
      },
    ],
    [
      "note_classifier_before_202",
      // ② UN SEUL `await`, glissé juste avant le 202.
      (s) => replaceAt(s, RESPOND_EARLY, `void (${NOTE_AWAIT});\n${RESPOND_EARLY}`),
    ],
    [
      "note_classifier_before_202",
      (s) => {
        // ③ LE LANCEMENT SEUL avant le 202: un refus d'avant le modèle le paie.
        const launchFrom = s.indexOf("const draftNoteMembers = composedMembers.map(");
        const launchTo = s.indexOf("});", s.indexOf(NOTE_LAUNCH)) + "});".length;
        const launch = s.slice(launchFrom, launchTo);
        const without = s.slice(0, launchFrom) + s.slice(launchTo);
        const at = without.indexOf("const sideDayIndex");
        return without.slice(0, at) + launch + "\n" + without.slice(at);
      },
    ],
    [
      "side_terms_not_memory_only",
      // Le planificateur relit les exclusions complètes (qui attendent la note).
      (s) =>
        replaceAt(
          s,
          SIDE_TERMS_READ,
          "memberExclusionTerms.find((x) => x.memberId === m.memberId)?.terms ?? sidePlanTableTerms;",
        ),
    ],
    [
      "side_terms_not_memory_only",
      // La variable de la mémoire seule faite de `beltItems`.
      (s) => replaceAt(s, SIDE_PLAN_ITEMS, "const sidePlanMemoryItems: readonly RetainedItem[] = beltItems;"),
    ],
    [
      "side_terms_incomplete",
      (s) => replaceAt(s, "...houseRuleForbidden", "...[]", s.indexOf(SIDE_PLAN_TABLE)),
    ],
    [
      "side_terms_incomplete",
      // Ce que la table évite ne rejoint plus chaque bouche.
      (s) => replaceAt(s, "...sidePlanTableTerms,", "", s.indexOf(SIDE_PLAN_TERMS)),
    ],
    ["sides_not_passed", (s) => s.replace(SIDES_FIELD, "sides: null ??")],
    ["asks_not_built", (s) => s.replace(ASKS_PUSH, "void ({")],
    ["asks_not_prompted", (s) => s.replace(PROMPT_FIELD, "sideCourses: [],")],
    ["prompt_counts_dropped", (s) => s.replace(PROMPT_COUNTS, "")],
    ["trace_not_written", (s) => s.replace(TRACE_FIELD, "")],
    ["contract_counters_dropped", (s) => s.replace(CONTRACT_COUNT, "")],
    [
      "directions_missing",
      (s) => {
        const input = s.indexOf(PROMPT_INPUT);
        const at = s.indexOf(DIRECTIONS, input);
        const end = closingOf(s, at + DIRECTIONS.length - 1);
        return s.slice(0, at) + "direction: ownerDirection" + s.slice(end + 1);
      },
    ],
    [
      "directions_speak_under_floor",
      (s) => {
        const input = s.indexOf(PROMPT_INPUT);
        const at = s.indexOf('restrictionOf(m) === "raised" || ', s.indexOf(DIRECTIONS, input));
        return s.slice(0, at) + s.slice(at + 'restrictionOf(m) === "raised" || '.length);
      },
    ],
    [
      "gated_goal_missing",
      (s) => {
        const call = s.indexOf("toHouseholdMember(");
        const close = closingOf(s, call + "toHouseholdMember".length);
        const inner = s.slice(call, close);
        const at = call + inner.lastIndexOf("gatedGoal");
        return s.slice(0, at) + "m.goal" + s.slice(at + "gatedGoal".length);
      },
    ],
    [
      "exact_age_missing",
      (s) => {
        const call = s.indexOf("envelopeFor(");
        const close = closingOf(s, call + "envelopeFor".length);
        const inner = s.slice(call, close);
        const tail = "bodyOfMouth(m.memberId)?.ageYears ?? null";
        const at = call + inner.lastIndexOf(tail);
        return s.slice(0, at) + "null" + s.slice(at + tail.length);
      },
    ],
    [
      "brief_shape",
      (s) => {
        const at = s.indexOf(BRIEF);
        const field = s.indexOf("memberId: m.memberId,", at);
        return s.slice(0, field) + s.slice(field + "memberId: m.memberId,".length);
      },
    ],
    ["snack_protein_floor", (s) => s.replace(BRIEF_PROTEIN, "proteinMinG,")],
    ["side_protein_missing", (s) => s.replace(SIDE_PROTEIN, "")],
    // ⑤ bis / ⑨ bis — ⟳ 2026-09-23, contrôle W2d.
    ["gated_goal_not_retained", (s) => s.replace(GATED_RETAINED, "")],
    ["hard_ceiling_cells_missing", (s) => s.replace(HARD_CEILING_PUSH, "void ({")],
    [
      "side_kcal_under_floor",
      (s) => s.replace("if (sideKcalWithheld) {", "if (false) {"),
    ],
    [
      // ⟳ 2026-09-23 — la bouche sous plancher n'est plus nommée au registre.
      "side_kcal_under_floor",
      (s) => s.replace("sideKcalWithheldIds.add(m.memberId);", ""),
    ],
    [
      "directions_ungated",
      (s) => {
        const at = s.indexOf(GATED_DIRECTION, s.indexOf(DIRECTIONS, s.indexOf(PROMPT_INPUT)));
        return s.slice(0, at) + "m.goal === null ? null : scaleDirectionOf(m.goal)," +
          s.slice(at + GATED_DIRECTION.length);
      },
    ],
    ["side_goal_ungated", (s) => s.replace(SIDE_GOAL, ": m.goal,")],
    [
      "side_goal_speaks_under_floor",
      (s) => {
        const at = s.indexOf("sideCourseGoalFor({", contractLoopOf(s).loop);
        const from = 'goal: restrictionOf(m) === "raised" || restrictionOf(m) === "unreadable"';
        const i = s.indexOf(from, at);
        return s.slice(0, i) + 'goal: restrictionOf(m) === "never"' + s.slice(i + from.length);
      },
    ],
    [
      "language_fields_missing",
      (s) => s.replace(LANG_TRANSLATABLE, '[...MEAL_TRANSLATABLE_FIELDS, "explanation[]"],'),
    ],
    [
      "language_fields_on_repair",
      (s) => {
        const text = s.indexOf("c4Composed.text,");
        const at = s.indexOf('[...MEAL_TRANSLATABLE_FIELDS, "explanation[]"],', text);
        return s.slice(0, at) + LANG_TRANSLATABLE +
          s.slice(at + '[...MEAL_TRANSLATABLE_FIELDS, "explanation[]"],'.length);
      },
    ],
  ];
  for (const [name, cut] of cuts) {
    const mutated = cut(SRC);
    assertNotEquals(mutated, SRC, `la coupe « ${name} » n'a rien changé`);
    assertEquals(verdict(mutated), [name], `la coupe « ${name} » n'a pas fait rougir ce qu'elle devait`);
  }
});

Deno.test("CÂBLAGE — un commentaire ne câble rien", () => {
  // La ligne de lecture du réglage passée en commentaire dans la source BRUTE:
  // le retrait des commentaires doit la faire disparaître.
  const at = RAW.indexOf(HABITS_READ);
  assert(at > 0);
  const lineStart = RAW.lastIndexOf("\n", at) + 1;
  const mutated = stripComments(RAW.slice(0, lineStart) + "// " + RAW.slice(lineStart));
  assertEquals(verdict(mutated), ["habits_not_read"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-23 — APRÈS LE MODÈLE (vague 2, seconde moitié)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⑨ la clé `side_courses` est lue sur `mealSourceText` (jamais `result`), et
//    le registre est reconstruit EN TÊTE DE CHAQUE TOUR de la réparation, avec
//    ses vraies entrées (demandes, référentiel, sessions dans l'ordre de la
//    fenêtre, un juge par moment qui connaît les règles de maison, allergies);
// ⑨ ter ⟳ 2026-09-23 (W2e) — ce juge lit les exclusions COMPLÈTES
//    (`memberExclusionTerms`, `householdExclusionTerms`, faites de `beltItems`):
//    c'est là que la note fraîche mord un à-côté — refus, secours, et à défaut
//    l'à-côté tombe et `snapDeltaKcal` rend ses kcal au plat;
// ⑩ la cible du plat = `composeKcal + snapDeltaKcal`, aux deux sites de
//    dimensionnement et à l'audit des cases;
// ⑪ la soupe est mise à l'échelle avant tout, gardée par les passes
//    d'élagage, et les à-côtés entrent dans les courses (besoins ET dates);
// ⑫ `attachSideCourses` enveloppe CHAQUE `mealDishesPayload(`, AVANT le verrou
//    de maison, dont les retraits sont comptés;
// ⑬ la ceinture des boîtes du moteur retient au dimensionnement ET à la
//    livraison, et sort dans la trace;
// ⑭ le rabotage suit l'objectif, et `by_member` ne sort qu'en seaux;
// ⑮ l'énergie servie est relue sur la charge qui part, `day_kcal` est
//    réécrit sans `member_id`, la charge de l'assiette aussi;
// ⑯ la réparation reçoit le foyer — sans la clé de schéma des à-côtés.

const AFTER = {
  READ: "readSideCourses(mealSourceText);",
  LEDGER: "buildSideCourseLedger({",
  SESSIONS: "const sideSessionDayIndex = (",
  HOUSE_TERMS: "const sideHouseTerms: readonly ForbiddenTerm[] = [",
  EXCLUSIONS_OF: "const sideExclusionsOf = (memberId: string): readonly ForbiddenTerm[] =>",
  JUDGES: "const sideJudgeBySlot = {",
  MEMBER_TERMS: "const memberExclusionTerms = members.map(",
  TABLE_TERMS: "const householdExclusionTerms = exclusionTermsFor({",
  LOOP: "for (let c4Round = 0;; c4Round++) {",
  ENTRY: "const c4Entry: typeof meal = structuredClone(meal);",
  // ⟳ 2026-09-24 — la reconstruction de tête de tour passe le relevé VIDE.
  REBUILD: "sideLedger = buildSideLedgerFor(meal, NO_BOUNDARY_DEFICIT);",
  ATTACH: "attachSideCourses(mealDishesPayload(meal), sideLedger)",
  SIDE_ATTACH: "const sideAttach = attachSideCourses(",
  LOCK: "const lock = applyHouseRuleLock(",
  LOCK_DROP_ISSUE: "for (const s of lock.sideCoursesDropped) issues.push(`house_rule_side_dropped:${s}`);",
  LOCK_DROP_COUNT: "sideCoursesTrace.house_rule_side_dropped = lock.sideCoursesDropped.length;",
  SNAP: "snapDeltaKcal(sideLedger, contract.memberId, contract.dayToken, contract.slot)",
  DISH_TARGET: "? dishTargetOf(contract)",
  AUDIT_TARGET: "targetKcal: contratDeLaCase === null ? null : dishTargetOf(contratDeLaCase),",
  POTS: "scaleSidePots({",
  POTS_SPLICE: "meal.preparations.splice(0, meal.preparations.length, ...pots.preparations);",
  PORTION_SIZING: "const portionSizing = await (async () => {",
  DRAWS: "sideDrawsByPreparation(sideLedger)",
  SIDE_CITED: "!stillDrawn.has(id) && !sideCited.has(id)",
  SHOP_REBUILD: "const shoppingRebuild = (() => {",
  SHOP_LINES: "const sideShopping = sideShoppingLines(sideLedger);",
  SHOP_NEEDS: "dishes: [...meal.dishes, ...sideShopping],",
  SHOP_DATES: "dishes: [...meal.dishes, ...sideShoppingLines(sideLedger)],",
  FINAL: "const finalServed = finalServedByMouthDay({",
  FINAL_DISHES: "const finalEnergyDishes = readEnergyBoxDishes(dishes);",
  FINAL_SIDES: "sides: readEnergySideCourses(dishes),",
  BOX_TRACE: "const boxTrace = {",
  DAY_KCAL: '...("day_kcal" in histogrammes ? { day_kcal: finalDayKcal } : {}),',
  FINAL_TRACE: "final_served: { ...finalServed.counters, per_mouth: finalDayKcal.per_mouth },",
  DAY_KCAL_BLOCK: "const finalDayKcal = (() => {",
  PLATE_LOAD_BLOCK: "const plateLoad = composition === null ? null : (() => {",
  PLATE_LOAD_TRACE: "plate_load: plateLoad,",
  REPAIR_CALL: ": planRepairMessage({",
  REPAIR_ARG: "household: repairHousehold,",
  REPAIR_CTX: "const repairHousehold: RepairHouseholdContext = (() => {",
  REPAIR_NOTES: 'c4Composed.household.dropped.includes("notes")',
  BELT_SIZING: "const engineBelt = engineBeltOf(meal);",
  BELT_FED: "...(engineBelt.heldOffByDish[i] ?? []),",
  BELT_DELIVERY: "const engine = engineBeltOf(m);",
  BELT_DELIVERY_BOXES: "memberIds: b.memberIds.filter((id) => !heldIds.has(id)),",
  BELT_ISSUES: "issues.push(...engineBeltFinal.issues);",
  BELT_TRACE: "by_member: engineBeltFinal.byMember,",
  BOUNDARY: "const portionBoundary = fitPortionsToBounds({",
  BOUNDARY_GOAL: "goalOf: starchGoalOfMember,",
  STARCH_GOAL_FN: "const starchGoalOfMember = (memberId: string): StarchGoal | null => {",
  STARCH_GOAL_GATED: "goal: gatedGoalOf(memberId),",
  BOUNDARY_LOG: "...portionBoundaryTrace,",
  BOUNDARY_FACTS: "kcalPerG: facts?.kcalPerGram ?? null,",
  TRACE_ATTACH: "sideCoursesTrace.attach = sideAttach.counters;",
  TRACE_POTS: "sideCoursesTrace.pots = pots.counters;",
  TRACE_MODEL: "sideCoursesTrace.model = sideLedger.counters;",
  TRACE_VARIETY: "sideCoursesTrace.variety = sideLedger.variety;",
  SERVED_FROZEN: "for (const [key, acc] of lastShadowServed) engineServedByMouthDay.set(key, acc.engine);",
  APPLY_TABLE: "const appliedN = applySizingForEaters({",
} as const;

const count = (code: string, s: string) => code.split(s).length - 1;

/** CE QUI MANQUE, jonction par jonction, dans la moitié d'APRÈS le modèle. */
function verdictAfter(code: string): string[] {
  const A = AFTER;
  const missing: string[] = [];
  // ⑨ la lecture et le registre
  if (count(code, A.READ) !== 2 || /extractSideCourses\(result\b/.test(code)) {
    missing.push("extract_not_from_source_text");
  }
  const ledger = blockAt(code, A.LEDGER);
  for (const arg of [
    "raw: sideRawEntries",
    "asks: sideCourseAsks",
    "index: composition",
    "preparations: plan.preparations",
    "dishes: plan.dishes",
    "sessionDayIndexByPrep: sideSessionDayIndex(plan.cooking_sessions)",
    "judgeBySlot: sideJudgeBySlot",
    "allergens: constraints",
    "language: sideLanguage",
    // ⟳ 2026-09-23 — les bouches sous plancher TCA: aucune somme de kcal.
    "kcalWithheldMemberIds: sideKcalWithheldIds",
  ]) {
    if (!ledger.includes(arg)) {
      missing.push("ledger_args");
      break;
    }
  }
  const sessions = blockAt(code, "): Map<string, number> => {", Math.max(0, code.indexOf(A.SESSIONS)));
  if (!sessions.includes("sideDayIndex.get(")) missing.push("session_order_differs");
  const houseTerms = blockAt(code, A.HOUSE_TERMS.slice(0, -1) + "[");
  if (
    !houseTerms.includes("...houseRuleForbidden") ||
    count(code, "householdTerms: sideHouseTerms,") !== 2 ||
    // Un juge PAR MOMENT: celui du midi, puis celui du soir.
    !/slot: "lunch",\s*\}\),\s*dinner: judgeSideTerm\(\{[^}]*slot: "dinner",/.test(code)
  ) missing.push("judge_without_house_rules");
  // ⑨ ter ⟳ 2026-09-23 (W2e) — LE JUGE LIT LES EXCLUSIONS COMPLÈTES, note
  // fraîche comprise (`beltItems`): c'est lui, et lui seul, qui la fait mordre
  // un à-côté — le planificateur d'avant le modèle ne la connaît pas.
  const exclusionsOf = statementAt(code, A.EXCLUSIONS_OF);
  const judges = blockAt(code, A.JUDGES);
  if (
    !exclusionsOf.includes("memberExclusionTerms.find(") || /sidePlan/.test(exclusionsOf) ||
    !houseTerms.includes("...householdExclusionTerms") || /sidePlan/.test(houseTerms) ||
    count(judges, "exclusionsOf: sideExclusionsOf,") !== 2 ||
    !blockAt(code, A.MEMBER_TERMS).includes("items: beltItems,") ||
    !blockAt(code, A.TABLE_TERMS).includes("items: beltItems,")
  ) missing.push("judge_without_fresh_note");
  const loop = code.indexOf(A.LOOP);
  const entry = code.indexOf(A.ENTRY);
  const rebuild = code.indexOf(A.REBUILD);
  const reread = code.indexOf(A.READ, loop);
  if (loop < 0 || !(rebuild > loop && rebuild < entry) || !(reread > loop && reread < rebuild)) {
    missing.push("ledger_not_rebuilt_per_round");
  }
  // ⑩ la cible du plat
  if (
    !code.includes(A.SNAP) || count(code, A.DISH_TARGET) !== 2 || !code.includes(A.AUDIT_TARGET)
  ) missing.push("dish_target_without_snap");
  // ⑪ la soupe, l'élagage, les courses
  const pots = code.indexOf(A.POTS, loop);
  if (
    !(pots > entry && pots < code.indexOf(A.PORTION_SIZING)) ||
    !blockAt(code, A.POTS).includes("ledger: sideLedger") || !code.includes(A.POTS_SPLICE)
  ) missing.push("pots_not_scaled");
  if (count(code, A.DRAWS) !== 2 || !code.includes(A.SIDE_CITED)) missing.push("side_pots_pruned");
  const rebuildShop = blockAt(code, A.SHOP_REBUILD.slice(0, -1) + "{", 0);
  if (
    !rebuildShop.includes(A.SHOP_LINES) || !rebuildShop.includes(A.SHOP_NEEDS) ||
    !code.includes(A.SHOP_DATES)
  ) missing.push("shopping_without_sides");
  // ⑫ l'attache et le verrou
  if (count(code, "mealDishesPayload(") < 1 || count(code, "mealDishesPayload(") !== count(code, A.ATTACH)) {
    missing.push("attach_not_around_payload");
  }
  const sideAttach = code.indexOf(A.SIDE_ATTACH);
  const lock = code.indexOf(A.LOCK);
  if (
    sideAttach < 0 || lock < sideAttach || !blockAt(code, A.LOCK).includes("sideAttach.dishes,")
  ) missing.push("lock_before_attach");
  if (!code.includes(A.LOCK_DROP_ISSUE) || !code.includes(A.LOCK_DROP_COUNT)) {
    missing.push("lock_side_drops_uncounted");
  }
  // ⑬ la ceinture des boîtes du moteur
  const beltSizing = code.indexOf(A.BELT_SIZING);
  const fed = code.indexOf("const fed = eatersByDish({");
  if (
    beltSizing < 0 || fed < beltSizing || !blockAt(code, "const fed = eatersByDish({").includes(A.BELT_FED)
  ) missing.push("engine_belt_not_in_sizing");
  if (!code.includes(A.BELT_DELIVERY) || !code.includes(A.BELT_DELIVERY_BOXES)) {
    missing.push("engine_belt_not_in_delivery");
  }
  if (!code.includes(A.BELT_ISSUES) || !code.includes(A.BELT_TRACE)) missing.push("engine_belt_not_traced");
  // ⑭ le rabotage
  const boundary = blockAt(code, A.BOUNDARY);
  if (!boundary.includes(A.BOUNDARY_GOAL) || !boundary.includes(A.BOUNDARY_FACTS)) {
    missing.push("boundary_goal_missing");
  }
  // ⟳ 2026-09-23 (contrôle W2d) — la forme et le rabotage lisent l'objectif GATÉ.
  if (!blockAt(code, A.STARCH_GOAL_FN).includes(A.STARCH_GOAL_GATED)) missing.push("starch_goal_ungated");
  // ⟳ 2026-09-23 (contrôle W2d) — le rabotage ne verse aucun kcal d'une
  // personne sous plancher TCA dans ses seaux.
  if (
    !/if \(withheldMemberIds\.has\(memberId\)\) \{\s*kcalWithheldMouths\+\+;\s*continue;\s*\}/.test(
      blockAt(code, "const portionBoundaryTrace = (() => {"),
    )
  ) missing.push("boundary_speaks_under_floor");
  if (
    !code.includes(A.BOUNDARY_LOG) || code.includes("...portionBoundary,") ||
    !code.includes("portion_boundary_missing_shave_facts:")
  ) missing.push("boundary_by_member_logged");
  // ⑮ l'énergie servie
  const final = code.indexOf(A.FINAL);
  if (
    !(final > lock && final < code.indexOf(A.BOX_TRACE)) || !code.includes(A.FINAL_DISHES) ||
    !code.includes(A.FINAL_SIDES) || !blockAt(code, A.FINAL).includes("withheldMemberIds") ||
    !blockAt(code, A.FINAL).includes("before: finalServedBefore")
  ) missing.push("final_served_misplaced");
  if (!code.includes(A.DAY_KCAL) || !code.includes(A.FINAL_TRACE)) missing.push("day_kcal_not_rewritten");
  const dayKcalBlock = blockAt(code, A.DAY_KCAL_BLOCK);
  const plateBlock = blockAt(code, A.PLATE_LOAD_BLOCK);
  if (
    dayKcalBlock === "" || /member_id\s*:/.test(dayKcalBlock) ||
    dayKcalBlock.includes("memberId: r.memberId") ||
    !plateBlock.includes(".map(({ member_id: memberId, ...rest }) => {")
  ) missing.push("kcal_next_to_member_id");
  if (!code.includes(A.PLATE_LOAD_TRACE) || !plateBlock.includes("withheldMemberIds,")) {
    missing.push("plate_load_missing");
  }
  const applyTable = code.indexOf(A.APPLY_TABLE);
  const frozen = code.indexOf(A.SERVED_FROZEN);
  if (
    frozen < 0 || frozen > applyTable || !code.includes("lastShadowServed = servedByMouthDay;")
  ) missing.push("served_before_not_frozen");
  // ⑯ la réparation
  const repair = blockAt(code, A.REPAIR_CALL.slice(2));
  if (!repair.includes(A.REPAIR_ARG) || /household:\s*household\.repairContext/.test(code)) {
    missing.push("repair_context_missing");
  }
  if (!/\{ \.\.\.household\.repairContext, sideCourses: lines\.join\(/.test(blockAt(code, A.REPAIR_CTX))) {
    missing.push("schema_key_in_repair");
  }
  if (!code.includes(A.REPAIR_NOTES)) missing.push("repair_notes_reason_missing");
  // la trace
  if (
    // ⟳ 2026-09-24 — TROIS reconstructions: avant la boucle, en tête de
    // tour, et après le rabotage (le manque de la borne d'assiette).
    !code.includes(A.TRACE_ATTACH) || !code.includes(A.TRACE_POTS) || count(code, A.TRACE_MODEL) !== 3
  ) missing.push("trace_after_model");
  // ⟳ 2026-09-23 — LA TABLE ET LA SEMAINE (`variety`), recopiées à côté de
  // `model` aux DEUX reconstructions du registre: une seule, et la trace dirait
  // le registre du premier jet sur un plan réparé.
  const varietyPairs = code.match(
    /sideCoursesTrace\.model = sideLedger\.counters;\s*sideCoursesTrace\.variety = sideLedger\.variety;/g,
  ) ?? [];
  if (varietyPairs.length !== 3 || count(code, A.TRACE_VARIETY) !== 3) missing.push("variety_not_traced");
  return missing;
}

/** Remplace la n-ième occurrence (0 = la première) de `from` par `to`, à partir de `at`. */
function replaceAt(s: string, from: string, to: string, at = 0, nth = 0): string {
  let i = s.indexOf(from, at);
  for (let k = 0; k < nth && i >= 0; k++) i = s.indexOf(from, i + 1);
  return i < 0 ? s : s.slice(0, i) + to + s.slice(i + from.length);
}

Deno.test("CÂBLAGE — l'après-modèle est branché", () => {
  assertEquals(verdictAfter(SRC), []);
});

Deno.test("CÂBLAGE — chaque jonction d'après le modèle coupée fait ROUGIR, elle seule", () => {
  const A = AFTER;
  const cuts: Array<[string, (s: string) => string]> = [
    ["extract_not_from_source_text", (s) => replaceAt(s, A.READ, "readSideCourses(result);")],
    ["ledger_args", (s) => replaceAt(s, "asks: sideCourseAsks,\n        memberIds", "asks: [],\n        memberIds")],
    [
      "session_order_differs",
      (s) => replaceAt(s, "sideDayIndex.get(String(session.day", "windowDays.indexOf(String(session.day", s.indexOf(A.SESSIONS)),
    ],
    ["judge_without_house_rules", (s) => replaceAt(s, "...houseRuleForbidden,", "", s.indexOf(A.HOUSE_TERMS))],
    [
      "judge_without_fresh_note",
      // Le juge ne lit plus que la mémoire seule: la note fraîche ne mord plus rien.
      (s) =>
        replaceAt(
          s,
          "memberExclusionTerms.find((x) => x.memberId === memberId)?.terms ?? []",
          "sidePlanExclusionTerms.get(memberId) ?? []",
          s.indexOf(A.EXCLUSIONS_OF),
        ),
    ],
    ["ledger_not_rebuilt_per_round", (s) => replaceAt(s, A.REBUILD, "")],
    ["dish_target_without_snap", (s) => replaceAt(s, A.SNAP, "0")],
    ["pots_not_scaled", (s) => replaceAt(s, A.POTS_SPLICE, "")],
    ["side_pots_pruned", (s) => replaceAt(s, A.DRAWS, "new Map<string, number>()", 0, 1)],
    ["shopping_without_sides", (s) => replaceAt(s, A.SHOP_DATES, "dishes: meal.dishes,")],
    ["attach_not_around_payload", (s) => replaceAt(s, A.ATTACH, "attachSideCourses([], sideLedger)")],
    ["lock_before_attach", (s) => replaceAt(s, "sideAttach.dishes,", "sideAttach.counters as never,")],
    ["lock_side_drops_uncounted", (s) => replaceAt(s, A.LOCK_DROP_ISSUE, "")],
    ["engine_belt_not_in_sizing", (s) => replaceAt(s, A.BELT_FED, "")],
    ["engine_belt_not_in_delivery", (s) => replaceAt(s, A.BELT_DELIVERY_BOXES, "memberIds: b.memberIds,")],
    ["engine_belt_not_traced", (s) => replaceAt(s, A.BELT_ISSUES, "")],
    ["boundary_goal_missing", (s) => replaceAt(s, A.BOUNDARY_GOAL, "goalOf: () => null,")],
    ["starch_goal_ungated", (s) => replaceAt(s, A.STARCH_GOAL_GATED, "goal: m.goal,")],
    [
      "boundary_speaks_under_floor",
      (s) => replaceAt(s, "if (withheldMemberIds.has(memberId)) {", "if (false) {", s.indexOf("const portionBoundaryTrace = (() => {")),
    ],
    ["boundary_by_member_logged", (s) => replaceAt(s, A.BOUNDARY_LOG, "...portionBoundary,")],
    ["final_served_misplaced", (s) => replaceAt(s, A.FINAL_DISHES, "const finalEnergyDishes = readEnergyBoxDishes(meal.dishes);")],
    ["day_kcal_not_rewritten", (s) => replaceAt(s, A.DAY_KCAL, "")],
    [
      "kcal_next_to_member_id",
      (s) => replaceAt(s, "eater_bucket: bucket,", "eater_bucket: bucket,\n          member_id: r.memberId,", s.indexOf(A.DAY_KCAL_BLOCK)),
    ],
    ["plate_load_missing", (s) => replaceAt(s, A.PLATE_LOAD_TRACE, "plate_load: null,")],
    ["served_before_not_frozen", (s) => replaceAt(s, A.SERVED_FROZEN, "")],
    ["repair_context_missing", (s) => replaceAt(s, A.REPAIR_ARG, "household: household.repairContext,")],
    [
      "schema_key_in_repair",
      (s) => replaceAt(s, "{ ...household.repairContext, sideCourses: lines.join(", "{ ...household.repairContext, cards: lines.join("),
    ],
    ["repair_notes_reason_missing", (s) => replaceAt(s, A.REPAIR_NOTES, "false")],
    ["trace_after_model", (s) => replaceAt(s, A.TRACE_ATTACH, "")],
    // ⟳ 2026-09-23 — la recopie du tour de réparation retirée: la trace
    // garderait la table du premier jet.
    ["variety_not_traced", (s) => replaceAt(s, A.TRACE_VARIETY, "", 0, 1)],
    // ⟳ 2026-09-23 — le registre sans les bouches sous plancher TCA.
    [
      "ledger_args",
      (s) => replaceAt(s, "kcalWithheldMemberIds: sideKcalWithheldIds,", "kcalWithheldMemberIds: new Set(),"),
    ],
  ];
  const names = new Set<string>();
  for (const [name, cut] of cuts) {
    names.add(name);
    const mutated = cut(SRC);
    assertNotEquals(mutated, SRC, `la coupe « ${name} » n'a rien changé`);
    assertEquals(verdictAfter(mutated), [name], `la coupe « ${name} » n'a pas fait rougir ce qu'elle devait`);
    // ⚠️ ET LA MOITIÉ D'AVANT LE MODÈLE NE BOUGE PAS: chaque coupe d'ici
    // désigne une jonction d'après.
    assertEquals(verdict(mutated), [], `la coupe « ${name} » a touché l'avant-modèle`);
  }
  // ⛔ CHAQUE NOM DU VERDICT A SA COUPE — une jonction sans coupe est une
  // épingle qu'on n'a jamais vue rougir.
  assertEquals(names.size, 30);
});

Deno.test("CÂBLAGE — la réparation ne reçoit JAMAIS la clé de schéma des à-côtés", () => {
  // ⛔ `household.repairContext.sideCourses` porte `"side_courses": [` (les deux
  // constructeurs le remplissent avec `sideCoursesBlock(...).block`). Le
  // contexte passé à la réparation le REMPLACE par la répartition seule.
  const ctx = blockAt(SRC, AFTER.REPAIR_CTX);
  assert(ctx.includes("sideCoursesCellText(here, nameOf)"), ctx);
  assert(!ctx.includes("sideCoursesBlock("), "le bloc à clé de schéma est recopié");
  // L'override vient APRÈS le spread: dans l'autre ordre, le spread gagnerait.
  const spread = ctx.indexOf("...household.repairContext");
  const override = ctx.indexOf("sideCourses: lines.join(");
  assert(spread > 0 && override > spread, ctx);
});
