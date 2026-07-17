import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildContextString } from "../context/loader.ts";
import { runConversationRouters } from "../routers/routers.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  type ActiveLocalConversationFlowSkillId,
  readActiveFlowState,
  shouldSkipGlobalDispatcherForActiveLocalFlow,
} from "./active_flow_state.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../skills/_shared/active_skill_state.ts";
import {
  applyConversationSkillState,
  applyMemoryV2ActiveLoaderResult,
  applySafetyCrisisSkillState,
  buildTurnFrameForRuntime,
  effectLedgerTraceForTest,
  ensureClarifyQuestionVisible,
  ensureCommittedRenderParity,
  isReminderReadoutQuestion,
  mergeVisibleTextForTest,
  stripCommitClaimBeforeClarify,
  stripTrackClaimWithoutCommit,
  stripUnfoundedReminderCapacityDenial,
} from "./run.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    needs_research: { detected: false, value: false },
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    ...patch,
  };
}

Deno.test("direct effect text is not deterministically prepended when visible agent answered", () => {
  const merged = mergeVisibleTextForTest({
    content: "C'est programmé pour demain.",
    nextTempMemory: {},
    toolExecution: "success",
    executedTools: ["create_one_shot_reminder"],
    toolSkillRun: {
      selected_handler: "create_one_shot_reminder",
      committed_effects: [{ type: "create_one_shot_reminder" }],
    },
  }, "Je confirme le rappel et je réponds au besoin produit.");

  assertEquals(
    merged,
    "Je confirme le rappel et je réponds au besoin produit.",
  );
});

Deno.test("runtime trace effect ledger includes committed direct effects", () => {
  const trace = effectLedgerTraceForTest({
    turnId: "turn-ledger-direct-effect",
    operationRuntime: {
      content: "C'est programmé.",
      nextTempMemory: {},
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      toolSkillRun: {
        selected_handler: "create_one_shot_reminder",
        operation_id: "op-reminder-1",
        status: "success",
        committed_effects: [{
          type: "create_one_shot_reminder",
          operation_id: "op-reminder-1",
          scheduled_checkin_ids: ["checkin-1"],
          scheduled_for: "2026-07-01T13:44:03.829Z",
          local_label: "dans 45 minutes",
          reminder_instruction: "ouvrir Ajuster mon plan",
        }],
      },
    },
  });
  const entries = trace.entries as Array<Record<string, unknown>>;

  assertEquals((trace.counts as Record<string, number>).committed, 1);
  assertEquals(entries[0]?.effect_type, "one_shot_reminder.create");
  assertEquals(entries[0]?.operation_type, "create_one_shot_reminder");
  assertEquals(entries[0]?.db_ref, {
    table: "scheduled_checkins",
    id: "checkin-1",
  });
});

function route(turnFrame: TurnFrame) {
  return runConversationRouters({
    turn_frame: turnFrame,
    safety_context_risk_band: turnFrame.safety.risk_band,
  });
}

const RETAINED_LOCAL_FLOW_IDS: ActiveLocalConversationFlowSkillId[] = [
  "daily_action_review_v1",
  "weekly_adaptive_review_v1",
  "product_help",
  "coaching_recommendation",
  "plan_realignment",
  "feature_opportunity",
  "safety_crisis",
];

// P5-A (paul-p4verify T12) — recalibrage volontaire : l'ancien test préservait
// le carve-out V5-1 à high/critical. Doctrine P3-A/P5-A : en crise, le rappel
// explicite est BLOQUÉ à la route (reason safety_priority) et la lane le
// diffère honnêtement (safety_crisis_deferred + __safety_deferred_reminder),
// jamais committé. V5-1 ne vit que sur distress_support (medium non-crise).
Deno.test("global router gives safety high critical priority and blocks one-shot reminder for honest deferral", () => {
  const decision = route(frame({
    safety: {
      risk_band: "critical",
      reason_codes: ["self_harm"],
      evidence: ["danger"],
    },
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
    skill_signals: {
      product_help: { detected: true, confidence_band: "high" },
    },
  }));

  assertEquals(decision.response_owner, "safety");
  assertEquals(decision.selected_handler, "safety_crisis");
  assertEquals(decision.direct_effects_to_run, []);
  assertEquals(
    decision.blocked_paths.some((path) =>
      path.path === "direct_effects.create_one_shot_reminder" &&
      path.reason_code === "safety_priority"
    ),
    true,
  );
});

Deno.test("runtime turn frame builder does not call global dispatcher LLM during active local flow", async () => {
  let llmCalled = false;
  const turnFrame = await buildTurnFrameForRuntime({
    skipGlobalDispatcherForActiveLocalFlow: true,
    dispatcherInput: {
      user_message: "et du coup je fais quoi ?",
      recent_messages: [{ role: "user", content: "question produit" }],
      user_id: "u-active-flow",
      channel: "web",
      active_skill_state: { skill_id: "product_help", status: "active" },
      plan_snapshot: [],
      safety_context_output: {
        detected: false,
        risk_band: "none",
        reason_codes: [],
        evidence: [],
        allow_side_effects: true,
        layer_contributions: {},
      } as any,
      conversation_risk_history: [],
      source_message_id: "m-active-flow",
      turn_id: "t-active-flow",
    },
    llmRunner: async () => {
      llmCalled = true;
      throw new Error("global dispatcher llm must be skipped");
    },
  });

  assertEquals(llmCalled, false);
  assertEquals(turnFrame.turn_id, "t-active-flow");
  assertEquals(turnFrame.source_message_id, "m-active-flow");
  assertEquals(turnFrame.skill_signals, {});
  assertEquals(turnFrame.direct_effects, []);
  assertEquals(turnFrame.memory_plan.memory_mode, "none");
});

Deno.test("global redispatch after local exit uses note without active flow ownership", async () => {
  const turnFrame = await buildTurnFrameForRuntime({
    skipGlobalDispatcherForActiveLocalFlow: false,
    dispatcherInput: {
      user_message:
        "explique-moi en deux phrases la difference entre une carte d'attaque et une carte de defense",
      recent_messages: [],
      user_id: "u-local-exit",
      channel: "web",
      active_skill_state: null,
      flow_state_context: {
        last_local_flow_exit: {
          source_flow_id: "feature_opportunity",
          note_information: {
            source_flow_id: "feature_opportunity",
            target_dispatcher: "global",
            confidence: "high",
            structured_context: {
              recommended_next_focus: "product_help",
            },
          },
        },
      },
      plan_snapshot: [],
      safety_context_output: {
        detected: false,
        risk_band: "none",
        reason_codes: [],
        evidence: [],
        allow_side_effects: true,
        layer_contributions: {},
      } as any,
      conversation_risk_history: [],
      source_message_id: "m-local-exit",
      turn_id: "t-local-exit",
    },
    llmRunner: async () => ({
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      direct_effects: [],
      skill_signals: {
        product_help: {
          detected: true,
          confidence_band: "high",
          reason: "local_flow_exit_note",
        },
      },
    }),
  });

  const decision = runConversationRouters({
    turn_frame: turnFrame,
    active_skill_state: null,
    safety_context_risk_band: "none",
  });

  assertEquals(
    (turnFrame.note_information as any)?.source_flow_id,
    "feature_opportunity",
  );
  assertEquals(decision.response_owner, "product_help");
  assertEquals(decision.reason_code, "product_help_signal");
});

