import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  buildInitialOfferDispatcherOutput,
  normalizeFlowOpportunityDispatcherOutput,
  reduceFlowOpportunityDispatcherOutput,
} from "./reducer.ts";
import {
  buildFlowOpportunityLocalDispatcherUserPrompt,
  flowOpportunityLocalDispatcherSystemPrompt,
} from "./prompt.ts";
import {
  maybeRunFlowOpportunityVerificationRuntime,
  selectFlowOpportunityForTurn,
} from "./runtime.ts";
import {
  createFlowOpportunityState,
  readFlowOpportunityState,
  writeFlowOpportunityState,
} from "./state.ts";

function routeDecision(
  overrides: Partial<RouteDecision> = {},
): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "test",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  } as any;
}

function turnFrame(overrides: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn_1",
    source_message_id: "msg_1",
    user_id: "user_1",
    channel: "web",
    safety: { risk_band: "low", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "taxonomy_first",
    },
    ...overrides,
  };
}

const opportunity = {
  opportunity_id: "status_recap.attack_card_uncertainty",
  target_kind: "skill" as const,
  target_flow: "status_recap" as const,
  target_action: "run_status_recap",
  confidence: "high" as const,
  priority: 80,
  reason: "implicit status need from dispatcher",
  evidence: ["structured evidence"],
  seed_context: {
    focus: ["attack_card"],
    surface: "attack_card",
  },
};

function visibleTask(kind: string) {
  return {
    kind,
    conversation_context: {
      state_summary: "test state",
      user_words: ["test user words"],
      field_or_stage: kind,
      known_values: {},
      missing_or_weak_values: [],
      selected_candidate: {},
      handoff_data: {},
      tone_constraints: [],
      do_not_say: [],
      context_summary: null,
      evidence_used: ["test evidence"],
    },
  } as any;
}

Deno.test("flow opportunity local dispatcher prompt explains real output fields", () => {
  const systemPrompt = flowOpportunityLocalDispatcherSystemPrompt();
  assert(systemPrompt.includes("Field Completion Rules"));
  for (
    const field of [
      "`flow_action`",
      "`confidence`",
      "`risk_score`",
      "`opportunity`",
      "`target_flow_input`",
      "`subskill_call`",
      "`visible_task.kind`",
      "`visible_task.conversation_context`",
      "`note_information`",
      "`state_patch`",
      "`exit_memo`",
      "`evidence`",
    ]
  ) {
    assert(systemPrompt.includes(field), `missing field rule: ${field}`);
  }
  assert(systemPrompt.includes("Transition Rules"));
  assert(systemPrompt.includes("`exit_to_global_dispatcher`"));
  assert(systemPrompt.includes("`exit_to_global_dispatcher`"));
  assert(systemPrompt.includes("`safety_preempt`"));
  assert(systemPrompt.includes("`handoff_to_local_flow`"));
  assert(systemPrompt.includes("Anti-faux-positif"));
  assertEquals(systemPrompt.match(/Example \d -/g)?.length, 2);
});

Deno.test("flow opportunity dispatcher user prompt exposes contractual note field", () => {
  const prompt = JSON.parse(buildFlowOpportunityLocalDispatcherUserPrompt({
    user_message: "Tu peux me redire ce qui est pret ?",
    active_state: null,
    initial_payload: opportunity,
    recent_user_messages: [],
    subskill_history: [],
    supported_target_flows: ["status_recap"],
    safety: { risk_band: "low" },
  }));
  assertEquals(prompt.required_json_shape.note_information.needed, false);
  assertEquals(prompt.required_json_shape.note_information.note, null);
  assertEquals(
    "source_flow_id" in prompt.required_json_shape.note_information,
    false,
  );
});

Deno.test("flow opportunity selection keeps direct status as direct route", () => {
  const selected = selectFlowOpportunityForTurn({
    turnFrame: turnFrame({
      skill_signals: {
        entry: {
          status_recap: {
            detected: true,
            confidence_band: "high",
            reason: "structured status signal",
          },
        },
      },
    }),
    routeDecision: routeDecision({
      response_owner: "conversation_handler",
      selected_handler: "status_recap",
      reason_code: "status_recap",
    }),
    tempMemory: {},
  });
  assertEquals(selected, null);
});

