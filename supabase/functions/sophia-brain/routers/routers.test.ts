import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runDirectEffectGate } from "./direct_effect_gate.ts";
import { runToolSkillRouter } from "./tool_skill_router.ts";
import { runConversationRouters } from "./routers.ts";
import { runSkillRouter } from "./skill_router.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "whatsapp",
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
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    ...patch,
  };
}

Deno.test("skill_router covers start, continue, handoff, none and safety", () => {
  assertEquals(
    runSkillRouter({
      turn_frame: frame({
        skill_signals: {
          entry: {
            emotional_repair: { detected: true, confidence_band: "high" },
          },
        },
      }),
    }).status,
    "start",
  );
  assertEquals(
    runSkillRouter({
      active_skill_state: { skill_id: "emotional_repair" },
      turn_frame: frame({
        skill_signals: {
          lifecycle: {
            emotional_repair: { detected: true, confidence_band: "high" },
          },
        },
      }),
    }).status,
    "continue",
  );
  assertEquals(
    runSkillRouter({
      active_skill_state: { skill_id: "execution_breakdown" },
      turn_frame: frame({
        skill_signals: {
          entry: {
            emotional_repair: { detected: true, confidence_band: "high" },
          },
        },
      }),
    }).status,
    "handoff",
  );
  assertEquals(
    runSkillRouter({
      active_skill_state: { skill_id: "daily_action_review_v1" },
      turn_frame: frame({
        skill_signals: {
          exit: {
            skill_id: "daily_action_review_v1",
            reason: "user_explicitly_requested_to_stop_review",
          } as any,
          lifecycle: {
            daily_action_review_v1: {
              detected: true,
              confidence_band: "high",
            },
          },
        },
      }),
    }).status,
    "exit",
  );
  assertEquals(
    runSkillRouter({
      active_skill_state: { skill_id: "daily_action_review_v1" },
      turn_frame: frame({
        skill_signals: {
          exit: {
            daily_action_review_v1: {
              reason: "user_explicitly_requested_to_stop_review",
              evidence: "oublie le bilan",
            },
          } as any,
          lifecycle: {
            daily_action_review_v1: {
              detected: true,
              confidence_band: "high",
            },
          },
        },
      }),
    }).status,
    "exit",
  );
  assertEquals(runSkillRouter({ turn_frame: frame() }).status, "none");
  assertEquals(
    runSkillRouter({
      turn_frame: frame({
        safety: { risk_band: "critical", reason_codes: [], evidence: [] },
      }),
    }).selected_skill_id,
    "safety_crisis",
  );
  assertEquals(
    runSkillRouter({
      turn_frame: frame({
        safety: {
          risk_band: "medium",
          reason_codes: ["recent_safety_context_caution"],
          evidence: [],
        },
      }),
    }).selected_skill_id,
    "safety_crisis",
  );
  assertEquals(
    runSkillRouter({
      turn_frame: frame({
        safety: {
          risk_band: "medium",
          reason_codes: ["passive_ideation_negated_medium_caution"],
          evidence: [],
        },
      }),
    }).selected_skill_id,
    "safety_crisis",
  );
  assertEquals(
    runSkillRouter({
      turn_frame: frame({
        safety: {
          risk_band: "medium",
          reason_codes: ["active_safety_flow_caution"],
          evidence: [],
        },
      }),
    }).selected_skill_id,
    "safety_crisis",
  );
});

Deno.test("tool_skill_router covers start, continue, confirmation paths, blocked and none", () => {
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame({
        tool_skill_intents: [{
          operation_type: "prepare_attack_card",
          explicitness: "explicit",
          confidence_band: "high",
          ambiguity: "none",
          user_intent: "create",
        }],
      }),
      safety_pregate_risk_band: "none",
    }).status,
    "start",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame(),
      active_tool_skill_intake: { operation_type: "prepare_attack_card" },
      safety_pregate_risk_band: "none",
    }).status,
    "continue",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame({
        confirmation_response: { kind: "yes", confidence_band: "high" },
      }),
      pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
      safety_pregate_risk_band: "none",
    }).status,
    "execute_confirmed",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame({
        confirmation_response: { kind: "no", confidence_band: "high" },
      }),
      pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
      safety_pregate_risk_band: "none",
    }).status,
    "cancel",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame({
        confirmation_response: {
          kind: "correction_to_pending",
          confidence_band: "high",
        },
      }),
      pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
      safety_pregate_risk_band: "none",
    }).status,
    "continue",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame({
        tool_skill_intents: [{
          operation_type: "prepare_attack_card",
          explicitness: "explicit",
          confidence_band: "high",
          ambiguity: "target_ambiguous",
          user_intent: "create",
        }],
      }),
      safety_pregate_risk_band: "none",
    }).status,
    "blocked",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame(),
      safety_pregate_risk_band: "none",
    }).status,
    "none",
  );
});