Deno.test("runtime turn frame builder skips global dispatcher LLM for every retained local flow", async () => {
  for (const skillId of RETAINED_LOCAL_FLOW_IDS) {
    let llmCalled = false;
    const active = readActiveFlowState({
      __active_skill_state: { skill_id: skillId, status: "active" },
    });
    const turnFrame = await buildTurnFrameForRuntime({
      skipGlobalDispatcherForActiveLocalFlow:
        shouldSkipGlobalDispatcherForActiveLocalFlow({
          activeSkillState: active.activeSkillState,
        }),
      dispatcherInput: {
        user_message: "message pendant flow actif",
        recent_messages: [{ role: "user", content: "message precedent" }],
        user_id: `u-${skillId}`,
        channel: "web",
        active_skill_state: active.activeSkillState,
        plan_snapshot: [],
        safety_context_output: {
          detected: false,
          risk_band: "none",
          reason_codes: [],
          evidence: [],
          allow_side_effects: true,
          layer_contributions: {},
        } as any,
        conversation_risk_history: [],
        source_message_id: `m-${skillId}`,
        turn_id: `t-${skillId}`,
      },
      llmRunner: async () => {
        llmCalled = true;
        throw new Error(`global dispatcher llm called for ${skillId}`);
      },
    });

    assertEquals(llmCalled, false);
    assertEquals(turnFrame.turn_id, `t-${skillId}`);
    assertEquals(turnFrame.source_message_id, `m-${skillId}`);
    assertEquals(turnFrame.skill_signals, {});
  }
});

Deno.test("global router blocks non reminder direct effects during safety", () => {
  const decision = route(frame({
    safety: {
      risk_band: "high",
      reason_codes: ["self_harm"],
      evidence: ["danger"],
    },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { plan_item_id: "walk", status_hint: "done" },
    }],
  }));

  assertEquals(decision.response_owner, "safety");
  assertEquals(decision.selected_handler, "safety_crisis");
  assertEquals(decision.direct_effects_to_run, []);
  assertEquals(
    decision.blocked_paths.some((path) =>
      path.path === "direct_effects.track_progress_plan_item" &&
      path.reason_code === "safety_priority"
    ),
    true,
  );
});

Deno.test("global router runs direct effect then normal reply", () => {
  const decision = route(frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { plan_item_id: "walk", status_hint: "done" },
    }],
  }));

  assertEquals(decision.response_owner, "normal_reply");
  assertEquals(decision.selected_handler, undefined);
  assertEquals(decision.direct_effects_to_run, ["track_progress_plan_item"]);
  assertEquals(decision.reason_code, "direct_effects_then_normal_reply");
});

Deno.test("global router can combine direct effect with product_help owner", () => {
  const decision = route(frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "demain a 9h" },
    }],
    skill_signals: {
      product_help: {
        detected: true,
        confidence_band: "high",
        reason: "product_help_question",
      },
    },
  }));

  assertEquals(decision.response_owner, "product_help");
  assertEquals(decision.selected_handler, "product_help");
  assertEquals(decision.direct_effects_to_run, [
    "create_one_shot_reminder",
  ]);
});

Deno.test("global router routes coaching recommendation signal", () => {
  const decision = route(frame({
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        reason: "feature_choice",
      },
    },
  }));

  assertEquals(decision.response_owner, "coaching_recommendation");
  assertEquals(decision.selected_handler, "coaching_recommendation");
  assertEquals(decision.reason_code, "coaching_recommendation_signal");
});

Deno.test("global router does not invent active flow arbitration for standard routes", () => {
  const decision = route(frame({
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        reason: "feature_choice",
      },
    },
  }));

  assertEquals(decision.response_owner, "coaching_recommendation");
  assertEquals(decision.active_flow_arbitration, undefined);
});

Deno.test("global router routes feature opportunity signal", () => {
  const decision = route(frame({
    skill_signals: {
      feature_opportunity: {
        detected: true,
        confidence_band: "high",
        reason: "initiative_opportunity",
        context: {
          feature: "initiatives",
          opportunity_kind: "recurring_context",
          trigger_context: "avant chaque diner",
          user_problem_summary: "Repeated dinner smoking difficulty.",
          priority_reason: "Repeated context fits initiatives.",
        },
      },
    },
  }));

  assertEquals(decision.response_owner, "feature_opportunity");
  assertEquals(decision.selected_handler, "feature_opportunity");
  assertEquals(decision.reason_code, "feature_opportunity_signal");
});

Deno.test("global router routes plan realignment signal", () => {
  const decision = route(frame({
    skill_signals: {
      plan_realignment: {
        detected: true,
        confidence_band: "high",
        reason: "plan_drift_repair_need",
        context: {
          drift_type: "lost_rhythm",
          scope: "week",
          explicit_adjust_request: false,
          product_execution_allowed: false,
          reason: "User reports being disconnected from the weekly plan.",
        },
      },
    },
  }));

  assertEquals(decision.response_owner, "plan_realignment");
  assertEquals(decision.selected_handler, "plan_realignment");
  assertEquals(decision.reason_code, "plan_realignment_signal");
});

Deno.test("global router keeps coaching recommendation before feature opportunity", () => {
  const decision = route(frame({
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        reason: "risk_moment_feature_recommendation",
      },
      feature_opportunity: {
        detected: true,
        confidence_band: "high",
        reason: "initiative_opportunity",
      },
    },
  }));

  assertEquals(decision.response_owner, "coaching_recommendation");
});

Deno.test("global router keeps active coaching before product_help", () => {
  const active = {
    skill_id: "coaching_recommendation",
    status: "active",
    working_state: {},
  };
  const continued = runConversationRouters({
    turn_frame: frame(),
    active_skill_state: active,
    safety_context_risk_band: "none",
  });
  assertEquals(continued.response_owner, "coaching_recommendation");

  const interrupted = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        product_help: { detected: true, confidence_band: "high" },
      },
    }),
    active_skill_state: active,
    safety_context_risk_band: "none",
  });
  assertEquals(interrupted.response_owner, "coaching_recommendation");
  assertEquals(interrupted.reason_code, "active_coaching_recommendation");
  assertEquals(
    interrupted.active_flow_arbitration?.active_owner,
    "coaching_recommendation",
  );
  assertEquals(
    interrupted.active_flow_arbitration?.decision,
    "continue_active",
  );
});

