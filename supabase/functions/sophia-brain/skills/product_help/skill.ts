import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import {
  createNoteInformation,
  type NoteInformation,
  noteInformationForTrace,
  noteInformationSummary,
} from "../../contracts/note_information.v1.ts";
import {
  type ProductHelpLocalDispatcher,
  readProductHelpFlowState,
  reduceProductHelpLocalDispatcherOutput,
  runProductHelpLocalDispatcher,
} from "./local_flow.ts";
import { retrieveProductHelpCandidates } from "./retrieval.ts";
import {
  type ProductHelpVisibleAgent,
  runProductHelpVisibleAgent,
} from "./visible_agent.ts";
import {
  RECENT_MESSAGE_LIMITS,
  trimRecentChatMessages,
} from "../../context/recent_messages_policy.ts";

export type ProductHelpRunSkillInput = RunSkillInput & {
  local_dispatcher?: ProductHelpLocalDispatcher;
  visible_agent?: ProductHelpVisibleAgent;
};

function recentMessagesFromContext(input: ProductHelpRunSkillInput) {
  return trimRecentChatMessages(
    input.context.recent_messages,
    RECENT_MESSAGE_LIMITS.toolFlow,
  );
}

function compactActiveFlowContext(
  activeState: unknown,
): Record<string, unknown> | null {
  if (!activeState || typeof activeState !== "object") return null;
  const state = activeState as any;
  return {
    skill_id: String(state.skill_id ?? "").trim() || null,
    status: String(state.status ?? "").trim() || null,
    turn_count: Number(state.turn_count ?? 0) || 0,
    working_state:
      state.working_state && typeof state.working_state === "object"
        ? state.working_state
        : null,
  };
}

function recentCommittedEffects(turnFrame: unknown): unknown[] {
  const frame = turnFrame as any;
  const direct = Array.isArray(frame?.direct_effects)
    ? frame.direct_effects
    : [];
  return direct.filter((effect: any) => effect?.target_status === "identified")
    .slice(0, 8);
}

function inboundProductHelpNote(args: {
  input: ProductHelpRunSkillInput;
  mode: "standalone" | "inline";
  previous: unknown;
  activeFlow: Record<string, unknown> | null;
}): NoteInformation | null {
  const context = args.input.context as any;
  const existing = context.note_information ?? context.inbound_note_information;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as NoteInformation;
  }
  if (args.previous) return null;
  const sourceFlowId = args.mode === "inline"
    ? String(args.activeFlow?.skill_id ?? "parent_flow")
    : "global";
  return createNoteInformation({
    source_flow_id: sourceFlowId,
    handoff_reason: args.mode === "inline"
      ? "inline_tool"
      : "explicit_user_request",
    target_dispatcher: "product_help",
    handoff_context_for_next_dispatcher: JSON.stringify({
      user_message: args.input.user_message,
      mode: args.mode,
      parent_flow_context: args.mode === "inline" ? args.activeFlow : null,
    }),
    user_words: [args.input.user_message],
    structured_context: {
      source_flow: sourceFlowId,
      user_message: args.input.user_message,
      user_message_summary: args.input.user_message,
      active_flow_summary: args.mode === "inline"
        ? `Parent flow ${sourceFlowId} asked product_help inline.`
        : "Global dispatcher selected product_help for a product question.",
      mode: args.mode,
      parent_flow_context: args.mode === "inline" ? args.activeFlow : null,
      unresolved_questions: [],
      recommended_next_focus: "product_help",
    },
  });
}

function fallbackSkillOutput(reason: string) {
  return baseOutput("product_help", {
    status: "complete",
    response_intent: "technical_fallback",
    reply:
      "Je peux t'aider sur le fonctionnement du produit, mais je préfère rester prudent sur ce tour: je n'exécute rien et je ne confirme aucun objet sans source fiable.",
    diagnosis: {
      local_flow: true,
      local_dispatcher_status: "failed",
      reason,
      operation_suggestions: [],
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "product_help_does_not_execute_operations",
        "technical_fallback_no_mutation",
      ],
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: {
      requested: [],
      allowed: [],
      blocked: [{
        type: "product_help",
        reason_code: "local_dispatcher_failed",
      }],
      committed: [],
    },
    state_patch: {
      product_help_local_flow: {
        status: "blocked",
        reason_code: reason,
      },
    },
  });
}