Deno.test("conversation routers assign response owner priority", () => {
  assertEquals(
    runConversationRouters({
      turn_frame: frame({
        safety: {
          risk_band: "medium",
          reason_codes: ["recent_safety_context_caution"],
          evidence: [],
        },
      }),
      safety_pregate_risk_band: "medium",
    }).response_owner,
    "safety",
  );
  assertEquals(
    runConversationRouters({
      turn_frame: frame({
        confirmation_response: { kind: "yes", confidence_band: "high" },
      }),
      pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
      safety_pregate_risk_band: "none",
    }).response_owner,
    "pending_confirmation",
  );
  const productRoute = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "product_question",
          },
        },
      },
    }),
    safety_pregate_risk_band: "none",
  });
  assertEquals(productRoute.response_owner, "product_help");
  assertEquals(productRoute.selected_handler, "product_help");
});

Deno.test("conversation routers keep emotional_repair owner over new tool skill start", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        entry: {
          emotional_repair: {
            detected: true,
            confidence_band: "high",
            reason: "self_attack_or_shame",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "update_coach_preferences",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      }],
    }),
    safety_pregate_risk_band: "none",
  });
  assertEquals(route.response_owner, "conversation_handler");
  assertEquals(route.selected_handler, "emotional_repair");
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "tool_skills" && path.reason_code === "emotion_dominates"
    ),
    true,
  );
});

Deno.test("conversation routers let explicit tool skill interrupt active emotional repair continuation", () => {
  const route = runConversationRouters({
    active_skill_state: { skill_id: "emotional_repair" },
    turn_frame: frame({
      skill_signals: {
        lifecycle: {
          emotional_repair: {
            detected: true,
            confidence_band: "high",
            reason: "active_skill_continue",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "create_recurring_reminder",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    safety_pregate_risk_band: "none",
  });
  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "create_recurring_reminder");
});

Deno.test("conversation routers let explicit tool skill supersede an active conversation exit", () => {
  const route = runConversationRouters({
    active_skill_state: { skill_id: "execution_breakdown" },
    turn_frame: frame({
      skill_signals: {
        exit: {
          execution_breakdown: {
            detected: true,
            confidence_band: "high",
            reason: "user_switched_to_tool_skill_intent",
          },
        },
        lifecycle: {
          execution_breakdown: {
            detected: true,
            confidence_band: "high",
            reason: "active_skill_continue",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    safety_pregate_risk_band: "none",
  });

  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "prepare_attack_card");
  assertEquals(
    route.reason_code,
    "explicit_tool_intent_supersedes_active_conversation_skill",
  );
});

Deno.test("active tool flow answers product_help inline and keeps direct effects runnable", () => {
  const route = runConversationRouters({
    active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { target_item_id: "walk" },
      }],
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "product_question",
          },
        },
      },
    }),
    safety_pregate_risk_band: "none",
  });

  assertEquals(route.response_owner, "product_help");
  assertEquals(route.reason_code, "product_help_inline_resume_active_tool_skill");
  assertEquals(
    route.active_flow_arbitration?.decision,
    "inline_answer_then_resume",
  );
  assertEquals(route.direct_effects_to_run, ["track_progress_plan_item"]);
});

Deno.test("active tool flow blocks weak product_help and continues active operation", () => {
  const route = runConversationRouters({
    active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    turn_frame: frame({
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "medium",
            reason: "weak_product_question",
          },
        },
      },
    }),
    safety_pregate_risk_band: "none",
  });

  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "prepare_attack_card");
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "skill_signals.product_help" &&
      path.reason_code === "weak_product_help_blocked_by_active_tool_skill"
    ),
    true,
  );
});

