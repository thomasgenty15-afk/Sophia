import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runDirectEffectGate } from "./direct_effect_gate.ts";
import { runToolSkillRouter } from "./tool_skill_router.ts";
import { runConversationRouters } from "./routers.ts";
import { runSkillRouter } from "./skill_router.ts";

function frame(
  patch: Partial<TurnFrame> & Record<string, unknown> = {},
): TurnFrame {
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
    flow_opportunity: null,
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
  } as unknown as TurnFrame;
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
      active_skill_state: { skill_id: "demotivation_repair" },
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
  const activeSafety = runSkillRouter({
    active_skill_state: {
      skill_id: "safety_crisis",
      working_state: { phase: "stabilizing" },
    },
    turn_frame: frame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  });
  assertEquals(activeSafety.status, "continue");
  assertEquals(activeSafety.reason_code, "active_safety_crisis_continue");
  const activeSafetyResolvedTurn = runSkillRouter({
    active_skill_state: {
      skill_id: "safety_crisis",
      working_state: { phase: "exit_check" },
    },
    turn_frame: frame({
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "user_says_security",
          },
        },
      },
    }),
  });
  assertEquals(activeSafetyResolvedTurn.status, "continue");
  assertEquals(activeSafetyResolvedTurn.selected_skill_id, "safety_crisis");
});

Deno.test("skill_router ignores malformed entry skill signal values", () => {
  const decision = runSkillRouter({
    turn_frame: frame({
      skill_signals: {
        entry: {
          noisy_skill: undefined,
          emotional_repair: { detected: true, confidence_band: "high" },
        } as any,
      },
    }),
  });
  assertEquals(decision.status, "start");
  assertEquals(decision.selected_skill_id, "emotional_repair");
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
      safety_context_risk_band: "none",
    }).status,
    "start",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame(),
      active_tool_skill_intake: { operation_type: "prepare_attack_card" },
      safety_context_risk_band: "none",
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
      safety_context_risk_band: "none",
    }).status,
    "wait_for_confirmation",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame({
        confirmation_response: { kind: "no", confidence_band: "high" },
      }),
      pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
      safety_context_risk_band: "none",
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
      safety_context_risk_band: "none",
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
      safety_context_risk_band: "none",
    }).status,
    "blocked",
  );
  assertEquals(
    runToolSkillRouter({
      turn_frame: frame(),
      safety_context_risk_band: "none",
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
      safety_context_risk_band: "medium",
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
      safety_context_risk_band: "none",
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
    safety_context_risk_band: "none",
  });
  assertEquals(productRoute.response_owner, "product_help");
  assertEquals(productRoute.selected_handler, "product_help");
});

Deno.test("conversation routers force normal reply when research is requested", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      needs_research: {
        detected: true,
        value: true,
        query: "OpenAI latest model pricing",
        confidence: 0.82,
      },
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "product_question",
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
      flow_opportunity: {
        opportunity_id: "prepare_attack_card.execution_friction",
        target_kind: "tool_skill",
        target_flow: "prepare_attack_card",
        confidence: "high",
        priority: 60,
        reason: "execution_friction",
        evidence: ["je bloque"],
        seed_context: {
          target_hint: "marche",
          surface: "attack_card",
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "normal_reply");
  assertEquals(route.reason_code, "needs_research_forces_normal_reply");
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "tool_skill.prepare_attack_card" &&
      path.reason_code === "needs_research_forces_normal_reply"
    ),
    true,
  );
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "conversation_skill.product_help" &&
      path.reason_code === "needs_research_forces_normal_reply"
    ),
    true,
  );
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "flow_opportunity" &&
      path.reason_code === "needs_research_forces_normal_reply"
    ),
    true,
  );
});

Deno.test("conversation routers keep safety and explicit confirmations above research", () => {
  assertEquals(
    runConversationRouters({
      turn_frame: frame({
        safety: { risk_band: "critical", reason_codes: [], evidence: [] },
        needs_research: {
          detected: true,
          value: true,
          query: "latest news",
          confidence: 0.9,
        },
      }),
      safety_context_risk_band: "critical",
    }).response_owner,
    "safety",
  );

  assertEquals(
    runConversationRouters({
      turn_frame: frame({
        confirmation_response: { kind: "yes", confidence_band: "high" },
        needs_research: {
          detected: true,
          value: true,
          query: "latest news",
          confidence: 0.9,
        },
      }),
      pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
      safety_context_risk_band: "none",
    }).response_owner,
    "pending_confirmation",
  );
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
    safety_context_risk_band: "none",
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

Deno.test("conversation routers keep normal reply over implicit tool starts when normal fit dominates", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      normal_reply_fit_score: 0.88,
      normal_reply_fit_evidence: ["ordinary conversation can answer directly"],
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "implied",
        confidence_band: "high",
        score: 0.82,
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "normal_reply");
  assertEquals(route.reason_code, "normal_reply_fit_dominates");
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "tool_skill.prepare_defense_card" &&
      path.reason_code === "normal_reply_fit_dominates" &&
      path.raw_score === 0.82 &&
      path.normal_reply_fit_score === 0.88
    ),
    true,
  );
});