export async function runProductHelpSkill(input: ProductHelpRunSkillInput) {
  const candidates = retrieveProductHelpCandidates(input.user_message);
  const previous = readProductHelpFlowState(
    input.context.active_skill_working_state,
  );
  const activeFlow = compactActiveFlowContext(
    input.context.active_skill_working_state,
  );
  const mode = activeFlow && activeFlow.skill_id !== "product_help"
    ? "inline"
    : "standalone";
  const inboundNote = inboundProductHelpNote({
    input,
    mode,
    previous,
    activeFlow,
  });
  const dispatcher = input.local_dispatcher ?? runProductHelpLocalDispatcher;
  const dbContextPack = {
    product_catalog_pack: candidates.map((feature) => ({
      id: feature.id,
      label: feature.label,
      locations: feature.locations,
      limits: feature.limits,
      source: "product_help_catalog",
      confidence: "high",
      freshness: "static_product_contract",
    })),
    parent_flow_context: mode === "inline" ? activeFlow : null,
    inbound_note_information: inboundNote,
    recent_committed_effects: recentCommittedEffects(input.context.turn_frame),
    product_surfaces: input.context.product_surfaces ?? [],
  };
  console.info("[ProductHelp] db_context_pack_loaded", {
    mode,
    catalog_candidate_count: candidates.length,
    has_parent_flow: mode === "inline",
    micro_memory_items: 0,
  });
  console.info("[ProductHelp] local_dispatcher_called", {
    mode,
    active_product_help: Boolean(previous),
    parent_skill_id: mode === "inline" ? activeFlow?.skill_id ?? null : null,
  });
  const decision = await dispatcher({
    user_id: input.context.user_id,
    request_id: (input.context.turn_frame as any)?.source_message_id ?? null,
    user_message: input.user_message,
    recent_messages: recentMessagesFromContext(input),
    product_help_state: previous,
    parent_flow_context: mode === "inline" ? activeFlow : null,
    catalog_candidates: candidates,
    product_surface_registry: input.context.product_surfaces ?? [],
    recent_committed_effects: recentCommittedEffects(input.context.turn_frame),
    db_projection_sources: [],
    db_context_pack: dbContextPack,
    micro_memory_context: {
      items: [],
      exclusions: ["product_help_no_micro_memory_by_default"],
      budget: {
        max_items: 0,
        reason: "product_help uses product context and parent context only",
      },
    },
    note_information_inbound: inboundNote,
    platform_context: {
      plan_snapshot: { items: input.context.plan_items ?? [] },
    },
    risk_context: { turn_safety: (input.context.turn_frame as any)?.safety },
    available_inline_tools: ["status_recap"],
    active_flow_context: activeFlow,
    mode,
    turn_frame: input.context.turn_frame,
  });
  if (!decision) {
    return fallbackSkillOutput("product_help_local_dispatcher_failed");
  }
  console.info("[ProductHelp] local_dispatcher_result", {
    flow_action: decision.flow_action,
    mode: decision.mode,
    visible_task: decision.visible_task.kind,
    return_to_parent: decision.return_to_parent.needed,
    exit_to_global_dispatcher:
      decision.flow_action === "exit_to_global_dispatcher",
    note_information_target: decision.note_information?.target_dispatcher ??
      null,
  });
  if (decision.flow_action === "apply_attempt") {
    console.info("[ProductHelp] apply_attempt_no_mutation", {
      bridge: decision.bridge,
    });
  }
  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous,
    output: decision,
    catalogCandidates: candidates,
    parentFlowContext: mode === "inline" ? activeFlow : null,
    productSurfaces: input.context.product_surfaces ?? [],
    recentCommittedEffects: recentCommittedEffects(input.context.turn_frame),
    userMessage: input.user_message,
  });
  if (reduced.note_information) {
    console.info("[ProductHelp] note_information_created", {
      ...noteInformationForTrace(reduced.note_information),
      flow_action: decision.flow_action,
    });
  }
  if (reduced.exit_to_global_dispatcher) {
    console.info("[ProductHelp] exit_to_global_dispatcher", {
      note_information_target: reduced.note_information?.target_dispatcher ??
        null,
    });
    return baseOutput("product_help", {
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      reply: "",
      diagnosis: {
        local_flow: true,
        flow_action: decision.flow_action,
        mode: decision.mode,
        note_information: reduced.note_information,
        exit_memo: decision.exit_memo,
        reason_code: reduced.reason_code,
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: [
          "product_help_does_not_execute_operations",
          "exit_to_global_dispatcher_with_note_information",
        ],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: {
        requested: [],
        allowed: [],
        blocked: [],
        committed: [],
      },
      state_patch: {
        product_help_local_state: reduced.local_state,
        product_help_exit_memo: {
          ...decision.exit_memo,
          note_information: reduced.note_information,
          at: new Date().toISOString(),
          reducer_reason_code: reduced.reason_code,
        },
        summary: noteInformationSummary(reduced.note_information) ??
          decision.exit_memo.user_intent_summary ??
          "Product help exited to global dispatcher.",
      },
    });
  }
  if (reduced.handoff_to_local_dispatcher) {
    const targetDispatcher = String(
      reduced.note_information?.target_dispatcher ?? "",
    );
    console.info("[ProductHelp] handoff_to_local_dispatcher", {
      target_dispatcher: targetDispatcher || null,
      note_information_target: reduced.note_information?.target_dispatcher ??
        null,
    });
    return baseOutput("product_help", {
      status: "handoff",
      response_intent: decision.product_help_intent.kind,
      reply: "",
      diagnosis: {
        local_flow: true,
        flow_action: decision.flow_action,
        mode: decision.mode,
        target: decision.target,
        grounding: decision.grounding,
        bridge: decision.bridge,
        visible_task: reduced.visible_task,
        return_to_parent_flow: reduced.return_to_parent_flow,
        handoff_to_local_dispatcher: true,
        note_information: reduced.note_information,
        reason_code: reduced.reason_code,
        evidence: reduced.evidence,
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: [
          "product_help_does_not_execute_operations",
          "local_handoff_with_note_information",
          "requested_allowed_committed_effects_empty",
        ],
      },
      operation_suggestions: [],
      handoff_request: targetDispatcher
        ? {
          target_skill_id: targetDispatcher,
          reason: reduced.reason_code,
          confidence_band: decision.confidence,
        }
        : undefined,
      memory_write_candidates: [],
      effects: {
        requested: [],
        allowed: [],
        blocked: reduced.blocked_effects,
        committed: [],
      },
      state_patch: {
        product_help_local_state: reduced.local_state,
        product_help_note_information: reduced.note_information,
        product_help_exit_memo: {
          ...decision.exit_memo,
          note_information: reduced.note_information,
          at: new Date().toISOString(),
          reducer_reason_code: reduced.reason_code,
        },
        product_help_subskill_trace: null,
        summary: noteInformationSummary(reduced.note_information) ??
          decision.exit_memo.user_intent_summary ??
          "Product help handed off to a local dispatcher.",
      },
    });
  }
  const visibleAgent = input.visible_agent ?? runProductHelpVisibleAgent;
  console.info("[ProductHelp] visible_prompt_called", {
    mode,
    stage: reduced.visible_task,
  });
  const visible = await visibleAgent({
    user_id: input.context.user_id,
    request_id: (input.context.turn_frame as any)?.source_message_id ?? null,
    stage: reduced.visible_task,
    conversation_context: reduced.conversation_context,
  });
  const reply = String(visible ?? "").trim();
  if (!reply) return fallbackSkillOutput("product_help_visible_agent_failed");
  if (mode === "inline") {
    console.info("[ProductHelp] inline_called_from_parent", {
      parent_skill_id: activeFlow?.skill_id ?? null,
    });
    console.info("[ProductHelp] returned_to_parent_flow", {
      parent_skill_id: activeFlow?.skill_id ?? null,
      returned_to_parent: true,
    });
  }
  const targetDispatcher = String(
    reduced.note_information?.target_dispatcher ?? "",
  );
  const handoffTarget = targetDispatcher && targetDispatcher !== "global"
    ? targetDispatcher
    : null;
  return baseOutput("product_help", {
    status: reduced.status === "handoff" || reduced.status === "safety"
      ? "handoff"
      : reduced.status === "closing" || reduced.status === "closed" ||
          mode === "inline"
      ? "complete"
      : "continue",
    response_intent: decision.product_help_intent.kind,
    reply,
    diagnosis: {
      local_flow: true,
      flow_action: decision.flow_action,
      mode: decision.mode,
      target: decision.target,
      grounding: decision.grounding,
      bridge: decision.bridge,
      visible_task: reduced.visible_task,
      return_to_parent_flow: reduced.return_to_parent_flow,
      handoff_to_local_dispatcher: reduced.handoff_to_local_dispatcher,
      note_information: reduced.note_information,
      reason_code: reduced.reason_code,
      evidence: reduced.evidence,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "product_help_does_not_execute_operations",
        "operation_suggestions_always_empty",
        "requested_allowed_committed_effects_empty",
      ],
    },
    operation_suggestions: [],
    handoff_request: handoffTarget
      ? {
        target_skill_id: handoffTarget,
        reason: reduced.reason_code,
        confidence_band: decision.confidence,
      }
      : undefined,
    memory_write_candidates: [],
    effects: {
      requested: [],
      allowed: [],
      blocked: reduced.blocked_effects,
      committed: [],
    },
    state_patch: {
      product_help_local_state: reduced.local_state,
      product_help_note_information: reduced.note_information,
      product_help_exit_memo: reduced.handoff_to_local_dispatcher
        ? {
          ...decision.exit_memo,
          note_information: reduced.note_information,
          at: new Date().toISOString(),
          reducer_reason_code: reduced.reason_code,
        }
        : null,
      product_help_subskill_trace: mode === "inline"
        ? {
          subskill: "product_help",
          mode: "inline",
          answered_intent: decision.product_help_intent.kind,
          returned_to_parent: true,
          parent_skill_id: activeFlow?.skill_id ?? null,
        }
        : null,
      summary: reduced.answer_summary ??
        `Product help answered: ${decision.flow_action}.`,
    },
  });
}