Deno.test("active tool flow absorbs execution_breakdown but lets high emotional repair suspend it", () => {
  const executionRoute = runConversationRouters({
    active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    turn_frame: frame({
      skill_signals: {
        entry: {
          execution_breakdown: {
            detected: true,
            confidence_band: "high",
            reason: "execution_blocked",
          },
        },
      },
    }),
    safety_pregate_risk_band: "none",
  });
  assertEquals(executionRoute.response_owner, "tool_skill");
  assertEquals(executionRoute.selected_handler, "prepare_attack_card");
  assertEquals(
    executionRoute.reason_code,
    "execution_breakdown_absorbed_by_active_tool_skill",
  );

  const emotionalRoute = runConversationRouters({
    active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    turn_frame: frame({
      skill_signals: {
        entry: {
          emotional_repair: {
            detected: true,
            confidence_band: "high",
            reason: "self_attack_or_shame",
          },
        },
      },
    }),
    safety_pregate_risk_band: "none",
  });
  assertEquals(emotionalRoute.response_owner, "conversation_handler");
  assertEquals(emotionalRoute.selected_handler, "emotional_repair");
  assertEquals(
    emotionalRoute.reason_code,
    "high_conversation_skill_signal_suspends_active_tool_skill",
  );
});

Deno.test("active flow defers tool skill opportunity without blocking direct effects", () => {
  const route = runConversationRouters({
    active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { target_item_id: "walk" },
      }],
      tool_skill_opportunity: {
        type: "self_reminder",
        operation_type: "create_recurring_reminder",
        surface_id: "dashboard.reminders",
        confidence_band: "high",
        should_offer: true,
        prop_reason: "reminder_would_help",
        source_span: "ce serait bien de me le rappeler",
        target_hint: "marcher",
        target_status: "identified",
        suggested_question_intent: "offer_self_reminder",
        offer_timing: "after_current_pending",
        must_not_execute: true,
      },
    }),
    safety_pregate_risk_band: "none",
  });

  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "prepare_attack_card");
  assertEquals(route.direct_effects_to_run, ["track_progress_plan_item"]);
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "tool_skill_opportunity" &&
      path.reason_code === "active_flow_blocks_tool_opportunity"
    ),
    true,
  );
});

Deno.test("active tool flow can be superseded by explicit high-confidence different tool intent", () => {
  const route = runConversationRouters({
    active_tool_skill_intake: { operation_type: "adjust_plan_item" },
    turn_frame: frame({
      tool_skill_intents: [{
        operation_type: "create_recurring_reminder",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    safety_pregate_risk_band: "none",
  });

  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "create_recurring_reminder");
  assertEquals(route.reason_code, "explicit_tool_intent_supersedes_active");
});

Deno.test("pending confirmation answers product_help inline when confirmation is unknown", () => {
  const route = runConversationRouters({
    pending_tool_skill_confirmation: { operation_type: "prepare_attack_card" },
    turn_frame: frame({
      confirmation_response: { kind: "unknown", confidence_band: "low" },
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "product_question",
          },
        },
      },
    }),
    safety_pregate_risk_band: "none",
  });

  assertEquals(route.response_owner, "product_help");
  assertEquals(
    route.reason_code,
    "product_help_inline_resume_pending_confirmation",
  );
});

