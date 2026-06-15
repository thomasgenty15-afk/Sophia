import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACTIVE_FLOW_TEMP_MEMORY_KEYS,
  buildDispatcherActiveRuntimeContext,
  buildLastLocalFlowExitContext,
  clearActiveToolFlow,
  clearLastLocalFlowExitContext,
  clearPendingRecommendation,
  clearPendingToolConfirmation,
  clearToolSkillFlow,
  clearToolSkillFlowForDirectReminder,
  readActiveFlowState,
  resolveActiveLocalConversationFlowOwnership,
  resolveActiveLocalToolFlowOwnership,
  restoreSuspendedPlatformHandoffForOperation,
  suspendActivePlatformHandoff,
  SUSPENDED_PLATFORM_HANDOFF_STATE_KEY,
} from "./active_flow_state.ts";

Deno.test("active_flow_state exposes canonical tempMemory key families", () => {
  assertEquals(ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeToolSkillIntake, [
    "__active_tool_skill_intake",
    "active_tool_skill_intake",
  ]);
  assertEquals(ACTIVE_FLOW_TEMP_MEMORY_KEYS.pendingToolSkillConfirmation, [
    "__pending_tool_skill_confirmation",
    "pending_tool_skill_confirmation",
  ]);
  assertEquals(ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeClarificationState, [
    "__clarification_flow_state",
  ]);
});

Deno.test("active_flow_state reads legacy and canonical pending keys", () => {
  const state = readActiveFlowState({
    __clarification_flow_state: { skill_id: "clarification" },
    active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    __pending_tool_skill_confirmation: { operation_type: "adjust_plan_item" },
    active_skill_state: { skill_id: "weekly_adaptive_review_v1" },
    __pending_recommendation_operation: {
      operation_type: "prepare_defense_card",
    },
  });
  assertEquals(
    (state.activeClarificationState as any).skill_id,
    "clarification",
  );
  assertEquals(
    (state.activeToolSkillIntake as any).operation_type,
    "prepare_attack_card",
  );
  assertEquals(
    (state.pendingToolSkillConfirmation as any).operation_type,
    "adjust_plan_item",
  );
  assertEquals(
    (state.activeSkillState as any).skill_id,
    "weekly_adaptive_review_v1",
  );
  assertEquals(
    (state.pendingRecommendationOperation as any).operation_type,
    "prepare_defense_card",
  );
});

Deno.test("active_flow_state reads dedicated defense handoff without generic intake", () => {
  const state = readActiveFlowState({
    __active_defense_card_handoff: {
      operation_type: "prepare_defense_card",
      skill_id: "prepare_defense_card",
      mode: "platform_handoff",
      status: "handoff_delivered",
      executable_from_chat: false,
    },
  });

  assertEquals(
    (state.activeToolSkillIntake as any)?.operation_type,
    "prepare_defense_card",
  );
});

Deno.test("active_flow_state resolves canonical local tool ownership for all local tool flows", () => {
  const cases: Array<{
    name: string;
    tempMemory: Record<string, unknown>;
    expectedOperationType: string;
    expectedSource: string;
  }> = [
    {
      name: "adjust plan handoff",
      tempMemory: {
        __adjust_plan_handoff_state: {
          skill_id: "adjust_plan_item",
          mode: "platform_handoff",
          status: "handoff_delivered",
          executable_from_chat: false,
        },
      },
      expectedOperationType: "adjust_plan_item",
      expectedSource: "__adjust_plan_handoff_state",
    },
    {
      name: "attack card handoff",
      tempMemory: {
        __active_attack_card_handoff: {
          operation_type: "prepare_attack_card",
          mode: "platform_handoff",
          status: "handoff_delivered",
          executable_from_chat: false,
        },
      },
      expectedOperationType: "prepare_attack_card",
      expectedSource: "__active_attack_card_handoff",
    },
    {
      name: "defense card handoff",
      tempMemory: {
        __active_defense_card_handoff: {
          operation_type: "prepare_defense_card",
          mode: "platform_handoff",
          status: "handoff_delivered",
          executable_from_chat: false,
        },
      },
      expectedOperationType: "prepare_defense_card",
      expectedSource: "__active_defense_card_handoff",
    },
    {
      name: "state potion active intake",
      tempMemory: {
        __active_tool_skill_intake: {
          skill_id: "select_state_potion",
          mode: "platform_handoff",
          status: "handoff_delivered",
          executable_from_chat: false,
        },
      },
      expectedOperationType: "select_state_potion",
      expectedSource: "readActiveFlowState.activeToolSkillIntake",
    },
    {
      name: "recurring reminder handoff",
      tempMemory: {
        __recurring_reminder_handoff_state: {
          skill_id: "create_recurring_reminder",
          mode: "platform_handoff",
          status: "handoff_delivered",
          executable_from_chat: false,
        },
      },
      expectedOperationType: "create_recurring_reminder",
      expectedSource: "__recurring_reminder_handoff_state",
    },
    {
      name: "coach preference flow",
      tempMemory: {
        __coach_preference_flow_state_v1: {
          skill_id: "update_coach_preferences",
          operation_type: "update_coach_preferences",
          status: "collecting",
        },
      },
      expectedOperationType: "update_coach_preferences",
      expectedSource: "__coach_preference_flow_state_v1",
    },
  ];

  for (const testCase of cases) {
    const active = readActiveFlowState(testCase.tempMemory);
    const ownership = resolveActiveLocalToolFlowOwnership({
      tempMemory: testCase.tempMemory,
      activeOperationIntake: active.activeToolSkillIntake,
      pendingOperationConfirmation: active.pendingToolSkillConfirmation,
    });
    assertEquals(
      ownership?.operation_type,
      testCase.expectedOperationType,
      testCase.name,
    );
    assertEquals(ownership?.source, testCase.expectedSource, testCase.name);
  }
});

