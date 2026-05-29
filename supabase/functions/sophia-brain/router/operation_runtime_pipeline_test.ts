import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runOperationRuntimePipeline } from "./operation_runtime_pipeline.ts";

function baseRouteDecision(overrides: Record<string, unknown> = {}) {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    selected_handler: undefined,
    reason_code: "test",
    direct_effects_to_run: [],
    blocked_paths: [],
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  } as any;
}

function baseTurnFrame(overrides: Record<string, unknown> = {}) {
  return {
    turn_id: "turn_op_1",
    source_message_id: "msg_1",
    user_id: "user_1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    conversation_risk: {
      score: 0,
      threshold: 8,
      should_exit_flows: false,
      reason_codes: [],
      previous_scores: [],
      matrix: [],
      context_summary: null,
    },
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
    },
    ...overrides,
  } as any;
}

Deno.test("operation_runtime_pipeline safety route blocks operation runtime", async () => {
  const result = await runOperationRuntimePipeline({
    supabase: {} as any,
    userId: "user_1",
    userMessage: "programme un rappel",
    channel: "web",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {},
    state: {},
    planItemSnapshot: [],
    turnFrame: baseTurnFrame({ safety: { risk_band: "high", reason_codes: [], evidence: [] } }),
    routeDecision: baseRouteDecision({
      response_owner: "safety_crisis",
      selected_handler: "safety_crisis",
    }),
    safetyPregateOutput: { risk_band: "high" },
    sourceMessageId: "msg_1",
    requestId: "turn_op_1",
    v2Runtime: null,
    turnAgenda: null,
    activeSkillState: null,
    activeOperationIntake: null,
    pendingOperationConfirmation: null,
    fullAiRequested: false,
    runAdjustPlanItemOperation: async () => {
      return null;
    },
    guards: {
      explicitlySafeWorkReminderRequest: () => false,
      detectExplicitNoToolRequest: () => false,
      detectsExplicitAttackCardCreationRequest: () => false,
      isActiveCardDraftingOperation: () => false,
      isExplicitOperationCommand: () => false,
      writeAdjustPlanPendingDraftReview: (tempMemory) => tempMemory,
    },
  });
  assertEquals(result.operationRuntime, null);
});