Deno.test("readActiveFlowState active coaching prevents product_help ownership", () => {
  const activeFlowState = readActiveFlowState({
    [ACTIVE_CONVERSATION_SKILL_KEY]: {
      version: 1,
      skill_id: "coaching_recommendation",
      status: "active",
      turn_count: 1,
      started_at: new Date(Date.now() - 120_000).toISOString(),
      updated_at: new Date(Date.now() - 60_000).toISOString(),
      working_state: {
        coaching_recommendation_local_state: {
          stage: "recommend",
          recommendation_decision: {
            primary_feature: "attack_card",
          },
        },
      },
    },
  });
  const decision = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        product_help: {
          detected: true,
          confidence_band: "high",
          reason: "where_is_feature",
        },
      },
    }),
    active_skill_state: activeFlowState.activeSkillState,
    safety_context_risk_band: "none",
  });

  assertEquals(
    (activeFlowState.activeSkillState as any)?.skill_id,
    "coaching_recommendation",
  );
  assertEquals(decision.response_owner, "coaching_recommendation");
  assertEquals(decision.reason_code, "active_coaching_recommendation");
});

Deno.test("readActiveFlowState active product_help keeps product_help ownership", () => {
  const activeFlowState = readActiveFlowState({
    [ACTIVE_CONVERSATION_SKILL_KEY]: {
      version: 1,
      skill_id: "product_help",
      status: "active",
      turn_count: 1,
      started_at: new Date(Date.now() - 120_000).toISOString(),
      updated_at: new Date(Date.now() - 60_000).toISOString(),
      working_state: {
        product_help_local_state: {
          skill_id: "product_help",
          status: "open",
        },
      },
    },
  });
  const decision = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        coaching_recommendation: { detected: true, confidence_band: "high" },
      },
    }),
    active_skill_state: activeFlowState.activeSkillState,
    safety_context_risk_band: "none",
  });

  assertEquals(
    (activeFlowState.activeSkillState as any)?.skill_id,
    "product_help",
  );
  assertEquals(decision.response_owner, "product_help");
  assertEquals(decision.reason_code, "active_product_help");
  assertEquals(decision.active_flow_arbitration?.decision, "continue_active");
});

Deno.test("readActiveFlowState active weekly keeps weekly ownership", () => {
  const activeFlowState = readActiveFlowState({
    [ACTIVE_CONVERSATION_SKILL_KEY]: {
      version: 1,
      skill_id: "weekly_adaptive_review_v1",
      status: "open",
      turn_count: 1,
      started_at: new Date(Date.now() - 120_000).toISOString(),
      updated_at: new Date(Date.now() - 60_000).toISOString(),
      weekly_flow_state: {
        stage: "week_experience",
      },
    },
  });
  const decision = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        product_help: { detected: true, confidence_band: "high" },
      },
    }),
    active_skill_state: activeFlowState.activeSkillState,
    safety_context_risk_band: "none",
  });

  assertEquals(
    (activeFlowState.activeSkillState as any)?.skill_id,
    "weekly_adaptive_review_v1",
  );
  assertEquals(decision.response_owner, "weekly_adaptive_review_v1");
  assertEquals(decision.selected_handler, "weekly_adaptive_review_v1");
  assertEquals(decision.reason_code, "active_weekly_adaptive_review");
  assertEquals(
    decision.active_flow_arbitration?.active_owner,
    "weekly_adaptive_review_v1",
  );
  assertEquals(decision.active_flow_arbitration?.decision, "continue_active");
});

Deno.test("readActiveFlowState active safety keeps safety ownership and skips product/help routes", () => {
  const activeFlowState = readActiveFlowState({
    [ACTIVE_CONVERSATION_SKILL_KEY]: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      mode: "local_safety_flow",
      turn_count: 1,
      started_at: new Date(Date.now() - 120_000).toISOString(),
      updated_at: new Date(Date.now() - 60_000).toISOString(),
      working_state: {
        phase: "acute_grounding",
        risk_band: "high",
        user_not_alone: false,
      },
    },
  });
  const decision = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        product_help: {
          detected: true,
          confidence_band: "high",
          reason: "where_is_feature",
        },
      },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: "rappelle-moi dans 30 minutes" },
      }],
    }),
    active_skill_state: activeFlowState.activeSkillState,
    safety_context_risk_band: "none",
  });

  assertEquals(
    (activeFlowState.activeSkillState as any)?.skill_id,
    "safety_crisis",
  );
  assertEquals(
    shouldSkipGlobalDispatcherForActiveLocalFlow({
      activeSkillState: activeFlowState.activeSkillState,
    }),
    true,
  );
  assertEquals(decision.response_owner, "safety");
  assertEquals(decision.selected_handler, "safety_crisis");
  // P3-A (alex-safety-escalation R1-B01): AUCUN effet durable pendant une
  // crise active — l'ancien contrat (rappel admis, reason *_with_direct_
  // effects) était le bug observé (rappel committé au milieu d'une crise).
  assertEquals(decision.reason_code, "active_safety_crisis");
  assertEquals(decision.direct_effects_to_run, []);
  assertEquals(
    decision.blocked_paths.some((blocked) =>
      blocked.path === "direct_effects.create_one_shot_reminder" &&
      blocked.reason_code === "active_safety_priority"
    ),
    true,
  );
  assertEquals(decision.active_flow_arbitration?.decision, "continue_active");
  assertEquals(
    decision.active_flow_arbitration?.active_owner,
    "safety_crisis",
  );
});

Deno.test("applySafetyCrisisSkillState writes canonical active state on continue", () => {
  const next = applySafetyCrisisSkillState({
    tempMemory: {},
    activeSkillState: null,
    output: {
      skill_id: "safety_crisis",
      status: "continue",
      response_intent: "continue_safety_flow",
      reply: "reste avec moi",
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
      state_patch: {
        phase: "acute_grounding",
        risk_band: "high",
        immediate_danger: null,
        has_means_nearby: null,
        user_not_alone: false,
        emergency_help_mentioned: false,
        human_support_mentioned: false,
        consecutive_deescalated_turns: 0,
        visible_task: { kind: "acute_grounding" },
      },
    } as any,
  });

  const active = readActiveFlowState(next).activeSkillState as any;
  assertEquals(active.skill_id, "safety_crisis");
  assertEquals(active.status, "active");
  assertEquals(active.mode, "local_safety_flow");
  assertEquals(active.working_state.phase, "acute_grounding");
  assertEquals(active.working_state.risk_band, "high");
  assertEquals(active.working_state.visible_task, undefined);
  assertEquals((next as any).__active_skill_state.skill_id, "safety_crisis");
});

