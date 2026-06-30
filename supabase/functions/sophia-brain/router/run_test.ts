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
  mergeVisibleTextForTest,
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
  "feature_opportunity",
  "safety_crisis",
];

Deno.test("global router gives safety high critical priority while preserving one-shot reminder", () => {
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
  assertEquals(decision.direct_effects_to_run, ["create_one_shot_reminder"]);
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
      started_at: "2026-06-18T10:00:00.000Z",
      updated_at: "2026-06-18T10:01:00.000Z",
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
      started_at: "2026-06-18T10:00:00.000Z",
      updated_at: "2026-06-18T10:01:00.000Z",
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
      started_at: "2026-06-23T10:00:00.000Z",
      updated_at: "2026-06-23T10:01:00.000Z",
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
      started_at: "2026-06-22T10:00:00.000Z",
      updated_at: "2026-06-22T10:01:00.000Z",
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
  assertEquals(
    decision.reason_code,
    "active_safety_crisis_with_direct_effects",
  );
  assertEquals(decision.direct_effects_to_run, ["create_one_shot_reminder"]);
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
