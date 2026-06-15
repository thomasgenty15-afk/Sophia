import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { STATUS_RECAP_FLOW_STATE_KEY } from "../skills/status_recap/local_flow.ts";
import {
  mergeDirectEffectRuntimeIntoVisibleRuntime,
  runDirectEffectLane,
  runOperationRuntimePipeline,
  turnFrameWithDirectEffectRuntime,
} from "./operation_runtime_pipeline.ts";

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
    flow_opportunity: null,
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
    safetyContextOutput: { risk_band: "high" },
    sourceMessageId: "msg_1",
    requestId: "turn_op_1",
    v2Runtime: null,
    activeSkillState: null,
    activeOperationIntake: null,
    pendingOperationConfirmation: null,
    fullAiRequested: false,
    runAdjustPlanItemOperation: async () => {
      return null;
    },
    guards: {
      isActiveCardDraftingOperation: () => false,
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
    safetyContextOutput: { risk_band: "low" },
    sourceMessageId: "msg_1",
    requestId: "turn_op_1",
    v2Runtime: null,
    activeSkillState: null,
    activeOperationIntake: null,
    pendingOperationConfirmation: null,
    fullAiRequested: false,
    runAdjustPlanItemOperation: async () => null,
    guards: {
      isActiveCardDraftingOperation: () => false,
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
      ?.executable_from_chat,
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

Deno.test("operation_runtime_pipeline does not start prepare_attack_card from raw intent when normal reply won", async () => {
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeAttackSupabase(),
    userMessage: "donne-moi juste une phrase simple a me repeter demain",
    routeDecision: baseRouteDecision({
      response_owner: "normal_reply",
      reason_code: "normal_reply_fit_dominates",
      blocked_paths: [{
        path: "tool_skill.prepare_attack_card",
        reason_code: "normal_reply_fit_dominates",
      }],
    }),
    turnFrame: baseTurnFrame({
      normal_reply_fit_score: 0.9,
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "implied",
        confidence_band: "high",
        score: 0.74,
        ambiguity: "none",
        user_intent: "draft_only",
      }],
    }),
  }));

  assertEquals(result.operationRuntime, null);
  assertEquals(result.routeDecision?.response_owner, "normal_reply");
});

Deno.test("operation_runtime_pipeline does not ask track-progress clarification when normal reply won", async () => {
  const result = await runOperationRuntimePipeline(basePipelineInput({
    userMessage:
      "je l'ai prepare dans ma tete mais pas encore envoye, ca compte ?",
    routeDecision: baseRouteDecision({
      response_owner: "normal_reply",
      reason_code: "normal_reply_fit_dominates",
      blocked_paths: [{
        path: "track_progress_plan_item",
        reason_code: "normal_reply_fit_dominates",
      }],
    }),
    turnFrame: baseTurnFrame({
      normal_reply_fit_score: 0.86,
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "weak",
        target_status: "identified",
        confidence_band: "medium",
        payload_hint: {
          target_item_id: "walk",
          target_title: "marche",
        },
      }],
    }),
  }));

  assertEquals(result.operationRuntime, null);
  assertEquals(result.routeDecision?.response_owner, "normal_reply");
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

Deno.test("direct_effect_lane can execute one-shot reminder from local dispatcher message intake", async () => {
  const message =
    "Rappelle-moi dans 40 minutes de relire mes notes sur ce dossier, et ensuite j'aimerais qu'on parle de pourquoi je bloque.";
  const result = await runDirectEffectLane({
    ...basePipelineInput({
      supabase: fakeOneShotSupabase(),
      userMessage: message,
      routeDecision: baseRouteDecision({
        response_owner: "conversation_handler",
        selected_handler: "flow_opportunity_verification",
        reason_code: "active_flow_opportunity_verification_local_dispatcher",
        direct_effects_to_run: [],
      }),
      turnFrame: baseTurnFrame(),
      clientNow: new Date("2026-06-13T08:00:00.000Z"),
    }),
    allowMessageIntakeFallback: true,
  });

  assertEquals(result.operationRuntime?.toolExecution, "success");
  assertEquals(result.operationRuntime?.executedTools, [
    "create_one_shot_reminder",
  ]);
  assertEquals(
    result.routeDecision?.selected_handler,
    "flow_opportunity_verification",
  );
  assertEquals(result.routeDecision?.direct_effects_to_run, [
    "create_one_shot_reminder",
  ]);
  assertEquals(
    (result.operationRuntime?.toolSkillRun as any)?.committed_effects[0]
      ?.reminder_instruction,
    "relire mes notes sur ce dossier",
  );
});

Deno.test("direct_effect_lane ignores soft support without explicit one-shot time", async () => {
  const result = await runDirectEffectLane({
    ...basePipelineInput({
      supabase: fakeOneShotSupabase(),
      userMessage:
        "J'ai besoin d'un appui pour ne pas décrocher, reste juste avec moi.",
      routeDecision: baseRouteDecision({
        response_owner: "conversation_handler",
        selected_handler: "flow_opportunity_verification",
        reason_code: "active_flow_opportunity_verification_local_dispatcher",
        direct_effects_to_run: [],
      }),
      turnFrame: baseTurnFrame(),
    }),
    allowMessageIntakeFallback: true,
  });

  assertEquals(result.operationRuntime, null);
  assertEquals(result.routeDecision?.direct_effects_to_run, []);
  assertEquals(result.turnFrame?.direct_effects, []);
});