Deno.test("active_flow_state resolves canonical conversation local ownership for local dispatchers", () => {
  const cases: Array<{
    name: string;
    tempMemory: Record<string, unknown>;
    activeSkillState?: unknown;
    expectedSkillId: string;
    expectedSource: string;
  }> = [
    {
      name: "clarification active local state",
      tempMemory: {},
      activeSkillState: undefined,
      expectedSkillId: "clarification",
      expectedSource: "readActiveFlowState.activeClarificationState",
    },
    {
      name: "weekly review active skill",
      tempMemory: {},
      activeSkillState: {
        skill_id: "weekly_adaptive_review_v1",
        status: "open",
      },
      expectedSkillId: "weekly_adaptive_review_v1",
      expectedSource: "readActiveFlowState.activeSkillState",
    },
    {
      name: "post morning nudge dedicated state",
      tempMemory: {
        __post_morning_nudge_active_state_v1: {
          skill_id: "post_morning_nudge",
          status: "active",
          flow_kind: "action",
        },
      },
      expectedSkillId: "post_morning_nudge",
      expectedSource: "__post_morning_nudge_active_state_v1",
    },
    {
      name: "status recap dedicated state",
      tempMemory: {
        __status_recap_flow_state_v1: {
          skill_id: "status_recap",
          mode: "local_readonly_flow",
          status: "active",
        },
      },
      expectedSkillId: "status_recap",
      expectedSource: "__status_recap_flow_state_v1",
    },
    {
      name: "emotional repair active skill",
      tempMemory: {},
      activeSkillState: {
        skill_id: "emotional_repair",
        status: "open",
      },
      expectedSkillId: "emotional_repair",
      expectedSource: "readActiveFlowState.activeSkillState",
    },
    {
      name: "demotivation repair active skill",
      tempMemory: {},
      activeSkillState: {
        skill_id: "demotivation_repair",
        status: "open",
      },
      expectedSkillId: "demotivation_repair",
      expectedSource: "readActiveFlowState.activeSkillState",
    },
    {
      name: "product help active skill",
      tempMemory: {},
      activeSkillState: {
        skill_id: "product_help",
        status: "open",
      },
      expectedSkillId: "product_help",
      expectedSource: "readActiveFlowState.activeSkillState",
    },
    {
      name: "flow opportunity dedicated state",
      tempMemory: {
        __flow_opportunity_verification_state_v1: {
          skill_id: "flow_opportunity_verification",
          mode: "local_verification_flow",
          status: "waiting_confirmation",
        },
      },
      expectedSkillId: "flow_opportunity_verification",
      expectedSource: "__flow_opportunity_verification_state_v1",
    },
    {
      name: "safety crisis active skill",
      tempMemory: {},
      activeSkillState: {
        skill_id: "safety_crisis",
        status: "active",
      },
      expectedSkillId: "safety_crisis",
      expectedSource: "readActiveFlowState.activeSkillState",
    },
  ];

  for (const testCase of cases) {
    const ownership = resolveActiveLocalConversationFlowOwnership({
      tempMemory: testCase.tempMemory,
      activeClarificationState: testCase.expectedSkillId === "clarification"
        ? {
          skill_id: "clarification",
          mode: "local_flow",
          status: "waiting_user",
        }
        : undefined,
      activeSkillState: testCase.activeSkillState,
    });
    assertEquals(ownership?.skill_id, testCase.expectedSkillId, testCase.name);
    assertEquals(ownership?.source, testCase.expectedSource, testCase.name);
  }
});