Deno.test("flow opportunity selection promotes implicit status signal", () => {
  const selected = selectFlowOpportunityForTurn({
    turnFrame: turnFrame({
      skill_signals: {
        entry: {
          status_recap: {
            detected: true,
            confidence_band: "high",
            reason: "implicit status need",
          },
        },
      },
    }),
    routeDecision: routeDecision(),
    tempMemory: {},
  });
  assertEquals(selected?.target_flow, "status_recap");
  assertEquals(selected?.target_kind, "skill");
  assertEquals(selected?.opportunity_id, "status_recap.implicit_need");
});

Deno.test("flow opportunity selection accepts canonical product_help opportunity", () => {
  const selected = selectFlowOpportunityForTurn({
    turnFrame: turnFrame({
      flow_opportunity: {
        opportunity_id: "product_help.implicit_catalog_need",
        target_kind: "skill",
        target_flow: "product_help",
        target_action: "run_product_help",
        confidence: "high",
        priority: 72,
        reason: "implicit product guidance opportunity",
        evidence: ["user may benefit from product guidance"],
        seed_context: {
          target_hint: "expliquer la surface utile",
        },
      },
    } as any),
    routeDecision: routeDecision(),
    tempMemory: {},
  });
  assertEquals(selected?.target_flow, "product_help");
  assertEquals(selected?.target_kind, "skill");
  assertEquals(selected?.opportunity_id, "product_help.implicit_catalog_need");
});

Deno.test("flow opportunity selection rejects target_kind/target_flow mismatch", () => {
  const selected = selectFlowOpportunityForTurn({
    turnFrame: turnFrame({
      flow_opportunity: {
        opportunity_id: "create_recurring_reminder.bad_kind",
        target_kind: "skill",
        target_flow: "create_recurring_reminder",
        target_action: "run_create_recurring_reminder",
        confidence: "high",
        priority: 80,
        reason: "mismatched canonical opportunity",
        evidence: ["tous les matins"],
        seed_context: {
          target_hint: "tous les matins",
        },
      },
    } as any),
    routeDecision: routeDecision(),
    tempMemory: {},
  });
  assertEquals(selected, null);
});

Deno.test("flow opportunity selection accepts canonical tool skill opportunity", () => {
  const selected = selectFlowOpportunityForTurn({
    turnFrame: turnFrame({
      flow_opportunity: {
        opportunity_id: "update_coach_preferences.question_tendency",
        target_kind: "tool_skill",
        target_flow: "update_coach_preferences",
        target_action: "run_update_coach_preferences",
        confidence: "medium",
        priority: 60,
        reason: "too many questions",
        evidence: ["structured source"],
        seed_context: {
          focus: ["question_tendency"],
          surface: "dashboard.preferences",
          target_hint: "question_tendency",
        },
      },
    } as any),
    routeDecision: routeDecision(),
    tempMemory: {},
  });
  assertEquals(selected?.target_flow, "update_coach_preferences");
  assertEquals(selected?.target_kind, "tool_skill");
  assertEquals(
    selected?.opportunity_id,
    "update_coach_preferences.question_tendency",
  );
});

Deno.test("flow opportunity reducer preserves anchor through product_help", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      flow_action: "get_info_product",
      visible_task: visibleTask("none"),
      subskill_call: {
        needed: true,
        skill_id: "product_help",
        reason: "inline product question",
        context_for_subskill: { preserve_active_flow: true },
      },
    },
    userMessage: "C'est quoi une carte d'attaque ?",
  });
  assertEquals(reduced.get_info_product, true);
  assertEquals(
    reduced.local_state?.confirmation_anchor,
    previous.confirmation_anchor,
  );
  assertEquals(reduced.local_state?.target_flow, "status_recap");
  assertEquals(
    reduced.local_state?.origin.user_message,
    previous.origin.user_message,
  );
  assertEquals(reduced.local_state?.turn_count, 2);
  assert(reduced.note_information);
  assertEquals(reduced.note_information.target_dispatcher, "product_help");
});

