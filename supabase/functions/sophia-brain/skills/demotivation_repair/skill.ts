import { noteInformationForTrace } from "../../contracts/note_information.v1.ts";
import {
  RECENT_MESSAGE_LIMITS,
  trimRecentChatMessages,
} from "../../context/recent_messages_policy.ts";
import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import {
  buildDemotivationRepairDbContextPack,
  buildDemotivationRepairMicroMemoryContext,
} from "./context_pack.ts";
import type {
  DemotivationRepairConstraint,
  DemotivationRepairLocalDispatcherOutput,
} from "./contract.ts";
import { normalizeDemotivationRepairConstraints } from "./contract.ts";
import {
  type DemotivationRepairLocalDispatcher,
  readDemotivationRepairLocalState,
  reduceDemotivationRepairLocalDispatcherOutput,
  runDemotivationRepairLocalDispatcher,
} from "./local_flow.ts";
import {
  type DemotivationRepairVisibleAgent,
  runDemotivationRepairVisibleAgent,
} from "./visible_agent.ts";

export type RunDemotivationRepairSkillInput = RunSkillInput & {
  local_dispatcher?: DemotivationRepairLocalDispatcher;
  visible_agent?: DemotivationRepairVisibleAgent;
  request_id?: string | null;
  explicit_constraints?: string[];
};

function recentMessagesFromContext(input: RunDemotivationRepairSkillInput) {
  return trimRecentChatMessages(
    input.context.recent_messages,
    RECENT_MESSAGE_LIMITS.conversationRepair,
  );
}

function safeLocalDispatcherOutput(
  reason: string,
  input: RunDemotivationRepairSkillInput,
): DemotivationRepairLocalDispatcherOutput {
  const userWords = [input.user_message].filter(Boolean).slice(0, 1);
  const constraints = normalizeDemotivationRepairConstraints([
    "do_not_modify_plan_yet",
    "prefer_smallest_action",
    "one_question_max",
    ...(input.explicit_constraints ?? []),
  ]);
  return {
    flow_action: "ask_gentle_clarification",
    confidence: "low",
    risk_score: 0,
    repair_state: {
      intent: "unclear",
      phase: "diagnose",
      motivation_state: "unclear",
      action_readiness: "none",
      summary: "Le dispatcher local n'a pas fourni de JSON exploitable.",
      user_words: userWords,
      identity_freeze_risk: false,
      motivation_source_diagnosed: false,
    },
    constraints,
    response_contract: {
      max_questions: 1,
      allow_plan_edit: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_attack_card_suggestion: false,
      allow_concrete_action: false,
      tone: "energy_preserving",
    },
    potion_bridge: {
      status: "not_applicable",
      selected_potion: null,
      visible_potion_label: null,
      candidate_potions: [],
      durable_need: { kind: null, summary: null },
      prefill_candidates: {},
      missing_before_handoff: ["motivation_source"],
      why_ready_or_blocked: reason,
      note_information: null,
    },
    visible_task: {
      kind: "ask_gentle_clarification",
      conversation_context: {
        state_summary:
          "Clarification minimale: le flow reste local et ne lance aucun outil.",
        user_words: userWords,
        field_or_stage: "ask_gentle_clarification",
        known_values: {
          intent: "unclear",
          phase: "diagnose",
          motivation_state: "unclear",
          action_readiness: "none",
          identity_freeze_risk: false,
          motivation_source_diagnosed: false,
        },
        missing_or_weak_values: ["motivation_source"],
        selected_candidate: {
          potion: null,
          potion_label: null,
          durable_need_kind: null,
          durable_need_summary: null,
        },
        handoff_data: {
          bridge_context_summary: null,
          target_dispatcher: null,
        },
        tone_constraints: ["energy_preserving", "one_question_max"],
        do_not_say: [
          "Ne mentionne pas de panne technique.",
          "Ne propose pas de potion ou d'outil.",
        ],
        context_summary:
          "Rester dans demotivation_repair avec une question douce.",
        evidence_used: [reason],
        db_context_summary: null,
        memory_context_summary: null,
        max_questions: 1,
      },
    },
    state_change_intent: {
      modified_fields: [],
      clear_fields: [],
      reason: null,
    },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
      potion_bridge_context: null,
      note_information: null,
    },
    evidence: [reason],
  };
}