Deno.test("applySafetyCrisisSkillState purges every active flow key on exit to global", () => {
  const active = {
    version: 1,
    skill_id: "safety_crisis",
    status: "resolving",
    mode: "local_safety_flow",
    turn_count: 4,
    working_state: { phase: "exit_check" },
  };
  const next = applySafetyCrisisSkillState({
    tempMemory: {
      [ACTIVE_CONVERSATION_SKILL_KEY]: active,
      __active_skill_state: active,
      active_skill_state: active,
    },
    activeSkillState: active,
    output: {
      skill_id: "safety_crisis",
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      reply: "Le plus urgent est stabilisé.",
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
      state_patch: {
        phase: "resolved",
        risk_band: "low",
        immediate_danger: false,
        has_means_nearby: false,
        user_not_alone: true,
        emergency_help_mentioned: true,
        human_support_mentioned: true,
        visible_task: { kind: "resolved_exit" },
        exit_memo: {
          reason: "resolved",
          flow_summary: "Safety crisis deescalated.",
          note_information: {
            source_flow_id: "safety_crisis",
            target_dispatcher: "global",
          },
        },
      },
    } as any,
  });

  assertEquals(readActiveFlowState(next).activeSkillState, null);
  assertEquals((next as any)[ACTIVE_CONVERSATION_SKILL_KEY], undefined);
  assertEquals((next as any).__active_skill_state, undefined);
  assertEquals((next as any).active_skill_state, undefined);
  assertEquals(
    (next as any).__last_safety_crisis_exit_memo.note_information
      .target_dispatcher,
    "global",
  );
});

Deno.test("applyConversationSkillState purges every active flow key for local dispatcher exits", () => {
  const skillIds = [
    "product_help",
    "coaching_recommendation",
    "feature_opportunity",
    "plan_realignment",
  ] as const;

  for (const skillId of skillIds) {
    const active = {
      version: 1,
      skill_id: skillId,
      status: "active",
      turn_count: 2,
      working_state: {},
    };
    const next = applyConversationSkillState({
      tempMemory: {
        [ACTIVE_CONVERSATION_SKILL_KEY]: active,
        __active_skill_state: active,
        active_skill_state: active,
      },
      activeSkillState: active,
      skillId,
      output: {
        skill_id: skillId,
        status: "exit",
        response_intent: "exit_to_global_dispatcher",
        reply: "",
        memory_trace: {
          memory_used_for_response: false,
          memory_item_ids_used: [],
          correction_detected: false,
          correction_target_item_ids: [],
        },
        state_patch: {},
      } as any,
    });

    assertEquals(readActiveFlowState(next).activeSkillState, null);
    assertEquals((next as any)[ACTIVE_CONVERSATION_SKILL_KEY], undefined);
    assertEquals((next as any).__active_skill_state, undefined);
    assertEquals((next as any).active_skill_state, undefined);
  }
});

Deno.test("global router keeps active feature opportunity before product_help", () => {
  const active = {
    skill_id: "feature_opportunity",
    status: "active",
    working_state: {},
  };
  const continued = runConversationRouters({
    turn_frame: frame(),
    active_skill_state: active,
    safety_context_risk_band: "none",
  });
  assertEquals(continued.response_owner, "feature_opportunity");

  const interrupted = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        product_help: { detected: true, confidence_band: "high" },
      },
    }),
    active_skill_state: active,
    safety_context_risk_band: "none",
  });
  assertEquals(interrupted.response_owner, "feature_opportunity");
  assertEquals(interrupted.reason_code, "active_feature_opportunity");
  assertEquals(
    interrupted.active_flow_arbitration?.active_owner,
    "feature_opportunity",
  );
  assertEquals(
    interrupted.active_flow_arbitration?.decision,
    "continue_active",
  );
});

Deno.test("global router keeps active plan realignment before product_help", () => {
  const active = {
    skill_id: "plan_realignment",
    status: "active",
    working_state: {},
  };
  const continued = runConversationRouters({
    turn_frame: frame(),
    active_skill_state: active,
    safety_context_risk_band: "none",
  });
  assertEquals(continued.response_owner, "plan_realignment");

  const interrupted = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        product_help: { detected: true, confidence_band: "high" },
      },
    }),
    active_skill_state: active,
    safety_context_risk_band: "none",
  });
  assertEquals(interrupted.response_owner, "plan_realignment");
  assertEquals(interrupted.reason_code, "active_plan_realignment");
  assertEquals(
    interrupted.active_flow_arbitration?.active_owner,
    "plan_realignment",
  );
  assertEquals(
    interrupted.active_flow_arbitration?.decision,
    "continue_active",
  );
});

Deno.test("global router can run one-shot direct effect during coaching", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: "demain a 9h" },
      }],
    }),
    active_skill_state: {
      skill_id: "coaching_recommendation",
      status: "active",
    },
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "coaching_recommendation");
  assertEquals(decision.direct_effects_to_run, ["create_one_shot_reminder"]);
});

Deno.test("global router allows one-shot direct effect during normal reply", () => {
  const decision = runConversationRouters({
    turn_frame: frame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: "demain a 9h" },
      }],
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(decision.response_owner, "normal_reply");
  assertEquals(decision.direct_effects_to_run, ["create_one_shot_reminder"]);
});

Deno.test("global router sends personal inventory/status requests to normal reply", () => {
  const decision = route(frame({
    memory_plan: {
      response_intent: "personal_state_question",
      reasoning_complexity: "medium",
      context_need: "targeted",
      memory_mode: "light",
      model_tier_hint: "standard",
      context_budget_tier: "small",
      targets: [{ type: "runtime_snapshot", key: "active_surfaces" }],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.8,
    },
  }));

  assertEquals(decision.response_owner, "normal_reply");
  assertEquals(decision.selected_handler, undefined);
  assertEquals(decision.direct_effects_to_run, []);
});

Deno.test("router bridge injects Memory V2 active payload into the final prompt context", () => {
  const contextLoadResult = {
    context: {
      recentTurns: "=== MESSAGES RECENTS ===\nUser: ou en etait mon ICP ?\n\n",
    },
    profile: {},
    metrics: {},
  } as any;

  const applied = applyMemoryV2ActiveLoaderResult(
    contextLoadResult,
    { before: true },
    {
      tempMemory: { before: true, memory_v2_loaded: true },
      context_block:
        "=== MEMOIRE V2 ACTIVE ===\n- Le fondateur avait choisi les managers primo-accedants comme ICP prioritaire.\n\n",
      retrieval_mode: "cross_topic_lookup",
      topic_decision: "stay",
      active_topic_id: "topic-1",
      payload_item_ids: ["mem-1"],
      metrics: {
        load_ms: 12,
        total_ms: 15,
        sensitive_excluded_count: 0,
        invalid_injection_count: 0,
        fallback_used: false,
        dispatcher_memory_plan_applied: true,
        loader_plan_reason: "dispatcher_memory_plan",
        loaded_scope_counts: {
          topic: 1,
          event: 0,
          global: 0,
          action: 0,
          level: 0,
          entity: 0,
        },
      },
    },
  );

  const prompt = buildContextString(contextLoadResult.context);
  assertEquals(applied.injected, true);
  assertEquals((applied.tempMemory as any).memory_v2_loaded, true);
  assertEquals(prompt.includes("=== MEMOIRE V2 ACTIVE ==="), true);
  assertEquals(prompt.includes("managers primo-accedants"), true);
});

