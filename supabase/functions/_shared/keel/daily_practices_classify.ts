/**
 * FF-001 — LA CLASSIFICATION D'UNE PRATIQUE. Le prompt, et la relecture.
 *
 * ── UN APPEL PAR PRATIQUE ET PAR COACH, À VIE ──────────────────────────────
 * C'est le chiffre qui gouverne toute la conception. Ni par élève, ni par soir:
 * le coach tape une pratique, valide, un appel classe — et le résultat est
 * STOCKÉ. Toute conception qui dériverait vers un appel par envoi est à
 * rejeter, et §9 de FF-001 le nomme explicitement comme rabbit hole.
 *
 * L'autre moitié du bénéfice n'est pas économique: ce qui est stocké est VU. Le
 * coach lit ce que la machine a compris et le corrige. Une classification
 * recalculée au vol serait invisible, donc incorrigible — même patron que
 * `coach_food_proposals` et son `why_source`.
 *
 * ── LA FRONTIÈRE QUI SE PINNE PAR UN TEST (R8) ─────────────────────────────
 * Le classifieur PROPOSE une portée et rédige un brief. Il n'arbitre PAS si le
 * coach a raison.
 *
 * C'est la ligne la plus facile à franchir sans s'en rendre compte, parce qu'un
 * modèle à qui on montre « jeûne jusqu'à midi » a des choses à en dire, et
 * qu'elles ont l'air raisonnables. Elles ne le sont pas ici: ce produit vend la
 * méthode du coach, pas la nôtre. Un avis maison déguisé en analyse est le
 * produit qu'on ne vend pas.
 *
 * D'où deux protections plutôt qu'une consigne:
 *   1. le modèle NE REND PAS `status`. Il ne peut donc pas refuser, même s'il
 *      décide de vouloir — il n'existe pas de champ pour le dire.
 *   2. `collides_with` est validé contre une liste FERMÉE de quatre ceintures
 *      du produit. Un « refus » écrit dans ce champ ne franchit pas le parseur.
 *
 * PURE MODULE: no I/O, no clock, no randomness. Le module qui APPELLE le modèle
 * est `coach-doctrine-v1`; ce qui doit être éprouvé est ce qui ne doit jamais
 * être publié, et on ne demande pas à un modèle de produire à la demande le
 * verdict fautif qu'on refuse.
 */

import {
  type DailyPractice,
  detectBeltCollision,
  PRACTICE_BLOCKING_SURFACES,
  type PracticeBlockingSurface,
  PRACTICE_CADENCES,
  type PracticeCadence,
  PRACTICE_KINDS,
  type PracticeKind,
  type PracticeStatus,
} from "./daily_practices.ts";
import { GOAL_TOKENS, parseGoalScope } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

export const PRACTICE_CLASSIFY_SYSTEM_PROMPT = [
  "You classify ONE daily practice a nutrition coach has written for their whole cohort.",
  "",
  "You are a librarian, not a reviewer. The coach's method is not under discussion here, and you have no opinion on it. Your job is to describe what they wrote so the product can carry it to their students in their absence.",
  "",
  "WHAT YOU MUST NEVER DO — these are not preferences:",
  "- NEVER refuse, water down, hedge or annotate a practice because you disagree with it. Fasting, high salt, red meat, raw milk, no breakfast, three coffees: not your call. If it is unusual, it is still theirs.",
  "- NEVER rewrite the coach's words. You do not return the label at all; it is kept verbatim by the caller.",
  "- NEVER invent a quantity the coach did not write.",
  "",
  "Return ONE JSON object, and nothing else. No prose, no code fence.",
  "",
  "{",
  `  "kind": one of ${PRACTICE_KINDS.join(" | ")},`,
  '  "quantified": true when the coach wrote a number, false otherwise,',
  '  "target": the number itself, or null,',
  '  "unit": the thing being counted in the coach\'s own language ("glasses", "minutes", "verres"), or null,',
  `  "goal_scope": [] or a subset of ${GOAL_TOKENS.join(" | ")},`,
  '  "cadence": "constant" when this is a cornerstone the coach repeats to everyone, "rotating" otherwise,',
  '  "askable": true when it makes sense to ask a student about it in one line, false when it does not,',
  '  "minor_safe": true when it is safe to convey to a student under the age of majority,',
  '  "brief": see below,',
  '  "collides_with": null, or exactly one of ' + PRACTICE_BLOCKING_SURFACES.join(" | "),
  "}",
  "",
  "goal_scope — RESTRICT ONLY WHEN IT WOULD BE WRONG FOR THE OTHERS.",
  "Empty means everyone, and empty is the right answer most of the time. Restrict when the practice only makes sense for one direction of the scale: a practice about eating in a deficit belongs to fat_loss, one about hitting a surplus to muscle_gain. Never restrict merely because a practice feels more relevant to one group.",
  "",
  "brief — A MINI-PROMPT, NOT A SENTENCE THE STUDENT WILL READ.",
  "It is given to the writer that composes the evening message, once per evening, and the sentence is written fresh each time. So do NOT write the sentence. Write, in one or two lines, what the coach wants conveyed and in what spirit: what the practice is for, and the tone they take about it. A ready-made sentence would be repeated verbatim night after night and become wallpaper in a week, which is exactly what this product exists to avoid.",
  "",
  "collides_with — THE ONLY THING THAT CAN STOP A PRACTICE, AND IT IS NOT AN OPINION.",
  "The product suspends a small number of student-facing surfaces for students showing signs of restrictive eating. A practice that IS one of those surfaces would contradict a rule the product already enforces. That, and only that, is what this field reports:",
  "- weight_readout — the practice asks the student to weigh THEMSELVES or read a scale.",
  "- calorie_readout — the practice asks the student to count, track or log calories or macros.",
  "- streak_display — the practice is about keeping a streak or not breaking a chain.",
  "- adherence_score — the practice asks the student to score or rate their own compliance.",
  "",
  "It is null for everything else. In particular it is NULL for a practice you find unusual, aggressive, unscientific or unwise. Those are the coach's call, and reporting one here would be you refusing their method through a side door.",
].join("\n");

