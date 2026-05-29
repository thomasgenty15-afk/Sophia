import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  assertConfirmationCanExecute,
  buildConfirmationDecisionFromSkillReview,
  decideConfirmation,
  type PendingConfirmationSnapshot,
} from "./confirmation_contract.ts";

const pending = (
  patch: Partial<PendingConfirmationSnapshot> = {},
): PendingConfirmationSnapshot => ({
  operation_id: "op-1",
  operation_type: "update_coach_preferences",
  effect_type: "coach_preferences.update",
  summary: "garder une preference coach",
  ...patch,
});

Deno.test("confirmation_contract: skill approve + pending compatible => executable", () => {
  const decision = buildConfirmationDecisionFromSkillReview({
    pending: pending(),
    review: {
      decision: "approve",
      confidence: "high",
      evidence: ["skill draft_validation approved pending draft"],
    },
  });
  assertEquals(decision.decision, "approve");
  assertEquals(decision.pending_operation_id, "op-1");
  assertEquals(decision.pending_operation_type, "update_coach_preferences");
  assertEquals(decision.applies_to_pending, true);
  assertEquals(decision.applies_to_pending_effect, true);
  assertEquals(decision.should_execute, true);
  assertEquals(assertConfirmationCanExecute(decision), { ok: true });
});

Deno.test("confirmation_contract: low confidence approve is not executable", () => {
  const decision = buildConfirmationDecisionFromSkillReview({
    pending: pending(),
    review: {
      decision: "approve",
      confidence: "low",
      evidence: ["skill was unsure"],
    },
  });
  assertEquals(decision.decision, "approve");
  assertEquals(decision.should_execute, false);
  assertEquals(assertConfirmationCanExecute(decision), {
    ok: false,
    reason_code: "confirmation_confidence_low",
  });
});

Deno.test("confirmation_contract: revise never executes", () => {
  const decision = buildConfirmationDecisionFromSkillReview({
    pending: pending(),
    review: {
      decision: "revise",
      confidence: "high",
      evidence: ["skill detected correction"],
    },
  });
  assertEquals(decision.decision, "revise");
  assertEquals(decision.should_revise, true);
  assertEquals(decision.should_execute, false);
});

Deno.test("confirmation_contract: reject clears pending but never executes", () => {
  const decision = buildConfirmationDecisionFromSkillReview({
    pending: pending({ operation_type: "prepare_attack_card" }),
    review: {
      decision: "reject",
      confidence: "high",
      evidence: ["skill detected rejection"],
    },
  });
  assertEquals(decision.decision, "reject");
  assertEquals(decision.should_clear_pending, true);
  assertEquals(decision.should_execute, false);
});

Deno.test("confirmation_contract: explain/status are non-mutating", () => {
  for (const reviewDecision of ["explain", "status"] as const) {
    const decision = buildConfirmationDecisionFromSkillReview({
      pending: pending(),
      review: {
        decision: reviewDecision,
        confidence: "high",
        evidence: [`skill detected ${reviewDecision}`],
      },
    });
    assertEquals(decision.decision, "explain");
    assertEquals(decision.should_explain, true);
    assertEquals(decision.should_execute, false);
  }
});

Deno.test("confirmation_contract: topic_change never executes", () => {
  const decision = buildConfirmationDecisionFromSkillReview({
    pending: pending(),
    review: {
      decision: "topic_change",
      confidence: "medium",
      evidence: ["skill detected topic change"],
    },
  });
  assertEquals(decision.decision, "topic_change");
  assertEquals(decision.target, null);
  assertEquals(decision.should_execute, false);
});

Deno.test("confirmation_contract: unclear remains unclear", () => {
  const decision = buildConfirmationDecisionFromSkillReview({
    pending: pending(),
    review: {
      decision: "unclear",
      confidence: "medium",
      evidence: ["skill could not classify"],
    },
  });
  assertEquals(decision.decision, "unclear");
  assertEquals(decision.should_execute, false);
});

Deno.test("confirmation_contract: missing review is unclear", () => {
  const decision = buildConfirmationDecisionFromSkillReview({
    pending: pending(),
    review: null,
  });
  assertEquals(decision.decision, "unclear");
  assertEquals(decision.should_execute, false);
});

Deno.test("confirmation_contract: deprecated global classifier never executes", () => {
  const decision = decideConfirmation({
    message: "oui",
    pending: pending(),
  } as never);
  assertEquals(decision.decision, "unclear");
  assertEquals(decision.should_execute, false);
  assertEquals(decision.reason_code, "global_confirmation_classifier_disabled");
});