Deno.test("global router does not run ambiguous direct effects", () => {
  const decision = route(frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "ambiguous",
      confidence_band: "high",
      payload_hint: { raw_text: "rappelle-moi demain" },
    }],
  }));

  assertEquals(decision.response_owner, "normal_reply");
  assertEquals(decision.direct_effects_to_run, []);
  assertEquals(decision.blocked_paths, [{
    path: "direct_effects.create_one_shot_reminder",
    reason_code: "target_ambiguous",
  }]);
});

Deno.test("ensureClarifyQuestionVisible re-injects a suppressed clarify question (P2-2, nina-untested R1-B02)", () => {
  const clarifyFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
  }) as TurnFrame & Record<string, unknown>;
  (clarifyFrame as Record<string, unknown>).direct_effect_lane = {
    requested_effects: [{ type: "track_progress_plan_item" }],
    allowed_effects: [{ type: "track_progress_plan_item" }],
    committed_effects: [],
    blocked_effects: [{
      type: "track_progress_plan_item",
      reason_code: "target_not_evidenced",
      status: "needs_clarify",
      clarify_question:
        "Tu parles de quelle action exactement ? Je pensais à « préparer une option saine ».",
    }],
  };

  // Le composeur a supprimé la question: elle est ré-injectée telle quelle.
  const withoutQuestion =
    "Dans ce fil, elle reste seulement signalée, pas confirmée.";
  const repaired = ensureClarifyQuestionVisible(withoutQuestion, clarifyFrame);
  assertEquals(repaired.includes("?"), true);
  assertEquals(repaired.includes("quelle action"), true);

  // Anti-faux-positif 1: le composeur a déjà posé UNE question (reformulation
  // permise) → aucune injection.
  const withQuestion = "Tu parles de laquelle, la marche ou la lecture ?";
  assertEquals(
    ensureClarifyQuestionVisible(withQuestion, clarifyFrame),
    withQuestion,
  );

  // Anti-faux-positif 2: aucun outcome needs_clarify → texte inchangé.
  const plainFrame = frame();
  assertEquals(
    ensureClarifyQuestionVisible(withoutQuestion, plainFrame),
    withoutQuestion,
  );
});

// ── P7-A (rose-hard19 R1-B03, rose-untested22 R1-B01): traîne conversation_risk
// BIDIRECTIONNELLE — un tour safety en bande basse n'épingle plus 10. ────────
Deno.test("commitPostTurnRiskTrail: tour safety bande none ⇒ score 0, la décroissance démarre (P7-A)", async () => {
  const { commitPostTurnRiskTrail } = await import("./run.ts");
  const next = commitPostTurnRiskTrail(
    { __conversation_risk_scores: [10, 10] },
    {
      runtimeSafetyRiskBand: "none",
      turnFrameRiskBand: "none",
      routeIsSafety: true,
      sourceMessageId: "m1",
    },
  );
  assertEquals(next.__conversation_risk_scores, [10, 10, 0]);
});

Deno.test("commitPostTurnRiskTrail: tour safety AIGU (high/critical) garde la traîne pleine (P7-A anti-FP, intention P4-C préservée)", async () => {
  const { commitPostTurnRiskTrail } = await import("./run.ts");
  const acute = commitPostTurnRiskTrail(
    {},
    {
      runtimeSafetyRiskBand: "high",
      turnFrameRiskBand: "high",
      routeIsSafety: true,
      sourceMessageId: "m1",
    },
  );
  assertEquals(acute.__conversation_risk_scores, [10]);
  // Medium safety = 6 (vigilance réelle, plus jamais un pin à 10).
  const medium = commitPostTurnRiskTrail(
    {},
    {
      runtimeSafetyRiskBand: "medium",
      turnFrameRiskBand: "medium",
      routeIsSafety: true,
      sourceMessageId: "m1",
    },
  );
  assertEquals(medium.__conversation_risk_scores, [6]);
  // Hors safety, la bande fait foi (inchangé).
  const plain = commitPostTurnRiskTrail(
    {},
    {
      runtimeSafetyRiskBand: "medium",
      turnFrameRiskBand: "medium",
      routeIsSafety: false,
      sourceMessageId: "m1",
    },
  );
  assertEquals(plain.__conversation_risk_scores, [6]);
});

// ── P7-F (rose-untested22 R1-B05): garde de cohérence de script en sortie ────
Deno.test("stripForeignScriptTokens: retire un token devanagari, préserve emoji et accents (P7-F)", async () => {
  const { stripForeignScriptTokens } = await import("./run.ts");
  assertEquals(
    stripForeignScriptTokens("je n'ai pas de पुष्टि ici pour un export 🙂"),
    "je n'ai pas de ici pour un export 🙂",
  );
  // Anti-faux-positif: français accenté + emoji + chiffres intacts.
  const clean = "C'est calé pour demain à 19h — bravo 💛 (2e jour d'affilée) !";
  assertEquals(stripForeignScriptTokens(clean), clean);
  // Fail-open: une réponse entièrement hors-script rend l'original.
  assertEquals(stripForeignScriptTokens("პასუხი"), "პასუხი");
});


// ── P8-E (paul-untested22 R1 T14): readout READ-ONLY des rappels sous safety ─

Deno.test("isReminderReadoutQuestion: readout servi, mutation et create jamais captés (P8-E)", () => {
  // Positifs: restitution/inventaire.
  assertEquals(
    isReminderReadoutQuestion("redis-moi mes rappels de demain"),
    true,
  );
  assertEquals(
    isReminderReadoutQuestion("j'ai quoi comme rappels posés là ?"),
    true,
  );
  assertEquals(
    isReminderReadoutQuestion("dis-moi quels rappels il me reste"),
    true,
  );
  // Anti-faux-positifs: un acte de création n'est pas un readout.
  assertEquals(
    isReminderReadoutQuestion("rappelle-moi demain d'appeler le kiné"),
    false,
  );
  // Anti-faux-positifs: une mutation n'est pas un readout.
  assertEquals(
    isReminderReadoutQuestion("annule mon rappel de 22h"),
    false,
  );
  assertEquals(
    isReminderReadoutQuestion("décale mes rappels à demain"),
    false,
  );
  // Anti-faux-positif: aucun nom « rappel » → jamais capté.
  assertEquals(
    isReminderReadoutQuestion("redis-moi ce que je t'avais dit de retenir"),
    false,
  );
});


// ── P8-F (eva-hard23 R1-B04): garde de rendu claim-avant-clarify ─────────────

