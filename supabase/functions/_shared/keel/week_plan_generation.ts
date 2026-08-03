/**
 * PIVOT NUTRITION — N1 : la génération du plan de semaine DE L'ÉLÈVE.
 *
 * LE MODÈLE, en trois lignes, parce que tout le fichier en découle :
 *
 *     LE COACH DONNE UNE MÉTHODE  (ses convictions, ses interdits, sa voix)
 *     L'ÉLÈVE DÉCIDE              (ce plan est le sien, il l'adopte ou non)
 *     PERSONNE NE NOTE            (il n'entre pas dans plan_commitments)
 *
 * ── CE QUI A CHANGÉ, ET POURQUOI C'EST STRUCTUREL ────────────────────────
 * La première version de ce fichier traitait Sophia en SCRIBE : elle recopiait
 * les lignes d'un programme écrit par le coach, et « n'ajoutait jamais de
 * contenu alimentaire ». Cette garantie était confortable et elle était FAUSSE
 * dans le produit réel : un coach de masterclass n'écrit pas de programme. Il a
 * une philosophie. Il n'y avait donc rien à recopier, et la génération
 * échouait sur `coach_has_no_program` à tous les coups.
 *
 * Sophia n'est donc plus un scribe, elle est un INTERPRÈTE SOUS CADRE. Elle
 * compose bel et bien les lignes alimentaires — c'est exactement ce que le
 * coach attend d'elle, il paie pour être présent en son absence.
 *
 * ── CE QUE LE CODE GARANTIT ENCORE, ET CE QU'IL NE GARANTIT PLUS ─────────
 * Écrit noir sur blanc parce qu'un fichier qui ment sur sa propre garantie est
 * le pire défaut que ce dépôt ait produit (le CONTRACT a déjà promis un verrou
 * médical qui n'avait qu'un seul appelant).
 *
 *   GARANTI, déterministe, testé :
 *     1. Toute ligne alimentaire NOMME la conviction qu'elle prétend appliquer,
 *        et cette clé existe dans la doctrine publiée. Une clé inventée est
 *        rejetée, comptée, nommée. La base le tient aussi par CHECK.
 *     2. Aucune ligne ne porte de cible chiffrée d'énergie ou de macro. C'est
 *        la décision « pas de kcal » du projet, rendue exécutable.
 *     3. Ce que Sophia ajoute de son propre chef est une `action` d'une liste
 *        CLOSE et non alimentaire. Hors liste = rejetée.
 *     4. Le plan rendu passe les deux verrous. Un plan qui contredit un interdit
 *        du coach ou une contrainte dure de l'élève ne part pas — en entier,
 *        jamais amputé en silence.
 *
 *   NON GARANTI, et il faut le dire :
 *     Que l'interprétation soit FIDÈLE. « Satiété d'abord » peut donner une
 *     ligne que le coach n'aurait pas écrite. Le code vérifie la traçabilité,
 *     pas la justesse de la dérivation. C'est pour ça que chaque ligne affiche
 *     à l'élève la conviction dont elle est tirée : la fidélité se juge à
 *     l'œil, par l'élève et par le coach, pas par un CHECK.
 *
 * ── CE QUE L'OBJECTIF ET LA SITUATION CHANGENT ───────────────────────────
 * Ils changent QUELLES convictions mettre en avant, COMBIEN de lignes, et sur
 * QUELS JOURS. Ils ne changent jamais la méthode elle-même.
 *
 * PURE MODULE : no I/O, no clock (le caller passe `now`), no randomness.
 */

import {
  applyKeelOutputLocks,
  type OutputLockResult,
} from "../../sophia-brain/skills/_shared/keel_output_locks.ts";
import type { CoachDoctrine } from "./doctrine.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

/**
 * Une conviction du coach, réduite à ce que le générateur lit.
 *
 * C'est l'ANCRE. Elle remplace l'ancien `CoachRecommendation`, qui supposait un
 * programme ligne à ligne que le modèle masterclass n'a pas.
 */
export interface CoachPrinciple {
  /** LA clé de traçabilité. Sans elle la conviction est inutilisable. */
  belief_key: string;
  claim: string;
  rationale: string | null;
}

export const STUDENT_GOALS = [
  "fat_loss",
  "recomposition",
  "performance",
  "health",
  "maintenance",
] as const;
export type StudentGoal = (typeof STUDENT_GOALS)[number];

export interface StudentSituation {
  goal: StudentGoal;
  /** Prose, dans les mots de l'élève. Lue par le modèle, jamais branchée. */
  situation: string | null;
  practicalConstraints: Record<string, unknown>;
}