Deno.test("flow opportunity reducer preserves anchor through status_recap info round-trip", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      flow_action: "get_info_db",
      visible_task: visibleTask("none"),
      subskill_call: {
        needed: true,
        skill_id: "status_recap",
        reason: "inline db status question",
        context_for_subskill: { preserve_active_flow: true },
      },
    },
    userMessage: "Qu'est-ce que j'ai deja dans mon recap ?",
  });
  assertEquals(reduced.get_info_db, true);
  assertEquals(
    reduced.local_state?.confirmation_anchor,
    previous.confirmation_anchor,
  );
  assertEquals(reduced.local_state?.target_flow, "status_recap");
  assert(reduced.note_information);
  assertEquals(reduced.note_information.target_dispatcher, "status_recap");
});

Deno.test("flow opportunity reducer blocks low confidence handoff", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      flow_action: "handoff_to_local_flow",
      confidence: "low",
      visible_task: visibleTask("handoff_status_recap_ready"),
    },
    userMessage: "Oui",
  });
  assertEquals(reduced.handoff_to_local_flow, false);
  assertEquals(
    reduced.blocked_effects[0].reason_code,
    "low_confidence_blocks_handoff",
  );
});

Deno.test("flow opportunity reducer creates note information for global handoff", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      flow_action: "exit_to_global_dispatcher",
      exit_memo: {
        ...output.exit_memo,
        needed: false,
      },
    },
    userMessage: "Au fait aide-moi à revoir mon plan.",
  });
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assert(reduced.note_information);
  assertEquals(reduced.note_information.target_dispatcher, "global");
});

Deno.test("flow opportunity normalizer accepts contractual note_information.note", () => {
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const normalized = normalizeFlowOpportunityDispatcherOutput({
    ...output,
    flow_action: "exit_to_global_dispatcher",
    note_information: {
      needed: true,
      note: {
        source_flow_id: "flow_opportunity_verification",
        handoff_reason: "topic_change",
        target_dispatcher: "global",
        handoff_context_for_next_dispatcher:
          "User is asking for a separate planning topic.",
        user_words: ["aide-moi plutot a revoir mon plan"],
        structured_context: {
          user_message_summary: "User is asking for a separate planning topic.",
          active_flow_summary: "Flow opportunity verification was active.",
          collected_state: {
            target_flow: "status_recap",
          },
          unresolved_questions: [],
          evidence: ["aide-moi plutot a revoir mon plan"],
          recommended_next_focus: "global",
          source_flow: "flow_opportunity_verification",
        },
        confidence: "high",
      },
    },
  });
  assertEquals(normalized.note_information.needed, true);
  assertEquals(normalized.note_information.note?.target_dispatcher, "global");
});

Deno.test("flow opportunity reducer preserves user constraints in visible context", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      flow_action: "repeat_current_state",
      visible_task: {
        kind: "repeat_current_state",
        conversation_context: {
          ...output.visible_task.conversation_context,
          user_words: ["redis-le sans créer quoi que ce soit"],
          tone_constraints: ["ne pas promettre de creation"],
          do_not_say: ["Ne dis pas que quelque chose a ete cree."],
        },
      },
    },
    userMessage: "Redis-le, mais sans créer quoi que ce soit.",
  });
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.local_state?.target_flow, "status_recap");
  assert(
    reduced.visible_task.conversation_context.tone_constraints.includes(
      "ne pas promettre de creation",
    ),
  );
  assert(
    reduced.visible_task.conversation_context.do_not_say.includes(
      "Ne dis pas que quelque chose a ete cree.",
    ),
  );
});

Deno.test("flow opportunity anti false positive continuation does not exit global", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      flow_action: "repeat_current_state",
      confidence: "medium",
      visible_task: visibleTask("repeat_current_state"),
      exit_memo: {
        ...output.exit_memo,
        needed: false,
        same_user_message_should_be_reprocessed: false,
      },
    },
    userMessage: "Attends, redis-moi ce que tu proposes et on continue.",
  });
  assertEquals(reduced.flow_action, "repeat_current_state");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.safety_preempt, false);
  assertEquals(reduced.local_state?.target_flow, "status_recap");
});

