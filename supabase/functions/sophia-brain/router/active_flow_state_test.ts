import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACTIVE_FLOW_TEMP_MEMORY_KEYS,
  buildDispatcherActiveRuntimeContext,
  clearActiveToolFlow,
  clearPendingRecommendation,
  clearPendingToolConfirmation,
  clearToolSkillFlow,
  clearToolSkillFlowForDirectReminder,
  readActiveFlowState,
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
