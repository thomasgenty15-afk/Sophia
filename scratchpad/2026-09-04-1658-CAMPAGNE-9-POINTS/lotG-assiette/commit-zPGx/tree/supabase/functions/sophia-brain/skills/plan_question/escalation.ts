/**
 * KEEL W4.4 — TIER 1: the escalation. PURE: builds a row, writes nothing.
 *
 * "The AI escalates, the coach decides." (CONTRACT, doctrine carried over.)
 * Everything Tier 0 could not clear becomes a `contract_change_requests` row
 * carrying three things and one non-thing:
 *
 *   student_words    the verbatim question, citable, never paraphrased away
 *   sophia_summary   what the AI understood, in one sentence
 *   sophia_evidence  the deterministic trace: verdict, reason code, the two
 *                    food groups, the autonomy and the policy that produced it
 *   suggested_option A DRAFT. Never applied. Not by this module, not by the
 *                    runtime that inserts the row, not by any cron. It is a
 *                    sentence in the coach's inbox, and the coach's click is
 *                    the only thing that can turn it into a prescription.
 *
 * WHY `suggested_option` IS SAFE TO PRODUCE AT ALL
 * Because nothing downstream reads it. `plan_commitments` is written by the
 * publish path only; this row is inert until a human acts on it. The invariant
 * is structural (this module imports no DB client and emits no effect) and
 * pinned by `plan_question_test.ts`, which asserts the built row can only be
 * `status='open'` with `coach_decision=null`, and that the module's source
 * never names `plan_commitments`.
 *
 * URGENCY IS NOT A FREE PARAMETER
 * SCHEMA (DIALOGUE): `allergen_violation` and `restriction_signal` are the only
 * reason codes allowed to bypass the weekly digest. `buildChangeRequest`
 * refuses — loudly — any other pairing, in both directions: an
 * `allergen_violation` filed as `next_digest` is a swallowed allergy, and a
 * `dislikes_food` filed as `immediate` is the interruption budget being spent
 * on nothing, which is how a coach learns to ignore the immediate lane.
 */

import type {
  ChangeRequestReasonCode,
  ChangeRequestUrgency,
  PlanQuestionChangeRequest,
  PlanQuestionCommitment,
  PlanQuestionKind,
  Tier0Verdict,
} from "./contract.ts";
import { IMMEDIATE_URGENCY_REASON_CODES } from "./contract.ts";

function fail(message: string): never {
  throw new Error(`[plan_question/escalation] ${message} (R7: fail loudly)`);
}

/**
 * Question kind -> `contract_change_requests.reason_code`.
 *
 * Deterministic and total: a kind with no mapping throws rather than defaulting
 * to `other`, because `other` is the bucket a coach stops reading.
 */
const REASON_BY_KIND: Record<PlanQuestionKind, ChangeRequestReasonCode> = {
  food_swap: "dislikes_food",
  eating_out: "social_event",
  meal_shifted: "schedule_conflict",
  other: "other",
};

export function reasonCodeForKind(
  kind: PlanQuestionKind,
): ChangeRequestReasonCode {
  const reason = REASON_BY_KIND[kind];
  if (!reason) fail(`no reason_code mapped for question kind ${JSON.stringify(kind)}`);
  return reason;
}

/**
 * The single gate on digest bypass. Both directions are errors, and both are
 * code bugs rather than data problems — hence a throw, not a clamp: a clamp
 * would let an `allergen_violation` quietly become a weekly item.
 */
export function assertUrgencyAllowed(
  reasonCode: ChangeRequestReasonCode,
  urgency: ChangeRequestUrgency,
): void {
  const mayBypass = IMMEDIATE_URGENCY_REASON_CODES.includes(reasonCode);
  if (urgency === "immediate" && !mayBypass) {
    fail(
      `urgency='immediate' is reserved for ${
        IMMEDIATE_URGENCY_REASON_CODES.join(" and ")
      } — reason_code '${reasonCode}' must wait for the digest`,
    );
  }
  if (mayBypass && urgency !== "immediate") {
    fail(
      `reason_code '${reasonCode}' bypasses the digest by contract and must ` +
        `carry urgency='immediate', got '${urgency}'`,
    );
  }
}

/** True iff this row leaves the weekly digest. Derived, never asserted. */
export function bypassesDigest(reasonCode: ChangeRequestReasonCode): boolean {
  return IMMEDIATE_URGENCY_REASON_CODES.includes(reasonCode);
}

export type BuildChangeRequestInput = {
  user_id: string;
  question_kind: PlanQuestionKind;
  verdict: Tier0Verdict;
  commitment: PlanQuestionCommitment | null;
  student_words: string;
  /** BCP-47 of `student_words` (R2). The row stores prose. */
  content_locale: string;
};

