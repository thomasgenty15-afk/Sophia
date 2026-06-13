import { assert, assertEquals } from "jsr:@std/assert@1";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { EmotionalRepairLocalDispatcherOutput } from "./contract.ts";
import {
  EMOTIONAL_REPAIR_DISPATCHER_DECISION_EXAMPLES,
  EMOTIONAL_REPAIR_DISPATCHER_FIELD_COMPLETION_RULES,
  EMOTIONAL_REPAIR_DISPATCHER_FLOW_ACTION_RULES,
  localDispatcherSystemPrompt,
  reduceEmotionalRepairLocalDispatcherOutput,
} from "./local_flow.ts";
import { runEmotionalRepairSkill } from "./skill.ts";
import { persistConversationSkillRoute } from "../../router/conversation_route_runtime_support.ts";

function turnFrame(risk: "none" | "high" = "none") {
  return {
    source_message_id: "message_test",
    user_id: "user_test",
    safety: { risk_band: risk, reason_codes: [] },
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    action_reference: null,
    tool_skill_intents: [],
    flow_opportunity: null,
    direct_effects: [],
    memory_plan: {},
  } as any;
}

function dispatcherOutput(
  patch: Partial<EmotionalRepairLocalDispatcherOutput> = {},
): EmotionalRepairLocalDispatcherOutput {
  return {
    flow_action: "answer_repair",
    confidence: "high",
    risk_score: 0,
    repair_state: {
      intent: "shame_or_guilt",
      phase: "de_shame",
      emotional_dominance: "high",
      context_domain: "work",
      summary: "Le user se punit apres un craquage.",
      user_words: ["j'ai honte"],
      identity_freeze_risk: true,
      emotion_stabilized_enough_for_tool: false,
    },
    constraints: [],
    response_contract: {
      max_questions: 0,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_concrete_action: false,
      tone: "soft",
    },
    potion_bridge: {
      status: "not_applicable",
      selected_potion: null,
      candidate_potions: [],
      durable_need: { kind: null, summary: null },
      prefill_candidates: {},
      missing_before_handoff: [],
      why_ready_or_blocked: "reparation d'abord",
    },
    visible_task: {
      kind: "de_shame",
      conversation_context: {
        state_summary: "Le user se punit apres un craquage.",
        user_words: ["j'ai honte"],
        field_or_stage: "de_shame",
        known_values: {
          intent: "shame_or_guilt",
          phase: "de_shame",
          emotional_dominance: "high",
          context_domain: "work",
          identity_freeze_risk: true,
          emotion_stabilized_enough_for_tool: false,
        },
        missing_or_weak_values: [],
        selected_candidate: {
          potion: null,
          potion_label: null,
          durable_need_kind: null,
          durable_need_summary: null,
        },
        handoff_data: {
          bridge_context_summary: null,
          target_dispatcher: null,
          no_chat_mutation: true,
        },
        tone_constraints: ["soft"],
        do_not_say: [],
        context_summary: "Le user se punit apres un craquage.",
        evidence_used: ["test"],
        max_questions: 0,
      },
    },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
      potion_bridge_context: null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
      db_write_committed: false,
    },
    evidence: ["test"],
    ...patch,
  };
}

