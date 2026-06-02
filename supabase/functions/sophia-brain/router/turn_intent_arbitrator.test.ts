import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { arbitrateTurnIntent } from "./turn_intent_arbitrator.ts";

function routeDecision(
  overrides: Partial<RouteDecision> = {},
): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "test",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  };
}

function turnFrame(overrides: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "low", reason_codes: [], evidence: [] },
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
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
    ...overrides,
  };
}

Deno.test("L3 keeps product_help terminal when no structured mutation exists", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "comment distinguer une carte d'attaque d'une carte de défense sans en créer une maintenant ?",
    routeDecision: routeDecision({ response_owner: "normal_reply" }),
    turnFrame: turnFrame({
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "dispatcher_product_question",
          },
        },
      },
    }),
    tempMemory: {
      __active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    },
  });

  assertEquals(result.routeDecision.response_owner, "product_help");
  assertEquals(result.routeDecision.selected_handler, "product_help");
  assertEquals(result.routeDecision.direct_effects_to_run, []);
  assertEquals(result.turnFrame.tool_skill_intents, []);
  assertEquals(result.tempMemory.__active_tool_skill_intake, undefined);
});

Deno.test("L3 runs one-shot reminder only from structured direct effect", () => {
  const result = arbitrateTurnIntent({
    userMessage: "rappelle-moi demain à 9h de prendre le dossier",
    routeDecision: routeDecision(),
    turnFrame: turnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: "dispatcher payload" },
      }],
    }),
    tempMemory: {
      __active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    },
  });

  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(result.routeDecision.direct_effects_to_run, [
    "create_one_shot_reminder",
  ]);
  assertEquals(result.tempMemory.__active_tool_skill_intake, undefined);
});

Deno.test("L3 does not infer attack card from text without structured intent", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "crée-moi une carte d'attaque maintenant, mais le dispatcher n'a pas émis d'intent",
    routeDecision: routeDecision(),
    turnFrame: turnFrame(),
    tempMemory: {},
  });

  assertEquals(result.changed, false);
  assertEquals(result.routeDecision.response_owner, "normal_reply");
  assertEquals(result.routeDecision.direct_effects_to_run, []);
});

Deno.test("L3 routes attack card from structured tool_skill_intents", () => {
  const result = arbitrateTurnIntent({
    userMessage: "crée-moi une carte d'attaque",
    routeDecision: routeDecision({ response_owner: "product_help" }),
    turnFrame: turnFrame({
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        target_hint: "dispatcher target",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    tempMemory: {},
  });

  assertEquals(result.routeDecision.response_owner, "orientation_clarification");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_structured_product_help_operation_conflict",
  );
});