Deno.test("direct effect runtime merges into visible owner without replacing selected handler", () => {
  const directRuntime = {
    content:
      "C'est programmé pour aujourd'hui à 10:40: je te rappellerai de relire mes notes.",
    nextTempMemory: {},
    toolExecution: "success" as const,
    executedTools: ["create_one_shot_reminder"],
    toolSkillRun: {
      selected_handler: "create_one_shot_reminder",
      status: "success",
      requested_effects: [{ type: "create_one_shot_reminder" }],
      allowed_effects: [{ type: "create_one_shot_reminder" }],
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "checkin-1",
        reminder_instruction: "relire mes notes",
      }],
      blocked_effects: [],
    },
  };
  const visibleRuntime = {
    content: "Oui, on peut regarder ce qui te bloque.",
    nextTempMemory: {},
    toolExecution: "none" as const,
    executedTools: [],
    toolSkillRun: {
      selected_handler: "flow_opportunity_verification",
      skill_id: "flow_opportunity_verification",
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
    },
  };
  const merged = mergeDirectEffectRuntimeIntoVisibleRuntime({
    directRuntime,
    visibleRuntime,
  });
  const turnFrame = turnFrameWithDirectEffectRuntime(
    baseTurnFrame(),
    directRuntime,
  ) as any;

  assertEquals(
    (merged?.toolSkillRun as any).selected_handler,
    "flow_opportunity_verification",
  );
  assertEquals(merged?.toolExecution, "success");
  assertEquals(merged?.executedTools, ["create_one_shot_reminder"]);
  assertEquals(
    ((merged?.toolSkillRun as any).committed_effects as unknown[]).length,
    1,
  );
  assertEquals(
    (merged?.toolSkillRun as any).direct_effect_lane.selected_handler,
    "create_one_shot_reminder",
  );
  assertEquals(
    turnFrame.direct_effect_lane.committed_effects[0].type,
    "create_one_shot_reminder",
  );
});

Deno.test("operation_runtime_pipeline active or closing status_recap flow runs status runtime without route signal", async () => {
  for (const status of ["active", "closing"] as const) {
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
          status,
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
          content: `status local ${status}`,
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
    assertEquals(result.operationRuntime?.content, `status local ${status}`);
    assertEquals(result.operationRuntime?.toolExecution, "none");
    assertEquals(result.operationRuntime?.executedTools, []);
  }
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

Deno.test("operation_runtime_pipeline runs direct effect from global second pass after local exit", async () => {
  const message =
    "Je change de sujet: programme-moi un rappel dans 30 minutes pour relancer le dossier.";
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase(),
    userMessage: message,
    routeDecision: baseRouteDecision({
      response_owner: "tool_skill",
      selected_handler: "create_one_shot_reminder",
      reason_code: "global_dispatcher_second_pass_after_local_exit",
      direct_effects_to_run: ["create_one_shot_reminder"],
      local_flow_exit_handoff: {
        source_flow_id: "demotivation_repair",
        note_information: {
          source_flow_id: "demotivation_repair",
          target_dispatcher: "global",
          handoff_reason: "explicit_tool_request",
        },
      },
    }),
    turnFrame: baseTurnFrame({
      note_information: {
        source_flow_id: "demotivation_repair",
        target_dispatcher: "global",
        handoff_reason: "explicit_tool_request",
      },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: message },
      }],
    }),
    activeSkillState: null,
    activeOperationIntake: null,
    pendingOperationConfirmation: null,
    clientNow: new Date("2026-06-13T12:00:00.000Z"),
  }));

  assertEquals(result.operationRuntime?.toolExecution, "success");
  assertEquals(result.operationRuntime?.executedTools, [
    "create_one_shot_reminder",
  ]);
  assertEquals(
    (result.operationRuntime?.toolSkillRun as any)?.committed_effects[0]
      ?.type,
    "create_one_shot_reminder",
  );
});

Deno.test("operation_runtime_pipeline runs one-shot reminder direct effect while safety owns visible route", async () => {
  const message =
    "D'accord, elle est au telephone avec moi. Mets-moi un rappel dans 30 minutes pour verifier que je tiens.";
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase(),
    userMessage: message,
    routeDecision: baseRouteDecision({
      response_owner: "safety",
      selected_handler: "safety_crisis",
      reason_code: "safety_crisis_create_one_shot_reminder_direct_effect",
      direct_effects_to_run: ["create_one_shot_reminder"],
    }),
    turnFrame: baseTurnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: message },
      }],
    }),
    safetyContextOutput: {
      risk_band: "medium",
      reason_codes: ["active_safety_flow_caution"],
    },
    clientNow: new Date("2026-06-12T08:10:00.000Z"),
  }));

  assertEquals(result.routeSafetyActive, true);
  assertEquals(result.operationRuntime?.toolExecution, "success");
  assertEquals(result.operationRuntime?.executedTools, [
    "create_one_shot_reminder",
  ]);
  assertEquals(
    (result.operationRuntime?.toolSkillRun as any)?.committed_effects[0]
      ?.type,
    "create_one_shot_reminder",
  );
});
