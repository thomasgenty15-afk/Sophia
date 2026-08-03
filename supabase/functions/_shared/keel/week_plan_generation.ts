/**
 * PIVOT NUTRITION — N1 : la génération du plan de semaine DE L'ÉLÈVE.
 *
 * LE MODÈLE, en trois lignes, parce que tout le fichier en découle :
 *
 *     LE COACH RECOMMANDE  (son programme + sa doctrine)
 *     L'ÉLÈVE DÉCIDE       (ce plan est le sien)
 *     PERSONNE NE NOTE     (il n'entre pas dans plan_commitments)
 *
 * Sophia n'est ni l'auteur ni l'arbitre : elle est le SCRIBE. Elle prend ce que
 * le coach a écrit, ce que l'élève vise et ce que sa vie permet, et elle en
 * fait une semaine tenable. Elle n'ajoute jamais de contenu alimentaire.
 *
 * ── LES TROIS RÈGLES, ET POURQUOI ELLES SONT EN CODE ─────────────────────
 * Un prompt est une consigne, pas une garantie. Ces trois-là décident si un
 * coach renouvelle ou pas, donc aucune ne repose sur la bonne volonté du
 * modèle :
 *
 *   1. TRAÇABILITÉ — toute ligne `nutrition` porte une `source_commitment_key`
 *      qui existe DANS le programme du coach. C'est exactement le filtre
 *      anti-hallucination de `meal_analysis.ts`, réutilisé : une clé inventée
 *      est rejetée, comptée et nommée, jamais gardée en silence.
 *      (La base le tient AUSSI, par CHECK — voir la migration N0. Ceinture et
 *      bretelles, parce que c'est la règle qui tue le produit si elle lâche.)
 *
 *   2. VOCABULAIRE FERMÉ DES AJOUTS — ce que Sophia ajoute de son propre chef
 *      est une `action`, et seulement parmi une liste close (marche, eau,
 *      sommeil, prep, respiration). Jamais une ligne alimentaire, jamais une
 *      cible chiffrée. Une action hors liste est rejetée.
 *
 *   3. LES DEUX VERROUS — le plan rendu passe `applyKeelOutputLocks` comme
 *      n'importe quel message : interdits du coach et contraintes dures de
 *      l'élève. Un plan qui contredit la doctrine ne part pas.
 *
 * ── CE QUE L'OBJECTIF ET LA SITUATION CHANGENT (et ce qu'ils ne changent pas)
 * Ils changent l'AGENCEMENT : quelles recommandations mettre en avant, sur
 * quels jours, combien en prendre. Ils ne changent JAMAIS le contenu — un
 * élève en perte de poids et un élève en performance reçoivent des lignes
 * tirées du même programme, arrangées différemment.
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

/** Une recommandation du coach, réduite à ce que le générateur lit. */
export interface CoachRecommendation {
  /** LA clé de traçabilité. Sans elle, la ligne est inutilisable. */
  template_commitment_key: string;
  title: string;
  student_instruction: string | null;
  activity_class: string;
  polarity: string;
  slot_key: string | null;
  scheduled_days: string[] | null;
  priority: string;
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
  source_commitment_key: string | null;
  /** Non nul pour `action` uniquement. */
  action_kind: AllowedActionKind | null;
  days: string[];
}

export interface GeneratedWeekPlan {
  items: WeekPlanItem[];
  /** Clés inventées par le modèle et rejetées. Non vide = défaut à voir. */
  rejected_keys: string[];
  /** Actions hors liste close, rejetées. */
  rejected_actions: string[];
  /** Tout le reste qui a dégradé. */
  issues: string[];
  /** Résultat des deux verrous sur le plan rendu. */
  lock: OutputLockResult;
}

export const WEEK_PLAN_PROMPT_VERSION = "week_plan.en.v1";

const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Combien de lignes nutrition proposer, selon l'objectif.
 *
 * R6 : chaque valeur d'objectif est lue par une branche nommée, sinon elle
 * n'existe pas. Ici la branche est le NOMBRE et l'accent, jamais le contenu.
 *
 * Le plafond bas est délibéré : une semaine à douze lignes est une semaine
 * qu'on abandonne le mercredi. Trois à cinq engagements tenus valent mieux que
 * douze affichés.
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
// Le prompt
// ---------------------------------------------------------------------------

