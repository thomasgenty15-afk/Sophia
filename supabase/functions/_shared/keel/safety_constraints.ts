/**
 * KEEL W3.3 — student safety constraints: loaded every turn, OUTSIDE the LLM
 * memory path, plus a deterministic post-generation validator.
 *
 * Authority: docs/keel/CONTRACT.md ("Supplement safety gate (P0)"),
 * docs/keel/BUILD_PLAN.md W3.3. Table: `student_safety_constraints`
 * (migration 20260727090000_keel_p0_commitments.sql).
 *
 * WHY THIS IS NOT MEMORY
 * The memorizer runs on the midnight cron and produces items with status
 * 'candidate', ranked by embedding similarity, promoted probabilistically.
 * That machinery is correct for "prefers short answers in the evening". It is
 * catastrophic for "anaphylactic to peanuts": an allergy that is recalled 80%
 * of the time is an allergy that kills on the 5th turn. So:
 *
 *   1. constraints are read from their own table, on EVERY turn, synchronously
 *      with the turn (no cron, no candidate status, no ranking, no cache);
 *   2. nothing in this module imports the memory runtime, and nothing in the
 *      memory runtime may import this module (asserted by
 *      safety_constraints_test.ts);
 *   3. a load failure THROWS. An empty constraint list and a failed query are
 *      indistinguishable to a caller that swallows errors, and the difference
 *      is a medical one. Fail loud (R7) rather than answer with no allergies.
 *
 * The validator is the second half of the same idea: prompts are advisory, so
 * the guarantee cannot live in the prompt. After generation, any visible text
 * that names a `severity='medical'` token is rejected, deterministically.
 */

import {
  type ForbiddenMatchOptions,
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import { surfaceFormsFor } from "./allergen_surface_forms.ts";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

export const SAFETY_CONSTRAINT_KINDS = [
  "allergy",
  "intolerance",
  "medical",
  "religious",
  "dislike",
] as const;

export const SAFETY_CONSTRAINT_SEVERITIES = [
  "medical",
  "strict",
  "preference",
] as const;

export type SafetyConstraintKind = typeof SAFETY_CONSTRAINT_KINDS[number];
export type SafetyConstraintSeverity =
  typeof SAFETY_CONSTRAINT_SEVERITIES[number];

export type StudentSafetyConstraint = {
  id: string;
  userId: string;
  kind: SafetyConstraintKind;
  /** R1: ASCII snake_case slugs. At least one of the three is non-null. */
  allergenRef: string | null;
  substanceRef: string | null;
  medicationClass: string | null;
  severity: SafetyConstraintSeverity;
  declaredBy: "student" | "coach";
  /** Prose, optional. NEVER used for matching (R1: identifiers, not prose). */
  notes: string | null;
  contentLocale: string;
};

type StudentSafetyConstraintRow = {
  id: string;
  user_id: string;
  kind: string;
  allergen_ref: string | null;
  substance_ref: string | null;
  medication_class: string | null;
  severity: string;
  declared_by: string;
  notes: string | null;
  content_locale: string;
};

/** Structural type: tests inject a fake, production injects a SupabaseClient. */
type SafetyConstraintsQuery =
  & PromiseLike<{ data: StudentSafetyConstraintRow[] | null; error: unknown }>
  & { eq(column: string, value: string): SafetyConstraintsQuery };

export type SafetyConstraintsDb = {
  from(table: string): {
    select(columns: string): SafetyConstraintsQuery;
  };
};

export class SafetyConstraintsLoadError extends Error {
  readonly userId: string;
  constructor(userId: string, cause: unknown) {
    super(
      `[keel/safety_constraints] Failed to load student_safety_constraints for ` +
        `user ${userId}: ${
          cause instanceof Error ? cause.message : String(cause)
        }. Refusing to continue with an unknown constraint set.`,
    );
    this.name = "SafetyConstraintsLoadError";
    this.userId = userId;
  }
}

/**
 * Load every safety constraint of one student.
 *
 * Called on EVERY turn by the composer context builder. There is deliberately
 * no cache and no memoization: the whole point of this module is that the
 * answer is the current row set, not a remembered one. A student who declares
 * a new allergy at 14:02 is protected at 14:03, not after the next cron.
 *
 * Throws `SafetyConstraintsLoadError` on any query failure (see module note).
 */
export async function loadStudentSafetyConstraints(
  db: SafetyConstraintsDb,
  userId: string,
): Promise<StudentSafetyConstraint[]> {
  const id = String(userId ?? "").trim();
  if (!id) {
    throw new SafetyConstraintsLoadError(
      String(userId),
      new Error("empty user id"),
    );
  }
  let data: StudentSafetyConstraintRow[] | null;
  let error: unknown;
  try {
    ({ data, error } = await db
      .from("student_safety_constraints")
      .select(
        "id, user_id, kind, allergen_ref, substance_ref, medication_class, " +
          "severity, declared_by, notes, content_locale",
      )
      .eq("user_id", id)
      // RÉTRACTATION (migration 20260803160000). Une contrainte retirée reste
      // EN BASE pour l'audit clinique et cesse de mordre ici, au seul endroit
      // qui compte: le chargement de chaque tour. Filtrer à la source plutôt
      // qu'au consommateur, sinon chaque nouveau lecteur doit se souvenir de
      // le faire — et un qui oublie ré-arme une contrainte que l'élève a
      // corrigée.
      .eq("status", "active"));
  } catch (thrown) {
    throw new SafetyConstraintsLoadError(id, thrown);
  }
  if (error) throw new SafetyConstraintsLoadError(id, error);
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    kind: row.kind as SafetyConstraintKind,
    allergenRef: row.allergen_ref,
    substanceRef: row.substance_ref,
    medicationClass: row.medication_class,
    severity: row.severity as SafetyConstraintSeverity,
    declaredBy: row.declared_by as "student" | "coach",
    notes: row.notes,
    contentLocale: row.content_locale,
  }));
}

