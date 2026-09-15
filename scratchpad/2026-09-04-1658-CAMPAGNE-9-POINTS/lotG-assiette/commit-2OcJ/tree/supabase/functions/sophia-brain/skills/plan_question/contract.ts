/**
 * `plan_question` — contract (KEEL W4.4).
 *
 * The lane for "can I swap X for Y?", "I'm at a restaurant", "I moved a meal".
 *
 * WHY IT IS NOT `plan_realignment`
 * `plan_realignment` is a DISENGAGEMENT lane: the student has drifted from the
 * plan and wants it changed. `plan_question` is an EXECUTION lane: the student
 * is following the plan right now and hit a concrete fork inside it. Merging
 * them turns a two-second yes into a "go to the plan screen and rewrite your
 * week", which is how a compliant student learns to stop asking.
 *
 * THE SHAPE OF THE ANSWER (BUILD_PLAN W4.4 — "all the ROI is in Tier 0")
 *
 *   TIER 0  deterministic, no model, no latency: the coach already answered
 *           this when they set `autonomy` and `swap_policy` on the line. Both
 *           foods in the same `food_groups.class` under `swap_within_policy`
 *           => yes. `swap_resolver.ts` computes it, and its verdict is
 *           byte-compatible with what the evaluator will grade tonight
 *           (`plan_question_test.ts` pins the parity: a Tier-0 "yes" that the
 *           evaluator later grades `missed` is the failure this lane exists to
 *           prevent).
 *
 *   TIER 1  outside the policy, `autonomy='strict'`, or a hard deny: the AI
 *           does NOT decide. It writes a `contract_change_requests` row with
 *           the student's words, its own summary and its evidence, plus a
 *           `suggested_option` that is A DRAFT AND IS NEVER APPLIED. The coach
 *           decides. Nothing in this skill writes to `plan_commitments`.
 *
 * URGENCY. `allergen_violation` and `restriction_signal` are the ONLY reason
 * codes allowed to bypass the weekly digest (`urgency='immediate'`). Every
 * other escalation waits for the digest. `escalation.ts` enforces this
 * fail-loud rather than trusting a caller.
 */

import type { Autonomy, SwapPolicy } from "../../../_shared/keel/evaluator.ts";

export const PLAN_QUESTION_SKILL_ID = "plan_question" as const;

// ---------------------------------------------------------------------------
// What the student is asking
// ---------------------------------------------------------------------------

export const PLAN_QUESTION_KINDS = [
  /** "can I have rice instead of the potatoes?" — the Tier 0 case. */
  "food_swap",
  /** "I'm at a restaurant tonight" — a context, not a substitution. */
  "eating_out",
  /** "I pushed lunch to 15:00" / "I skipped breakfast, ate at 11:00". */
  "meal_shifted",
  /** Anything else touching the prescription without being one of the above. */
  "other",
] as const;
export type PlanQuestionKind = (typeof PLAN_QUESTION_KINDS)[number];

// ---------------------------------------------------------------------------
// Tier 0 verdict
// ---------------------------------------------------------------------------

export const TIER0_ALLOW_REASONS = [
  /** Not a substitution at all: the student named the prescribed group. */
  "identical_group",
  /** The coach enumerated this substitute explicitly in `swap_policy`. */
  "explicit_allowlist",
  /** Same `food_groups.class`, and the policy allows class equivalence. */
  "class_equivalent",
] as const;
export type Tier0AllowReason = (typeof TIER0_ALLOW_REASONS)[number];

export const TIER0_ESCALATE_REASONS = [
  /** The coach pinned this line: no substitution without their decision. */
  "autonomy_strict",
  /** `swap_within_policy` but the policy does not grant class equivalence. */
  "policy_forbids_class_equivalent",
  /** Different `food_groups.class` — outside anything the coach authorized. */
  "different_class",
  /** A slug did not resolve. Never guessed: degraded, named, escalated. */
  "unresolved_food_group",
  /** The line has no `food_group_ref`: there is nothing to substitute for. */
  "commitment_has_no_food_group",
  /**
   * The student carries a `severity='medical'` constraint this runtime cannot
   * resolve against the food-group vocabulary. Tier 0 then refuses to
   * self-approve ANY substitution — see `allergen_bridge.ts`.
   */
  "unresolvable_medical_constraint",
  /** No commitment could be tied to the question. */
  "commitment_not_identified",
] as const;
export type Tier0EscalateReason = (typeof TIER0_ESCALATE_REASONS)[number];