Deno.test("active_flow_state resolves recurring reminder from generic active intake", () => {
  const tempMemory = {
    __active_tool_skill_intake: {
      operation_type: "create_recurring_reminder",
      mode: "platform_handoff",
      status: "handoff_delivered",
    },
  };
  const active = readActiveFlowState(tempMemory);
  const ownership = resolveActiveLocalToolFlowOwnership({
    tempMemory,
    activeOperationIntake: active.activeToolSkillIntake,
    pendingOperationConfirmation: active.pendingToolSkillConfirmation,
  });

  assertEquals(ownership?.operation_type, "create_recurring_reminder");
  assertEquals(ownership?.source, "readActiveFlowState.activeToolSkillIntake");
});

Deno.test("active_flow_state clear active tool removes legacy and canonical keys", () => {
  assertEquals(
    clearActiveToolFlow({
      __active_tool_skill_intake: { a: 1 },
      active_tool_skill_intake: { b: 2 },
      __active_skill_state: { keep: true },
    }),
    {
      __active_skill_state: { keep: true },
    },
  );
});

Deno.test("active_flow_state clear pending confirmation removes both keys", () => {
  assertEquals(
    clearPendingToolConfirmation({
      __pending_tool_skill_confirmation: { a: 1 },
      pending_tool_skill_confirmation: { b: 2 },
      other: true,
    }),
    { other: true },
  );
});

Deno.test("active_flow_state clear tool flow preserves active conversation skill", () => {
  assertEquals(
    clearToolSkillFlow({
      __active_tool_skill_intake: { a: 1 },
      pending_tool_skill_confirmation: { b: 2 },
      __pending_recommendation_operation: { c: 3 },
      active_skill_state: { skill_id: "product_help" },
    }),
    {
      active_skill_state: { skill_id: "product_help" },
    },
  );
});

Deno.test("active_flow_state clears pending recommendation", () => {
  assertEquals(
    clearPendingRecommendation({
      __pending_recommendation_operation: { a: 1 },
      pending_recommendation_operation: { b: 2 },
      keep: "ok",
    }),
    { keep: "ok" },
  );
});

Deno.test("active_flow_state direct reminder clear keeps legacy recommendation key contract", () => {
  assertEquals(
    clearToolSkillFlowForDirectReminder({
      __active_tool_skill_intake: { a: 1 },
      active_tool_skill_intake: { b: 2 },
      __pending_tool_skill_confirmation: { c: 3 },
      pending_tool_skill_confirmation: { d: 4 },
      __pending_recommendation_operation: { e: 5 },
      pending_recommendation_operation: { keep_legacy: true },
      reminder_followup_consent_v1: true,
      keep: "ok",
    }),
    {
      pending_recommendation_operation: { keep_legacy: true },
      keep: "ok",
    },
  );
});

Deno.test("active_flow_state suspends and restores an interrupted defense handoff", () => {
  const defenseHandoff = {
    operation_type: "prepare_defense_card",
    skill_id: "prepare_defense_card",
    mode: "platform_handoff",
    status: "handoff_delivered",
    draft: { title: "Soir sans scroll" },
    executable_from_chat: false,
  };
  const suspended = suspendActivePlatformHandoff(
    { __active_defense_card_handoff: defenseHandoff },
    {
      interrupted_by: "update_coach_preferences",
      reason_code: "update_coach_preferences_interrupts_active_handoff",
    },
  );

  assertEquals(
    (suspended[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY] as any).operation_type,
    "prepare_defense_card",
  );

  const cleared = clearActiveToolFlow(suspended);
  assertEquals(cleared.__active_tool_skill_intake, undefined);
  assertEquals(cleared.__active_defense_card_handoff, undefined);
  assertEquals(
    (cleared[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY] as any).operation_type,
    "prepare_defense_card",
  );

  const restored = restoreSuspendedPlatformHandoffForOperation(
    cleared,
    "prepare_defense_card",
  );
  assertEquals(restored.__active_defense_card_handoff, defenseHandoff);
  assertEquals(restored[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY], undefined);
});