Deno.test("conversation routers let explicit tool starts beat normal reply fit", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      normal_reply_fit_score: 0.9,
      normal_reply_fit_evidence: ["conversation remains possible"],
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        confidence_band: "high",
        score: 0.78,
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "prepare_defense_card");
});

Deno.test("conversation routers keep normal reply over light repair signals", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      normal_reply_fit_score: 0.86,
      normal_reply_fit_evidence: ["normal supportive answer can handle this"],
      skill_signals: {
        entry: {
          demotivation_repair: {
            detected: true,
            confidence_band: "high",
            score: 0.72,
            reason: "low_energy_but_not_repair_owned",
          },
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "normal_reply");
  assertEquals(route.reason_code, "normal_reply_fit_dominates");
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "conversation_skill.demotivation_repair" &&
      path.reason_code === "normal_reply_fit_dominates"
    ),
    true,
  );
});

Deno.test("conversation routers let strong repair signals beat normal reply fit", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      normal_reply_fit_score: 0.72,
      normal_reply_fit_evidence: ["conversation possible but not dominant"],
      skill_signals: {
        entry: {
          demotivation_repair: {
            detected: true,
            confidence_band: "high",
            score: 0.9,
            reason: "clear_immediate_repair_need",
          },
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "conversation_handler");
  assertEquals(route.selected_handler, "demotivation_repair");
});

Deno.test("conversation routers let explicit action refusal demotivation beat attack card", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      normal_reply_fit_score: 0.9,
      skill_signals: {
        entry: {
          demotivation_repair: {
            detected: true,
            confidence_band: "high",
            score: 0.82,
            reason: "explicit_action_refusal_focus_on_loss_of_desire",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        score: 0.9,
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "conversation_handler");
  assertEquals(route.selected_handler, "demotivation_repair");
  assertEquals(
    route.reason_code,
    "explicit_action_refusal_prefers_demotivation_repair",
  );
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "tool_skill.prepare_attack_card" &&
      path.reason_code ===
        "explicit_action_refusal_prefers_demotivation_repair"
    ),
    true,
  );
});

Deno.test("conversation routers block attack flow opportunity after explicit action refusal", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        entry: {
          demotivation_repair: {
            detected: true,
            confidence_band: "high",
            reason: "explicit_action_refusal_focus_on_loss_of_desire",
          },
        },
      },
      flow_opportunity: {
        opportunity_id: "prepare_attack_card.execution_friction",
        target_kind: "tool_skill",
        target_flow: "prepare_attack_card",
        confidence: "high",
        score: 0.88,
        priority: 70,
        reason: "attack card opportunity",
        evidence: ["execution friction"],
        seed_context: {},
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "conversation_handler");
  assertEquals(route.selected_handler, "demotivation_repair");
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "flow_opportunity.prepare_attack_card" &&
      path.reason_code ===
        "explicit_action_refusal_prefers_demotivation_repair"
    ),
    true,
  );
});