Deno.test("stripCommitClaimBeforeClarify: aucun verbe de commit ne survit sur un clarify de rappel sans commit (P8-F)", () => {
  const clarifyFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "rappel demain a 7" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "create",
      }],
      committed_effects: [],
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "hour_meridiem_ambiguous",
      }],
      visible_confirmation_hint:
        "Juste pour être sûre du créneau : 7h du matin, ou 19h ?",
    },
  } as any);
  // Positif: la phrase de claim saute, la question reste.
  const guarded = stripCommitClaimBeforeClarify(
    "Je te le mets pour demain à 07:00. Juste pour être sûre du créneau : 7h du matin, ou 19h ?",
    clarifyFrame,
  );
  assertEquals(/je te le mets/i.test(guarded), false);
  assertEquals(guarded.includes("7h du matin, ou 19h ?"), true);
  // Positif: texte 100% claim → la question contractuelle remplace tout.
  const replaced = stripCommitClaimBeforeClarify(
    "C'est fait, je te le pose pour demain à 07:00 ✅",
    clarifyFrame,
  );
  assertEquals(/c'est fait|je te le pose/i.test(replaced), false);
  assertEquals(replaced.length > 0, true);

  // Anti-faux-positif: un COMMIT du même type existe (co-demande partielle
  // P8-A) → « c'est fait pour jeudi » est vrai, rien n'est retiré.
  const partialFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "deux rappels" },
    }],
    direct_effect_lane: {
      requested_effects: [
        { type: "create_one_shot_reminder", reason_code: "create" },
        { type: "create_one_shot_reminder", reason_code: "create" },
      ],
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "r-1",
        scheduled_for: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        reminder_instruction: "appeler le médecin",
      }],
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "missing_time",
      }],
    },
  } as any);
  const untouched =
    "C'est fait pour jeudi à 18h. Par contre, l'autre n'est pas posé — il me manque le créneau, tu veux quelle heure ?";
  assertEquals(
    stripCommitClaimBeforeClarify(untouched, partialFrame),
    untouched,
  );

  // Anti-faux-positif: aucun outcome rappel → texte intact.
  assertEquals(
    stripCommitClaimBeforeClarify("C'est fait, bien joué !", frame()),
    "C'est fait, bien joué !",
  );
});

Deno.test("stripCommitClaimBeforeClarify: « bien décalé à jeudi » sur un ledger BLOQUÉ sans commit → strip, repli honnête (P9-C, alex-hard24 R1-B01)", () => {
  const blockedFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "decale le a jeudi soir meme heure" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "create",
      }],
      committed_effects: [],
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "duplicate_pending",
      }],
    },
  } as any);
  // Le claim exact du run réel: participes de mutation + mots intercalés
  // (« le rappel DE 22H est BIEN décalé ») — le motif P8-F d'origine le
  // laissait passer.
  const guarded = stripCommitClaimBeforeClarify(
    "Le rappel de 22h est bien décalé à jeudi soir, même heure : brancher mon téléphone loin du lit.",
    blockedFrame,
  );
  assertEquals(/d[ée]cal[ée]/i.test(guarded), false);
  assertEquals(guarded.trim().length > 0, true);

  // Paraphrase: « je l'ai déplacé » saute aussi.
  const paraphrase = stripCommitClaimBeforeClarify(
    "C'est bon, je l'ai déplacé à jeudi.",
    blockedFrame,
  );
  assertEquals(/d[ée]plac[ée]/i.test(paraphrase), false);

  // Anti-faux-positif: le DIFFÉRÉ SAFETY bloqué garde son accusé honnête
  // (« je le garde pour après » est la vérité contractuelle du blocage).
  const deferredFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "rappel demain midi boire de l'eau" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "create",
      }],
      committed_effects: [],
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "safety_deferred",
      }],
    },
  } as any);
  const deferredText =
    "Pour le rappel de midi, je le garde pour après — là, on reste sur toi.";
  assertEquals(
    stripCommitClaimBeforeClarify(deferredText, deferredFrame),
    deferredText,
  );
});

Deno.test("stripUnfoundedReminderCapacityDenial: refus de capacité confabulé sans AUCUN outcome rappel → strip + récupération honnête (P10-C, eva-hard24 R1-B01)", () => {
  // Tour multi-intent où le planner a perdu l'effet rappel: seul un track
  // committé vit au frame — le refus « je ne peux pas le créer ici » est
  // inventé (la capacité existe).
  const trackOnlyFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "puzzle", status_hint: "completed" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "track_progress_plan_item",
        reason_code: "track",
      }],
      committed_effects: [{
        type: "track_progress_plan_item",
        target_title: "puzzle",
        progress_status: "completed",
      }],
      blocked_effects: [],
    },
  } as any);
  const guarded = stripUnfoundedReminderCapacityDenial(
    "C'est noté pour le puzzle. Pour le rappel de demain à 19h, je ne peux pas le créer ici.",
    trackOnlyFrame,
  );
  assertEquals(/je ne peux pas le creer/i.test(
    guarded.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
  ), false);
  assertEquals(guarded.includes("C'est noté pour le puzzle."), true);
  // P12-V: récupération générique (elle couvre aussi les mutations).
  assertEquals(/dis-moi exactement ce que tu veux/.test(guarded), true);

  // Anti-faux-positif: un outcome rappel BLOQUÉ existe (raison contractuelle)
  // → le refus est la vérité, intact.
  const blockedReminderFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "rappelle-moi chaque soir" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "create",
      }],
      committed_effects: [],
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "recurring_not_supported",
      }],
    },
  } as any);
  const legit =
    "Je ne peux pas le créer ici : un rappel qui revient chaque soir se pose dans les initiatives.";
  assertEquals(
    stripUnfoundedReminderCapacityDenial(legit, blockedReminderFrame),
    legit,
  );
});

Deno.test("stripTrackClaimWithoutCommit: « les deux sont pris » sur ledger track bloqué 0-commit → strip (P10-C, alex-hard24 R1-B04)", () => {
  const blockedTrackFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "carnet", status_hint: "completed" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "track_progress_plan_item",
        reason_code: "track",
      }],
      committed_effects: [],
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "already_tracked_today",
      }],
    },
  } as any);
  const guarded = stripTrackClaimWithoutCommit(
    "Les deux sont pris en compte : carnet ET couper les écrans ✅",
    blockedTrackFrame,
  );
  assertEquals(/les deux sont (bien )?pris/i.test(
    guarded.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
  ), false);
  assertEquals(guarded.trim().length > 0, true);

  // Anti-faux-positif: un commit existe sur le tour → claim possible, intact.
  const committedFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "carnet", status_hint: "completed" },
    }],
    direct_effect_lane: {
      requested_effects: [
        { type: "track_progress_plan_item", reason_code: "track" },
        { type: "track_progress_plan_item", reason_code: "track" },
      ],
      committed_effects: [
        {
          type: "track_progress_plan_item",
          target_title: "carnet",
          progress_status: "completed",
        },
        {
          type: "track_progress_plan_item",
          target_title: "écrans",
          progress_status: "completed",
        },
      ],
      blocked_effects: [],
    },
  } as any);
  const honest = "Les deux sont pris en compte : carnet ET écrans ✅";
  assertEquals(stripTrackClaimWithoutCommit(honest, committedFrame), honest);
});

