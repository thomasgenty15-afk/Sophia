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

  assertEquals(
    result.routeDecision.response_owner,
    "orientation_clarification",
  );
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_structured_product_help_operation_conflict",
  );
});

Deno.test("L3 asks clarification when attack and defense card intents compete", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "je ne sais pas si je dois faire une carte d'attaque ou de défense",
    routeDecision: routeDecision({ response_owner: "normal_reply" }),
    turnFrame: turnFrame({
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        target_hint: "mails du soir",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }, {
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        target_hint: "YouTube après les mails",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    tempMemory: {},
  });

  assertEquals(
    result.routeDecision.response_owner,
    "orientation_clarification",
  );
  assertEquals(
    result.routeDecision.selected_handler,
    "orientation_clarification",
  );
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_attack_defense_card_ambiguity",
  );
  assertEquals(
    result.turnFrame.tool_skill_intents.map((intent) => intent.operation_type),
    ["prepare_attack_card", "prepare_defense_card"],
  );
  assertEquals(result.routeDecision.direct_effects_to_run, []);
});

Deno.test("L3 keeps active prepare_defense_card owner for local exit decision", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "En fait je veux plutôt une carte d'attaque pour me lancer demain",
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
      reason_code: "tool_skill_intent_start",
    }),
    turnFrame: turnFrame({
      skill_signals: {
        entry: {},
        lifecycle: {},
        exit: {
          prepare_defense_card: {
            detected: true,
            confidence_band: "high",
            reason: "user switches owner",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        target_hint: "me lancer demain",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "handoff_delivered",
      },
    },
  });

  assertEquals(result.routeDecision.response_owner, "tool_skill");
  assertEquals(result.routeDecision.selected_handler, "prepare_defense_card");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_active_tool_local_exit_required",
  );
  assertEquals(
    result.tempMemory.__active_tool_skill_intake?.operation_type,
    "prepare_defense_card",
  );
  assertEquals(
    result.turnFrame.tool_skill_intents.map((intent) => intent.operation_type),
    ["prepare_attack_card"],
  );
});

Deno.test("L3 keeps active prepare_defense_card owner from dedicated handoff key", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "En fait je veux plutôt une carte d'attaque pour me lancer demain",
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
      reason_code: "tool_skill_intent_start",
    }),
    turnFrame: turnFrame({
      skill_signals: {
        entry: {},
        lifecycle: {},
        exit: {
          prepare_defense_card: {
            detected: true,
            confidence_band: "high",
            reason: "user switches owner",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        target_hint: "me lancer demain",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    tempMemory: {
      __active_defense_card_handoff: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "handoff_delivered",
        no_chat_mutation: true,
      },
    },
  });

  assertEquals(result.routeDecision.response_owner, "tool_skill");
  assertEquals(result.routeDecision.selected_handler, "prepare_defense_card");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_active_tool_local_exit_required",
  );
  assertEquals(
    result.tempMemory.__active_defense_card_handoff?.operation_type,
    "prepare_defense_card",
  );
  assertEquals(
    result.turnFrame.tool_skill_intents.map((intent) => intent.operation_type),
    ["prepare_attack_card"],
  );
});

Deno.test("L3 does not clear active prepare_defense_card when route already owns it", () => {
  const result = arbitrateTurnIntent({
    userMessage: "laisse tomber cette carte",
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      reason_code: "active_prepare_defense_card_local_dispatcher",
    }),
    turnFrame: turnFrame({
      skill_signals: {
        entry: {},
        lifecycle: {},
        exit: {
          prepare_defense_card: {
            detected: true,
            confidence_band: "high",
            reason: "user stops active flow",
          },
        },
      },
    }),
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "collecting",
      },
    },
  });

  assertEquals(result.routeDecision.selected_handler, "prepare_defense_card");
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_active_tool_local_exit_required",
  );
  assertEquals(
    result.tempMemory.__active_tool_skill_intake?.operation_type,
    "prepare_defense_card",
  );
});

Deno.test("L3 product help rewrite clears all local tool ownership keys", () => {
  const result = arbitrateTurnIntent({
    userMessage: "où est-ce que je retrouve cette fonctionnalité ?",
    routeDecision: routeDecision({
      response_owner: "normal_reply",
      reason_code: "normal_reply_before_l3_product_help",
    }),
    turnFrame: turnFrame({
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "product question",
          },
        },
        lifecycle: {},
        exit: {},
      },
    }),
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_attack_card",
      },
      __active_attack_card_handoff: {
        operation_type: "prepare_attack_card",
        mode: "platform_handoff",
        no_chat_mutation: true,
      },
      __active_defense_card_handoff: {
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        no_chat_mutation: true,
      },
      __recurring_reminder_handoff_state: {
        operation_type: "create_recurring_reminder",
        mode: "platform_handoff",
        no_chat_mutation: true,
      },
      __adjust_plan_handoff_state: {
        operation_type: "adjust_plan_item",
        mode: "platform_handoff",
        no_chat_mutation: true,
      },
      __coach_preference_flow_state_v1: {
        operation_type: "update_coach_preferences",
      },
    },
  });

  assertEquals(result.changed, true);
  assertEquals(result.routeDecision.selected_handler, "product_help");
  assertEquals(result.tempMemory.__active_tool_skill_intake, undefined);
  assertEquals(result.tempMemory.__active_attack_card_handoff, undefined);
  assertEquals(result.tempMemory.__active_defense_card_handoff, undefined);
  assertEquals(result.tempMemory.__recurring_reminder_handoff_state, undefined);
  assertEquals(result.tempMemory.__adjust_plan_handoff_state, undefined);
  assertEquals(result.tempMemory.__coach_preference_flow_state_v1, undefined);
});

Deno.test("L3 keeps active recurring reminder owner on exit plus new topic", () => {
  const result = arbitrateTurnIntent({
    userMessage:
      "Ok laisse ce rappel de côté. Maintenant aide-moi plutôt à prioriser ma journée.",
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "adjust_plan_item",
      reason_code: "tool_skill_intent_start",
    }),
    turnFrame: turnFrame({
      skill_signals: {
        entry: {},
        lifecycle: {},
        exit: {
          create_recurring_reminder: {
            detected: true,
            confidence_band: "high",
            reason: "user stops active reminder flow",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        explicitness: "explicit",
        target_hint: "prioriser ma journée",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "adjust",
      }],
    }),
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "create_recurring_reminder",
        skill_id: "create_recurring_reminder",
        mode: "platform_handoff",
        status: "handoff_delivered",
      },
      __recurring_reminder_handoff_state: {
        operation_type: "create_recurring_reminder",
        skill_id: "create_recurring_reminder",
        mode: "platform_handoff",
        status: "handoff_delivered",
        no_chat_mutation: true,
      },
    },
  });

  assertEquals(result.routeDecision.response_owner, "tool_skill");
  assertEquals(
    result.routeDecision.selected_handler,
    "create_recurring_reminder",
  );
  assertEquals(
    result.routeDecision.reason_code,
    "central_arbitrator_active_tool_local_exit_required",
  );
  assertEquals(
    result.tempMemory.__active_tool_skill_intake?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(
    result.tempMemory.__recurring_reminder_handoff_state?.operation_type,
    "create_recurring_reminder",
  );
});