/**
 * Les actions que Sophia a le droit d'ajouter. LISTE CLOSE.
 *
 * Pourquoi une liste et pas une consigne : « reste léger » est interprétable,
 * « seulement ces cinq » ne l'est pas. Aucune n'est alimentaire, aucune ne
 * porte de cible chiffrée — ce sont des gestes qui donnent de l'élan, pas des
 * prescriptions déguisées.
 */
export const ALLOWED_ACTION_KINDS = [
  "walk",
  "hydration",
  "sleep_window",
  "meal_prep",
  "breathing",
] as const;
export type AllowedActionKind = (typeof ALLOWED_ACTION_KINDS)[number];

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

export interface WeekPlanItem {
  kind: "nutrition" | "action";
  label: string;
  rationale: string;
  /** Non nul et vérifié pour `nutrition`; toujours nul pour `action`. */
  source_belief_key: string | null;
  /**
   * La conviction, dans les mots du coach, FIGÉE au moment de la génération.
   *
   * Dénormalisé volontairement. Deux raisons, et la seconde est la vraie :
   *   - l'élève n'a pas le droit de lire `coach_doctrines` (c'est la méthode
   *     privée du coach), donc l'app ne peut pas résoudre la clé à l'affichage ;
   *   - un plan doit montrer la conviction TELLE QU'ELLE ÉTAIT quand il a été
   *     fait. Si le coach reformule en juin, le plan de mars ne doit pas se
   *     mettre à citer un texte que l'élève n'a jamais vu.
   */
  source_belief_claim: string | null;
  /** Non nul pour `action` uniquement. */
  action_kind: AllowedActionKind | null;
  days: string[];
}

export interface GeneratedWeekPlan {
  items: WeekPlanItem[];
  /** Clés de conviction inventées par le modèle et rejetées. */
  rejected_keys: string[];
  /** Actions hors liste close, rejetées. */
  rejected_actions: string[];
  /** Lignes rejetées pour cible chiffrée. Non vide = le prompt a dérivé. */
  rejected_numeric: string[];
  /** Tout le reste qui a dégradé. */
  issues: string[];
  /** Résultat des deux verrous sur le plan rendu. */
  lock: OutputLockResult;
}

export const WEEK_PLAN_PROMPT_VERSION = "week_plan.en.v2_doctrine";

const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Combien de lignes nutrition proposer, selon l'objectif.
 *
 * R6 : chaque valeur d'objectif est lue par une branche nommée, sinon elle
 * n'existe pas. Ici la branche est le NOMBRE et l'accent, jamais la méthode.
 *
 * Le plafond bas est délibéré : une semaine à douze lignes est une semaine
 * qu'on abandonne le mercredi.
 */
export function focusFor(goal: StudentGoal): { maxNutrition: number; emphasis: string } {
  switch (goal) {
    case "fat_loss":
      return {
        maxNutrition: 4,
        emphasis: "satiety and protein at each meal, so the week is livable rather than merely restrictive",
      };
    case "recomposition":
      return { maxNutrition: 4, emphasis: "protein regularity and training-day meals" };
    case "performance":
      return { maxNutrition: 5, emphasis: "fuelling around sessions and recovery meals" };
    case "health":
      return { maxNutrition: 4, emphasis: "vegetable and fibre variety, and steady meal timing" };
    case "maintenance":
      return { maxNutrition: 3, emphasis: "keeping what already works, with the lightest possible load" };
  }
}

// ---------------------------------------------------------------------------
// Règle 2 — pas de cible chiffrée
// ---------------------------------------------------------------------------

/**
 * Les motifs d'une cible chiffrée d'énergie ou de macro.
 *
 * POURQUOI CE FILTRE EXISTE MAINTENANT ET PAS AVANT : tant que Sophia recopiait
 * le coach, un chiffre dans une ligne était le chiffre DU COACH. Maintenant
 * qu'elle compose, elle peut inventer « 150 g de protéines par jour » — un
 * chiffre que personne n'a mesuré, présenté avec l'autorité du coach. Le projet
 * a refusé les kcal sur preuve mesurée ; ce filtre est ce refus rendu exécutable
 * plutôt que confié à la bonne volonté du prompt.
 *
 * CE QUI N'EST PAS VISÉ : les dénombrements ordinaires. « 3 repas par jour »,
 * « 2 légumes au dîner » sont des cadences, pas des cibles nutritionnelles, et
 * les interdire rendrait le générateur incapable d'écrire une ligne utile. Le
 * filtre ne mord donc que sur une unité d'énergie, ou sur une quantité ACCOLÉE
 * à un nom de macro.
 *
 * Chaque motif est nommé pour qu'un rejet dise LEQUEL a mordu (R7).
 */