Deno.test("flow opportunity reducer routes safety with note information", () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: {
      ...output,
      flow_action: "safety_preempt",
      risk_score: 9,
      visible_task: visibleTask("safety_transition"),
      exit_memo: {
        ...output.exit_memo,
        needed: true,
        reason: "safety",
      },
    },
    userMessage: "Je ne me sens pas en securite.",
  });
  assertEquals(reduced.safety_preempt, true);
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assert(reduced.note_information);
  assertEquals(reduced.note_information.target_dispatcher, "safety_crisis");
});

Deno.test("flow opportunity runtime initial offer creates active state without tools", async () => {
  let visibleInput: any = null;
  const runtime = await maybeRunFlowOpportunityVerificationRuntime({
    supabase: {} as any,
    userId: "user_1",
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: turnFrame({ flow_opportunity: opportunity }),
    routeDecision: routeDecision(),
    safetyContextOutput: {
      risk_band: "low",
      reason_codes: [],
      evidence: [],
    } as any,
    runVisibleAgent: (input) => {
      visibleInput = input;
      return Promise.resolve("Tu veux un rappel rapide ?");
    },
  });
  assert(runtime);
  assertEquals(runtime.toolExecution, "none");
  assertEquals(runtime.executedTools, []);
  assertEquals(
    (runtime.toolSkillRun as any).committed_effects,
    [],
  );
  assertEquals(runtime.content, "Tu veux un rappel rapide ?");
  assertEquals(visibleInput.stage, "offer_status_recap");
  assert(visibleInput.conversation_context);
  assertEquals("local_state" in visibleInput, false);
  assert((runtime.toolSkillRun as any).note_information_inbound);
  assertEquals(
    (runtime.toolSkillRun as any).note_information_inbound.target_dispatcher,
    "verification_opportunities",
  );
  const state = readFlowOpportunityState(runtime.nextTempMemory);
  assertEquals(state?.skill_id, "flow_opportunity_verification");
  assertEquals(state?.target_flow, "status_recap");
  assert(state?.confirmation_anchor);
});

Deno.test("flow opportunity runtime exit_to_global_dispatcher stores note for global", async () => {
  const previous = createFlowOpportunityState({
    opportunity,
    userMessage: "Je sais plus ce qu'il y a dans ma carte.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: opportunity.opportunity_id,
    target_flow: opportunity.target_flow,
    target_action: opportunity.target_action,
    target_context: opportunity.seed_context,
    reason: opportunity.reason,
    evidence: opportunity.evidence,
  });
  const runtime = await maybeRunFlowOpportunityVerificationRuntime({
    supabase: {} as any,
    userId: "user_1",
    userMessage: "Laisse tomber.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: writeFlowOpportunityState({}, previous),
    turnFrame: turnFrame(),
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "flow_opportunity_verification",
    }),
    safetyContextOutput: {
      risk_band: "low",
      reason_codes: [],
      evidence: [],
    } as any,
    runLocalDispatcher: async () => ({
      ...output,
      flow_action: "exit_to_global_dispatcher",
      visible_task: visibleTask("stop_or_cancel"),
    }),
    runVisibleAgent: () => {
      throw new Error("visible agent should not run on exit_to_global");
    },
  });
  assert(runtime);
  assertEquals(runtime.content, "");
  assertEquals(runtime.toolExecution, "none");
  assertEquals(
    (runtime.toolSkillRun as any).flow_action,
    "exit_to_global_dispatcher",
  );
  assertEquals(
    (runtime.toolSkillRun as any).note_information.target_dispatcher,
    "global",
  );
  assertEquals(readFlowOpportunityState(runtime.nextTempMemory), null);
});