function stabilizedOffer(
  selected_potion: "amour" | "guerison" | "apaisement",
): EmotionalRepairLocalDispatcherOutput {
  return dispatcherOutput({
    flow_action: "potion_bridge_offer",
    repair_state: {
      intent: selected_potion === "apaisement"
        ? "anxiety_or_panic"
        : selected_potion === "guerison"
        ? "shame_or_guilt"
        : "acute_self_attack",
      phase: "stabilize",
      emotional_dominance: "low",
      context_domain: "work",
      summary: "L'emotion est redescendue et le besoin durable est nomme.",
      user_words: ["j'ai besoin d'un truc plus doux"],
      identity_freeze_risk: selected_potion !== "apaisement",
      emotion_stabilized_enough_for_tool: true,
    },
    response_contract: {
      max_questions: 1,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: true,
      allow_concrete_action: false,
      tone: "soft",
    },
    potion_bridge: {
      status: "offered_waiting_consent",
      selected_potion,
      candidate_potions: [{
        potion_type: selected_potion,
        confidence: "high",
        reason: "besoin durable compatible",
      }],
      durable_need: {
        kind: selected_potion === "amour"
          ? "self_kindness"
          : selected_potion === "guerison"
          ? "healing_after_hurt"
          : "pressure_relief",
        summary: "Soutenir la suite sans auto-punition.",
      },
      prefill_candidates: selected_potion === "amour"
        ? {
          love_lack_context: "son erreur de ce matin",
          love_state: "dur",
        }
        : selected_potion === "guerison"
        ? {
          recent_hurt: "le craquage d'hier",
          dominant_feeling: "honte",
        }
        : {
          pressure_source: "la pression de cette semaine",
          pressure_state: "a_cran",
        },
      missing_before_handoff: [],
      why_ready_or_blocked: "La potion soutient le besoin durable nomme.",
    },
    visible_task: {
      kind: "potion_bridge_offer",
      conversation_context: {
        state_summary: "L'emotion est redescendue.",
        user_words: ["j'ai besoin d'un truc plus doux"],
        field_or_stage: "potion_bridge_offer",
        known_values: {
          intent: selected_potion === "apaisement"
            ? "anxiety_or_panic"
            : selected_potion === "guerison"
            ? "shame_or_guilt"
            : "acute_self_attack",
          phase: "stabilize",
          emotional_dominance: "low",
          context_domain: "work",
          identity_freeze_risk: selected_potion !== "apaisement",
          emotion_stabilized_enough_for_tool: true,
        },
        missing_or_weak_values: [],
        selected_candidate: {
          potion: selected_potion,
          potion_label: selected_potion === "amour"
            ? "Potion d'amour"
            : selected_potion === "guerison"
            ? "Potion de guerison"
            : "Potion d'apaisement",
          durable_need_kind: selected_potion === "amour"
            ? "self_kindness"
            : selected_potion === "guerison"
            ? "healing_after_hurt"
            : "pressure_relief",
          durable_need_summary: "Soutenir la suite sans auto-punition.",
        },
        handoff_data: {
          bridge_context_summary: "Besoin durable stabilise.",
          target_dispatcher: null,
          no_chat_mutation: true,
        },
        tone_constraints: ["soft"],
        do_not_say: [],
        context_summary: "L'emotion est redescendue.",
        evidence_used: ["test"],
        max_questions: 1,
      },
    },
  });
}

Deno.test("emotional_repair dispatcher prompt teaches field completion and transitions", () => {
  const prompt = localDispatcherSystemPrompt();

  assert(prompt.includes("field_completion_rules"));
  assert(prompt.includes("flow_action_rules"));
  assert(prompt.includes("message courant est prioritaire"));
  assert(
    EMOTIONAL_REPAIR_DISPATCHER_FIELD_COMPLETION_RULES.flow_action.some((
      rule,
    ) => rule.includes("message courant")),
  );
  assert(
    EMOTIONAL_REPAIR_DISPATCHER_FLOW_ACTION_RULES.exit_to_global_dispatcher
      .some((
        rule,
      ) => rule.includes("exit_memo.needed=true")),
  );
  assert(
    EMOTIONAL_REPAIR_DISPATCHER_FLOW_ACTION_RULES.exit_to_global_dispatcher
      .some((rule) => rule.includes("exit_memo.needed=true")),
  );
});

Deno.test("emotional_repair dispatcher prompt keeps exactly two decision examples", () => {
  assertEquals(EMOTIONAL_REPAIR_DISPATCHER_DECISION_EXAMPLES.length, 2);
  assertEquals(
    EMOTIONAL_REPAIR_DISPATCHER_DECISION_EXAMPLES[0].expected_decision
      .flow_action,
    "provide_concrete_phrase",
  );
  assertEquals(
    EMOTIONAL_REPAIR_DISPATCHER_DECISION_EXAMPLES[1].expected_decision
      .flow_action,
    "exit_to_global_dispatcher",
  );
  assertEquals(
    EMOTIONAL_REPAIR_DISPATCHER_DECISION_EXAMPLES[1].expected_decision
      .exit_memo.needed,
    false,
  );
});