const NUMERIC_TARGET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // Une unité d'énergie est toujours une cible, quel que soit le contexte.
  { name: "energy_unit", re: /\d[\d.,]*\s*(kcal|kj|cal(?:orie)?s?)\b/i },
  // Une masse ou un volume COLLÉ à un macro. L'ordre des deux sens compte:
  // "30 g of protein" et "protein: 30 g" s'écrivent tous les deux.
  {
    name: "macro_quantity",
    re: /\d[\d.,]*\s*(g|gr|grams?|kg|oz|ml|cl|l)\b[^.\n]{0,20}\b(protein|carb|carbohydrate|fat|sugar|fibre|fiber)/i,
  },
  {
    name: "macro_quantity_reversed",
    re: /\b(protein|carb|carbohydrate|fat|sugar|fibre|fiber)\w*\b[^.\n]{0,20}\d[\d.,]*\s*(g|gr|grams?|kg|oz|ml|cl|l)\b/i,
  },
  // Un pourcentage accolé à un macro est une répartition, donc une cible.
  {
    name: "macro_percentage",
    re: /(\d[\d.,]*\s*%[^.\n]{0,20}\b(protein|carb|carbohydrate|fat|sugar)|\b(protein|carb|carbohydrate|fat|sugar)\w*\b[^.\n]{0,20}\d[\d.,]*\s*%)/i,
  },
];

/** Renvoie le nom du motif qui mord, ou null. Exporté pour être testé motif par motif. */
export function findNumericTarget(text: string): string | null {
  for (const p of NUMERIC_TARGET_PATTERNS) {
    if (p.re.test(text)) return p.name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Le prompt
// ---------------------------------------------------------------------------

export const WEEK_PLAN_SYSTEM_PROMPT =
  `You help ONE student shape THEIR OWN week, working inside the method their coach teaches.

Output a single JSON object, nothing else. No prose outside the JSON, no markdown fences.

== WHAT YOUR COACH GAVE YOU, AND WHAT THEY DID NOT ==

Your coach teaches a method: a set of convictions about how eating should work. They did NOT write a per-student meal plan, and you must not pretend they did. Your job is to APPLY their convictions to this one student's actual life.

So you do write the food lines. That is the work. But every single one must be a faithful application of one of the convictions listed below, and must carry that conviction's exact \`source_belief_key\`, copied character for character.

A downstream filter rejects any key that is not in the list, records it, and names it. Inventing one does not help the student; it gets logged as a fault against this prompt.

Write the line the way the coach would, not the way a textbook would. If a conviction says "satiety before arithmetic", the line that applies it looks like "build lunch around something that keeps you full until dinner" — not "consume adequate protein".

== NEVER PUT A NUMBER ON FOOD ==

No calories. No macro grams. No percentages of anything nutritional. Not as a target, not as a range, not "roughly". Nobody has measured this student, and a number carries an authority that nothing here has earned.

Cadence is fine and often useful: "three meals", "two vegetables at dinner", "eat within an hour of waking". The difference is that a cadence describes a rhythm and a target claims a measurement.

A downstream filter rejects any line carrying an energy unit or a quantified macro.

== WHAT YOU MAY ADD YOURSELF ==

Light, non-prescriptive actions, and ONLY these five kinds:
- walk          — a short walk, tied to a moment ("after lunch")
- hydration     — water, plainly
- sleep_window  — a going-to-bed window
- meal_prep     — preparing ahead, once or twice in the week
- breathing     — two minutes, before a meal or at night

These carry NO number, NO target, NO food. They exist to give momentum, not to add a second plan. At most 2 per week. Fewer is better; zero is a valid answer for a student whose week is already full.

== HOW TO SHAPE A LIVABLE WEEK ==

- Pick FEW lines. A twelve-line week is a week abandoned on Wednesday. Respect the maximum given in the context.
- Read the student's situation and make the week POSSIBLE. If they eat at a canteen at midday, do not build the week around home-cooked lunches. If they never cook in the evening, choose lines that survive that.
- Spread across days rather than stacking everything on Monday.
- rationale: ONE short sentence, addressed to the student, saying why THIS line for THIS week. Never a lecture, never a promise of results.

== OUTPUT JSON SCHEMA ==

{
  "items": [
    {
      "kind": "nutrition",
      "label": "...",
      "rationale": "...",
      "source_belief_key": "<exact key from the convictions list>",
      "days": ["mon","wed","fri"]
    },
    {
      "kind": "action",
      "label": "...",
      "rationale": "...",
      "action_kind": "walk"|"hydration"|"sleep_window"|"meal_prep"|"breathing",
      "days": ["mon","tue"]
    }
  ]
}

Day tokens are exactly: mon tue wed thu fri sat sun. Never translated.`;

export function buildWeekPlanPrompt(args: {
  principles: readonly CoachPrinciple[];
  situation: StudentSituation;
  doctrineBlock: string;
  weekStart: string;
}): { systemPrompt: string; userMessage: string; allowedKeys: string[] } {
  const focus = focusFor(args.situation.goal);
  const allowedKeys = args.principles
    .map((p) => String(p.belief_key ?? "").trim())
    .filter(Boolean);

  const userMessage = [
    args.doctrineBlock.trim(),
    "",
    "== YOUR COACH'S CONVICTIONS (the only method that exists here) ==",
    JSON.stringify(
      args.principles.map((p) => ({
        source_belief_key: p.belief_key,
        conviction: p.claim,
        why_the_coach_holds_it: p.rationale,
      })),
      null,
      2,
    ),
    "",
    "== THIS STUDENT ==",
    `goal: ${args.situation.goal}`,
    `emphasis for this goal: ${focus.emphasis}`,
    `maximum nutrition lines: ${focus.maxNutrition}`,
    args.situation.situation
      ? `their situation, in their words: ${args.situation.situation}`
      : "their situation: not stated — keep the week simple and low-effort.",
    `practical constraints: ${JSON.stringify(args.situation.practicalConstraints ?? {})}`,
    "",
    `week starting: ${args.weekStart} (Monday)`,
  ].join("\n");

  return { systemPrompt: WEEK_PLAN_SYSTEM_PROMPT, userMessage, allowedKeys };
}

// ---------------------------------------------------------------------------
// Le parseur — c'est lui qui tient les quatre règles
// ---------------------------------------------------------------------------

function parseDays(raw: unknown, issues: string[], where: string): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const d of list) {
    const token = String(d ?? "").trim().toLowerCase();
    if (DAY_TOKENS.includes(token)) {
      if (!out.includes(token)) out.push(token);
    } else {
      // R7: un token de jour inconnu est nommé, jamais deviné.
      issues.push(`${where}: unknown day token ${JSON.stringify(d)}, dropped`);
    }
  }
  return out;
}