function reducerTraceSummary(args: {
  decision: DemotivationRepairLocalDispatcherOutput;
  reduced: ReturnType<typeof reduceDemotivationRepairLocalDispatcherOutput>;
  previous: ReturnType<typeof readDemotivationRepairLocalState>;
}) {
  return {
    flow_action: args.decision.flow_action,
    visible_task: args.reduced.visible_task.kind,
    selected_potion: args.reduced.potion_bridge_context?.selected_potion ??
      args.decision.potion_bridge.selected_potion,
    selected_target: args.reduced.note_information?.target_dispatcher ??
      args.reduced.visible_task.conversation_context.handoff_data
        .target_dispatcher,
    pending_potion_offer_present: Boolean(
      args.reduced.local_state?.last_potion_bridge_offer ??
        args.previous?.last_potion_bridge_offer,
    ),
    active_handoff_context_present: Boolean(
      args.reduced.local_state?.active_potion_handoff_context ??
        args.previous?.active_potion_handoff_context,
    ),
    direct_handoff_flag_present: args.decision.potion_bridge.status ===
      "confirmed_handoff",
    candidate_potions_summary: args.decision.potion_bridge.candidate_potions
      .map((candidate) => ({
        potion_type: candidate.potion_type,
        confidence: candidate.confidence,
      }))
      .slice(0, 3),
    constraints: args.reduced.constraints,
    motivation_source_diagnosed:
      args.decision.repair_state.motivation_source_diagnosed,
    action_readiness: args.decision.repair_state.action_readiness,
    blocked_effects: args.reduced.blocked_effects,
    state_mutation_audit: args.reduced.state_mutation_audit,
  };
}

