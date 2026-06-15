import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  type ActiveHandoffStateSnapshot,
  arbitrateActiveHandoffFlow,
  extractActiveHandoffFromTempMemory,
  shouldBypassOrientationClarificationForActiveHandoff,
} from "./handoff_flow_arbitration.ts";

function active(
  operationType: string,
): ActiveHandoffStateSnapshot {
  return {
    operation_type: operationType,
    mode: "platform_handoff",
    status: "handoff_delivered",
    surface_id: null,
    turn_count: 1,
    max_turns: 8,
    executable_from_chat: false,
  };
}

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t",
    source_message_id: "m",
    user_id: "u",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    confirmation_response: { kind: "unknown", confidence_band: "low" },
    direct_effects: [],
    tool_skill_intents: [],
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "taxonomy_first",
    },
    ...patch,
  };
}

function route(patch: Partial<RouteDecision> = {}): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "test",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...patch,
  };
}

function decide(args: {
  message: string;
  operation?: string;
  turnFrame?: TurnFrame;
  routeDecision?: RouteDecision | null;
}) {
  return arbitrateActiveHandoffFlow({
    user_message: args.message,
    active_handoff: args.operation === "none"
      ? null
      : active(args.operation ?? "adjust_plan_item"),
    turn_frame: args.turnFrame ?? frame(),
    route_decision: args.routeDecision ?? route(),
    recent_messages: [],
  });
}

Deno.test("active recurring handoff routes explicit one-shot through local exit", () => {
  const result = decide({
    message: "Un rappel unique demain à 17h pour envoyer mon bilan rapide.",
    operation: "create_recurring_reminder",
    turnFrame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text:
            "Un rappel unique demain à 17h pour envoyer mon bilan rapide.",
        },
      }],
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "create_one_shot_reminder_uses_active_handoff_local_exit",
  );
});

Deno.test("active recurring handoff keeps non finalement one-shot inside local exit", () => {
  const message =
    "Non finalement, fais seulement un rappel unique demain à 17h pour envoyer mon bilan rapide.";
  const result = decide({
    message,
    operation: "create_recurring_reminder",
    turnFrame: frame({
      confirmation_response: { kind: "no", confidence_band: "high" },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: message },
      }],
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "create_one_shot_reminder_uses_active_handoff_local_exit",
  );
});

const handoffOperations = [
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
];

Deno.test("extractActiveHandoffFromTempMemory detects all migrated handoff flows", () => {
  const memories = [
    { __adjust_plan_handoff_state: active("adjust_plan_item") },
    { __active_attack_card_handoff: active("prepare_attack_card") },
    { __active_defense_card_handoff: active("prepare_defense_card") },
    {
      __active_tool_skill_intake: {
        ...active("select_state_potion"),
        skill_id: "select_state_potion",
      },
    },
    { __recurring_reminder_handoff_state: active("create_recurring_reminder") },
  ];
  for (const [index, memory] of memories.entries()) {
    assertEquals(
      extractActiveHandoffFromTempMemory(memory)?.operation_type,
      handoffOperations[index],
    );
  }
});

Deno.test("active handoff structured same-operation signals are consistent for all migrated flows", () => {
  for (const operation of handoffOperations) {
    assertEquals(
      decide({
        message: "message déjà classé par le dispatcher",
        operation,
        turnFrame: frame({
          tool_skill_intents: [{
            operation_type: operation,
            explicitness: "explicit",
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "update",
          }],
        }),
      }).continuation_intent,
      "revise_handoff",
    );
  }
});

Deno.test("active handoff exits always stay with the active local dispatcher", () => {
  for (const operation of handoffOperations) {
    for (
      const [type, expectedIntent] of [
        ["cancel_handoff", "cancel_handoff"],
        ["topic_change", "topic_change"],
      ] as const
    ) {
      const result = decide({
        message: "message déjà classé sortie de flow actif",
        operation,
        turnFrame: frame({
          active_handoff_action: {
            type,
            confidence: "high",
            evidence: ["sortie de flow actif"],
            target_skill_id: operation,
          },
        }),
      });
      assertEquals(result.action, "continue_handoff");
      assertEquals(result.operation_type, operation);
      assertEquals(result.continuation_intent, expectedIntent);
    }
  }
});