Deno.test("active_flow_state restore ignores non-matching suspended handoff", () => {
  const attackHandoff = {
    operation_type: "prepare_attack_card",
    mode: "platform_handoff",
    status: "handoff_delivered",
    executable_from_chat: false,
  };
  const suspended = suspendActivePlatformHandoff(
    { __active_attack_card_handoff: attackHandoff },
    {
      interrupted_by: "update_coach_preferences",
      reason_code: "update_coach_preferences_interrupts_active_handoff",
    },
  );
  const cleared = clearActiveToolFlow(suspended);
  const restored = restoreSuspendedPlatformHandoffForOperation(
    cleared,
    "prepare_defense_card",
  );

  assertEquals(restored.__active_tool_skill_intake, undefined);
  assertEquals(
    (restored[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY] as any).operation_type,
    "prepare_attack_card",
  );
});

Deno.test("active_flow_state builds dispatcher context for pending tool confirmation", () => {
  const context = buildDispatcherActiveRuntimeContext({
    tempMemory: {},
    activeSkillState: null,
    activeOperationIntake: null,
    pendingOperationConfirmation: {
      operation_type: "prepare_attack_card",
      operation_id: "op_1",
      operation_input: { target: "doc" },
    },
  });
  assertEquals(context?.owner, "tool_skill");
  assertEquals(context?.operation_type, "prepare_attack_card");
  assertEquals(context?.pending_confirmation, true);
});

Deno.test("active_flow_state exposes last local flow exit context", () => {
  const context = buildLastLocalFlowExitContext({
    __last_prepare_attack_card_exit_memo: {
      reason: "topic_change",
      flow_summary: "carte d'attaque mise de côté",
      handoff_hint_for_global_dispatcher: "prioriser la soirée",
      note_information: {
        source_flow_id: "prepare_attack_card",
        target_dispatcher: "global",
      },
      at: "2026-06-08T10:00:00.000Z",
    },
    __last_select_state_potion_exit_memo: {
      reason: "cancelled",
      flow_summary: "ancienne sortie",
      handoff_hint_for_global_dispatcher: null,
      at: "2026-06-08T09:00:00.000Z",
    },
  });
  assertEquals(context?.operation_type, "prepare_attack_card");
  assertEquals(context?.reason, "topic_change");
  assertEquals(
    context?.handoff_hint_for_global_dispatcher,
    "prioriser la soirée",
  );
  assertEquals(
    (context?.note_information as any)?.source_flow_id,
    "prepare_attack_card",
  );
  assertEquals((context?.note_information as any)?.target_dispatcher, "global");
});

Deno.test("active_flow_state exposes whatsapp onboarding exit memo", () => {
  const context = buildLastLocalFlowExitContext({
    __last_whatsapp_onboarding_exit_memo: {
      reason: "topic_change",
      flow_summary: "WhatsApp onboarding stopped after plan was ready.",
      handoff_hint_for_global_dispatcher: "prioriser",
      note_information: {
        source_flow_id: "whatsapp_onboarding",
        target_dispatcher: "global",
      },
      at: "2026-06-08T10:02:00.000Z",
    },
  });
  assertEquals(context?.operation_type, "whatsapp_onboarding");
  assertEquals(context?.reason, "topic_change");
  assertEquals(context?.handoff_hint_for_global_dispatcher, "prioriser");
  assertEquals(
    (context?.note_information as any)?.source_flow_id,
    "whatsapp_onboarding",
  );
});

Deno.test("active_flow_state compacts post morning nudge note for dispatcher", () => {
  const context = buildLastLocalFlowExitContext({
    __last_post_morning_nudge_note_information: {
      reason: "explicit_tool_request",
      user_message_summary: "User asks for a defense card.",
      collected_state: {
        skill_id: "post_morning_nudge",
        flow_kind: "action",
        source_nudge_summary: "nudge_kind=action_nudge",
      },
      recommended_next_focus: "prepare_defense_card",
      at: "2026-06-08T10:01:00.000Z",
    },
  });

  assertEquals(context?.operation_type, "post_morning_nudge");
  assertEquals(context?.reason, "explicit_tool_request");
  assertEquals(context?.flow_summary, "User asks for a defense card.");
  assertEquals(
    context?.handoff_hint_for_global_dispatcher,
    "prepare_defense_card: explicit_tool_request",
  );
});

Deno.test("active_flow_state clears last local flow exit context keys", () => {
  assertEquals(
    clearLastLocalFlowExitContext({
      __last_prepare_attack_card_exit_memo: { reason: "topic_change" },
      __last_whatsapp_onboarding_exit_memo: { reason: "topic_change" },
      __last_prepare_defense_card_exit_memo: { reason: "cancelled" },
      __last_select_state_potion_exit_memo: { reason: "safety" },
      __last_post_morning_nudge_note_information: {
        reason: "explicit_tool_request",
      },
      __last_flow_opportunity_verification_exit_memo: {
        reason: "topic_change",
      },
      keep: true,
    }),
    { keep: true },
  );
});
