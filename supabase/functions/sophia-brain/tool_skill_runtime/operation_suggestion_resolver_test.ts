import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { buildProductSurfaceRegistry } from "../product_surface_registry/registry.ts";
import { PRODUCT_SURFACE_DEFINITIONS } from "../product_surface_registry/surfaces_data.ts";
import { evaluateOperationSuggestionAccess } from "./operation_access_policy.ts";
import { resolveSkillOperationSuggestion } from "./operation_suggestion_resolver.ts";

const surfaces = buildProductSurfaceRegistry([...PRODUCT_SURFACE_DEFINITIONS])
  .surfaces;

function frame(risk: TurnFrame["safety"]["risk_band"] = "low"): TurnFrame {
  return {
    turn_id: "turn",
    source_message_id: "message",
    user_id: "user",
    channel: "whatsapp",
    safety: { risk_band: risk, reason_codes: [], evidence: [] },
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
      memory_mode: "none",
      context_need: "minimal",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  };
}

function skillOutput(
  patch: Partial<ConversationSkillOutput>,
): ConversationSkillOutput {
  return {
    skill_id: "demotivation_repair",
    status: "continue",
    response_intent: "test",
    memory_trace: {
      memory_used_for_response: false,
      memory_item_ids_used: [],
      correction_detected: false,
      correction_target_item_ids: [],
    },
    ...patch,
  };
}

Deno.test("operation suggestion access allows demotivation attack card", () => {
  const decision = evaluateOperationSuggestionAccess({
    skill_id: "demotivation_repair",
    safety_risk_band: "low",
    suggestion: {
      operation_type: "prepare_attack_card",
      reason: "clear_execution_block",
      confidence_band: "medium",
      urgency: "medium",
      source_skill_id: "demotivation_repair",
      requires_user_consent: true,
    },
  });

  assertEquals(decision.allowed, true);
  if (decision.allowed) {
    assertEquals(decision.surface_id, "attack_card");
    assertEquals(decision.chat_runtime_ready, true);
  }
});

Deno.test("operation suggestion access allows demotivation owned operations", () => {
  for (
    const operationType of [
      "prepare_attack_card",
      "prepare_defense_card",
      "adjust_plan_item",
      "select_state_potion",
      "create_recurring_reminder",
    ] as const
  ) {
    const decision = evaluateOperationSuggestionAccess({
      skill_id: "demotivation_repair",
      safety_risk_band: "low",
      suggestion: {
        operation_type: operationType,
        reason: "demotivation_repair_structured_decision",
        confidence_band: "medium",
        urgency: "medium",
        source_skill_id: "demotivation_repair",
        requires_user_consent: true,
      },
    });

    assertEquals(decision.allowed, true);
    if (decision.allowed) {
      assertEquals(
        decision.chat_runtime_ready,
        operationType !== "select_state_potion",
      );
    }
  }
});

Deno.test("operation suggestion access blocks disallowed skill operation", () => {
  const decision = evaluateOperationSuggestionAccess({
    skill_id: "safety_crisis",
    safety_risk_band: "low",
    suggestion: {
      operation_type: "adjust_plan_item",
      reason: "bad_route",
      confidence_band: "medium",
      urgency: "medium",
      source_skill_id: "safety_crisis",
      requires_user_consent: true,
    },
  });

  assertEquals(decision.allowed, false);
  if (!decision.allowed) {
    assertEquals(decision.reason_code, "tool_not_allowed_for_skill");
  }
});

Deno.test("operation suggestion access blocks safety medium", () => {
  const decision = evaluateOperationSuggestionAccess({
    skill_id: "demotivation_repair",
    safety_risk_band: "medium",
    suggestion: {
      operation_type: "prepare_attack_card",
      reason: "clear_execution_block",
      confidence_band: "medium",
      urgency: "medium",
      source_skill_id: "demotivation_repair",
      requires_user_consent: true,
    },
  });

  assertEquals(decision.allowed, false);
  if (!decision.allowed) {
    assertEquals(decision.reason_code, "safety_blocks_tool_suggestion");
  }
});

Deno.test("resolver converts supported skill suggestion to consented recommendation", () => {
  const resolution = resolveSkillOperationSuggestion({
    turn_frame: frame(),
    available_surfaces: surfaces,
    request_id: "req",
    skill_output: skillOutput({
      operation_suggestions: [{
        operation_type: "prepare_attack_card",
        reason: "clear_execution_block",
        confidence_band: "medium",
        urgency: "medium",
        source_skill_id: "demotivation_repair",
        operation_input_hint: {
          target: {
            kind: "plan_item",
            plan_item_id: "walk",
            title: "Faire une marche",
          },
        },
        requires_user_consent: true,
      }],
    }),
  });

  assertEquals(resolution.recommendation?.decision, "recommend_operation");
  assertEquals(
    resolution.recommendation?.operation_type,
    "prepare_attack_card",
  );
  assertEquals(resolution.recommendation?.requires_consent, true);
  assertEquals(resolution.blocked_suggestions, []);
});

Deno.test("resolver exposes consented potion suggestion", () => {
  const resolution = resolveSkillOperationSuggestion({
    turn_frame: frame(),
    available_surfaces: surfaces,
    request_id: "req",
    skill_output: skillOutput({
      skill_id: "emotional_repair",
      operation_suggestions: [{
        operation_type: "select_state_potion",
        reason: "state_regulation",
        confidence_band: "medium",
        urgency: "medium",
        source_skill_id: "emotional_repair",
        operation_input_hint: {
          potion_type: "guerison",
          state: {
            kind: "shame_guilt",
            intensity: "medium",
            evidence: ["honte redescendue"],
          },
          context: {
            handoff_summary:
              "Le user a clarifie que la honte vient d'un episode recent et cherche un soutien doux pour reparer sans s'enfoncer.",
            topic_hint: "episode recent",
          },
        },
        requires_user_consent: true,
      }],
    }),
  });

  assertEquals(resolution.recommendation?.decision, "recommend_operation");
  assertEquals(
    resolution.recommendation?.operation_type,
    "select_state_potion",
  );
  assertEquals(resolution.recommendation?.executor_tool_id, null);
  assertEquals(resolution.recommendation?.requires_consent, true);
  assertEquals(
    (resolution.recommendation?.operation_input as any)?.context
      ?.handoff_summary,
    "Le user a clarifie que la honte vient d'un episode recent et cherche un soutien doux pour reparer sans s'enfoncer.",
  );
  assertEquals(resolution.blocked_suggestions, []);
});
