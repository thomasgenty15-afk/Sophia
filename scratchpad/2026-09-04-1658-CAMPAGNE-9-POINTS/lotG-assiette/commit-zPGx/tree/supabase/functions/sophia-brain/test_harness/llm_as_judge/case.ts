/**
 * KEEL judge — the CASE.
 *
 * A case is one assistant turn plus everything needed to decide whether that
 * turn was allowed to say what it said. The shape is chosen so that the judge
 * NEVER has to guess ground truth:
 *
 *  - `committed_effects` is the effect ledger after the turn. Empty means
 *    nothing was written. This is what makes `honesty` decidable rather than
 *    stylistic: "was there a row?" is a lookup, not an impression.
 *  - `plan_context` is what the coach wrote. `non_prescription` is decided by
 *    set membership against it.
 *  - `restriction_flag` is the DETERMINISTIC guard's output, supplied, never
 *    re-derived by the judge. The model does not get a vote on the clinical
 *    floor; it only judges what the assistant said once the floor had spoken.
 *
 * `expectation` and `expected_failing_rubrics` are how the harness measures the
 * JUDGE. A judge that passes everything is worthless, and the only way to know
 * is to hand it turns that must fail and check that it says so, on the right
 * rubric. Negative cases are not optional decoration here — `scenarios_test.ts`
 * asserts every scenario ships at least one.
 */

import type { RubricId } from "./rubrics/index.ts";

export const JUDGE_CHANNELS = ["whatsapp", "web"] as const;
export type JudgeChannel = (typeof JUDGE_CHANNELS)[number];

export const CASE_EXPECTATIONS = ["should_pass", "should_fail"] as const;
export type CaseExpectation = (typeof CASE_EXPECTATIONS)[number];

/** One line of the coach's published plan, reduced to what a judge can check. */
export type CasePlanCommitment = {
  commitment_id: string;
  /** Verbatim `plan_commitments.title`. */
  title: string;
  /** Human-readable target as the coach wrote it, or null for a binary line. */
  target: string | null;
  slot_key: string | null;
  scheduled_days: readonly string[] | null;
  priority: "core" | "secondary" | "optional";
};

export type CasePlanContext = {
  coach_display_name: string;
  commitments: readonly CasePlanCommitment[];
  /** Unscored `plan_guidance`, verbatim coach prose. */
  guidance: readonly string[];
};

/**
 * One row of the effect ledger. `committed: false` is a REQUESTED-then-blocked
 * effect: it exists in the ledger and must still not be acknowledged as done.
 */
export type CaseCommittedEffect = {
  effect_type: string;
  /** What the row points at — a commitment title, a date, a slot. */
  target: string;
  committed: boolean;
};

export type CaseTurn = {
  role: "student" | "coach" | "assistant";
  content: string;
};

export type JudgeCase = {
  case_id: string;
  scenario_id: string;
  persona_id: string;
  channel: JudgeChannel;
  /** Output of `_shared/keel/restriction_guard.ts` for this student, supplied. */
  restriction_flag: boolean;
  restriction_trigger_codes: readonly string[];
  plan_context: CasePlanContext;
  /** Facts the assistant was entitled to rely on. Anything else is confabulation. */
  known_state: readonly string[];
  /** Ends on the assistant turn under judgment. */
  transcript: readonly CaseTurn[];
  /** Effects committed by the FINAL assistant turn. Empty = nothing written. */
  committed_effects: readonly CaseCommittedEffect[];
  expectation: CaseExpectation;
  /** Non-empty iff `expectation === "should_fail"`. */
  expected_failing_rubrics: readonly RubricId[];
  /** Why this case exists, one sentence. Read by humans reviewing a red run. */
  note: string;
};

/** The assistant turn under judgment — the last one. R7: absent throws. */
export function finalAssistantTurn(judgeCase: JudgeCase): string {
  for (let i = judgeCase.transcript.length - 1; i >= 0; i -= 1) {
    if (judgeCase.transcript[i].role === "assistant") {
      return judgeCase.transcript[i].content;
    }
  }
  throw new Error(
    `[keel/judge] case ${judgeCase.case_id} has no assistant turn to judge`,
  );
}

/**
 * Structural validation, run on every case before it reaches a model.
 *
 * Cheap, and it catches the failure mode that makes a harness lie: a
 * `should_fail` case with no expected rubric passes trivially, and a
 * `should_pass` case with expected failures can never pass. Both are silent
 * green today and meaningless forever after.
 */
export function assertValidCase(judgeCase: JudgeCase): void {
  const fail = (msg: string): never => {
    throw new Error(`[keel/judge] case ${judgeCase.case_id}: ${msg}`);
  };
  if (!judgeCase.case_id.trim()) fail("empty case_id");
  if (!judgeCase.transcript.length) fail("empty transcript");
  finalAssistantTurn(judgeCase);
  if (
    judgeCase.expectation === "should_fail" &&
    judgeCase.expected_failing_rubrics.length === 0
  ) {
    fail(
      "expectation=should_fail with no expected_failing_rubrics — such a case " +
        "can be 'caught' by any verdict at all and measures nothing",
    );
  }
  if (
    judgeCase.expectation === "should_pass" &&
    judgeCase.expected_failing_rubrics.length > 0
  ) {
    fail("expectation=should_pass must not list expected_failing_rubrics");
  }
  if (!judgeCase.restriction_flag && judgeCase.restriction_trigger_codes.length > 0) {
    fail("restriction_trigger_codes present while restriction_flag is false");
  }
  if (judgeCase.restriction_flag && judgeCase.restriction_trigger_codes.length === 0) {
    fail(
      "restriction_flag raised with no trigger code — the guard never raises a " +
        "bare flag, so neither may a case",
    );
  }
  if (!(JUDGE_CHANNELS as readonly string[]).includes(judgeCase.channel)) {
    fail(`unknown channel ${JSON.stringify(judgeCase.channel)}`);
  }
}
