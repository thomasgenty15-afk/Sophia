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

/** NFD-strip diacritics + lowercase, so 'proteine' matches 'proteine'. */
function normalizeForMatch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A slug becomes a tolerant word pattern: 'tree_nut' matches "tree nut",
 * "tree-nut", "tree nuts"; 'vitamin_d3' matches "vitamin d3". Word boundaries
 * are lookarounds on letters/digits so "peanut" does not match "peanuts" only
 * by luck, and does not match inside an unrelated word.
 */
function tokenPattern(token: string): RegExp {
  const parts = normalizeForMatch(token)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(escapeRegex);
  const body = parts.join("[\\s\\-_]*");
  return new RegExp(`(?<![a-z0-9])${body}(?:e?s)?(?![a-z0-9])`, "gi");
}

/**
 * CLOSED list of constructions that make a mention SAFE.
 *
 * Why this exists: the contract says "rejects any output containing a
 * severity='medical' token", and taken absolutely that rejects "gluten-free
 * bread" for the coeliac student whose plan is literally made of gluten-free
 * items (acceptance fixture 3). A validator that rejects every legitimate turn
 * gets switched off within a week, which is a worse outcome than a narrow,
 * documented, tested exception list. Pass `allowNegatedMentions: false` for the
 * absolute reading (audit mode).
 *
 * EN + FR because the legacy branch still generates French.
 */
const NEGATION_BEFORE =
  /(?:\b(?:no|not|without|avoid|avoids|avoiding|skip|skips|exclude|excludes|excluding|never|instead\s+of|free\s+(?:from|of)|allergic\s+to|allergy\s+to|intolerant\s+to|sans|pas|aucun|aucune|eviter|evite|evitez|remplace|remplacer|a\s+la\s+place)\s+(?:any\s+|all\s+|the\s+|some\s+|du\s+|de\s+la\s+|de\s+l'\s*|des\s+|de\s+|d'\s*)*)$/;

const NEGATION_AFTER =
  /^(?:\s*[-\s]?free\b|\s*[-\s]?sans\b|\s+allerg(?:y|ies|ic|ie|ique|ies)\b|\s+intoleran(?:ce|t)\b)/;

export type MedicalConstraintCheckOptions = {
  /** Default true. See NEGATION_BEFORE for why. */
  allowNegatedMentions?: boolean;
};

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
  const allowNegated = options.allowNegatedMentions !== false;
  const haystackRaw = String(text ?? "");
  if (!haystackRaw.trim()) return [];
  const haystack = normalizeForMatch(haystackRaw);
  // Diacritic stripping preserves length for precomposed input, but not for
  // already-decomposed input. When the two disagree, report the normalized
  // match rather than slicing the raw text at a shifted offset.
  const offsetsAligned = haystack.length === haystackRaw.length;
  const violations: MedicalConstraintViolation[] = [];
  for (const constraint of constraints) {
    if (constraint.severity !== "medical") continue;
    for (const token of safetyConstraintTokens(constraint)) {
      const pattern = tokenPattern(token);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(haystack)) !== null) {
        if (match[0].length === 0) {
          pattern.lastIndex += 1;
          continue;
        }
        const before = haystack.slice(0, match.index);
        const after = haystack.slice(match.index + match[0].length);
        if (
          allowNegated &&
          (NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after))
        ) {
          continue;
        }
        violations.push({
          constraintId: constraint.id,
          token: token.trim().toLowerCase(),
          matchedText: offsetsAligned
            ? haystackRaw.slice(match.index, match.index + match[0].length)
            : match[0],
          index: match.index,
        });
      }
    }
  }
  return violations;
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