Deno.test("flow opportunity runtime hands off accepted prepare_attack_card opportunity", async () => {
  const attackOpportunity = {
    opportunity_id: "attack_card.startup_friction",
    target_kind: "tool_skill" as const,
    target_flow: "prepare_attack_card" as const,
    target_action: "prepare attack card for sas",
    confidence: "high" as const,
    priority: 80,
    reason: "startup friction on planned action",
    evidence: ["tourne autour du carnet"],
    seed_context: {
      target_hint: "Faire le sas de déchargement",
      focus: ["startup_friction"],
    },
  };
  const previous = createFlowOpportunityState({
    opportunity: attackOpportunity,
    userMessage:
      "Ce soir je tourne autour du carnet avant le sas de déchargement.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: attackOpportunity.opportunity_id,
    target_flow: attackOpportunity.target_flow,
    target_action: attackOpportunity.target_action,
    target_context: attackOpportunity.seed_context,
    reason: attackOpportunity.reason,
    evidence: attackOpportunity.evidence,
  });
  const runtime = await maybeRunFlowOpportunityVerificationRuntime({
    supabase: {} as any,
    userId: "user_1",
    userMessage: "Oui, on fait ça.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: writeFlowOpportunityState({}, previous),
    turnFrame: turnFrame(),
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "flow_opportunity_verification",
    }),
    safetyContextOutput: {
      risk_band: "low",
      reason_codes: [],
      evidence: [],
    } as any,
    runLocalDispatcher: async () => ({
      ...output,
      flow_action: "handoff_to_local_flow",
      confidence: "high",
      visible_task: visibleTask("handoff_target_flow_ready"),
    }),
    runPrepareAttackCardOperation: async (input: any) => {
      assertEquals(input.routeDecision.selected_handler, "prepare_attack_card");
      assertEquals(
        input.turnFrame.tool_skill_intents[0].operation_type,
        "prepare_attack_card",
      );
      assertEquals(
        input.turnFrame.tool_skill_intents[0].target_hint,
        "Faire le sas de déchargement",
      );
      return {
        content: "Quel est le piège au moment de commencer ?",
        nextTempMemory: { attack: true },
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "collecting",
          committed_effects: [],
        },
      };
    },
  });
  assert(runtime);
  assertEquals(runtime.content, "Quel est le piège au moment de commencer ?");
  assertEquals(runtime.toolExecution, "blocked");
  assertEquals(runtime.executedTools, []);
  assertEquals(
    (runtime.toolSkillRun as any).selected_handler,
    "prepare_attack_card",
  );
  assertEquals(
    (runtime.toolSkillRun as any).handoff_source_flow,
    "flow_opportunity_verification",
  );
  assertEquals(readFlowOpportunityState(runtime.nextTempMemory), null);
});

Deno.test("flow opportunity runtime hands off accepted conversation skill targets", async () => {
  for (
    const targetFlow of [
      "emotional_repair",
      "demotivation_repair",
      "product_help",
    ] as const
  ) {
    const skillOpportunity = {
      opportunity_id: `${targetFlow}.implicit_need`,
      target_kind: "skill" as const,
      target_flow: targetFlow,
      target_action: `run_${targetFlow}`,
      confidence: "high" as const,
      priority: 80,
      reason: "structured skill signal",
      evidence: ["structured skill evidence"],
      seed_context: {
        target_hint: "besoin utilisateur",
      },
    };
    const previous = createFlowOpportunityState({
      opportunity: skillOpportunity,
      userMessage: "Tu peux m'aider sur ça ?",
    });
    const output = buildInitialOfferDispatcherOutput({
      opportunity_id: skillOpportunity.opportunity_id,
      target_flow: skillOpportunity.target_flow,
      target_action: skillOpportunity.target_action,
      target_context: skillOpportunity.seed_context,
      reason: skillOpportunity.reason,
      evidence: skillOpportunity.evidence,
    });
    const runtime = await maybeRunFlowOpportunityVerificationRuntime({
      supabase: {} as any,
      userId: "user_1",
      userMessage: "Oui, allons-y.",
      channel: "web",
      userTimezone: "Europe/Paris",
      tempMemory: writeFlowOpportunityState({}, previous),
      turnFrame: turnFrame(),
      routeDecision: routeDecision({
        response_owner: "tool_skill",
        selected_handler: "flow_opportunity_verification",
      }),
      safetyContextOutput: {
        risk_band: "low",
        reason_codes: [],
        evidence: [],
      } as any,
      runLocalDispatcher: async () => ({
        ...output,
        flow_action: "handoff_to_local_flow",
        confidence: "high",
        visible_task: visibleTask("handoff_target_flow_ready"),
      }),
      runConversationTargetFlow: async (input: any) => {
        assertEquals(input.skillId, targetFlow);
        assertEquals(input.targetContext.target_hint, "besoin utilisateur");
        return {
          content: `${targetFlow} lancé`,
          nextTempMemory: { active: targetFlow },
          toolExecution: "none",
          executedTools: [],
          toolSkillRun: {
            selected_handler: targetFlow,
            skill_id: targetFlow,
            status: "continue",
            committed_effects: [],
          },
        };
      },
    });
    assert(runtime);
    assertEquals(runtime.content, `${targetFlow} lancé`);
    assertEquals((runtime.toolSkillRun as any).selected_handler, targetFlow);
    assertEquals(
      (runtime.toolSkillRun as any).handoff_source_flow,
      "flow_opportunity_verification",
    );
    assertEquals(readFlowOpportunityState(runtime.nextTempMemory), null);
  }
});

