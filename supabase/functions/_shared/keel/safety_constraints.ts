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
export type SafetyConstraintsDb = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<
        { data: StudentSafetyConstraintRow[] | null; error: unknown }
      >;
    };
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
      .eq("user_id", id));
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
      terms.push({ ruleId: constraint.id, token });
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