/** Le tour « utilisateur »: la pratique, et le contexte minimal pour la lire. */
export function buildPracticeClassifyPrompt(args: {
  label: string;
  /** La langue dans laquelle le coach écrit (R2). Le brief la suit. */
  contentLocale: string;
  /** Ce que le coach a déjà écrit, pour situer le vocabulaire. Facultatif. */
  existingLabels?: readonly string[];
}): string {
  const lines: string[] = [];
  lines.push(`The practice, exactly as the coach typed it: ${JSON.stringify(args.label)}`);
  lines.push(
    `The coach writes in ${args.contentLocale}. Write the brief in that language — it feeds a writer that speaks in their voice.`,
  );
  const existing = (args.existingLabels ?? []).filter((l) => String(l ?? "").trim());
  if (existing.length > 0) {
    // Le contexte sert la CADENCE, pas le contenu: « constant » veut dire
    // « socle par rapport aux autres », ce qui ne se décide pas sur une
    // pratique lue toute seule.
    lines.push(
      `Their other practices, for context only — do not classify them: ${
        existing.map((l) => JSON.stringify(l)).join(", ")
      }`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// LA RELECTURE
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const token = str(raw);
  return (allowed as readonly string[]).includes(token) ? (token as T) : null;
}

export interface ClassifiedPractice {
  practice: DailyPractice;
  issues: string[];
}

/**
 * La sortie du modèle, ramenée à une pratique — ou à une relecture.
 *
 * ── `status` EST DÉRIVÉ ICI, ET LE MODÈLE N'A PAS SON MOT À DIRE ───────────
 *
 *   blocked      — une ceinture est nommée: le matcher déterministe sur le
 *                  label, OU un `collides_with` valide. Le matcher passe en
 *                  premier parce qu'il ne dépend d'aucun modèle.
 *   needs_review — un champ manque ou est illisible. La saisie du coach est
 *                  CONSERVÉE (§7): il relit, il corrige, rien n'est perdu.
 *   remind_only  — le coach (ou le classifieur) dit que ça ne se demande pas.
 *                  C'est la branche nommée qui donne son existence à `askable`.
 *   active       — le cas nominal.
 *
 * `label` n'est jamais lu de la sortie du modèle: il est passé à part et
 * recopié tel quel. Un modèle qui « améliore » la formulation du coach est
 * précisément ce que ce produit ne vend pas, et la seule façon de le rendre
 * impossible est de ne pas lui laisser le champ.
 */
export function parseClassifiedPractice(
  raw: unknown,
  label: string,
): ClassifiedPractice {
  const issues: string[] = [];
  const coachLabel = str(label);
  if (!coachLabel) {
    throw new Error("[keel/daily_practices] parseClassifiedPractice: empty coach label");
  }

  const row = (raw ?? {}) as Record<string, unknown>;
  const isObject = raw !== null && typeof raw === "object" && !Array.isArray(raw);
  if (!isObject) {
    issues.push("classification did not return an object");
  }

  let review = !isObject;
  const flag = (message: string) => {
    issues.push(message);
    review = true;
  };

  const kind: PracticeKind | null = oneOf(row.kind, PRACTICE_KINDS);
  if (kind === null) flag(`unknown kind ${JSON.stringify(row.kind)}`);

  const cadence: PracticeCadence | null = oneOf(row.cadence, PRACTICE_CADENCES);
  if (cadence === null) flag(`unknown cadence ${JSON.stringify(row.cadence)}`);

  const quantified = row.quantified === true;
  let target: number | null = null;
  let unit: string | null = null;
  if (quantified) {
    const n = Number(row.target);
    if (!Number.isFinite(n) || n <= 0) {
      flag("quantified with no usable target");
    } else {
      target = n;
    }
    unit = str(row.unit) || null;
    if (!unit) flag("quantified with no unit");
  }

  const brief = str(row.brief);
  if (!brief) flag("no brief — nothing to instruct the evening writer with");

  const goalScope = parseGoalScope(row.goal_scope ?? row.goalScope, "goal_scope", issues);

  // ── R8, LA MOITIÉ STRUCTURELLE ────────────────────────────────────────
  // Un `collides_with` hors liste n'est pas un refus qu'on discute: c'est une
  // valeur qui n'existe pas. On la compte et on passe — la pratique du coach
  // n'a pas à payer l'imagination du modèle.
  const named = str(row.collides_with ?? row.collidesWith);
  const claimed: PracticeBlockingSurface | null = named
    ? oneOf(named, PRACTICE_BLOCKING_SURFACES)
    : null;
  if (named && claimed === null) {
    issues.push(
      `collides_with ${JSON.stringify(named)} is not a product surface, ignored — ` +
        `a practice is never refused on its method (R8)`,
    );
  }
  const collision = detectBeltCollision(coachLabel) ?? claimed;

  const askable = row.askable === true;
  const status: PracticeStatus = collision !== null
    ? "blocked"
    : review
    ? "needs_review"
    : askable
    ? "active"
    : "remind_only";

  return {
    practice: {
      label: coachLabel,
      kind: kind ?? "other",
      quantified,
      target,
      unit,
      goalScope,
      cadence: cadence ?? "rotating",
      askable,
      minorSafe: row.minor_safe === true || row.minorSafe === true,
      brief,
      status,
      collidesWith: collision,
    },
    issues,
  };
}

/**
 * La pratique, dans la forme que la base stocke (snake_case, jsonb).
 *
 * ⚠️ TOUT CHAMP AJOUTÉ À `DailyPractice` DOIT APPARAÎTRE ICI **ET** ÊTRE ADMIS
 * PAR `parseDailyPractices`. C'est la règle que `doctrine_editor_shape.ts`
 * écrit en tête pour les mêmes raisons: l'écran RELIT pour modifier, et le
 * premier « enregistrer » réécrit ce qu'il a relu. Un champ que cette fonction
 * laisse tomber est effacé de toutes les pratiques du coach, sans message.
 */
export function dailyPracticeToRow(
  practice: DailyPractice,
): Record<string, unknown> {
  return {
    label: practice.label,
    kind: practice.kind,
    quantified: practice.quantified,
    target: practice.target,
    unit: practice.unit,
    goal_scope: [...practice.goalScope],
    cadence: practice.cadence,
    askable: practice.askable,
    minor_safe: practice.minorSafe,
    brief: practice.brief,
    status: practice.status,
    collides_with: practice.collidesWith,
  };
}

/**
 * La pratique qu'on stocke quand la classification n'a PAS eu lieu.
 *
 * §7 de FF-001, mot pour mot: « la pratique est STOCKÉE (le coach ne perd pas
 * sa saisie) et l'écran le montre ». Un appel qui échoue ne doit jamais coûter
 * au coach ce qu'il vient de taper — c'est le moment où il est le plus près de
 * fermer l'onglet.
 */
export function unclassifiedPractice(label: string): DailyPractice {
  const coachLabel = str(label);
  if (!coachLabel) {
    throw new Error("[keel/daily_practices] unclassifiedPractice: empty coach label");
  }
  // Le blocage déterministe s'applique MÊME sans classification: il ne dépend
  // que du label, et une pratique qui contredit une ceinture ne devient pas
  // acceptable parce que le modèle était en panne.
  const collision = detectBeltCollision(coachLabel);
  return {
    label: coachLabel,
    kind: "other",
    quantified: false,
    target: null,
    unit: null,
    goalScope: [],
    cadence: "rotating",
    askable: false,
    minorSafe: false,
    // Le motif voyage DANS le brief plutôt que dans un champ à part: c'est ce
    // que l'écran affiche déjà pour une pratique à relire, et un second champ
    // qui ne sert qu'aux pannes serait vide 99,9 % du temps et oublié au
    // premier rendu.
    // Vide, donc `parseDailyPractices` la maintiendra en relecture à chaque
    // lecture ultérieure: le statut n'est pas la seule chose qui la retient, la
    // FORME l'est aussi. Une pratique sans brief n'a rien à dire au modèle du
    // soir, et ce serait vrai même si quelqu'un remettait `status` à `active`.
    brief: "",
    status: collision !== null ? "blocked" : "needs_review",
    collidesWith: collision,
  };
}
