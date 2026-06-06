import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { buildTurnAgenda, findAgendaTasks } from "./turn_agenda.ts";
import { resolveFlowInterruptions } from "./turn_interruption_policy.ts";
import {
  buildUserTurnSnapshot,
  type UserTurnSnapshot,
} from "./user_turn_snapshot.ts";

function routeDecision(
  overrides: Partial<RouteDecision> = {},
): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    selected_handler: undefined,
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "normal_reply_default",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  };
}

function turnFrame(overrides: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-1",
    source_message_id: "msg-1",
    user_id: "user-1",
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

function snapshot(args: {
  frame?: TurnFrame;
  route?: RouteDecision;
  tempMemory?: Record<string, unknown>;
} = {}): UserTurnSnapshot {
  return buildUserTurnSnapshot({
    turn_id: "turn-1",
    user_id: "user-1",
    source_message_id: "msg-1",
    message: "test",
    channel: "web",
    timezone: "Europe/Paris",
    turn_frame: args.frame ?? turnFrame(),
    route_decision: args.route ?? routeDecision(),
    temp_memory: args.tempMemory ?? {},
  });
}

Deno.test("agenda keeps cancel and create reminder as two effect tasks", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: "crée un rappel à 11h" },
      }],
    }),
    route: routeDecision({
      direct_effects_to_run: [
        "cancel_one_shot_reminder",
        "create_one_shot_reminder",
      ],
      reason_code: "one_shot_replace",
    }),
  }));

  assertEquals(
    findAgendaTasks(agenda, (task) => task.kind === "effect").map((task) =>
      task.operation_type
    ).sort(),
    ["cancel_one_shot_reminder", "create_one_shot_reminder"],
  );
});

Deno.test("status_only agenda preserves status and blocks effect tasks", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
    route: routeDecision({
      selected_handler: "status_only_no_mutation_check",
      reason_code: "status_only_request_blocks_tool_start",
    }),
  }));

  assertEquals(
    agenda.tasks.some((task) => task.kind === "status"),
    true,
  );
  assertEquals(
    agenda.tasks.find((task) =>
      task.operation_type === "create_one_shot_reminder"
    )?.status,
    "blocked",
  );
});

Deno.test("pending confirmation plus incompatible new intent does not consume pending", () => {
  const snap = snapshot({
    frame: turnFrame({
      confirmation_response: { kind: "yes", confidence_band: "high" },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
    },
  });
  const resolved = resolveFlowInterruptions({
    snapshot: snap,
    agenda: buildTurnAgenda(snap),
  });

  assertEquals(resolved.clear_pending_confirmation, true);
  assertEquals(
    resolved.reason_codes.includes("confirmation_incompatible_with_pending"),
    true,
  );
});

Deno.test("old attack card flow plus explicit reminder prioritizes reminder and clears active flow", () => {
  const snap = snapshot({
    frame: turnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
    tempMemory: {
      __active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    },
  });
  const resolved = resolveFlowInterruptions({
    snapshot: snap,
    agenda: buildTurnAgenda(snap),
  });

  assertEquals(resolved.clear_active_tool_flow, true);
  assertEquals(
    resolved.agenda.tasks[0].operation_type,
    "create_one_shot_reminder",
  );
});

Deno.test("no_potion blocks select_state_potion and leaves a concrete reply task", () => {
  const snap = snapshot({
    frame: turnFrame({
      tool_skill_intents: [{
        operation_type: "select_state_potion",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "select",
      }],
    }),
    tempMemory: { __turn_constraints: { no_potion: true } },
  });
  const resolved = resolveFlowInterruptions({
    snapshot: snap,
    agenda: buildTurnAgenda(snap),
  });

  assertEquals(
    resolved.agenda.tasks.find((task) =>
      task.operation_type === "select_state_potion"
    )?.status,
    "blocked",
  );
  assertEquals(
    resolved.agenda.tasks.some((task) => task.kind === "reply"),
    true,
  );
});

Deno.test("preview_only update_coach_preferences remains non-mutant", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      tool_skill_intents: [{
        operation_type: "update_coach_preferences",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
    tempMemory: { __turn_constraints: { preview_only: true } },
  }));
  const task = agenda.tasks.find((candidate) =>
    candidate.operation_type === "update_coach_preferences"
  );

  assertEquals(task?.kind, "platform_handoff");
  assertEquals(task?.requires_confirmation, false);
  assertEquals(task?.no_chat_mutation, true);
});

Deno.test("no_tool blocks new effect tasks but keeps compatible pending confirmation", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    tempMemory: {
      __turn_constraints: { no_tool: true },
      __pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
    },
  }));

  assertEquals(
    agenda.tasks.find((task) => task.operation_type === "prepare_defense_card")
      ?.status,
    "blocked",
  );
  const pendingTask = agenda.tasks.find((task) =>
    task.source === "pending_confirmation" &&
    task.operation_type === "prepare_attack_card"
  );
  assertEquals(pendingTask?.kind, "platform_handoff");
  assertEquals(pendingTask?.status, "proposed");
  assertEquals(pendingTask?.requires_confirmation, false);
});