Deno.test("emotional_repair local reducer blocks potion while shame dominates", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "potion_bridge_offer",
      potion_bridge: {
        status: "offered_waiting_consent",
        selected_potion: "guerison",
        candidate_potions: [{
          potion_type: "guerison",
          confidence: "high",
          reason: "honte",
        }],
        durable_need: {
          kind: "healing_after_hurt",
          summary: "reparer la honte",
        },
        prefill_candidates: {
          recent_hurt: "le craquage",
          dominant_feeling: "honte",
        },
        missing_before_handoff: [],
        why_ready_or_blocked: "honte encore dominante",
      },
    }),
    turn_frame: turnFrame(),
  });

  assertEquals(reduced.potion_bridge_context, null);
  assertEquals(
    reduced.visible_task.conversation_context.selected_candidate.potion,
    null,
  );
  assertEquals(reduced.reason_code, "emotional_repair_potion_bridge_blocked");
});

Deno.test("emotional_repair soft_support_only blocks potion bridge", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("amour"),
    explicit_constraints: ["soft_support_only"],
    turn_frame: turnFrame(),
  });

  assertEquals(reduced.potion_bridge_context, null);
  assert(reduced.constraints.includes("no_potion"));
  assert(reduced.constraints.includes("no_tool"));
});

Deno.test("emotional_repair candidate potion is not a visible consent offer", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: {
      ...stabilizedOffer("amour"),
      potion_bridge: {
        ...stabilizedOffer("amour").potion_bridge,
        status: "candidate",
      },
      visible_task: {
        ...stabilizedOffer("amour").visible_task,
        kind: "potion_bridge_offer",
      },
    },
    turn_frame: turnFrame(),
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.reason_code, "emotional_repair_potion_bridge_blocked");
  assertEquals(reduced.visible_task.kind, "separate_fact_from_identity");
  assertEquals(
    reduced.visible_task.conversation_context.selected_candidate.potion,
    null,
  );
  assert(
    reduced.visible_task.conversation_context.do_not_say.includes(
      "Ne propose pas de potion dans ce message.",
    ),
  );
  assertEquals(reduced.local_state?.last_potion_bridge_offer, null);
  assertEquals(reduced.blocked_effects[0]?.reason_code, "bridge_not_mature");
});

Deno.test("emotional_repair confirmation without persisted offer does not handoff", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: {
      ...stabilizedOffer("guerison"),
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...stabilizedOffer("guerison").potion_bridge,
        status: "confirmed_handoff",
      },
    },
    turn_frame: turnFrame(),
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.reason_code, "emotional_repair_potion_bridge_blocked");
  assertEquals(reduced.potion_bridge_context, null);
  assertEquals(reduced.visible_task.kind, "de_shame");
  assertEquals(
    reduced.visible_task.conversation_context.selected_candidate.potion,
    null,
  );
  assertEquals(reduced.local_state?.last_potion_bridge_offer, null);
  assertEquals(
    reduced.blocked_effects[0]?.reason_code,
    "missing_previous_potion_offer",
  );
});