Deno.test("flow opportunity runtime hands off accepted create_recurring_reminder opportunity", async () => {
  const reminderOpportunity = {
    opportunity_id: "create_recurring_reminder.recurrent_support",
    target_kind: "tool_skill" as const,
    target_flow: "create_recurring_reminder" as const,
    target_action: "run_create_recurring_reminder",
    confidence: "high" as const,
    priority: 80,
    reason: "recurrent reminder opportunity",
    evidence: ["tous les matins"],
    seed_context: {
      target_hint: "phrase tous les matins",
      recurrence_text: "tous les matins",
    },
  };
  const previous = createFlowOpportunityState({
    opportunity: reminderOpportunity,
    userMessage: "Un rappel tous les matins pourrait m'aider.",
  });
  const output = buildInitialOfferDispatcherOutput({
    opportunity_id: reminderOpportunity.opportunity_id,
    target_flow: reminderOpportunity.target_flow,
    target_action: reminderOpportunity.target_action,
    target_context: reminderOpportunity.seed_context,
    reason: reminderOpportunity.reason,
    evidence: reminderOpportunity.evidence,
  });
  const runtime = await maybeRunFlowOpportunityVerificationRuntime({
    supabase: {} as any,
    userId: "user_1",
    userMessage: "Oui, programme-le.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: writeFlowOpportunityState({}, previous),
    turnFrame: turnFrame(),
    routeDecision: routeDecision({
      response_owner: "tool_skill",
      selected_handler: "flow_opportunity_verification",
    }),
    safetyContextOutput: {
      risk_band: "low",
      reason_codes: [],
      evidence: [],
    } as any,
    runLocalDispatcher: async () => ({
      ...output,
      flow_action: "handoff_to_local_flow",
      confidence: "high",
      visible_task: visibleTask("handoff_target_flow_ready"),
    }),
    runCreateRecurringReminderOperation: async (input: any) => {
      assertEquals(
        input.routeDecision.selected_handler,
        "create_recurring_reminder",
      );
      assertEquals(
        input.turnFrame.tool_skill_intents[0].operation_type,
        "create_recurring_reminder",
      );
      assertEquals(
        input.turnFrame.tool_skill_intents[0].target_hint,
        "phrase tous les matins",
      );
      return {
        content: "Je te demande l'heure avant de le créer.",
        nextTempMemory: { recurring: true },
        toolExecution: "platform_handoff",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "ask_question",
          committed_effects: [],
        },
      };
    },
  });
  assert(runtime);
  assertEquals(runtime.content, "Je te demande l'heure avant de le créer.");
  assertEquals(
    (runtime.toolSkillRun as any).selected_handler,
    "create_recurring_reminder",
  );
  assertEquals(
    (runtime.toolSkillRun as any).handoff_source_flow,
    "flow_opportunity_verification",
  );
  assertEquals(readFlowOpportunityState(runtime.nextTempMemory), null);
});
