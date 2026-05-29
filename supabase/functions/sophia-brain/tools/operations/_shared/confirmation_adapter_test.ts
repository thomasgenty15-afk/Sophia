import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { buildToolConfirmationDecision } from "./confirmation_adapter.ts";

function turnFrame(
  patch: Partial<TurnFrame> = {},
): TurnFrame {
  return {
    turn_id: "turn-1",
    source_message_id: "msg-1",
    user_id: "user-1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    conversation_skill_intents: [],
    memory_plan: null,
    research_signal: null,
    response_contract: null,
    ...patch,
  } as TurnFrame;
}

const pending = {
  operation_id: "op-1",
  operation_type: "prepare_defense_card",
  draft: { operation_type: "prepare_defense_card" },
  summary: "defense draft",
};

Deno.test("confirmation_adapter: approve_requires_pending", () => {
  const decision = buildToolConfirmationDecision({
    user_message: "ok",
    turn_frame: turnFrame({
      confirmation_response: { kind: "yes", confidence_band: "high" },
    }),
    pending_confirmation: pending,
    operation_type: "prepare_defense_card",
  });
  assertEquals(decision.decision, "approve");
  assertEquals(decision.applies_to_pending, true);
  assertEquals(decision.executable, true);
});

Deno.test("confirmation_adapter: approve_low_confidence_not_executable", () => {
  const decision = buildToolConfirmationDecision({
    user_message: "peut-être",
    turn_frame: turnFrame({
      confirmation_response: { kind: "yes", confidence_band: "low" },
    }),
    pending_confirmation: pending,
    operation_type: "prepare_defense_card",
  });
  assertEquals(decision.decision, "approve");
  assertEquals(decision.executable, false);
});

Deno.test("confirmation_adapter: non-approve decisions never execute", () => {
  for (
    const [kind, expected] of [
      ["correction_to_pending", "revise"],
      ["no", "reject"],
      ["topic_change", "topic_change"],
      ["unknown", "unclear"],
    ] as const
  ) {
    const decision = buildToolConfirmationDecision({
      user_message: kind,
      turn_frame: turnFrame({
        confirmation_response: { kind, confidence_band: "high" },
      }),
      pending_confirmation: pending,
      operation_type: "prepare_defense_card",
    });
    assertEquals(decision.decision, expected);
    assertEquals(decision.executable, false);
  }
});

Deno.test("confirmation_adapter: safety_blocks_confirmation", () => {
  const decision = buildToolConfirmationDecision({
    user_message: "ok",
    turn_frame: turnFrame({
      safety: { risk_band: "high", reason_codes: ["risk"], evidence: [] },
      confirmation_response: { kind: "yes", confidence_band: "high" },
    }),
    pending_confirmation: pending,
    operation_type: "prepare_defense_card",
  });
  assertEquals(decision.executable, false);
  assertEquals(decision.blocked_by.includes("safety_blocks_confirmation"), true);
});

Deno.test("confirmation_adapter: no_tool_blocks_confirmation", () => {
  const decision = buildToolConfirmationDecision({
    user_message: "pas d'outil finalement",
    turn_frame: turnFrame({
      confirmation_response: { kind: "yes", confidence_band: "high" },
    }),
    pending_confirmation: pending,
    operation_type: "prepare_defense_card",
    no_tool_requested: true,
  });
  assertEquals(decision.executable, false);
  assertEquals(decision.blocked_by.includes("no_tool_blocks_confirmation"), true);
});

Deno.test("confirmation_adapter: local_review_fallback_normalized", () => {
  const decision = buildToolConfirmationDecision({
    user_message: "explique",
    turn_frame: turnFrame(),
    pending_confirmation: pending,
    operation_type: "prepare_defense_card",
    local_review: {
      decision: "explain",
      confidence: "high",
      evidence: ["local draft_validation"],
    },
  });
  assertEquals(decision.source, "local_review");
  assertEquals(decision.legacy_local_review_used, true);
  assertEquals(decision.decision, "explain");
  assertEquals(decision.executable, false);
});

Deno.test("confirmation_adapter: turn_frame_confirmation_preferred_over_legacy_local", () => {
  const decision = buildToolConfirmationDecision({
    user_message: "ok",
    turn_frame: turnFrame({
      confirmation_response: { kind: "yes", confidence_band: "high" },
    }),
    pending_confirmation: pending,
    operation_type: "prepare_defense_card",
    local_review: { decision: "reject", confidence: "high" },
  });
  assertEquals(decision.source, "turn_frame");
  assertEquals(decision.legacy_local_review_used, false);
  assertEquals(decision.decision, "approve");
  assertEquals(decision.executable, true);
});