Deno.test("status plus action keeps both tasks", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
    route: routeDecision({
      selected_handler: "status_only_no_mutation_check",
      reason_code: "status_only_with_action",
    }),
  }));

  assertEquals(
    agenda.tasks.some((task) => task.kind === "status"),
    true,
  );
  assertEquals(
    agenda.tasks.some((task) =>
      task.operation_type === "create_one_shot_reminder"
    ),
    true,
  );
});

Deno.test("route owner does not remove secondary tasks", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
    route: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      direct_effects_to_run: ["create_one_shot_reminder"],
    }),
  }));

  assertEquals(
    agenda.tasks.some((task) => task.operation_type === "prepare_defense_card"),
    true,
  );
  assertEquals(
    agenda.tasks.some((task) =>
      task.operation_type === "create_one_shot_reminder"
    ),
    true,
  );
});

Deno.test("adjust_plan_item intent becomes platform_handoff, not effect", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "adjust",
      }],
    }),
  }));

  const task = agenda.tasks.find((item) =>
    item.operation_type === "adjust_plan_item"
  );
  assertEquals(task?.kind, "platform_handoff");
  assertEquals(task?.requires_confirmation, false);
  assertEquals(task?.no_chat_mutation, true);
  assertEquals(
    agenda.tasks.some((item) =>
      item.kind === "effect" && item.operation_type === "adjust_plan_item"
    ),
    false,
  );
});

Deno.test("attack card and recurring reminder intents become platform_handoff", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      tool_skill_intents: [
        {
          operation_type: "prepare_attack_card",
          explicitness: "explicit",
          confidence_band: "high",
          ambiguity: "none",
          user_intent: "create",
        },
        {
          operation_type: "create_recurring_reminder",
          explicitness: "explicit",
          confidence_band: "high",
          ambiguity: "none",
          user_intent: "create",
        },
      ],
    }),
  }));

  assertEquals(
    agenda.tasks.filter((item) => item.kind === "platform_handoff").map((
      item,
    ) => item.operation_type).sort(),
    ["create_recurring_reminder", "prepare_attack_card"],
  );
  assertEquals(
    agenda.tasks.some((item) =>
      item.kind === "effect" &&
      (item.operation_type === "prepare_attack_card" ||
        item.operation_type === "create_recurring_reminder")
    ),
    false,
  );
});

Deno.test("agenda keeps one-shot reminder effect and attack card handoff", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: "prendre mes médicaments" },
      }],
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
        target_hint: "action demandée maintenant",
      }],
    }),
    route: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "create_one_shot_reminder",
      direct_effects_to_run: ["create_one_shot_reminder"],
    }),
  }));

  assertEquals(
    agenda.tasks.find((item) =>
      item.operation_type === "create_one_shot_reminder"
    )?.kind,
    "effect",
  );
  assertEquals(
    agenda.tasks.find((item) => item.operation_type === "prepare_attack_card")
      ?.kind,
    "platform_handoff",
  );
});

Deno.test("direct executable effects stay effect tasks", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }, {
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
  }));

  assertEquals(
    agenda.tasks.filter((item) => item.kind === "effect").map((item) =>
      item.operation_type
    ).sort(),
    ["create_one_shot_reminder", "track_progress_plan_item"],
  );
});

Deno.test("clarification required preempts platform handoff", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        explicitness: "explicit",
        confidence_band: "medium",
        ambiguity: "target_ambiguous",
        user_intent: "adjust",
      }],
    }),
  }));

  assertEquals(
    agenda.tasks.some((item) => item.kind === "clarification"),
    true,
  );
  assertEquals(
    agenda.tasks.some((item) => item.kind === "platform_handoff"),
    false,
  );
});

Deno.test("safety active blocks product platform handoff", () => {
  const agenda = buildTurnAgenda(snapshot({
    frame: turnFrame({
      safety: { risk_band: "high", reason_codes: ["risk"], evidence: [] },
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
  }));

  const task = agenda.tasks.find((item) =>
    item.operation_type === "prepare_defense_card"
  );
  assertEquals(task?.kind, "platform_handoff");
  assertEquals(task?.status, "blocked");
  assertEquals(task?.reason_code, "safety_blocks_runtime_task");
});

Deno.test("old flow plus explicit platform handoff interrupts active flow", () => {
  const snap = snapshot({
    frame: turnFrame({
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "adjust",
      }],
    }),
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_attack_card",
      },
    },
  });
  const resolved = resolveFlowInterruptions({
    snapshot: snap,
    agenda: buildTurnAgenda(snap),
  });

  assertEquals(resolved.clear_active_tool_flow, true);
  assertEquals(
    resolved.reason_codes.includes(
      "explicit_tool_intent_interrupts_active_flow",
    ),
    true,
  );
});