// ---------------------------------------------------------------------------
// Le bloc de PROMPT — la moitié « avant génération » du double verrou
// ---------------------------------------------------------------------------

/**
 * Les contraintes dures de l'élève, rendues pour le PROMPT.
 *
 * ── POURQUOI CETTE FONCTION N'EXISTAIT PAS, ET CE QUE ÇA COÛTAIT ──────────
 * Le §3.3 du pivot décrit un DOUBLE verrou: injecté dans le prompt ET vérifié
 * en sortie. La moitié « vérifié en sortie » était écrite, testée, posée au
 * point de passage unique du rendu. La moitié « injecté dans le prompt »
 * n'existait pas: `grep` du 2026-08-03 montre que `safety_constraints` n'avait
 * que deux consommateurs runtime, `applyKeelOutputLocks` et le skill
 * `plan_question`. Les deux seuls blocs qu'un tour d'élève KEEL recevait
 * étaient le plan et la doctrine du coach.
 *
 * Le modèle générait donc À L'AVEUGLE, et toute la sécurité reposait sur un
 * matcher post-hoc. Conséquence mesurée: « the nut butter option is the
 * stronger bag snack » servi à un élève anaphylactique.
 *
 * Pire, cette absence rendait FAUSSE la justification écrite du fail-open de
 * `run.ts` (« le prompt porte déjà les contraintes, seule la vérification
 * déterministe manque »). Le fail-open est acceptable quand une des deux
 * moitiés tient. Il ne l'était pas quand aucune ne tenait.
 *
 * ── CE QUE LE BLOC DIT, ET CE QU'IL SE GARDE DE DIRE ──────────────────────
 * Il nomme les identifiants, pas la prose des `notes` (R1: on branche sur des
 * identifiants). Et il autorise EXPLICITEMENT d'en parler pour les éviter ou
 * les expliquer — sans cette phrase, un modèle prudent refuse de répondre à
 * « est-ce que ce plat contient des arachides ? », qui est précisément la
 * question qu'un élève allergique a le droit de poser. C'est la même carve-out
 * que la condition de désarmement `disarmed_negated_mention` de la ceinture:
 * les deux moitiés du verrou doivent avoir la MÊME politique de négation,
 * sinon le prompt produit un texte que la ceinture rejette.
 *
 * Rend `null` quand il n'y a rien à dire — un bloc vide dans un prompt est du
 * bruit qui coûte du cache.
 */