Deno.test("active handoff decisions bypass generic orientation clarification", () => {
  for (
    const message of [
      "redis-moi quoi mettre exactement",
      "ok crée-la",
      "pas de carte finalement",
      "rends-la plus douce",
    ]
  ) {
    const result = decide({
      message,
      operation: "prepare_defense_card",
    });
    assertEquals(
      shouldBypassOrientationClarificationForActiveHandoff(result),
      true,
    );
  }
  assertEquals(
    shouldBypassOrientationClarificationForActiveHandoff(
      decide({ message: "bonjour", operation: "none" }),
    ),
    false,
  );
});

Deno.test("active defense handoff keeps explicit coach preference inside local exit policy", () => {
  const result = decide({
    message:
      "Préférence coach très claire : pour la suite, parle-moi plus doucement et pose moins de questions.",
    operation: "prepare_defense_card",
    turnFrame: frame({
      tool_skill_intents: [{
        operation_type: "update_coach_preferences",
        explicitness: "explicit",
        target_hint:
          "Préférence coach très claire : pour la suite, parle-moi plus doucement et pose moins de questions.",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "update_coach_preferences_uses_active_handoff_local_exit",
  );
});

Deno.test("structured status and product help signals use active handoff local exit", () => {
  const withStatus = decide({
    message: "message déjà classé status",
    turnFrame: frame({
      skill_signals: {
        entry: {
          status_recap: {
            detected: true,
            confidence_band: "high",
            reason: "test_status_signal",
          },
        },
        lifecycle: {},
        exit: {},
      },
    }),
  });
  assertEquals(withStatus.action, "continue_handoff");
  assertEquals(withStatus.continuation_intent, "explicit_interrupt");
  assertEquals(
    withStatus.reason_code,
    "status_recap_uses_active_handoff_local_exit",
  );

  const withProductHelp = decide({
    message: "message déjà classé product_help",
    routeDecision: route({
      response_owner: "product_help",
      selected_handler: "product_help",
    }),
    turnFrame: frame({
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "test_product_help_signal",
          },
        },
        lifecycle: {},
        exit: {},
      },
    }),
  });
  assertEquals(withProductHelp.action, "continue_handoff");
  assertEquals(withProductHelp.continuation_intent, "explicit_interrupt");
  assertEquals(
    withProductHelp.reason_code,
    "product_help_uses_active_handoff_local_exit",
  );
});

Deno.test("active adjust_plan + renders lighter continues revise_handoff", () => {
  const result = decide({ message: "rends ça plus léger" });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "revise_handoff");
});

Deno.test("active adjust_plan + confirmation yes continues apply_attempt", () => {
  const result = decide({
    message: "confirmation déjà classée",
    turnFrame: frame({
      confirmation_response: { kind: "yes", confidence_band: "high" },
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "apply_attempt");
});

Deno.test("active adjust_plan + clarification answer stays with skill", () => {
  const result = decide({
    message:
      "Les deux mini-actions sont celles qui gardent le fil ; le reste peut attendre la semaine prochaine.",
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.operation_type, "adjust_plan_item");
  assertEquals(
    result.reason_code,
    "active_adjust_plan_followup_stays_with_skill",
  );
});

Deno.test("active attack_card + change technique continues revise_handoff", () => {
  const result = decide({
    message: "message déjà classé prepare_attack_card",
    operation: "prepare_attack_card",
    turnFrame: frame({
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "revise_handoff");
});

Deno.test("active attack_card + structured no confirmation uses local exit", () => {
  const result = decide({
    message: "confirmation négative déjà classée",
    operation: "prepare_attack_card",
    turnFrame: frame({
      confirmation_response: { kind: "no", confidence_band: "high" },
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "cancel_handoff");
  assertEquals(
    result.reason_code,
    "negative_confirmation_uses_active_handoff_local_exit",
  );
});

Deno.test("active defense_card + softer continues revise_handoff", () => {
  const result = decide({
    message: "message déjà classé prepare_defense_card",
    operation: "prepare_defense_card",
    turnFrame: frame({
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "revise_handoff");
});

Deno.test("active defense_card + softer plan B wording continues revise_handoff", () => {
  const result = decide({
    message: "message déjà classé prepare_defense_card",
    operation: "prepare_defense_card",
    turnFrame: frame({
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "revise_handoff");
  assertEquals(
    result.reason_code,
    "same_operation_signal_continues_active_handoff",
  );
});

Deno.test("active defense_card + structured no confirmation uses local exit", () => {
  const result = decide({
    message: "confirmation négative déjà classée",
    operation: "prepare_defense_card",
    turnFrame: frame({
      confirmation_response: { kind: "no", confidence_band: "high" },
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "cancel_handoff");
  assertEquals(
    result.reason_code,
    "negative_confirmation_uses_active_handoff_local_exit",
  );
});

Deno.test("active defense_card + explicit attack request stays with defense local exit", () => {
  const result = decide({
    message: "message déjà classé prepare_attack_card",
    operation: "prepare_defense_card",
    turnFrame: frame({
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "prepare_attack_card_uses_active_handoff_local_exit",
  );
});

Deno.test("active defense_card + topic change stays with defense local exit", () => {
  const result = decide({
    message: "en fait je change de sujet",
    operation: "prepare_defense_card",
    turnFrame: frame({
      confirmation_response: { kind: "topic_change", confidence_band: "high" },
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "topic_change");
  assertEquals(
    result.reason_code,
    "active_handoff_topic_change_uses_local_exit",
  );
});

Deno.test("active potion + no follow-up stays in handoff policy", () => {
  const result = decide({
    message: "message déjà classé select_state_potion",
    operation: "select_state_potion",
    turnFrame: frame({
      tool_skill_intents: [{
        operation_type: "select_state_potion",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "revise_handoff");
});

Deno.test("active recurring + monday cadence continues revise_handoff", () => {
  const result = decide({
    message: "message déjà classé create_recurring_reminder",
    operation: "create_recurring_reminder",
    turnFrame: frame({
      tool_skill_intents: [{
        operation_type: "create_recurring_reminder",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "revise_handoff");
});

Deno.test("active recurring + slot revision stays with skill when dispatcher keeps recurring owner", () => {
  const result = decide({
    message: "message déjà classé create_recurring_reminder",
    operation: "create_recurring_reminder",
    turnFrame: frame({
      tool_skill_intents: [{
        operation_type: "create_recurring_reminder",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "revise_handoff");
  assertEquals(
    result.reason_code,
    "same_operation_signal_continues_active_handoff",
  );
});

Deno.test("active recurring + unclassified compact edit stays with skill clarification", () => {
  const result = decide({
    message: "à 9h",
    operation: "create_recurring_reminder",
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "unclear");
  assertEquals(result.reason_code, "active_recurring_handoff_stays_with_skill");
});

Deno.test("active state potion + unclassified field answer stays with skill", () => {
  const result = decide({
    message:
      "Quand je regarde mes actions, j'ai l'impression de cocher des cases pour rester occupé.",
    operation: "select_state_potion",
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "unclear");
  assertEquals(
    result.reason_code,
    "active_state_potion_handoff_stays_with_skill",
  );
});

Deno.test("active recurring + structured apply attempt stays non-mutating", () => {
  const result = decide({
    message: "confirmation positive déjà classée",
    operation: "create_recurring_reminder",
    turnFrame: frame({
      confirmation_response: { kind: "yes", confidence_band: "high" },
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "apply_attempt");
  assertEquals(result.reason_code, "confirmation_yes_is_handoff_apply_attempt");
});

Deno.test("active platform handoff + structured apply request becomes handoff_apply_attempt", () => {
  const result = decide({
    message: "message déjà classé active_handoff_action",
    operation: "select_state_potion",
    turnFrame: frame({
      active_handoff_action: {
        type: "handoff_apply_attempt",
        confidence: "high",
        evidence: ["Ok vas-y active-la."],
        target_skill_id: "select_state_potion",
      },
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "handoff_apply_attempt");
  assertEquals(result.operation_type, "select_state_potion");
  assertEquals(result.reason_code, "active_handoff_apply_attempt");
});

Deno.test("active platform handoff + field confirmation continues collection", () => {
  const result = decide({
    message: "message déjà classé confirmation de champ",
    operation: "select_state_potion",
    turnFrame: frame({
      active_handoff_action: {
        type: "field_confirmation",
        confidence: "high",
        evidence: ["Oui, c'est la honte surtout."],
        target_skill_id: "select_state_potion",
      },
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "field_confirmation");
  assertEquals(result.operation_type, "select_state_potion");
  assertEquals(result.reason_code, "active_handoff_field_confirmation");
});

Deno.test("active platform handoff + destination followup stays with handoff", () => {
  const result = decide({
    message: "message déjà classé destination plateforme",
    operation: "select_state_potion",
    turnFrame: frame({
      active_handoff_action: {
        type: "platform_destination_followup",
        confidence: "high",
        evidence: ["Et je la lance ou exactement dans la plateforme ?"],
        target_skill_id: "select_state_potion",
      },
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "platform_destination_followup");
  assertEquals(result.operation_type, "select_state_potion");
  assertEquals(
    result.reason_code,
    "active_handoff_platform_destination_followup",
  );
});

Deno.test("structured active handoff apply keeps active owner without executor signal", () => {
  const result = decide({
    message: "message déjà classé active_handoff_action",
    operation: "prepare_attack_card",
    turnFrame: frame({
      active_handoff_action: {
        type: "handoff_apply_attempt",
        confidence: "high",
        evidence: ["crée-la"],
        target_skill_id: "prepare_attack_card",
      },
      direct_effects: [],
      tool_skill_intents: [],
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.operation_type, "prepare_attack_card");
  assertEquals(result.continuation_intent, "handoff_apply_attempt");
});

Deno.test("explicit new tool stays with structured active handoff local exit", () => {
  const result = decide({
    message: "message déjà classé rappel ponctuel",
    operation: "select_state_potion",
    turnFrame: frame({
      active_handoff_action: {
        type: "handoff_apply_attempt",
        confidence: "high",
        evidence: ["vas-y"],
        target_skill_id: "select_state_potion",
      },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
  });

  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "create_one_shot_reminder_uses_active_handoff_local_exit",
  );
});

Deno.test("explicit one-shot reminder uses active handoff local exit", () => {
  const result = decide({
    message: "mets-moi un rappel demain à 9h",
    turnFrame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "create_one_shot_reminder_uses_active_handoff_local_exit",
  );
});

Deno.test("active defense_card + explicit one-shot reminder stays with defense local exit", () => {
  const result = decide({
    message: "mets-moi un rappel demain à 9h",
    operation: "prepare_defense_card",
    turnFrame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "create_one_shot_reminder_uses_active_handoff_local_exit",
  );
});

Deno.test("explicit progress tracking uses active handoff local exit", () => {
  const result = decide({
    message: "j’ai fini l’action",
    turnFrame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "track_progress_plan_item_uses_active_handoff_local_exit",
  );
});

Deno.test("safety signal interrupts active handoff", () => {
  const result = decide({
    message: "je suis en danger",
    turnFrame: frame({
      safety: {
        risk_band: "high",
        reason_codes: ["test_safety"],
        evidence: ["test"],
      },
    }),
  });
  assertEquals(result.action, "interrupt_for_explicit_intent");
});

Deno.test("clear status DB request uses active handoff local exit", () => {
  const result = decide({
    message: "où sont mes rappels actifs ?",
    turnFrame: frame({
      skill_signals: {
        entry: {
          status_recap: {
            detected: true,
            confidence_band: "high",
            reason: "db_status",
          },
        },
        lifecycle: {},
        exit: {},
      },
    }),
  });
  assertEquals(result.action, "continue_handoff");
  assertEquals(result.continuation_intent, "explicit_interrupt");
  assertEquals(
    result.reason_code,
    "status_recap_uses_active_handoff_local_exit",
  );
});

Deno.test("ambiguous continuation or new intent asks clarification", () => {
  const result = decide({
    message: "plutôt demain matin",
    turnFrame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "ambiguous",
        confidence_band: "medium",
        payload_hint: {},
      }],
    }),
  });
  assertEquals(result.action, "ask_clarification");
});

Deno.test("no active handoff is ignored", () => {
  const result = decide({ message: "redis-moi", operation: "none" });
  assertEquals(result.action, "ignore");
});