export const WEEK_PLAN_SYSTEM_PROMPT =
  `You help ONE student shape THEIR OWN week from the recommendations their coach wrote. You are a scribe, not an author and not a judge.

Output a single JSON object, nothing else. No prose outside the JSON, no markdown fences.

== THE RULE THAT MATTERS MOST ==

You NEVER invent food content. Every nutrition line you output must come from the coach's recommendations given below, and must carry that recommendation's exact \`template_commitment_key\`, copied character for character. If a line is not in the coach's list, it does not go in the plan — not as a suggestion, not as a "you could also".

A downstream filter rejects any key that is not in the list, records it, and names it. Inventing one does not help the student; it gets logged as a fault against this prompt.

What the student's goal and situation change: WHICH recommendations you pick, HOW MANY, and on WHICH DAYS. What they never change: the content of a recommendation. You do not adjust a coach's line "for weight loss" — you choose the ones that serve it and leave the rest out.

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
- Read the student's situation and make the week POSSIBLE. If they eat at a canteen at midday, do not build the week around home-cooked lunches. If they never cook in the evening, say so by choosing lines that survive that.
- Spread across days rather than stacking everything on Monday.
- rationale: ONE short sentence, addressed to the student, saying why THIS line for THIS week. Never a lecture, never a promise of results.

== OUTPUT JSON SCHEMA ==

{
  "items": [
    {
      "kind": "nutrition",
      "label": "...",
      "rationale": "...",
      "source_commitment_key": "<exact key from the coach's list>",
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
  recommendations: readonly CoachRecommendation[];
  situation: StudentSituation;
  doctrineBlock: string;
  weekStart: string;
}): { systemPrompt: string; userMessage: string; allowedKeys: string[] } {
  const focus = focusFor(args.situation.goal);
  const allowedKeys = args.recommendations
    .map((r) => String(r.template_commitment_key ?? "").trim())
    .filter(Boolean);

  const userMessage = [
    args.doctrineBlock.trim(),
    "",
    "== THE COACH'S RECOMMENDATIONS (the only nutrition content that exists) ==",
    JSON.stringify(
      args.recommendations.map((r) => ({
        template_commitment_key: r.template_commitment_key,
        title: r.title,
        student_instruction: r.student_instruction,
        activity_class: r.activity_class,
        polarity: r.polarity,
        slot_key: r.slot_key,
        suggested_days: r.scheduled_days,
        priority: r.priority,
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
// Le parseur — c'est lui qui tient les trois règles
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
 * Parse la sortie du modèle en appliquant les trois règles.
 *
 * @param allowedKeys LES clés du programme du coach. Obligatoire, pas
 *   optionnel : une allowlist optionnelle est une allowlist qu'un appelant
 *   finit par oublier, et le coût de l'oubli ici est une ligne alimentaire
 *   inventée dans le plan d'un élève.
 */
export function parseWeekPlan(
  raw: unknown,
  allowedKeys: readonly string[],
  args: {
    doctrine: Pick<CoachDoctrine, "forbidden"> | null;
    safetyConstraints: readonly StudentSafetyConstraint[] | null;
    maxNutrition: number;
  },
): GeneratedWeekPlan {
  const issues: string[] = [];
  const rejectedKeys: string[] = [];
  const rejectedActions: string[] = [];

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    parsed = JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[keel/week_plan] model output is not a JSON object");
  }

  const allowed = new Set(allowedKeys.map((k) => String(k)));
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

    if (kind === "nutrition") {
      // ── RÈGLE 1 : TRAÇABILITÉ ────────────────────────────────────────
      const key = String(it.source_commitment_key ?? "").trim();
      if (!key || !allowed.has(key)) {
        if (key && !rejectedKeys.includes(key)) rejectedKeys.push(key);
        issues.push(
          `items[${i}]: source_commitment_key ${JSON.stringify(key)} is not in ` +
            `the coach's recommendations -- rejected`,
        );
        continue;
      }
      if (seenKeys.has(key)) {
        // Discipline de cardinalité: une recommandation, une ligne. Deux
        // lignes sur la même clé double la charge perçue pour rien.
        issues.push(`items[${i}]: duplicate recommendation ${key}, kept the first`);
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
        source_commitment_key: key,
        action_kind: null,
        days,
      });
      continue;
    }

    if (kind === "action") {
      // ── RÈGLE 2 : VOCABULAIRE FERMÉ DES AJOUTS ───────────────────────
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
        source_commitment_key: null,
        action_kind: actionKind as AllowedActionKind,
        days,
      });
      continue;
    }

    issues.push(`items[${i}]: unknown kind ${JSON.stringify(kind)}, dropped`);
  }

  // ── RÈGLE 3 : LES DEUX VERROUS ─────────────────────────────────────────
  // Le plan rendu passe exactement la même ceinture qu'un message: interdits
  // du coach, contraintes dures de l'élève. Un plan qui contredit la doctrine
  // n'a pas plus le droit de partir qu'une phrase qui la contredit.
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
    // La base REFUSE une ligne nutrition sans cette clé (CHECK, migration N0).
    source_commitment_key: it.source_commitment_key,
    action_kind: it.action_kind,
    days: it.days,
  }));
}