export function safetyConstraintsPromptBlock(
  constraints: readonly StudentSafetyConstraint[] | null,
): string | null {
  if (!constraints || constraints.length === 0) return null;
  const lines: string[] = [];
  for (const constraint of constraints) {
    const refs = safetyConstraintTokens(constraint);
    if (refs.length === 0) continue;
    lines.push(
      `- ${refs.join(", ")} — ${constraint.kind}, severity=${constraint.severity}` +
        ` (declared by ${constraint.declaredBy})`,
    );
  }
  if (lines.length === 0) return null;
  const hasMedical = constraints.some((c) => c.severity === "medical");
  return [
    "=== THIS STUDENT'S HARD CONSTRAINTS (source: student_safety_constraints) ===",
    "These are not preferences. They are loaded fresh every turn.",
    ...lines,
    "",
    "NEVER suggest, recommend or include any of the above, and never suggest a",
    "food that ordinarily contains one (a nut butter for a peanut constraint, a",
    "satay sauce, a tahini for sesame). When you propose anything to eat, check",
    "it against this list first.",
    "You MAY name them to warn, to exclude, or to answer a direct question about",
    "them — avoiding a food requires being able to say its name.",
    ...(hasMedical
      ? [
        "A medical-severity constraint is not something to reason around: if a",
        "question turns on it clinically, say so and point to a doctor.",
      ]
      : []),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Deterministic post-generation validator
// ---------------------------------------------------------------------------

/** Every identifier carried by a constraint (prose `notes` excluded, R1). */
export function safetyConstraintTokens(
  constraint: StudentSafetyConstraint,
): string[] {
  return [
    constraint.allergenRef,
    constraint.substanceRef,
    constraint.medicationClass,
  ].filter((token): token is string => Boolean(token && token.trim()));
}

export function medicalConstraintTokens(
  constraints: readonly StudentSafetyConstraint[],
): string[] {
  const seen = new Set<string>();
  for (const constraint of constraints) {
    if (constraint.severity !== "medical") continue;
    for (const token of safetyConstraintTokens(constraint)) {
      seen.add(token.trim().toLowerCase());
    }
  }
  return [...seen];
}

export type MedicalConstraintViolation = {
  constraintId: string;
  /** The slug that matched, canonical form. */
  token: string;
  /** The literal substring of the generated text that matched. */
  matchedText: string;
  index: number;
};

export class MedicalConstraintViolationError extends Error {
  readonly violations: MedicalConstraintViolation[];
  constructor(violations: MedicalConstraintViolation[]) {
    super(
      `[keel/safety_constraints] Generated text names ${violations.length} ` +
        `medical-severity constraint token(s): ` +
        violations.map((v) => `${v.token} ("${v.matchedText}")`).join(", ") +
        ". Output rejected; regenerate.",
    );
    this.name = "MedicalConstraintViolationError";
    this.violations = violations;
  }
}

/** Alias, not a copy: the negation policy is one decision, made in one place. */
export type MedicalConstraintCheckOptions = ForbiddenMatchOptions;

/**
 * Pure, deterministic, zero-I/O. Returns every medical-token occurrence that
 * survives the negation exceptions. Callers that regenerate use this one;
 * callers that must fail loudly use `assertNoMedicalConstraintViolation`.
 */
export function findMedicalConstraintViolations(
  text: string,
  constraints: readonly StudentSafetyConstraint[],
  options: MedicalConstraintCheckOptions = {},
): MedicalConstraintViolation[] {
  // The engine lives in `forbidden_matcher.ts` -- see that file's header for
  // why. This function keeps its exact signature, its exact semantics and its
  // exact tests; what it no longer keeps is a private second copy of the
  // normalization and negation rules that the coach-doctrine lock also needs.
  const terms: ForbiddenTerm[] = [];
  for (const constraint of constraints) {
    if (constraint.severity !== "medical") continue;
    for (const token of safetyConstraintTokens(constraint)) {
      // LES FORMES DE SURFACE, et leur absence était le trou (QA agent 4).
      //
      // Le moteur supporte `surfaceForms` depuis toujours et la doctrine du
      // coach s'en sert; cette moitié-ci ne les alimentait pas, donc la garde
      // MÉDICALE — la plus critique des deux — était la seule à ne matcher
      // qu'un mot. Mesuré: "the nut butter option is the stronger bag snack"
      // est SORTI, `reason: "clean"`, sur un élève `allergen_ref='peanut'`
      // `severity='medical'`.
      //
      // La table est plate, fermée, écrite à la main (voir son en-tête). Un
      // slug qui n'y figure pas garde exactement son comportement d'avant:
      // `surfaceFormsFor` rend `[]`, jamais `null`, donc l'ajout ne peut pas
      // réduire la couverture.
      terms.push({
        ruleId: constraint.id,
        token,
        surfaceForms: surfaceFormsFor(token),
      });
    }
  }
  return findForbiddenMatches(text, terms, options).map((m) => ({
    constraintId: m.ruleId,
    token: m.token,
    matchedText: m.matchedText,
    index: m.index,
  }));
}

/**
 * Fail-loud gate to run on every generated visible text before it is sent.
 * Throws `MedicalConstraintViolationError` listing the offending tokens.
 */
export function assertNoMedicalConstraintViolation(
  text: string,
  constraints: readonly StudentSafetyConstraint[],
  options: MedicalConstraintCheckOptions = {},
): void {
  const violations = findMedicalConstraintViolations(text, constraints, options);
  if (violations.length === 0) return;
  console.error("keel.safety_constraints.medical_violation", {
    violation_count: violations.length,
    tokens: [...new Set(violations.map((v) => v.token))].join(","),
    detail: "Generated output rejected before delivery; regenerate.",
  });
  throw new MedicalConstraintViolationError(violations);
}
