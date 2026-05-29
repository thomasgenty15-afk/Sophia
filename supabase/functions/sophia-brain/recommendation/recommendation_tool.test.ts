import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { loadProductSurfaceRegistry } from "../product_surface_registry/registry.ts";
import { runRecommendationOrchestrator } from "./recommendation_orchestrator.ts";
import { runRecommendationTool } from "./recommendation_tool.ts";
import type { RecommendationToolInput } from "./recommendation_types.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-rec",
    source_message_id: "message-rec",
    user_id: "user-rec",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "none",
      operation_type: null,
      surface_id: null,
      confidence_band: "low",
      should_offer: false,
      prop_reason: null,
      source_span: null,
      target_hint: null,
      target_status: "none",
      suggested_question_intent: null,
      offer_timing: "never",
      must_not_execute: true,
    },
    skill_signals: {},
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

function skillOutput(
  patch: Partial<ConversationSkillOutput>,
): ConversationSkillOutput {
  return {
    skill_id: "execution_breakdown",
    status: "continue",
    response_intent: "diagnose_blocker",
    diagnosis: {},
    recommendation_need: {
      needed: true,
      type: "execution_repair",
      urgency: "medium",
      constraints: [],
    },
    memory_trace: {
      memory_used_for_response: false,
      memory_item_ids_used: [],
      correction_detected: false,
      correction_target_item_ids: [],
    },
    ...patch,
  };
}

async function input(
  patch: Partial<RecommendationToolInput> = {},
): Promise<RecommendationToolInput> {
  const registry = await loadProductSurfaceRegistry();
  return {
    user_id: "user-rec",
    channel: "whatsapp",
    current_skill_id: "execution_breakdown",
    skill_output: skillOutput({ diagnosis: { plan_item_id: "item-1" } }),
    turn_frame: frame(),
    memory_payload: {},
    plan_items: [{
      id: "item-1",
      title: "Faire le sas de déchargement",
      status: "active",
      item_type: "habit",
      dimension: "habits",
    }],
    available_surfaces: registry.surfaces,
    recent_recommendations: [],
    safety_pregate_risk_band: "none",
    ...patch,
  };
}

Deno.test("recommendation_tool covers recommend, operations, clarification, defer and blocked paths", async () => {
  let llmCalls = 0;
  const cases = [
    {
      name: "safety-block-no-llm",
      patch: {
        safety_pregate_risk_band: "medium" as const,
        llm_runner: async () => {
          llmCalls++;
          return {};
        },
      },
      expected: "blocked",
      llmDelta: 0,
    },
    {
      name: "state-regulation",
      patch: {
        skill_output: skillOutput({
          skill_id: "emotional_repair",
          recommendation_need: {
            needed: true,
            type: "state_regulation",
            urgency: "medium",
            constraints: [],
          },
        }),
      },
      expected: "recommend_operation",
      operation: "select_state_potion",
    },
    {
      name: "high-emotion-prefers-potion",
      patch: {
        skill_output: skillOutput({
          recommendation_need: {
            needed: true,
            type: "execution_repair",
            urgency: "high",
            constraints: ["high_emotion"],
          },
          diagnosis: { emotional_state: "shame high" },
        }),
      },
      expected: "recommend_operation",
      operation: "select_state_potion",
    },
    {
      name: "execution-repair-attack-card",
      patch: {},
      expected: "recommend_operation",
      operation: "prepare_attack_card",
    },
    {
      name: "motivation-repair-owned-by-skill",
      patch: {
        skill_output: skillOutput({
          skill_id: "demotivation_repair",
          diagnosis: { plan_item_id: "item-1" },
          recommendation_need: {
            needed: true,
            type: "motivation_repair",
            urgency: "low",
            constraints: ["prefer_attack_card_over_plan_edit"],
          },
        }),
      },
      expected: "defer",
    },
    {
      name: "no-opportunity-defer",
      patch: {
        skill_output: skillOutput({
          recommendation_need: {
            needed: false,
            type: "none",
            urgency: "none",
            constraints: [],
          },
        }),
      },
      expected: "defer",
    },
    {
      name: "cooldown-applied",
      patch: {
        recent_recommendations: [{
          surface_or_operation: "attack_card",
          user_response: "unknown",
          cooldown_active: true,
        }],
      },
      expected: "defer",
    },
    {
      name: "recent-decline-applied",
      patch: {
        recent_recommendations: [{
          surface_or_operation: "attack_card",
          user_response: "declined",
        }],
      },
      expected: "defer",
    },
    {
      name: "product-help-signal-recommend",
      patch: {
        skill_output: undefined,
        turn_frame: frame({
          skill_signals: {
            entry: {
              product_help: {
                detected: true,
                confidence_band: "high",
                reason: "product_question",
              },
            },
          },
        }),
      },
      expected: "recommend",
    },
    {
      name: "llm-recommendation-used",
      patch: {
        llm_runner: async () => {
          llmCalls++;
          return {
            decision: "ask_clarification",
            confidence: 0.66,
            timing: "watch",
            presentation_level: 1,
            cta_style: "soft",
            requires_consent: false,
            reason: "llm_needs_target",
            alternatives: [],
            do_not_recommend: [],
          };
        },
      },
      expected: "ask_clarification",
      llmDelta: 1,
    },
  ];
  assertEquals(cases.length, 10);
  for (const testCase of cases) {
    const before = llmCalls;
    const recommendation = await runRecommendationTool(
      await input(testCase.patch),
    );
    assertEquals(recommendation.decision, testCase.expected, testCase.name);
    if (testCase.operation) {
      assertEquals(recommendation.operation_type, testCase.operation);
    }
    if (testCase.llmDelta !== undefined) {
      assertEquals(llmCalls - before, testCase.llmDelta, testCase.name);
    }
  }
});