Deno.test("emotional_repair no_potion clears previous bridge offer", () => {
  const offered = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("amour"),
    turn_frame: turnFrame(),
  });
  const refused = reduceEmotionalRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: {
      ...dispatcherOutput({
        flow_action: "soft_presence",
        constraints: ["no_potion"],
        repair_state: {
          ...stabilizedOffer("amour").repair_state,
          emotion_stabilized_enough_for_tool: true,
        },
        visible_task: {
          kind: "soft_presence",
          conversation_context: {
            state_summary: "Le user refuse la potion.",
            user_words: ["pas de potion"],
            field_or_stage: "soft_presence",
            known_values: {
              intent: "shame_or_guilt",
              phase: "stabilize",
              emotional_dominance: "low",
              context_domain: "work",
              identity_freeze_risk: true,
              emotion_stabilized_enough_for_tool: true,
            },
            missing_or_weak_values: [],
            selected_candidate: {
              potion: null,
              potion_label: null,
              durable_need_kind: null,
              durable_need_summary: null,
            },
            handoff_data: {
              bridge_context_summary: null,
              target_dispatcher: null,
              no_chat_mutation: true,
            },
            tone_constraints: ["soft", "no_potion"],
            do_not_say: ["Ne propose pas de potion."],
            context_summary: "Le user refuse la potion.",
            evidence_used: ["pas de potion"],
            max_questions: 0,
          },
        },
      }),
    },
    turn_frame: turnFrame(),
  });

  assertEquals(refused.potion_bridge_context, null);
  assertEquals(refused.local_state?.last_potion_bridge_offer, null);
  assert(refused.constraints.includes("no_potion"));
});

Deno.test("emotional_repair stabilized self-kindness offers amour with information note", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("amour"),
    turn_frame: turnFrame(),
  });

  assertEquals(
    reduced.local_state?.last_potion_bridge_offer?.selected_potion,
    "amour",
  );
  assertEquals(
    reduced.local_state?.last_potion_bridge_offer?.information_note
      .context_for_next_dispatcher?.selected_potion,
    "amour",
  );
  assertEquals(reduced.visible_task.kind, "potion_bridge_offer");
});

Deno.test("emotional_repair confirmed bridge emits potion context without mutation", () => {
  const offered = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("guerison"),
    turn_frame: turnFrame(),
  });
  const confirmed = reduceEmotionalRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: {
      ...stabilizedOffer("guerison"),
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...stabilizedOffer("guerison").potion_bridge,
        status: "confirmed_handoff",
      },
    },
    turn_frame: turnFrame(),
  });

  assertEquals(confirmed.status, "handoff");
  assertEquals(
    confirmed.potion_bridge_context?.origin_flow,
    "emotional_repair",
  );
  assertEquals(confirmed.potion_bridge_context?.selected_potion, "guerison");
  assertEquals(
    confirmed.potion_bridge_context?.note_information.source_flow_id,
    "emotional_repair",
  );
  assertEquals(
    confirmed.potion_bridge_context?.note_information.target_dispatcher,
    "select_state_potion",
  );
  assertEquals(
    Object.keys(
      confirmed.potion_bridge_context?.note_information.structured_context ??
        {},
    ).length > 0,
    true,
  );
  assertEquals(
    confirmed.potion_bridge_context?.prefill_candidates.recent_hurt
      ?.candidate_value,
    "le craquage d'hier",
  );
  assertEquals(
    confirmed.potion_bridge_context?.no_chat_mutation.potion_session_created,
    false,
  );
});

Deno.test("emotional_repair safety preempt wins over local bridge", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("apaisement"),
    turn_frame: turnFrame("high"),
  });

  assertEquals(reduced.status, "safety");
  assertEquals(reduced.potion_bridge_context, null);
  assertEquals(reduced.visible_task.kind, "safety");
  assertEquals(
    reduced.visible_task.conversation_context.handoff_data.target_dispatcher,
    "safety_crisis",
  );
});

Deno.test("emotional_repair exit_to_global_dispatcher exits to global", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "exit_to_global_dispatcher",
      repair_state: {
        intent: "unclear",
        phase: "exit",
        emotional_dominance: "low",
        context_domain: "unknown",
        summary: "Le user arrete le flow.",
        user_words: ["stop"],
        identity_freeze_risk: false,
        emotion_stabilized_enough_for_tool: false,
      },
      exit_memo: {
        needed: true,
        reason: "cancelled",
        flow_summary: "Le user arrete le flow.",
        handoff_hint_for_global_dispatcher: null,
        potion_bridge_context: null,
      },
    }),
    turn_frame: turnFrame(),
  });

  assertEquals(reduced.status, "exit");
  assertEquals(reduced.response_intent, "exit_to_global_dispatcher");
  assertEquals(reduced.local_state, null);
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.potion_bridge_context, null);
  assertEquals(reduced.visible_task.kind, "exit_or_cancel");
});