/**
 * Build the escalation row for a verdict Tier 0 could not clear.
 *
 * Throws on `decision='allowed'`: an allowed swap escalates nothing, and
 * building a change request for it would put noise in the coach's inbox for
 * every question the system answered correctly.
 */
export function buildChangeRequest(
  input: BuildChangeRequestInput,
): PlanQuestionChangeRequest {
  const userId = String(input.user_id ?? "").trim();
  if (userId === "") fail("user_id is required");
  if (input.verdict.decision === "allowed") {
    fail(
      "buildChangeRequest called on an allowed Tier 0 verdict — a resolved " +
        "swap escalates nothing",
    );
  }

  const isDeny = input.verdict.decision === "denied";
  const reasonCode: ChangeRequestReasonCode = isDeny
    ? "allergen_violation"
    : reasonCodeForKind(input.question_kind);
  const urgency: ChangeRequestUrgency = bypassesDigest(reasonCode)
    ? "immediate"
    : "next_digest";
  assertUrgencyAllowed(reasonCode, urgency);

  const summary = isDeny
    ? "Student asked to substitute a food that a declared safety constraint " +
      "covers. Sophia refused the substitution and did not change anything. " +
      "Please confirm the constraint and the line."
    : `Student asked about the plan (${input.question_kind}) and the request ` +
      `falls outside the substitution latitude on this line ` +
      `(${input.verdict.reason_code}). Sophia did not decide and did not ` +
      "change anything.";

  const evidence: Record<string, unknown> = {
    resolver: "plan_question_tier0",
    question_kind: input.question_kind,
    decision: input.verdict.decision,
    reason_code: input.verdict.reason_code,
    commitment_id: input.commitment?.id ?? null,
    commitment_title: input.commitment?.title ?? null,
    slot_key: input.commitment?.slot_key ?? null,
    autonomy: input.commitment?.autonomy ?? null,
    swap_policy: input.commitment?.swap_policy ?? null,
  };
  if (input.verdict.decision === "denied") {
    evidence.constraint_ref = input.verdict.constraint_ref;
    evidence.constraint_severity = input.verdict.constraint_severity;
    evidence.requested_food_group = input.verdict.requested_food_group;
  } else {
    evidence.prescribed_food_group = input.verdict.prescribed_food_group;
    evidence.requested_food_group = input.verdict.requested_food_group;
    evidence.detail = input.verdict.detail;
  }

  // The draft. Deliberately shaped as a PROPOSAL to a human, not as a patch:
  // there is no column path, no operation verb and no id to apply it to, so
  // there is nothing here an executor could mistake for an instruction.
  const suggestedOption: Record<string, unknown> | null = isDeny
    ? null
    : {
      kind: "coach_review_only",
      applied: false,
      never_auto_applied: true,
      proposal: input.verdict.decision === "escalate" &&
          input.verdict.requested_food_group
        ? `Consider allowing ${input.verdict.requested_food_group} as a ` +
          `substitute on this line, or confirm it stays as prescribed.`
        : "Consider whether this line needs adjusting, or confirm it stays " +
          "as prescribed.",
    };

  const row: PlanQuestionChangeRequest = {
    user_id: userId,
    plan_version_id: input.commitment?.plan_version_id ?? null,
    commitment_id: input.commitment?.id ?? null,
    raised_by: "sophia",
    reason_code: reasonCode,
    student_words: input.student_words.trim() || null,
    sophia_summary: summary,
    sophia_evidence: evidence,
    suggested_option: suggestedOption,
    urgency,
    status: "open",
    coach_decision: null,
    content_locale: input.content_locale,
    bypasses_digest: bypassesDigest(reasonCode),
  };
  assertSuggestedOptionIsDraft(row);
  return row;
}

/**
 * The invariant, checkable by anyone holding the row: it is open, undecided,
 * and its draft carries no applied marker. Called on every build, and called
 * again by the runtime before insert (W4.3 write path).
 */
export function assertSuggestedOptionIsDraft(
  row: PlanQuestionChangeRequest,
): void {
  if (row.status !== "open") {
    fail(`change request must be inserted 'open', got '${row.status}'`);
  }
  if (row.coach_decision !== null) {
    fail("coach_decision must be null: Sophia never decides for the coach");
  }
  const option = row.suggested_option;
  if (option === null) return;
  if (option.applied !== false || option.never_auto_applied !== true) {
    fail(
      "suggested_option must carry applied=false and never_auto_applied=true " +
        "— it is a draft for the coach, never a patch",
    );
  }
}