export async function runDemotivationRepairSkill(
  input: RunDemotivationRepairSkillInput,
) {
  const previous = readDemotivationRepairLocalState(
    input.context.active_skill_working_state,
  );
  const requestId = input.request_id ??
    (input.context.turn_frame as any)?.source_message_id ?? null;
  const dbContextPack = buildDemotivationRepairDbContextPack(input);
  const microMemoryContext = buildDemotivationRepairMicroMemoryContext(input);

  console.info("[DemotivationRepair] db_context_pack_loaded", {
    request_id: requestId,
    evidence: dbContextPack.evidence,
  });
  console.info("[DemotivationRepair] micro_memory_context_loaded", {
    request_id: requestId,
    item_count: microMemoryContext.items.length,
    max_items: microMemoryContext.budget.max_items,
  });
  if (previous) {
    console.info("[DemotivationRepair] global_dispatcher_skipped", {
      request_id: requestId,
      active_flow: "demotivation_repair",
    });
  }
  if (dbContextPack.note_information_inbound) {
    console.info("[DemotivationRepair] note_information_consumed", {
      ...noteInformationForTrace(dbContextPack.note_information_inbound),
      request_id: requestId,
    });
  }

  const dispatcher = input.local_dispatcher ??
    runDemotivationRepairLocalDispatcher;
  console.info("[DemotivationRepair] local_dispatcher_called", {
    request_id: requestId,
    active_demotivation_repair: Boolean(previous),
    previous_visible_task: previous?.last_visible_task ?? null,
  });
  const decision = await dispatcher({
    user_id: input.context.user_id,
    request_id: requestId,
    user_message: input.user_message,
    recent_messages: recentMessagesFromContext(input),
    active_state: previous,
    note_information_inbound: dbContextPack.note_information_inbound as
      | Record<string, unknown>
      | null,
    db_context_pack: dbContextPack,
    micro_memory_context: microMemoryContext,
    platform_context: {
      channel: input.context.turn_frame.channel,
      plan_snapshot: { items: input.context.plan_items ?? [] },
    },
    risk_context: {
      safety: input.context.turn_frame.safety,
      conversation_risk: input.context.turn_frame.conversation_risk ?? null,
    },
    available_inline_tools: ["product_help", "status_recap"],
    parent_flow_context: (input.context as any).flow_opportunity_context ??
      null,
    timezone: null,
    channel: input.context.turn_frame.channel,
    previous_repair_summary: previous?.previous_repair_summary ?? null,
    previous_potion_bridge_offer: previous?.last_potion_bridge_offer ?? null,
    turn_frame: input.context.turn_frame,
    explicit_constraints: input.explicit_constraints ?? [],
  }) ?? safeLocalDispatcherOutput("local_dispatcher_failed", input);

  console.info("[DemotivationRepair] local_dispatcher_result", {
    request_id: requestId,
    flow_action: decision.flow_action,
    visible_task: decision.visible_task.kind,
    potion_bridge_status: decision.potion_bridge.status,
    selected_potion: decision.potion_bridge.selected_potion,
    risk_score: decision.risk_score,
  });
  const reduced = reduceDemotivationRepairLocalDispatcherOutput({
    previous,
    output: decision,
    explicit_constraints: input.explicit_constraints ?? [],
    turn_frame: input.context.turn_frame,
  });
  console.info("[DemotivationRepair] reducer_result", {
    request_id: requestId,
    status: reduced.status,
    reason_code: reduced.reason_code,
    visible_task: reduced.visible_task.kind,
    flow_action: decision.flow_action,
    handoff_to_potion: Boolean(reduced.potion_bridge_context),
    risk_score: decision.risk_score,
    state_mutation_audit: reduced.state_mutation_audit,
  });

  if (reduced.note_information) {
    console.info("[DemotivationRepair] note_information_created", {
      ...noteInformationForTrace(reduced.note_information),
      request_id: requestId,
      transition_tag: reduced.note_information.target_dispatcher ===
          "safety_crisis"
        ? "local_to_safety_with_note"
        : reduced.note_information.target_dispatcher === "global"
        ? "local_to_global_with_note"
        : "local_to_local_or_inline_with_note",
    });
  }
  if (reduced.potion_bridge_context && reduced.status === "handoff") {
    console.info("[DemotivationRepair] potion_bridge_confirmed", {
      request_id: requestId,
      selected_potion: reduced.potion_bridge_context.selected_potion,
      origin_flow: reduced.potion_bridge_context.origin_flow,
    });
    console.info("[DemotivationRepair] handoff_to_select_state_potion", {
      request_id: requestId,
      selected_potion: reduced.potion_bridge_context.selected_potion,
    });
  } else if (decision.flow_action === "potion_bridge_offer") {
    console.info("[DemotivationRepair] potion_bridge_offered", {
      request_id: requestId,
      selected_potion: decision.potion_bridge.selected_potion,
      blocked:
        reduced.reason_code === "demotivation_repair_potion_bridge_blocked",
    });
  }
  if (decision.flow_action === "exit_to_global_dispatcher") {
    console.info("[DemotivationRepair] local_exit_to_global_dispatcher", {
      request_id: requestId,
      reason_code: reduced.reason_code,
    });
  }
  if (
    decision.flow_action === "get_info_product" ||
    decision.flow_action === "get_info_db"
  ) {
    console.info("[DemotivationRepair] inline_tool_roundtrip", {
      request_id: requestId,
      target_dispatcher: reduced.note_information?.target_dispatcher ?? null,
      parent_flow_preserved: Boolean(reduced.local_state),
    });
  }

  if (reduced.status === "safety") {
    return baseOutput("demotivation_repair", {
      status: "handoff",
      response_intent: "handoff_to_safety",
      reply: "",
      diagnosis: {
        local_flow: true,
        reason_code: reduced.reason_code,
        evidence: reduced.evidence,
        note_information: reduced.note_information,
        ...reducerTraceSummary({ decision, reduced, previous }),
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["safety_preempt"],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: {
        ...emptyConversationEffects(),
        blocked: reduced.blocked_effects,
      },
      state_patch: {
        demotivation_repair_local_state: null,
        demotivation_repair_safety_handoff: reduced.note_information
          ? {
            note_information: reduced.note_information,
          }
          : null,
      },
    });
  }

  if (reduced.exit_to_global_dispatcher) {
    return baseOutput("demotivation_repair", {
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      reply: "",
      diagnosis: {
        local_flow: true,
        exit_memo: decision.exit_memo,
        reason_code: reduced.reason_code,
        evidence: reduced.evidence,
        note_information: reduced.note_information,
        ...reducerTraceSummary({ decision, reduced, previous }),
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["exit_to_global_dispatcher"],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: emptyConversationEffects(),
      state_patch: {
        demotivation_repair_local_state: null,
        demotivation_repair_exit_memo: {
          ...decision.exit_memo,
          note_information: reduced.note_information,
        },
      },
    });
  }

  const visibleAgent = input.visible_agent ??
    runDemotivationRepairVisibleAgent;
  console.info("[DemotivationRepair] visible_prompt_called", {
    request_id: requestId,
    stage: reduced.visible_task.kind,
  });
  const visible = await visibleAgent({
    user_id: input.context.user_id,
    request_id: requestId,
    stage: reduced.visible_task.kind,
    visible_task: reduced.visible_task,
  });
  const reply = String(visible ?? "").trim();
  if (!reply) {
    return baseOutput("demotivation_repair", {
      status: "continue",
      response_intent: "visible_agent_failed",
      reply: undefined,
      diagnosis: {
        local_flow: true,
        reason_code: "visible_agent_failed",
        ...reducerTraceSummary({ decision, reduced, previous }),
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["visible_agent_failed"],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: {
        ...emptyConversationEffects(),
        blocked: [{
          type: "demotivation_repair",
          reason_code: "visible_agent_failed",
        }],
      },
      state_patch: {
        demotivation_repair_local_state: reduced.local_state,
        demotivation_repair_visible_task: reduced.visible_task,
      },
    });
  }

  return baseOutput("demotivation_repair", {
    status: reduced.status,
    response_intent: reduced.response_intent,
    reply,
    diagnosis: {
      local_flow: true,
      potion_bridge_status: decision.potion_bridge.status,
      reason_code: reduced.reason_code,
      evidence: reduced.evidence,
      note_information: reduced.note_information,
      ...reducerTraceSummary({ decision, reduced, previous }),
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: reduced.constraints,
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: {
      ...emptyConversationEffects(),
      blocked: reduced.blocked_effects,
    },
    state_patch: {
      demotivation_repair_local_state: reduced.local_state,
      demotivation_repair_visible_task: reduced.visible_task,
      demotivation_repair_inline_note: decision.flow_action ===
            "get_info_product" ||
          decision.flow_action === "get_info_db"
        ? reduced.note_information
        : null,
      demotivation_repair_potion_handoff: reduced.potion_bridge_context
        ? {
          selected_potion: reduced.potion_bridge_context.selected_potion,
          potion_bridge_context: reduced.potion_bridge_context,
          note_information: reduced.potion_bridge_context.note_information,
        }
        : null,
      summary: reduced.local_state?.previous_repair_summary ??
        decision.repair_state.summary,
    },
  });
}
