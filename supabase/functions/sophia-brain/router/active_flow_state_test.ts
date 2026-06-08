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
});

Deno.test("active_flow_state reads legacy and canonical pending keys", () => {
  const state = readActiveFlowState({
    active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    __pending_tool_skill_confirmation: { operation_type: "adjust_plan_item" },
    active_skill_state: { skill_id: "weekly_adaptive_review_v1" },
    __pending_recommendation_operation: {
      operation_type: "prepare_defense_card",
    },
  });
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
    mode: "platform_handoff",
    status: "handoff_delivered",
    draft: { title: "Soir sans scroll" },
    no_chat_mutation: true,
  };
  const suspended = suspendActivePlatformHandoff(
    { __active_tool_skill_intake: defenseHandoff },
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
  assertEquals(
    (cleared[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY] as any).operation_type,
    "prepare_defense_card",
  );

  const restored = restoreSuspendedPlatformHandoffForOperation(
    cleared,
    "prepare_defense_card",
  );
  assertEquals(restored.__active_tool_skill_intake, defenseHandoff);
  assertEquals(restored[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY], undefined);
});

Deno.test("active_flow_state restore ignores non-matching suspended handoff", () => {
  const attackHandoff = {
    operation_type: "prepare_attack_card",
    mode: "platform_handoff",
    status: "handoff_delivered",
    no_chat_mutation: true,
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
});

Deno.test("active_flow_state compacts post morning nudge exit memo for dispatcher", () => {
  const context = buildLastLocalFlowExitContext({
    __last_post_morning_nudge_exit_memo: {
      reason: "explicit_tool_request",
      user_intent_summary: "User asks for a defense card.",
      local_flow_context: {
        skill_id: "post_morning_nudge",
        flow_kind: "action",
        source_nudge_summary: "nudge_kind=action_nudge",
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "prepare_defense_card",
        why: "explicit handoff",
      },
      at: "2026-06-08T10:01:00.000Z",
    },
  });

  assertEquals(context?.operation_type, "post_morning_nudge");
  assertEquals(context?.reason, "explicit_tool_request");
  assertEquals(context?.flow_summary, "User asks for a defense card.");
  assertEquals(
    context?.handoff_hint_for_global_dispatcher,
    "prepare_defense_card: explicit handoff",
  );
});

Deno.test("active_flow_state clears last local flow exit context keys", () => {
  assertEquals(
    clearLastLocalFlowExitContext({
      __last_prepare_attack_card_exit_memo: { reason: "topic_change" },
      __last_prepare_defense_card_exit_memo: { reason: "cancelled" },
      __last_select_state_potion_exit_memo: { reason: "safety" },
      __last_post_morning_nudge_exit_memo: { reason: "explicit_tool_request" },
      keep: true,
    }),
    { keep: true },
  );
});
