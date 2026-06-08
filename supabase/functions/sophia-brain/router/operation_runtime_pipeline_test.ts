import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { STATUS_RECAP_FLOW_STATE_KEY } from "../skills/status_recap/local_flow.ts";
import { runOperationRuntimePipeline } from "./operation_runtime_pipeline.ts";

function fakeAttackSupabase() {
  return {
    from(table: string) {
      if (table === "user_profile_facts") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      }
      if (table === "user_attack_cards") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit: async () => ({ data: [], error: null }),
        };
      }
      throw new Error(`unexpected_table:${table}`);
    },
  } as any;
}

function fakeOneShotSupabase() {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { timezone: "Europe/Paris", locale: "fr-FR" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "scheduled_checkins") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      like() {
                        return {
                          order() {
                            return {
                              limit: async () => ({ data: [], error: null }),
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          upsert(row: any) {
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: "checkin-1",
                      scheduled_for: row.scheduled_for,
                      event_context: row.event_context,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          update() {
            return {
              in: async () => ({ error: null }),
            };
          },
        };
      }
      throw new Error(`unexpected_table:${table}`);
    },
  } as any;
}

function pendingAttackConfirmation() {
  return {
    operation_id: "op-attack",
    operation_type: "prepare_attack_card",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: {
      operation_type: "prepare_attack_card",
      output_schema: "attack_card_draft_v1",
      draft: {
        title: "Carte d'attaque - marche",
        target_label: "marche",
        technique: "texte_recadrage",
        technique_title: "Le texte magique",
        instruction: "Reviens au premier geste.",
        generated_asset:
          "Quand je négocie, je reviens au premier geste minuscule.",
        activation_keyword: null,
        supporting_points: [],
        mode_emploi: "Lis-la au moment où la résistance monte.",
        why_it_helps: "Elle coupe le débat intérieur.",
      },
      confirmation_message: "Je la crée ?",
      confirmation_actions: ["yes", "no"],
    },
  };
}

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
    turnFrame: baseTurnFrame({
      safety: { risk_band: "high", reason_codes: [], evidence: [] },
    }),
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
      isActiveCardDraftingOperation: () => false,
      writeAdjustPlanPendingDraftReview: (tempMemory) => tempMemory,
    },
  });
  assertEquals(result.operationRuntime, null);
});

function basePipelineInput(overrides: Record<string, unknown> = {}) {
  return {
    supabase: {} as any,
    userId: "user_1",
    userMessage: "test",
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {},
    state: {},
    planItemSnapshot: [],
    turnFrame: baseTurnFrame(),
    routeDecision: baseRouteDecision(),
    safetyPregateOutput: { risk_band: "low" },
    sourceMessageId: "msg_1",
    requestId: "turn_op_1",
    v2Runtime: null,
    turnAgenda: null,
    activeSkillState: null,
    activeOperationIntake: null,
    pendingOperationConfirmation: null,
    fullAiRequested: false,
    runAdjustPlanItemOperation: async () => null,
    guards: {
      isActiveCardDraftingOperation: () => false,
      writeAdjustPlanPendingDraftReview: (tempMemory: any) => tempMemory,
    },
    ...overrides,
  };
}

Deno.test("operation_runtime_pipeline prepare_attack_card uses specialized handoff router", async () => {
  let adjustCalls = 0;
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeAttackSupabase(),
    userMessage: "ok vas-y",
    tempMemory: {
      __pending_tool_skill_confirmation: pendingAttackConfirmation(),
    },
    pendingOperationConfirmation: pendingAttackConfirmation(),
    routeDecision: baseRouteDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
    }),
    turnFrame: baseTurnFrame({
      confirmation_response: { kind: "yes", confidence_band: "high" },
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "draft_only",
      }],
    }),
    runAdjustPlanItemOperation: async () => {
      adjustCalls += 1;
      throw new Error("adjust executor should not run");
    },
  }));

  assertEquals(adjustCalls, 0);
  assertEquals(result.operationRuntime?.toolExecution, "platform_handoff");
  assertEquals(result.operationRuntime?.executedTools, []);
  assertEquals(
    (result.operationRuntime?.toolSkillRun as any)?.status,
    "apply_attempt",
  );
  assertEquals(
    Boolean((result.operationRuntime?.toolSkillRun as any)?.handoff_state),
    true,
  );
  assertEquals(
    (result.operationRuntime?.toolSkillRun.platform_handoff as any)
      ?.no_chat_mutation,
    true,
  );
  assertEquals(
    (result.operationRuntime?.toolSkillRun.committed_effects as unknown[])
      .length,
    0,
  );
  assertEquals(
    (result.operationRuntime?.toolSkillRun.platform_handoff as any)
      ?.reason_code === "complex_operation_redirect_to_platform",
    false,
  );
});