Deno.test("DirectEffectGate covers allow, needs_clarify and blocked cases", async () => {
  const allowedFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "walk" },
    }],
  });
  assertEquals(
    (await runDirectEffectGate({
      effect_type: "track_progress_plan_item",
      turn_frame: allowedFrame,
      recent_writes_idempotency: { source_message_ids: [] },
      db_idempotency_check: async () => false,
    })).decision,
    "allow",
  );
  assertEquals(
    (await runDirectEffectGate({
      effect_type: "track_progress_plan_item",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "ambiguous",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      recent_writes_idempotency: { source_message_ids: [] },
      db_idempotency_check: async () => false,
    })).decision,
    "needs_clarify",
  );
  const blockedCases = [
    frame({
      safety: { risk_band: "medium", reason_codes: [], evidence: [] },
      direct_effects: allowedFrame.direct_effects,
    }),
    allowedFrame,
    allowedFrame,
  ];
  assertEquals(
    (await runDirectEffectGate({
      effect_type: "track_progress_plan_item",
      turn_frame: blockedCases[0],
      recent_writes_idempotency: { source_message_ids: [] },
      db_idempotency_check: async () => false,
    })).decision,
    "blocked",
  );
  assertEquals(
    (await runDirectEffectGate({
      effect_type: "track_progress_plan_item",
      turn_frame: blockedCases[1],
      pending_tool_skill_confirmation: { id: "p" },
      recent_writes_idempotency: { source_message_ids: [] },
      db_idempotency_check: async () => false,
    })).decision,
    "blocked",
  );
  assertEquals(
    (await runDirectEffectGate({
      effect_type: "track_progress_plan_item",
      turn_frame: blockedCases[2],
      recent_writes_idempotency: { source_message_ids: ["m1"] },
      db_idempotency_check: async () => false,
    })).decision,
    "blocked",
  );
});

Deno.test("DirectEffectGate covers 20 cumulative condition cases", async () => {
  const baseFrame = frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { text: "rappel" },
    }],
  });
  const cases = [
    { name: "allow-reminder", input: baseFrame, expected: "allow" },
    {
      name: "allow-tracking",
      input: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk" },
        }],
      }),
      effect: "track_progress_plan_item" as const,
      expected: "allow",
    },
    {
      name: "safety-medium",
      input: frame({
        safety: { risk_band: "medium", reason_codes: [], evidence: [] },
        direct_effects: baseFrame.direct_effects,
      }),
      expected: "blocked",
    },
    {
      name: "safety-high",
      input: frame({
        safety: { risk_band: "high", reason_codes: [], evidence: [] },
        direct_effects: baseFrame.direct_effects,
      }),
      expected: "blocked",
    },
    {
      name: "safety-critical",
      input: frame({
        safety: { risk_band: "critical", reason_codes: [], evidence: [] },
        direct_effects: baseFrame.direct_effects,
      }),
      expected: "blocked",
    },
    { name: "pending", input: baseFrame, pending: true, expected: "blocked" },
    {
      name: "recent-duplicate",
      input: baseFrame,
      recent: ["m1"],
      expected: "blocked",
    },
    {
      name: "db-duplicate",
      input: baseFrame,
      dbDuplicate: true,
      expected: "blocked",
    },
    { name: "missing-effect", input: frame(), expected: "blocked" },
    {
      name: "weak-intent",
      input: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "weak",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "implied-intent",
      input: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "implied",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "target-ambiguous",
      input: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "ambiguous",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "target-missing",
      input: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "missing",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "medium-confidence",
      input: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "medium",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "low-confidence",
      input: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "low",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "critical-confidence",
      input: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "critical",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "allow-low-safety",
      input: frame({
        safety: { risk_band: "low", reason_codes: [], evidence: [] },
        direct_effects: baseFrame.direct_effects,
      }),
      expected: "allow",
    },
    {
      name: "allow-none-safety",
      input: frame({
        safety: { risk_band: "none", reason_codes: [], evidence: [] },
        direct_effects: baseFrame.direct_effects,
      }),
      expected: "allow",
    },
    {
      name: "duplicate-source-before-db",
      input: baseFrame,
      recent: ["m1"],
      dbDuplicate: true,
      expected: "blocked",
    },
    {
      name: "pending-before-db",
      input: baseFrame,
      pending: true,
      dbDuplicate: true,
      expected: "blocked",
    },
  ];
  assertEquals(cases.length, 20);
  for (const testCase of cases) {
    const result = await runDirectEffectGate({
      effect_type: testCase.effect ?? "create_one_shot_reminder",
      turn_frame: testCase.input,
      pending_tool_skill_confirmation: testCase.pending
        ? { id: "p" }
        : undefined,
      recent_writes_idempotency: { source_message_ids: testCase.recent ?? [] },
      db_idempotency_check: async () => Boolean(testCase.dbDuplicate),
    });
    assertEquals(result.decision, testCase.expected, testCase.name);
  }
});