Deno.test("conversation routers penalize repeated implicit flow offers", () => {
  const route = runConversationRouters({
    flow_intervention_context: {
      last_flow_target: "prepare_defense_card",
      turns_since_last_flow_decline: 2,
    },
    turn_frame: frame({
      normal_reply_fit_score: 0.5,
      normal_reply_fit_evidence: ["conversation still fits"],
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "implied",
        confidence_band: "high",
        score: 0.9,
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "normal_reply");
  assertEquals(route.reason_code, "normal_reply_fit_dominates");
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "tool_skill.prepare_defense_card" &&
      path.raw_score === 0.9 &&
      path.adjusted_score === 0.55
    ),
    true,
  );
});

Deno.test("conversation routers block weak flow opportunities when normal reply dominates", () => {
  const route = runConversationRouters({
    turn_frame: frame({
      normal_reply_fit_score: 1,
      normal_reply_fit_evidence: ["ordinary conversation remains dominant"],
      flow_opportunity: {
        opportunity_id: "prepare_defense_card.reflex_snacking",
        target_kind: "tool_skill",
        target_flow: "prepare_defense_card",
        confidence: "medium",
        score: 0.55,
        priority: 40,
        reason: "implicit defense card opportunity",
        evidence: ["grignoter par reflexe"],
        seed_context: {
          target_hint: "grignotage par reflexe",
          surface: "defense_card",
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "normal_reply");
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "flow_opportunity.prepare_defense_card" &&
      path.reason_code === "normal_reply_fit_dominates" &&
      path.raw_score === 0.55 &&
      path.normal_reply_fit_score === 1
    ),
    true,
  );
});

Deno.test("conversation routers keep active safety owner while deferring tool skills", () => {
  const route = runConversationRouters({
    active_skill_state: { skill_id: "safety_crisis" },
    turn_frame: frame({
      skill_signals: {
        lifecycle: {
          safety_crisis: {
            detected: true,
            confidence_band: "high",
            reason: "active_safety_followup",
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
    safety_context_risk_band: "none",
  });
  assertEquals(route.response_owner, "safety");
  assertEquals(route.selected_handler, "safety_crisis");
  assertEquals(route.direct_effects_to_run, []);
});

Deno.test("conversation routers block explicit tool skill during active emotional repair continuation", () => {
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
    safety_context_risk_band: "none",
  });
  assertEquals(route.response_owner, "conversation_handler");
  assertEquals(route.selected_handler, "emotional_repair");
  assertEquals(
    route.reason_code,
    "explicit_tool_intent_blocked_by_active_conversation_skill",
  );
});

Deno.test("conversation routers keep active conversation local flow before explicit tool skill", () => {
  const route = runConversationRouters({
    active_skill_state: { skill_id: "demotivation_repair" },
    turn_frame: frame({
      skill_signals: {
        exit: {
          demotivation_repair: {
            detected: true,
            confidence_band: "high",
            reason: "user_switched_to_tool_skill_intent",
          },
        },
        lifecycle: {
          demotivation_repair: {
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
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "conversation_handler");
  assertEquals(route.selected_handler, "demotivation_repair");
  assertEquals(
    route.reason_code,
    "explicit_tool_intent_blocked_by_active_conversation_skill",
  );
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "tool_skill.prepare_attack_card" &&
      path.reason_code ===
        "active_conversation_skill_requires_local_dispatcher_handoff"
    ),
    true,
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
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "product_help");
  assertEquals(
    route.reason_code,
    "product_help_inline_resume_active_tool_skill",
  );
  assertEquals(
    route.active_flow_arbitration?.decision,
    "inline_answer_then_resume",
  );
  assertEquals(route.direct_effects_to_run, ["track_progress_plan_item"]);
});

Deno.test("active conversation skill exit signal routes through active local dispatcher", () => {
  const route = runConversationRouters({
    active_skill_state: { skill_id: "demotivation_repair" },
    turn_frame: frame({
      skill_signals: {
        exit: {
          demotivation_repair: {
            detected: true,
            confidence_band: "high",
            reason: "user_asks_to_stop_flow",
          },
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "conversation_handler");
  assertEquals(route.selected_handler, "demotivation_repair");
  assertEquals(route.reason_code, "active_skill_exit_requested");
  assertEquals(route.active_flow_arbitration?.decision, "continue_active");
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
    safety_context_risk_band: "none",
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

Deno.test("active tool flow lets high emotional repair suspend it", () => {
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
    safety_context_risk_band: "none",
  });
  assertEquals(emotionalRoute.response_owner, "conversation_handler");
  assertEquals(emotionalRoute.selected_handler, "emotional_repair");
  assertEquals(
    emotionalRoute.reason_code,
    "high_conversation_skill_signal_suspends_active_tool_skill",
  );
});

Deno.test("active flow defers flow opportunity without blocking direct effects", () => {
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
      flow_opportunity: {
        opportunity_id: "create_recurring_reminder.self_reminder",
        target_kind: "tool_skill",
        target_flow: "create_recurring_reminder",
        confidence: "high",
        priority: 60,
        reason: "reminder_would_help",
        evidence: ["ce serait bien de me le rappeler"],
        seed_context: {
          target_hint: "marcher",
          surface: "dashboard.reminders",
        },
      },
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "prepare_attack_card");
  assertEquals(route.direct_effects_to_run, ["track_progress_plan_item"]);
  assertEquals(
    route.blocked_paths.some((path) =>
      path.path === "flow_opportunity" &&
      path.reason_code === "active_flow_defers_flow_opportunity"
    ),
    false,
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
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "create_recurring_reminder");
  assertEquals(route.reason_code, "explicit_tool_intent_supersedes_active");
});

Deno.test("active tool flow lets explicit different tool intent supersede active flow", () => {
  const route = runConversationRouters({
    active_tool_skill_intake: { operation_type: "create_recurring_reminder" },
    turn_frame: frame({
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    }),
    safety_context_risk_band: "none",
  });

  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "prepare_attack_card");
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
    safety_context_risk_band: "none",
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
      expected: "allow",
    },
    {
      name: "safety-high",
      input: frame({
        safety: { risk_band: "high", reason_codes: [], evidence: [] },
        direct_effects: baseFrame.direct_effects,
      }),
      expected: "allow",
    },
    {
      name: "safety-critical",
      input: frame({
        safety: { risk_band: "critical", reason_codes: [], evidence: [] },
        direct_effects: baseFrame.direct_effects,
      }),
      expected: "allow",
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