Deno.test("operation_runtime_pipeline blocks tool runtime when clarification is required", async () => {
  let adjustCalls = 0;
  const result = await runOperationRuntimePipeline(basePipelineInput({
    routeDecision: baseRouteDecision({
      response_owner: "tool_skill",
      selected_handler: "select_state_potion",
      reason_code: "clarification_required",
      blocked_paths: [{
        path: "operation_runtime_pipeline",
        reason_code: "clarification_required",
      }],
    }),
    turnFrame: baseTurnFrame({
      tool_skill_intents: [],
      skill_signals: { entry: {} },
    }),
    runAdjustPlanItemOperation: async () => {
      adjustCalls += 1;
      return null;
    },
  }));

  assertEquals(adjustCalls, 0);
  assertEquals(result.operationRuntime, null);
  assertEquals(
    result.routeDecision?.response_owner,
    "orientation_clarification",
  );
  assertEquals(
    result.routeDecision?.selected_handler,
    "orientation_clarification",
  );
  assertEquals(result.routeDecision?.direct_effects_to_run, []);
});

Deno.test("operation_runtime_pipeline explicit approval does not make complex pending executable", async () => {
  let adjustCalls = 0;
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeAttackSupabase(),
    userMessage: "ok vas-y",
    tempMemory: {
      __pending_tool_skill_confirmation: pendingAttackConfirmation(),
    },
    pendingOperationConfirmation: pendingAttackConfirmation(),
    routeDecision: baseRouteDecision({
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
    }),
    turnFrame: baseTurnFrame({
      confirmation_response: { kind: "yes", confidence_band: "high" },
    }),
    runAdjustPlanItemOperation: async () => {
      adjustCalls += 1;
      throw new Error("pending adjust executor should not run");
    },
  }));

  assertEquals(adjustCalls, 0);
  assertEquals(result.operationRuntime?.toolExecution, "platform_handoff");
  assertEquals(result.operationRuntime?.executedTools, []);
  assertEquals(
    (result.operationRuntime?.toolSkillRun as any)?.status,
    "apply_attempt",
  );
});

Deno.test("operation_runtime_pipeline non-complex operation is not converted to platform handoff", async () => {
  const result = await runOperationRuntimePipeline(basePipelineInput({
    userMessage: "hello",
    routeDecision: baseRouteDecision({
      direct_effects_to_run: ["create_one_shot_reminder"],
    }),
  }));

  assertEquals(
    result.operationRuntime?.toolExecution === "platform_handoff",
    false,
  );
});

Deno.test("operation_runtime_pipeline active status_recap flow runs status runtime without route signal", async () => {
  let statusRuntimeCalls = 0;
  const result = await runOperationRuntimePipeline(basePipelineInput({
    routeDecision: baseRouteDecision({
      response_owner: "normal_reply",
      selected_handler: undefined,
      reason_code: "normal_reply",
    }),
    tempMemory: {
      [STATUS_RECAP_FLOW_STATE_KEY]: {
        skill_id: "status_recap",
        mode: "local_readonly_flow",
        status: "active",
        last_intent: "durable_status",
        last_target_objects: ["unknown"],
        last_projection_summary: {
          attack_card_count: 0,
          defense_card_count: 0,
          one_shot_pending_count: 0,
          one_shot_cancelled_recent_count: 0,
          recurring_reminder_count: 0,
          potion_session_count: 0,
          coach_preference_count: 0,
          recent_effect_history_count: 0,
        },
        last_answer_summary: "status précédent",
        turn_count: 1,
        max_turns: 3,
        created_at: "2026-06-08T08:00:00.000Z",
        updated_at: "2026-06-08T08:00:00.000Z",
      },
    },
    runStatusRecapRuntime: async (input: any) => {
      statusRuntimeCalls += 1;
      assertEquals(input.routeDecision?.reason_code, "normal_reply");
      return {
        content: "status local",
        nextTempMemory: input.tempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "status_recap",
          flow_action: "answer_object_status",
        },
      };
    },
  }));

  assertEquals(statusRuntimeCalls, 1);
  assertEquals(result.operationRuntime?.content, "status local");
  assertEquals(result.operationRuntime?.toolExecution, "none");
  assertEquals(result.operationRuntime?.executedTools, []);
});

Deno.test("operation_runtime_pipeline passes turn frame direct effect to one-shot reminder", async () => {
  const message =
    "Non finalement, fais seulement un rappel unique demain à 17h pour envoyer mon bilan rapide.";
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase(),
    userMessage: message,
    routeDecision: baseRouteDecision({
      reason_code: "create_one_shot_reminder_interrupts_active_handoff",
      direct_effects_to_run: ["create_one_shot_reminder"],
    }),
    turnFrame: baseTurnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: message },
      }],
    }),
    clientNow: new Date("2026-06-01T10:00:00.000Z"),
  }));

  assertEquals(result.operationRuntime?.toolExecution, "success");
  assertEquals(result.operationRuntime?.executedTools, [
    "create_one_shot_reminder",
  ]);
  assertEquals(
    (result.operationRuntime?.toolSkillRun as any)?.committed_effects.length,
    1,
  );
});