Deno.test("emotional_repair visible agent receives only conversation_context task data", async () => {
  let seenInput: Record<string, unknown> | null = null;
  const output = await runEmotionalRepairSkill({
    user_message: "j'ai honte",
    context: {
      skill_id: "emotional_repair",
      user_id: "user_test",
      recent_messages: [{ role: "user", content: "ne pas transmettre brut" }],
      active_skill_working_state: null,
      turn_frame: turnFrame(),
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    } as any,
    local_dispatcher: async () => dispatcherOutput(),
    visible_agent: async (input) => {
      seenInput = input as unknown as Record<string, unknown>;
      return "Je reste avec toi sans transformer ce moment en verdict sur toi.";
    },
  });

  assertEquals(output.status, "continue");
  assertEquals(
    Object.keys(seenInput ?? {}).sort(),
    ["request_id", "stage", "user_id", "visible_task"].sort(),
  );
  const visibleTask = (seenInput as Record<string, any> | null)?.visible_task;
  assert(visibleTask?.conversation_context);
  assertEquals((seenInput as any)?.recent_messages, undefined);
  assertEquals((seenInput as any)?.local_state, undefined);
});

Deno.test("emotional_repair safety context hands off without local visible message", async () => {
  const output = await runEmotionalRepairSkill({
    user_message: "je risque de me faire du mal",
    context: {
      skill_id: "emotional_repair",
      user_id: "user_test",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: turnFrame("high"),
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    } as any,
    local_dispatcher: async () => {
      throw new Error("local_dispatcher_should_not_run_after_safety_context");
    },
    visible_agent: async () => {
      throw new Error("visible_agent_should_not_run_on_safety_handoff");
    },
  });

  assertEquals(output.status, "handoff");
  assertEquals(output.reply, "");
  assertEquals(
    (output.state_patch?.emotional_repair_safety_handoff as any)
      ?.note_information?.target_dispatcher,
    "safety_crisis",
  );
});

Deno.test("emotional_repair handoff persists select_state_potion owner directly", async () => {
  const offered = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("amour"),
    turn_frame: turnFrame(),
  }).local_state;
  const output = await runEmotionalRepairSkill({
    user_message: "oui",
    context: {
      skill_id: "emotional_repair",
      user_id: "user_test",
      recent_messages: [],
      active_skill_working_state: {
        skill_id: "emotional_repair",
        working_state: { emotional_repair_local_state: offered },
      },
      turn_frame: turnFrame(),
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    } as any,
    local_dispatcher: async () => ({
      ...stabilizedOffer("amour"),
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...stabilizedOffer("amour").potion_bridge,
        status: "confirmed_handoff",
      },
    }),
    visible_agent: async () =>
      "Oui. Je passe la suite vers la Potion d'amour sans te refaire raconter l'episode.",
  });
  const route: RouteDecision = {
    route_version: "v1",
    response_owner: "conversation_handler",
    selected_handler: "emotional_repair",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "active_skill_continue",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
  const temp = persistConversationSkillRoute(
    { __active_skill_state: { skill_id: "emotional_repair" } },
    route,
    output,
  );

  assertEquals(temp.__active_skill_state, undefined);
  assertEquals(
    temp.__active_tool_skill_intake?.skill_id,
    "select_state_potion",
  );
  assertEquals(
    temp.__active_tool_skill_intake?.active_subskill_id,
    "select_state_potion.amour",
  );
  assertEquals(
    temp.__active_tool_skill_intake?.origin_bridge_context?.information_note
      ?.context_for_next_dispatcher?.selected_potion,
    "amour",
  );
  assertEquals(
    temp.__active_tool_skill_intake?.origin_bridge_context?.note_information
      ?.target_dispatcher,
    "select_state_potion",
  );
  assertEquals(
    temp.__active_tool_skill_intake?.note_information?.source_flow_id,
    "emotional_repair",
  );
});
