import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  createNoteInformation,
  noteInformationForTrace,
} from "../../contracts/note_information.v1.ts";
import {
  RECENT_MESSAGE_LIMITS,
  trimRecentChatMessages,
} from "../../context/recent_messages_policy.ts";
import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import {
  type EmotionalRepairLocalDispatcher,
  readEmotionalRepairLocalState,
  reduceEmotionalRepairLocalDispatcherOutput,
  runEmotionalRepairLocalDispatcher,
} from "./local_flow.ts";
import {
  type EmotionalRepairVisibleAgent,
  runEmotionalRepairVisibleAgent,
} from "./visible_agent.ts";

export type RunEmotionalRepairSkillInput = RunSkillInput & {
  local_dispatcher?: EmotionalRepairLocalDispatcher;
  visible_agent?: EmotionalRepairVisibleAgent;
  request_id?: string | null;
  explicit_constraints?: string[];
};

function recentMessagesFromContext(input: RunEmotionalRepairSkillInput) {
  return trimRecentChatMessages(
    input.context.recent_messages,
    RECENT_MESSAGE_LIMITS.conversationRepair,
  );
}

function localFallbackOutput(reason: string): ConversationSkillOutput {
  return baseOutput("emotional_repair", {
    status: "continue",
    response_intent: "technical_fallback",
    reply: "",
    diagnosis: {
      local_flow: true,
      reason_code: reason,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: ["no_chat_mutation", "technical_fallback"],
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: {
      ...emptyConversationEffects(),
      blocked: [{ type: "emotional_repair", reason_code: reason }],
    },
  });
}

function compactText(value: unknown, max = 220): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function compactDbContextPack(input: RunEmotionalRepairSkillInput) {
  const planItems = Array.isArray(input.context.plan_items)
    ? input.context.plan_items.slice(0, 4).map((item) => ({
      id: compactText((item as any)?.id, 80),
      title: compactText((item as any)?.title, 120),
      status: compactText((item as any)?.status, 80),
      dimension: compactText((item as any)?.dimension, 80),
      source: "db_derived",
      confidence: "medium",
    }))
    : [];
  const inboundNote =
    (input.context.active_skill_working_state as any)?.note_information ??
      (input.context.active_skill_working_state as any)?.working_state
        ?.note_information ??
      (input.context as any).note_information ??
      (input.context as any).flow_opportunity_context?.note_information ??
      null;
  return {
    source: "skill_context",
    freshness: "current_turn",
    confidence: "medium",
    evidence: planItems.length > 0 ? ["plan_items_compacted"] : [],
    status: "db_derived",
    active_flow_state: input.context.active_skill_working_state ?? null,
    plan_context: {
      items: planItems,
      included_only_if_relevant: true,
    },
    potion_bridge_catalog: {
      allowed_from_emotional_repair: ["amour", "guerison", "apaisement"],
      source: "contract",
    },
    note_information_inbound: inboundNote,
  };
}

function microMemoryContext(input: RunEmotionalRepairSkillInput) {
  const exclusions: string[] = [];
  const items = (input.context.relevant_memory_items ?? []).flatMap((item) => {
    const sensitivity = String(item.sensitivity_level ?? "").trim();
    if (sensitivity === "safety" || sensitivity === "4") {
      exclusions.push(`safety_memory:${item.id}`);
      return [];
    }
    const summary = compactText(item.content_text, 180);
    if (!summary) return [];
    return [{
      summary,
      source: "semantic_memory",
      linked_object: {
        type: "memory_item",
        id: item.id,
        label: compactText(item.kind, 80),
      },
      freshness: "recent",
      confidence: "medium",
      evidence: [summary],
      sensitivity: sensitivity === "sensitive" || sensitivity === "3" ||
          sensitivity === "2"
        ? "sensitive"
        : "normal",
    }];
  }).slice(0, 4);
  return {
    items,
    exclusions,
    budget: {
      max_items: 4,
      reason:
        "emotional_repair uses only very close memory to avoid making the user repeat an emotional episode.",
    },
  };
}

function safetyContextHandoffOutput(
  input: RunEmotionalRepairSkillInput,
): ConversationSkillOutput {
  const safety = input.context.turn_frame.safety;
  const userWords = compactText(input.user_message, 240)
    ? [compactText(input.user_message, 240)!]
    : [];
  const structuredContext = {
    source_flow: "emotional_repair",
    trigger: "turn_frame_safety_context",
    user_message_summary: compactText(input.user_message, 240),
    active_flow_summary: compactText(
      (input.context.active_skill_working_state as any)?.summary ??
        (input.context.active_skill_working_state as any)?.working_state
          ?.summary,
      240,
    ),
    safety,
    no_chat_mutation: true,
  };
  const noteInformation = createNoteInformation({
    source_flow_id: "emotional_repair",
    handoff_reason: "safety",
    target_dispatcher: "safety_crisis",
    handoff_context_for_next_dispatcher: JSON.stringify(structuredContext),
    user_words: userWords,
    structured_context: structuredContext,
    confidence: safety.risk_band === "critical" ? "high" : "medium",
  });
  console.info("[EmotionalRepair] note_information_created", {
    ...noteInformationForTrace(noteInformation),
    request_id: input.request_id ??
      (input.context.turn_frame as any)?.source_message_id ?? null,
    transition_tag: "safety_context_to_safety_with_note",
  });
  return baseOutput("emotional_repair", {
    status: "handoff",
    response_intent: "handoff_to_safety",
    reply: "",
    diagnosis: {
      local_flow: true,
      flow_action: "safety_preempt",
      reason_code: "safety_context",
      evidence: safety.evidence ?? safety.reason_codes ?? [],
      note_information: noteInformation,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: ["safety_preempt", "no_chat_mutation"],
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: {
      ...emptyConversationEffects(),
      blocked: [{
        type: "emotional_repair",
        reason_code: "safety_preempt",
      }],
    },
    state_patch: {
      emotional_repair_local_state: null,
      emotional_repair_safety_handoff: {
        note_information: noteInformation,
        no_chat_mutation: true,
      },
      summary: "Safety handoff from emotional_repair.",
    },
  });
}

export async function runEmotionalRepairSkill(
  input: RunEmotionalRepairSkillInput,
): Promise<ConversationSkillOutput> {
  const safetyRisk = input.context.turn_frame.safety.risk_band;
  if (safetyRisk === "high" || safetyRisk === "critical") {
    return safetyContextHandoffOutput(input);
  }

  const previous = readEmotionalRepairLocalState(
    input.context.active_skill_working_state,
  );
  const dispatcher = input.local_dispatcher ??
    runEmotionalRepairLocalDispatcher;
  const dbContextPack = compactDbContextPack(input);
  console.info("[EmotionalRepair] local_dispatcher_called", {
    active_emotional_repair: Boolean(previous),
    previous_visible_task: previous?.last_visible_task ?? null,
  });
  const decision = await dispatcher({
    user_id: input.context.user_id,
    request_id: input.request_id ??
      (input.context.turn_frame as any)?.source_message_id ?? null,
    current_user_message: input.user_message,
    user_message: input.user_message,
    recent_messages: recentMessagesFromContext(input),
    active_state: previous,
    note_information_inbound: (dbContextPack.note_information_inbound as
      | Record<string, unknown>
      | null),
    db_context_pack: dbContextPack,
    micro_memory_context: microMemoryContext(input),
    platform_context: {
      channel: input.context.turn_frame.channel,
      plan_snapshot: { items: input.context.plan_items ?? [] },
    },
    risk_context: {
      safety: input.context.turn_frame.safety,
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
  });
  if (!decision) return localFallbackOutput("local_dispatcher_failed");
  console.info("[EmotionalRepair] local_dispatcher_result", {
    flow_action: decision.flow_action,
    visible_task: decision.visible_task.kind,
    potion_bridge_status: decision.potion_bridge.status,
    selected_potion: decision.potion_bridge.selected_potion,
  });
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous,
    output: decision,
    explicit_constraints: input.explicit_constraints ?? [],
    turn_frame: input.context.turn_frame,
  });
  console.info("[EmotionalRepair] reducer_result", {
    status: reduced.status,
    reason_code: reduced.reason_code,
    visible_task: reduced.visible_task.kind,
    handoff_to_potion: Boolean(reduced.potion_bridge_context),
  });
  if (reduced.potion_bridge_context && reduced.status === "handoff") {
    console.info("[EmotionalRepair] potion_bridge_confirmed", {
      selected_potion: reduced.potion_bridge_context.selected_potion,
      origin_flow: reduced.potion_bridge_context.origin_flow,
    });
    console.info("[EmotionalRepair] note_information_created", {
      ...noteInformationForTrace(
        reduced.potion_bridge_context.note_information,
      ),
      request_id: input.request_id ??
        (input.context.turn_frame as any)?.source_message_id ?? null,
      transition_tag: "local_to_local_bridge_with_note",
    });
    console.info("[EmotionalRepair] handoff_to_select_state_potion", {
      selected_potion: reduced.potion_bridge_context.selected_potion,
    });
  } else if (decision.flow_action === "potion_bridge_offer") {
    console.info("[EmotionalRepair] potion_bridge_offered", {
      selected_potion: decision.potion_bridge.selected_potion,
      blocked: reduced.reason_code === "emotional_repair_potion_bridge_blocked",
    });
  }
  if (reduced.exit_to_global_dispatcher) {
    const noteInformation = createNoteInformation({
      source_flow_id: "emotional_repair",
      handoff_reason: decision.exit_memo.reason === "safety"
        ? "safety"
        : "topic_change",
      target_dispatcher: decision.exit_memo.reason === "safety"
        ? "safety_crisis"
        : "global",
      handoff_context_for_next_dispatcher: decision.exit_memo
        .handoff_hint_for_global_dispatcher ??
        decision.repair_state.summary,
      user_words: decision.repair_state.user_words,
      structured_context: {
        source_flow: "emotional_repair",
        user_message_summary: decision.repair_state.summary,
        active_flow_summary: decision.repair_state.summary,
        collected_state: {
          flow_action: decision.flow_action,
          repair_intent: decision.repair_state.intent,
        },
        unresolved_questions: [],
        recommended_next_focus: decision.exit_memo.reason === "safety"
          ? "safety_crisis"
          : "global",
      },
      confidence: decision.confidence,
    });
    console.info("[EmotionalRepair] note_information_created", {
      ...noteInformationForTrace(noteInformation),
      request_id: input.request_id ??
        (input.context.turn_frame as any)?.source_message_id ?? null,
      transition_tag: noteInformation.target_dispatcher === "safety_crisis"
        ? "local_to_safety_with_note"
        : "local_to_global_with_note",
    });
    return baseOutput("emotional_repair", {
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      reply: "",
      diagnosis: {
        local_flow: true,
        flow_action: decision.flow_action,
        exit_memo: decision.exit_memo,
        reason_code: reduced.reason_code,
        evidence: reduced.evidence,
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["exit_to_global_dispatcher", "no_chat_mutation"],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: emptyConversationEffects(),
      state_patch: {
        emotional_repair_local_state: null,
        emotional_repair_exit_memo: {
          ...decision.exit_memo,
          note_information: noteInformation,
          information_note: {
            departed_flow_summary: decision.repair_state.summary,
            context_for_next_dispatcher: decision.exit_memo
              .handoff_hint_for_global_dispatcher,
          },
        },
      },
    });
  }
  if (reduced.status === "safety") {
    const safetyNoteInformation = createNoteInformation({
      source_flow_id: "emotional_repair",
      handoff_reason: "safety",
      target_dispatcher: "safety_crisis",
      handoff_context_for_next_dispatcher: JSON.stringify({
        origin_flow: "emotional_repair",
        flow_action: decision.flow_action,
        repair_intent: decision.repair_state.intent,
        emotional_dominance: decision.repair_state.emotional_dominance,
        user_words: decision.repair_state.user_words,
        safety_evidence: reduced.evidence,
      }),
      user_words: decision.repair_state.user_words,
      structured_context: {
        source_flow: "emotional_repair",
        user_message_summary: decision.repair_state.summary,
        active_flow_summary: decision.repair_state.summary,
        collected_state: {
          flow_action: decision.flow_action,
          repair_intent: decision.repair_state.intent,
        },
        unresolved_questions: [],
        evidence: reduced.evidence,
        recommended_next_focus: "safety_crisis",
      },
      confidence: decision.confidence,
    });
    console.info("[EmotionalRepair] note_information_created", {
      ...noteInformationForTrace(safetyNoteInformation),
      request_id: input.request_id ??
        (input.context.turn_frame as any)?.source_message_id ?? null,
      transition_tag: "local_to_safety_with_note",
    });
    return baseOutput("emotional_repair", {
      status: "handoff",
      response_intent: "handoff_to_safety",
      reply: "",
      diagnosis: {
        local_flow: true,
        flow_action: decision.flow_action,
        visible_task: "safety",
        reason_code: reduced.reason_code,
        evidence: reduced.evidence,
        note_information: safetyNoteInformation,
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["safety_preempt", "no_chat_mutation"],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: {
        ...emptyConversationEffects(),
        blocked: reduced.blocked_effects,
      },
      state_patch: {
        emotional_repair_local_state: null,
        emotional_repair_safety_handoff: {
          note_information: safetyNoteInformation,
          no_chat_mutation: true,
        },
        summary: decision.repair_state.summary,
      },
    });
  }
  const visibleAgent = input.visible_agent ?? runEmotionalRepairVisibleAgent;
  console.info("[EmotionalRepair] visible_prompt_called", {
    stage: reduced.visible_task.kind,
  });
  const visible = await visibleAgent({
    user_id: input.context.user_id,
    request_id: input.request_id ??
      (input.context.turn_frame as any)?.source_message_id ?? null,
    stage: reduced.visible_task.kind,
    visible_task: reduced.visible_task,
  });
  const reply = String(visible ?? "").trim();
  if (!reply) return localFallbackOutput("visible_agent_failed");
  return baseOutput("emotional_repair", {
    status: reduced.status,
    response_intent: reduced.response_intent,
    reply,
    diagnosis: {
      local_flow: true,
      flow_action: decision.flow_action,
      visible_task: reduced.visible_task.kind,
      potion_bridge_status: decision.potion_bridge.status,
      selected_potion: reduced.potion_bridge_context?.selected_potion ??
        decision.potion_bridge.selected_potion,
      reason_code: reduced.reason_code,
      evidence: reduced.evidence,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: ["no_chat_mutation", ...reduced.constraints],
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: {
      ...emptyConversationEffects(),
      blocked: reduced.blocked_effects,
    },
    state_patch: {
      emotional_repair_local_state: reduced.local_state,
      emotional_repair_visible_task: reduced.visible_task,
      emotional_repair_potion_handoff: reduced.potion_bridge_context
        ? {
          selected_potion: reduced.potion_bridge_context.selected_potion,
          potion_bridge_context: reduced.potion_bridge_context,
          note_information: reduced.potion_bridge_context.note_information,
          information_note: reduced.potion_bridge_context.information_note,
          no_chat_mutation: true,
        }
        : null,
      summary: reduced.local_state?.previous_repair_summary ??
        decision.repair_state.summary,
    },
  });
}