Deno.test("stripCommitClaimBeforeClarify: mutation affirmée SANS aucun outcome rappel → strip (P10-V, câblage contractuel P12-C, eva-hard25 R1-B03)", () => {
  // P12-C: le frame est construit à la forme RUNTIME (AUCUN champ
  // user_message — il n'existe pas dans le contrat) ; le message user passe
  // par le PARAMÈTRE contractuel. L'ancien test enrichissait le frame d'un
  // champ commode et masquait le fait que la branche P10-V était
  // inatteignable en prod (leçon de la vague 25).
  const noOutcomeFrame = frame({ direct_effects: [] } as any);
  const guarded = stripCommitClaimBeforeClarify(
    "C'est fait pour celui du midi : demain à 12h pile, à la place de 12h30.",
    noOutcomeFrame,
    "et celui du midi, garde le demain mais avance le a 12h pile au lieu de 12h30",
  );
  assertEquals(/a la place de 12h30/.test(
    guarded.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ").toLowerCase(),
  ), false);
  assertEquals(guarded.trim().length > 0, true);

  // Régression eva-hard25 R1-B03 (verbatim du run réel): « avance le a
  // 20h15 » sans AUCUN effet émis + « C'est avancé à 20h15 » → strip.
  const evaFrame = frame({ direct_effects: [] } as any);
  const evaGuarded = stripCommitClaimBeforeClarify(
    "C'est avancé à 20h15 pour les poubelles.",
    evaFrame,
    "avance le a 20h15",
  );
  assertEquals(/avance/.test(
    evaGuarded.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
      .replace(/redis-moi lequel deplacer[\s\S]*/, ""),
  ), false);

  // Anti-faux-positif 1: readout légitime sur un tour STATUS (le user parle
  // du rappel sans verbe de mutation) → intact.
  const statusFrame = frame({ direct_effects: [] } as any);
  const readout = "Oui, ton rappel est posé pour demain à 18h.";
  assertEquals(
    stripCommitClaimBeforeClarify(
      readout,
      statusFrame,
      "mon rappel de demain est bien posé ?",
    ),
    readout,
  );

  // Anti-faux-positif 2: mutation demandée ET committée → intact (couvert
  // par reminderCommitted).
  const committedFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "avance le a 12h" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "create",
      }],
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "r1",
        scheduled_for: "2026-07-16T10:00:00.000Z",
        local_label: "demain à 12:00",
        reminder_instruction: "pause déjeuner",
      }],
      blocked_effects: [],
    },
  } as any);
  const honest = "C'est fait : le rappel de midi est avancé à 12h pile.";
  assertEquals(
    stripCommitClaimBeforeClarify(
      honest,
      committedFrame,
      "avance le a 12h pile au lieu de 12h30",
    ),
    honest,
  );
});

// ── P12-C: parité INVERSE rendu=ledger (ensureCommittedRenderParity) ──────

Deno.test("ensureCommittedRenderParity: 2 commits rendus « je n'ai rien changé » → déni retiré + commits accusés depuis le ledger (alex-untested24 R1-B05)", () => {
  const silentCommitFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "avance le rappel des courses d'une heure" },
    }],
    direct_effect_lane: {
      requested_effects: [
        { type: "cancel_one_shot_reminder", reason_code: "cancel" },
        { type: "create_one_shot_reminder", reason_code: "create" },
      ],
      committed_effects: [
        {
          type: "cancel_one_shot_reminder",
          id: "old",
          ids: ["old"],
          local_label: "aujourd'hui à 17:00",
        },
        {
          type: "create_one_shot_reminder",
          id: "new",
          scheduled_for: "2026-07-15T14:00:00.000Z",
          local_label: "aujourd'hui à 16:00",
          reminder_instruction: "faire les courses",
        },
      ],
      blocked_effects: [],
    },
  } as any);
  const out = ensureCommittedRenderParity(
    "Je n'ai rien changé sur tes rappels. Donne-moi l'heure cible exacte et je le fais ?",
    silentCommitFrame,
    "avance le rappel des courses d'une heure",
  );
  const normalized = out.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  // Le déni saute, le commit réel est accusé (label ou instruction), le
  // cancel aussi.
  assertEquals(/je n ?.?ai rien change/.test(normalized), false);
  assertEquals(/16:00|courses/.test(normalized), true);
  assertEquals(/annul/.test(normalized), true);
});

Deno.test("ensureCommittedRenderParity: « j'ai annulé » sans AUCUN commit cancel → strip + repli honnête (alex-untested24 R1-B08)", () => {
  const createOnlyFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "annule-le et remets-le à 16h" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "create",
      }],
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "new",
        scheduled_for: "2026-07-15T14:00:00.000Z",
        local_label: "aujourd'hui à 16:00",
        reminder_instruction: "faire les courses",
      }],
      blocked_effects: [],
    },
  } as any);
  const out = ensureCommittedRenderParity(
    "C'est fait : j'ai annulé le rappel des courses de 17:00 et je l'ai remis à 16:00.",
    createOnlyFrame,
    "annule-le et remets-le à 16h",
  );
  const normalized = out.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ").toLowerCase();
  assertEquals(/j ai (bien |deja )?annule/.test(normalized), false);
  // Le create committé reste accusé (ré-appendu si la phrase a sauté).
  assertEquals(/16:00|courses/.test(normalized), true);
});

Deno.test("ensureCommittedRenderParity: « vendredi reste tel quel » sur un cancel committé du tour → faux-intact retiré + cancel accusé (nina-p10reval R1-B03c)", () => {
  const cancelledFridayFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "rajoute jeudi et garde vendredi" },
    }],
    direct_effect_lane: {
      requested_effects: [
        { type: "cancel_one_shot_reminder", reason_code: "cancel" },
        { type: "create_one_shot_reminder", reason_code: "create" },
      ],
      committed_effects: [
        {
          type: "cancel_one_shot_reminder",
          id: "friday",
          ids: ["friday"],
          local_label: "vendredi 17 juillet à 18:00",
        },
        {
          type: "create_one_shot_reminder",
          id: "thursday",
          scheduled_for: "2026-07-16T16:00:00.000Z",
          local_label: "jeudi 16 juillet à 18:00",
          reminder_instruction: "récupérer le colis",
        },
      ],
      blocked_effects: [],
    },
  } as any);
  const out = ensureCommittedRenderParity(
    "C'est rajouté pour jeudi 16 juillet à 18:00 (récupérer le colis). Le rappel de vendredi reste tel quel.",
    cancelledFridayFrame,
    "rajoute jeudi et tu gardes vendredi hein",
  );
  const normalized = out.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  assertEquals(/reste tel quel/.test(normalized), false);
  assertEquals(/annul/.test(normalized), true);
});

