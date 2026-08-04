import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "../routers/routers.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t-product-help-guard",
    source_message_id: "m-product-help-guard",
    user_id: "u-product-help-guard",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    needs_research: { detected: false, value: false },
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    ...patch,
  };
}

Deno.test("product_help signal owns product questions without launching tool flow", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        product_help: {
          detected: true,
          confidence_band: "high",
          reason: "product_question",
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "product_help");
  assertEquals(decision.selected_handler, "product_help");
  assertEquals(decision.direct_effects_to_run, []);
});

Deno.test("safety stays above product_help and direct effects", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      safety: {
        risk_band: "critical",
        reason_codes: ["self_harm"],
        evidence: ["danger immediat"],
      },
      skill_signals: {
        product_help: {
          detected: true,
          confidence_band: "high",
          reason: "product_question",
        },
      },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: "demain 9h" },
      }],
    }),
    safety_context_risk_band: "critical",
  });

  assertEquals(decision.response_owner, "safety");
  assertEquals(decision.selected_handler, "safety_crisis");
  // P5-A (paul-p4verify T12) — recalibrage volontaire : à high/critical le
  // rappel n'est plus servi (carve-out V5-1 fermé), il est BLOQUÉ à la route
  // et différé honnêtement par la lane (safety_crisis_deferred).
  assertEquals(decision.direct_effects_to_run, []);
  assertEquals(
    decision.blocked_paths.some((path) =>
      path.path === "direct_effects.create_one_shot_reminder" &&
      path.reason_code === "safety_priority"
    ),
    true,
  );
});

Deno.test("direct effects remain limited to reminder and plan progress", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      direct_effects: [
        {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { raw_text: "demain 9h" },
        },
        {
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { plan_item_id: "plan-1", status_hint: "done" },
        },
        {
          effect_type: "platform",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        } as any,
      ],
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(decision.direct_effects_to_run, [
    "create_one_shot_reminder",
    "track_progress_plan_item",
  ]);
});