export type Tier0Verdict =
  | {
    decision: "allowed";
    tier: 0;
    reason_code: Tier0AllowReason;
    swap_applied: boolean;
    prescribed_food_group: string;
    requested_food_group: string;
    matched_class: string | null;
  }
  | {
    decision: "denied";
    tier: 0;
    reason_code: "allergen_violation";
    /**
     * The constraint slug that matched. NEVER rendered to the student when the
     * severity is `medical` (CONTRACT: the post-generation validator rejects
     * any output naming a medical token) — it exists for the coach escalation.
     */
    constraint_ref: string;
    constraint_severity: "medical" | "strict";
    requested_food_group: string;
  }
  | {
    decision: "escalate";
    tier: 0;
    reason_code: Tier0EscalateReason;
    /** Present when the slug resolved; null when it is the reason we escalate. */
    prescribed_food_group: string | null;
    requested_food_group: string | null;
    detail: string | null;
  };

// ---------------------------------------------------------------------------
// The commitment slice Tier 0 needs
// ---------------------------------------------------------------------------

/**
 * R5 FRONTIER. `swap_policy` lives in `plan_commitments.content` jsonb. The
 * evaluator refuses to read jsonb and takes it pre-extracted and typed; this
 * resolver takes it on exactly the same terms, from exactly the same shape
 * (`SwapPolicy` is imported from the evaluator, not redeclared) — so that
 * "yes" today and "met" tonight cannot drift apart through two copies of a
 * type.
 */
export type PlanQuestionCommitment = {
  id: string;
  title: string;
  slot_key: string | null;
  food_group_ref: string | null;
  autonomy: Autonomy;
  swap_policy: SwapPolicy | null;
  plan_version_id: string | null;
};

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

/** `contract_change_requests.reason_code` — the DB enum, verbatim. */
export const CHANGE_REQUEST_REASON_CODES = [
  "too_much_food",
  "not_enough_food",
  "schedule_conflict",
  "dislikes_food",
  "travel",
  "budget",
  "symptom",
  "social_event",
  "allergen_violation",
  "restriction_signal",
  "other",
] as const;
export type ChangeRequestReasonCode =
  (typeof CHANGE_REQUEST_REASON_CODES)[number];

/**
 * The ONLY two reason codes allowed to bypass the weekly digest
 * (SCHEMA, DIALOGUE section). Enforced in `escalation.ts`, not documented and
 * hoped for.
 */
export const IMMEDIATE_URGENCY_REASON_CODES: readonly ChangeRequestReasonCode[] =
  ["allergen_violation", "restriction_signal"];

export type ChangeRequestUrgency = "routine" | "next_digest" | "immediate";

/** The row shape written to `contract_change_requests` by the runtime. */
export type PlanQuestionChangeRequest = {
  user_id: string;
  plan_version_id: string | null;
  commitment_id: string | null;
  raised_by: "sophia";
  reason_code: ChangeRequestReasonCode;
  student_words: string | null;
  sophia_summary: string;
  sophia_evidence: Record<string, unknown>;
  /**
   * A DRAFT. Never applied, by this skill or by the runtime that writes the
   * row. The coach applies it, or does not. `assertSuggestedOptionIsDraft`
   * and `plan_question_test.ts` pin the invariant.
   */
  suggested_option: Record<string, unknown> | null;
  urgency: ChangeRequestUrgency;
  status: "open";
  coach_decision: null;
  content_locale: string;
  /** Derived, mirrored into the diagnosis so the ledger can be read. */
  bypasses_digest: boolean;
};

export type PlanQuestionOutcomeKind =
  /** Tier 0 said yes. Nothing escalates, nothing is written. */
  | "tier0_allowed"
  /** Hard deny (allergen). An immediate escalation is emitted. */
  | "hard_deny"
  /** Outside the policy. A next-digest escalation is emitted. */
  | "escalated";