Deno.test("ensureCommittedRenderParity anti-faux-positifs: commit accusé nominal intact ; déni légitime sans commit intact", () => {
  // Commit accusé correctement → aucun changement.
  const nominalFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "rappelle-moi demain à 9h de relire le plan" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "create",
      }],
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "r1",
        scheduled_for: "2026-07-16T07:00:00.000Z",
        local_label: "demain à 09:00",
        reminder_instruction: "relire le plan",
      }],
      blocked_effects: [],
    },
  } as any);
  const nominal = "C'est fait : demain à 09:00 pour relire le plan.";
  assertEquals(
    ensureCommittedRenderParity(
      nominal,
      nominalFrame,
      "rappelle-moi demain à 9h de relire le plan",
    ),
    nominal,
  );
  // Zéro commit + déni honnête → intact (la garde ne s'arme que sur commit).
  const emptyFrame = frame({ direct_effects: [] } as any);
  const honestDenial =
    "Je n'ai rien changé sur tes rappels — dis-moi lequel tu veux bouger.";
  assertEquals(
    ensureCommittedRenderParity(honestDenial, emptyFrame, "ok merci"),
    honestDenial,
  );
});

Deno.test("stripTrackClaimWithoutCommit: claim ADDITIF sur item non commis retiré même avec un commit coexistant (P12-C, eva-hard25 R1-B01)", () => {
  const partialTrackFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "item-1", status_hint: "completed" },
    }],
    direct_effect_lane: {
      requested_effects: [{
        type: "track_progress_plan_item",
        reason_code: "track",
      }],
      committed_effects: [{
        type: "track_progress_plan_item",
        target_title: "Temps d'écran limité",
        progress_status: "completed",
      }],
      blocked_effects: [],
    },
  } as any);
  const out = stripTrackClaimWithoutCommit(
    "C'est fait pour le temps d'écran limité. Et j'ai aussi noté ton activité de ce soir : aquarelle. ✅",
    partialTrackFrame,
  );
  const normalized = out.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ").toLowerCase();
  assertEquals(/aquarelle/.test(normalized), false);
  assertEquals(/temps d ecran/.test(normalized), true);

  // Anti-FP 1: le claim additif RECOUVRE le titre committé → intact.
  const covered =
    "C'est noté. Et j'ai aussi coché ton temps d'écran limité au passage.";
  assertEquals(
    stripTrackClaimWithoutCommit(covered, partialTrackFrame),
    covered,
  );
  // Anti-FP 2: accusé mémoire (« je le garde en tête ») → intact.
  const memory =
    "C'est fait pour le temps d'écran limité. Et j'ai aussi noté ça, je le garde en tête.";
  assertEquals(
    stripTrackClaimWithoutCommit(memory, partialTrackFrame),
    memory,
  );
});

Deno.test("commitPostTurnRiskTrail: bande = MAX(runtime, frame) — snapshot runtime none n'écrase plus un frame medium (P12-F, rose-hard25 R1-B03)", async () => {
  const { commitPostTurnRiskTrail } = await import("./run.ts");
  // Positif: runtime stale « none » + frame medium ⇒ medium/6 committé.
  const next = commitPostTurnRiskTrail(
    { __conversation_risk_scores: [6] },
    {
      runtimeSafetyRiskBand: "none",
      turnFrameRiskBand: "medium",
      routeIsSafety: false,
      sourceMessageId: "m1",
    },
  );
  assertEquals(next.__last_turn_risk_band, "medium");
  assertEquals(next.__conversation_risk_scores, [6, 6]);
  // Symétrique: runtime medium + frame none ⇒ medium (le max, pas l'ordre).
  const reversed = commitPostTurnRiskTrail(
    {},
    {
      runtimeSafetyRiskBand: "medium",
      turnFrameRiskBand: "none",
      routeIsSafety: false,
      sourceMessageId: "m2",
    },
  );
  assertEquals(reversed.__last_turn_risk_band, "medium");
  // Anti-FP désescalade (P7-A préservé): none des deux côtés ⇒ 0, la
  // décroissance démarre.
  const calm = commitPostTurnRiskTrail(
    { __conversation_risk_scores: [6, 6] },
    {
      runtimeSafetyRiskBand: "none",
      turnFrameRiskBand: "none",
      routeIsSafety: false,
      sourceMessageId: "m3",
    },
  );
  assertEquals(calm.__last_turn_risk_band, "none");
  assertEquals(calm.__conversation_risk_scores, [6, 6, 0]);
});

Deno.test("stripRetractedSessionMention: contenu rétracté restitué depuis l'history → strip; réouverture NOMINATIVE intacte (P12-V, probe P12-3)", async () => {
  const { stripRetractedSessionMention } = await import("./run.ts");
  const history = [
    {
      role: "user",
      content:
        "au fait, retiens que je veux me remettre à la natation, ça me trotte dans la tête.",
    },
    { role: "assistant", content: "C'est noté." },
    {
      role: "user",
      content:
        "ah et en fait, oublie ce que je t'ai dit tout à l'heure sur la natation, laisse tomber ce projet.",
    },
    { role: "assistant", content: "C'est bon, je le mets de côté." },
  ];
  // Positif: recall GÉNÉRIQUE + restitution → la phrase saute.
  const guarded = stripRetractedSessionMention(
    "Tu voulais te remettre à la natation. C'est le seul objectif que j'ai sous la main.",
    history,
    "tu te souviens de ce que je t'ai dit que je voulais faire ?",
    frame(),
  );
  assertEquals(/natation/i.test(guarded), false);
  assertEquals(guarded.trim().length > 0, true);
  // Anti-FP 1: réouverture NOMINATIVE (le user renomme la natation) → intact.
  const reopened = "Pour la natation, tu m'avais demandé de laisser tomber — on la reprend ?";
  assertEquals(
    stripRetractedSessionMention(
      reopened,
      history,
      "finalement parle-moi de la natation, je re-réfléchis",
      frame(),
    ),
    reopened,
  );
  // Anti-FP 2: aucune rétractation dans l'history → intact.
  const noRetraction = [
    { role: "user", content: "retiens que je veux me remettre à la natation." },
    { role: "assistant", content: "C'est noté." },
  ];
  const normalReply = "Tu voulais te remettre à la natation.";
  assertEquals(
    stripRetractedSessionMention(
      normalReply,
      noRetraction,
      "tu te souviens de ce que je voulais faire ?",
      frame(),
    ),
    normalReply,
  );
});

Deno.test("stripUnfoundedReminderCapacityDenial: refus confabulé sur une MUTATION (« je ne peux pas décaler ça depuis ce chat ») → strip (P12-V, probe P12-5 passe 4)", () => {
  const emptyFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
  } as any);
  const guarded = stripUnfoundedReminderCapacityDenial(
    "Je ne peux pas décaler ça depuis ce chat. Tes deux rappels de ce soir restent à 19h et 22h.",
    emptyFrame,
  );
  assertEquals(/je ne peux pas decaler/i.test(
    guarded.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
  ), false);
  assertEquals(/19h et 22h/.test(guarded), true);
  // Anti-FP: refus LÉGITIME (outcome rappel bloqué existant) → intact —
  // couvert par le test P10-C existant (blockedReminderFrame).
});
