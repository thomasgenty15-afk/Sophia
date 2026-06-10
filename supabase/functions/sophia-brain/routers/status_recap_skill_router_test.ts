import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runSkillRouter } from "./skill_router.ts";

function frame(skillSignals: TurnFrame["skill_signals"]): TurnFrame {
  return {
    turn_id: "turn-status",
    source_message_id: "msg-status",
    user_id: "user-status",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    conversation_risk: {
      score: 0,
      threshold: 8,
      should_exit_flows: false,
      reason_codes: [],
      previous_scores: [],
      matrix: [],
      context_summary: null,
    },
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    skill_signals: skillSignals,
    memory_plan: {
      response_intent: "status_recap",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.8,
    },
  };
}

Deno.test("skill_router prefers status_recap over product_help when both entry signals exist", () => {
  const decision = runSkillRouter({
    turn_frame: frame({
      entry: {
        product_help: {
          detected: true,
          confidence_band: "high",
          reason: "surface mentioned",
        },
        status_recap: {
          detected: true,
          confidence_band: "high",
          reason: "user asks factual state",
        },
      },
    }),
  });

  assertEquals(decision.status, "start");
  assertEquals(decision.selected_skill_id, "status_recap");
});