/**
 * Parse la sortie du modèle en appliquant les quatre règles.
 *
 * @param principles LES convictions de la doctrine publiée. On passe les
 *   convictions entières et pas seulement leurs clés, pour que l'allowlist et
 *   le texte affiché à l'élève sortent du MÊME objet : deux sources séparées
 *   finiraient par diverger, et la divergence produirait une ligne attribuée à
 *   une conviction dont elle ne cite pas le texte.
 *   Obligatoire, pas optionnel : une allowlist optionnelle est une allowlist
 *   qu'un appelant finit par oublier, et le coût de l'oubli ici est une ligne
 *   alimentaire présentée comme la méthode d'un coach qui ne l'a jamais dite.
 */
export function parseWeekPlan(
  raw: unknown,
  principles: readonly CoachPrinciple[],
  args: {
    doctrine: Pick<CoachDoctrine, "forbidden"> | null;
    safetyConstraints: readonly StudentSafetyConstraint[] | null;
    maxNutrition: number;
  },
): GeneratedWeekPlan {
  const issues: string[] = [];
  const rejectedKeys: string[] = [];
  const rejectedActions: string[] = [];
  const rejectedNumeric: string[] = [];

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    parsed = JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[keel/week_plan] model output is not a JSON object");
  }

  const claimByKey = new Map<string, string>();
  for (const p of principles) {
    const k = String(p.belief_key ?? "").trim();
    if (k) claimByKey.set(k, p.claim);
  }
  const allowed = claimByKey;
  const rawItems = Array.isArray((parsed as Record<string, unknown>).items)
    ? ((parsed as Record<string, unknown>).items as unknown[])
    : [];

  const items: WeekPlanItem[] = [];
  const seenKeys = new Set<string>();
  let nutritionCount = 0;
  let actionCount = 0;

  for (const [i, entry] of rawItems.entries()) {
    const it = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const kind = String(it.kind ?? "").trim();
    const label = String(it.label ?? "").trim();
    if (!label) {
      issues.push(`items[${i}]: empty label, dropped`);
      continue;
    }
    const rationale = String(it.rationale ?? "").trim();
    const days = parseDays(it.days, issues, `items[${i}].days`);

    // ── RÈGLE 2 : PAS DE CIBLE CHIFFRÉE ──────────────────────────────────
    // Testée sur label ET rationale: « mange plus de protéines » suivi de
    // « vise 150 g » place la cible dans la justification, où elle est tout
    // aussi lue par l'élève.
    const numeric = findNumericTarget(`${label} ${rationale}`);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(
        `items[${i}]: numeric target (${numeric}) -- rejected, nobody has measured this student`,
      );
      continue;
    }

    if (kind === "nutrition") {
      // ── RÈGLE 1 : TRAÇABILITÉ À UNE CONVICTION ─────────────────────────
      const key = String(it.source_belief_key ?? "").trim();
      if (!key || !allowed.has(key)) {
        if (key && !rejectedKeys.includes(key)) rejectedKeys.push(key);
        issues.push(
          `items[${i}]: source_belief_key ${JSON.stringify(key)} is not in ` +
            `the coach's doctrine -- rejected`,
        );
        continue;
      }
      if (seenKeys.has(key)) {
        // Discipline de cardinalité: une conviction, une ligne. Deux lignes sur
        // la même conviction doublent la charge perçue pour rien.
        issues.push(`items[${i}]: duplicate conviction ${key}, kept the first`);
        continue;
      }
      if (nutritionCount >= args.maxNutrition) {
        issues.push(`items[${i}]: over the ${args.maxNutrition}-line cap, dropped`);
        continue;
      }
      seenKeys.add(key);
      nutritionCount++;
      items.push({
        kind: "nutrition",
        label,
        rationale,
        source_belief_key: key,
        // `allowed.has(key)` vient d'être vérifié: le get ne peut pas manquer.
        source_belief_claim: claimByKey.get(key) ?? null,
        action_kind: null,
        days,
      });
      continue;
    }

    if (kind === "action") {
      // ── RÈGLE 3 : VOCABULAIRE FERMÉ DES AJOUTS ─────────────────────────
      const actionKind = String(it.action_kind ?? "").trim();
      if (!ALLOWED_ACTION_KINDS.includes(actionKind as AllowedActionKind)) {
        if (actionKind && !rejectedActions.includes(actionKind)) {
          rejectedActions.push(actionKind);
        }
        issues.push(
          `items[${i}]: action_kind ${JSON.stringify(actionKind)} is outside the ` +
            `closed list -- rejected`,
        );
        continue;
      }
      if (actionCount >= 2) {
        issues.push(`items[${i}]: more than 2 actions, dropped`);
        continue;
      }
      actionCount++;
      items.push({
        kind: "action",
        label,
        rationale,
        source_belief_key: null,
        source_belief_claim: null,
        action_kind: actionKind as AllowedActionKind,
        days,
      });
      continue;
    }

    issues.push(`items[${i}]: unknown kind ${JSON.stringify(kind)}, dropped`);
  }

  // ── RÈGLE 4 : LES DEUX VERROUS ─────────────────────────────────────────
  // Le plan rendu passe exactement la même ceinture qu'un message: interdits
  // du coach, contraintes dures de l'élève. Cette règle a pris du poids avec
  // le passage au modèle doctrine: c'est désormais Sophia qui compose les
  // lignes, donc c'est ici, et plus dans la copie fidèle d'un programme, que
  // se joue le fait qu'un plan ne contredise pas son coach.
  const rendered = items
    .map((it) => `${it.label}. ${it.rationale}`)
    .join("\n");
  const lock = applyKeelOutputLocks({
    text: rendered,
    isKeelStudent: true,
    safetyConstraints: args.safetyConstraints,
    doctrine: args.doctrine,
  });

  return {
    items: lock.reason === "clean" || lock.reason.startsWith("disarmed") ? items : [],
    rejected_keys: rejectedKeys,
    rejected_actions: rejectedActions,
    rejected_numeric: rejectedNumeric,
    issues,
    lock,
  };
}

/** Le payload `items` écrit sur `student_week_plans`. R1: clés ASCII. */
export function weekPlanItemsPayload(
  plan: GeneratedWeekPlan,
): Array<Record<string, unknown>> {
  return plan.items.map((it) => ({
    kind: it.kind,
    label: it.label,
    rationale: it.rationale,
    // La base REFUSE une ligne nutrition sans cette clé (CHECK, migration C1).
    source_belief_key: it.source_belief_key,
    source_belief_claim: it.source_belief_claim,
    action_kind: it.action_kind,
    days: it.days,
  }));
}