Deno.test("recommendation_orchestrator applies timing and presentation gates", async () => {
  const recommendation = await runRecommendationTool(await input());
  const cases = [
    {
      name: "present-now",
      current_skill_output: skillOutput({}),
      presentation_state: {},
      expected: "present_now",
    },
    {
      name: "safety-drop",
      current_skill_output: skillOutput({ skill_id: "safety_crisis" }),
      presentation_state: {},
      expected: "drop",
    },
    {
      name: "emotion-high-drop",
      current_skill_output: skillOutput({
        recommendation_need: {
          needed: true,
          type: "execution_repair",
          urgency: "high",
          constraints: [],
        },
      }),
      presentation_state: {},
      expected: "drop",
    },
    {
      name: "cooldown-defer",
      current_skill_output: skillOutput({}),
      presentation_state: { cooldowns: { attack_card: true } },
      expected: "defer",
    },
    {
      name: "recent-decline-drop",
      current_skill_output: skillOutput({}),
      presentation_state: { recent_declines: ["attack_card"] },
      expected: "drop",
    },
    {
      name: "lower-level-drop",
      current_skill_output: skillOutput({}),
      presentation_state: { current_presentation_level: 4 },
      expected: "drop",
    },
    {
      name: "blocked-drop",
      recommendation: { ...recommendation, decision: "blocked" as const },
      current_skill_output: skillOutput({}),
      presentation_state: {},
      expected: "drop",
    },
    {
      name: "deferred-defer",
      recommendation: { ...recommendation, decision: "defer" as const },
      current_skill_output: skillOutput({}),
      presentation_state: {},
      expected: "defer",
    },
    {
      name: "clarification-defer",
      recommendation: {
        ...recommendation,
        decision: "ask_clarification" as const,
      },
      current_skill_output: skillOutput({}),
      presentation_state: {},
      expected: "defer",
    },
    {
      name: "zero-level-drop",
      recommendation: { ...recommendation, presentation_level: 0 as const },
      current_skill_output: skillOutput({}),
      presentation_state: {},
      expected: "drop",
    },
  ];
  assertEquals(cases.length, 10);
  for (const testCase of cases) {
    const result = await runRecommendationOrchestrator({
      recommendation: testCase.recommendation ?? recommendation,
      current_skill_output: testCase.current_skill_output,
      presentation_state: testCase.presentation_state,
    });
    assertEquals(result.decision, testCase.expected, testCase.name);
  }
});

Deno.test("recommendation_tool integrates with orchestrator", async () => {
  const recommendation = await runRecommendationTool(await input());
  const presentation = await runRecommendationOrchestrator({
    recommendation,
    current_skill_output: skillOutput({}),
    presentation_state: {},
  });
  assertEquals(recommendation.decision, "recommend_operation");
  assertEquals(presentation.decision, "present_now");
  assertEquals(presentation.presentation_payload?.requires_consent, true);
});
