/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
} from "../../../contracts/note_information.v1.ts";
import {
  RECENT_MESSAGE_LIMITS,
  recentChatMessagesFromHistory,
} from "../../../context/recent_messages_policy.ts";
import type { SafetySignalContext } from "../../../safety/safety_context.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";
import type {
  AttackCardHandoffDraft,
  AttackCardPlatformFieldId,
} from "./contract.ts";
import {
  type AttackCardHandoffState,
  buildAttackCardHandoffState,
  isAttackCardHandoffState,
} from "./state.ts";
import {
  createInitialPrepareAttackCardLocalState,
  type PrepareAttackCardLocalDispatcher,
  reducePrepareAttackCardLocalDispatcherOutput,
  runPrepareAttackCardLocalDispatcher,
} from "./local_flow.ts";
import {
  type PrepareAttackCardVisibleAgent,
  runPrepareAttackCardVisibleAgent,
} from "./visible_agent.ts";
import {
  type InlineInfoToolContext,
  runInlineGetInfoDbTool,
  runInlineGetInfoProductTool,
} from "../inline_info_tools.ts";

export type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution:
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain"
    | "platform_handoff";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

function runtimeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function runtimeString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function operationType(value: unknown): string {
  return runtimeString(runtimeRecord(value).operation_type) ?? "";
}

function attackCardFrameRecord(tempMemory: any) {
  const memory = tempMemory ?? {};
  return {
    pending: memory.__pending_tool_skill_confirmation ??
      memory.pending_tool_skill_confirmation ?? null,
    draftReview: memory.__pending_attack_card_draft_review ?? null,
    active: memory.__active_tool_skill_intake ??
      memory.active_tool_skill_intake ?? null,
    recommendation: memory.__pending_recommendation_operation ?? null,
    handoff: memory.__active_attack_card_handoff ?? null,
  };
}

export function loadPrepareAttackCardFrameFromTempMemory(tempMemory: any) {
  return attackCardFrameRecord(tempMemory);
}

export function writePrepareAttackCardFrameToTempMemory(
  tempMemory: any,
  frame: {
    pending?: Record<string, unknown> | null;
    draftReview?: Record<string, unknown> | null;
    active?: Record<string, unknown> | null;
    recommendation?: Record<string, unknown> | null;
    handoff?: AttackCardHandoffState | null;
  },
) {
  const next = { ...(tempMemory ?? {}) };
  if ("pending" in frame) {
    if (frame.pending) next.__pending_tool_skill_confirmation = frame.pending;
    else delete next.__pending_tool_skill_confirmation;
    delete next.pending_tool_skill_confirmation;
  }
  if ("draftReview" in frame) {
    if (frame.draftReview) {
      next.__pending_attack_card_draft_review = frame.draftReview;
    } else {
      delete next.__pending_attack_card_draft_review;
    }
  }
  if ("active" in frame) {
    if (frame.active) next.__active_tool_skill_intake = frame.active;
    else delete next.__active_tool_skill_intake;
    delete next.active_tool_skill_intake;
  }
  if ("recommendation" in frame) {
    if (frame.recommendation) {
      next.__pending_recommendation_operation = frame.recommendation;
    } else {
      delete next.__pending_recommendation_operation;
    }
  }
  if ("handoff" in frame) {
    if (frame.handoff) next.__active_attack_card_handoff = frame.handoff;
    else delete next.__active_attack_card_handoff;
  }
  return next;
}

export function clearPrepareAttackCardFrame(tempMemory: any) {
  return writePrepareAttackCardFrameToTempMemory(tempMemory, {
    pending: null,
    draftReview: null,
    active: null,
    recommendation: null,
    handoff: null,
  });
}

function recentMessagesFromHistory(history: unknown) {
  return recentChatMessagesFromHistory(history, RECENT_MESSAGE_LIMITS.toolFlow);
}

function localRuntimeTraceBase(args: {
  event: string;
  flowAction?: string | null;
  visibleTask?: string | null;
  currentFieldId?: string | null;
  techniqueKey?: string | null;
  targetStatus?: string | null;
  blockerStatus?: string | null;
  missingFields?: string[];
  riskAssessment?: Record<string, unknown> | null;
  selectedHandler?: string | null;
  stateMutationAudit?: Record<string, unknown> | null;
}) {
  return {
    component: "prepare_attack_card.local_flow",
    event: args.event,
    flow_action: args.flowAction ?? null,
    stage: args.visibleTask ?? null,
    visible_task_kind: args.visibleTask ?? null,
    current_field_id: args.currentFieldId ?? null,
    technique_key: args.techniqueKey ?? null,
    target_status: args.targetStatus ?? null,
    blocker_status: args.blockerStatus ?? null,
    missing_fields: args.missingFields ?? [],
    risk_assessment: args.riskAssessment ?? null,
    selected_handler: args.selectedHandler ?? "prepare_attack_card",
    state_mutation_audit: args.stateMutationAudit ?? null,
  };
}

function buildPrepareAttackCardDbContextPack(args: {
  planSnapshot?: unknown;
  operationInput?: Record<string, unknown> | null;
  activeHandoff: AttackCardHandoffState | null;
}) {
  const planItems = Array.isArray((args.planSnapshot as any)?.items)
    ? ((args.planSnapshot as any).items as unknown[]).slice(0, 12).map((item) =>
      item && typeof item === "object"
        ? {
          id: (item as any).id ?? null,
          title: (item as any).title ?? null,
          status: (item as any).status ?? null,
          kind: (item as any).kind ?? (item as any).item_type ?? null,
          source: "plan_snapshot",
          confidence: "medium",
        }
        : null
    ).filter(Boolean)
    : [];
  const handoffTarget = getHandoffTargetForOperation("prepare_attack_card");
  return {
    source: "prepare_attack_card.router",
    freshness: "same_turn",
    confidence: "medium",
    surface: {
      operation_type: "prepare_attack_card",
      surface_id: handoffTarget?.surface_id ?? "attack_cards",
      destination: handoffTarget?.user_facing_destination ??
        "dans la section Cartes d'attaque",
      platform_steps: handoffTarget?.platform_steps ?? [],
      status: "db_derived",
    },
    plan: {
      items: planItems,
      status: planItems.length > 0 ? "db_derived" : "missing",
    },
    operation_input: args.operationInput
      ? {
        value: args.operationInput,
        status: "bridge_provided",
        confidence: "medium",
      }
      : null,
    active_handoff: args.activeHandoff
      ? {
        status: args.activeHandoff.status,
        target: args.activeHandoff.target ?? null,
        draft_summary: args.activeHandoff.draft
          ? {
            target_summary: args.activeHandoff.draft.target_summary,
            blocker_summary: args.activeHandoff.draft.blocker_summary,
            technique_label:
              args.activeHandoff.draft.platform_handoff?.technique_label ??
                args.activeHandoff.draft.recommendation.technique_label,
          }
          : null,
        source: "active_flow_state",
        confidence: "high",
      }
      : null,
  };
}

function buildPrepareAttackCardMicroMemoryContext(args: {
  operationInput?: Record<string, unknown> | null;
}) {
  const target = args.operationInput?.target &&
      typeof args.operationInput.target === "object"
    ? args.operationInput.target as Record<string, unknown>
    : null;
  return {
    items: [],
    exclusions: [
      "No raw memory dump is loaded for prepare_attack_card V1.",
      "Memory alone must not lock target, blocker, technique, or fields.",
      "Safety memory is excluded unless safety_crisis owns the turn.",
    ],
    budget: {
      max_items: target ? 3 : 0,
      reason: target
        ? "An action candidate exists, but no dedicated micro-memory retrieval is wired in this runtime path yet."
        : "No action candidate requiring micro-memory context.",
    },
  };
}

function buildPrepareAttackCardInboundNote(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  operationInput?: Record<string, unknown> | null;
  activeHandoff: AttackCardHandoffState | null;
}): NoteInformation | null {
  if (args.activeHandoff) return null;
  if (
    args.routeDecision?.response_owner !== "tool_skill" ||
    args.routeDecision.selected_handler !== "prepare_attack_card"
  ) return null;
  if (args.turnFrame?.note_information) {
    return normalizeNoteInformation(args.turnFrame.note_information, {
      source_flow_id: "global",
      handoff_reason: "explicit_user_request",
      target_dispatcher: "prepare_attack_card",
      handoff_context_for_next_dispatcher: JSON.stringify({
        route_reason: args.routeDecision.reason_code ?? null,
        operation_input: args.operationInput ?? null,
        selected_handler: args.routeDecision.selected_handler,
      }),
      structured_context: {
        route_reason: args.routeDecision.reason_code ?? null,
        operation_input: args.operationInput ?? null,
        selected_handler: args.routeDecision.selected_handler,
        first_local_activation: true,
        active_flow_summary: String(args.routeDecision.reason_code ?? "")
          .trim() || "prepare_attack_card selected by prior dispatcher.",
        unresolved_questions: [],
        recommended_next_focus: "prepare_attack_card",
      },
    });
  }
  return createNoteInformation({
    source_flow_id: "global",
    handoff_reason: "explicit_user_request",
    target_dispatcher: "prepare_attack_card",
    handoff_context_for_next_dispatcher: JSON.stringify({
      route_reason: args.routeDecision.reason_code ?? null,
      operation_input: args.operationInput ?? null,
      selected_handler: args.routeDecision.selected_handler,
    }),
    structured_context: {
      source_flow: "global",
      active_flow_summary: String(args.routeDecision.reason_code ?? "")
        .trim() || "prepare_attack_card selected by global dispatcher.",
      route_reason: args.routeDecision.reason_code ?? null,
      operation_input: args.operationInput ?? null,
      selected_handler: args.routeDecision.selected_handler,
      first_local_activation: true,
      unresolved_questions: [],
      recommended_next_focus: "prepare_attack_card",
    },
  });
}

function activeFlowContext(
  state: ReturnType<typeof createInitialPrepareAttackCardLocalState>,
) {
  return {
    flow_kind: state.flow_kind,
    platform_destination: state.platform_destination,
    target_state: state.target_state,
    blocker_state: state.blocker_state,
    technique_state: state.technique_state,
    current_field_id: state.current_field_id,
    missing_fields: state.platform_field_order.filter((fieldId) =>
      state.platform_field_states[fieldId]?.status !== "locked"
    ),
  };
}

function attackInlineInfoContext(args: {
  state: ReturnType<typeof createInitialPrepareAttackCardLocalState>;
  userMessage: string;
  subskillContext: Record<string, unknown> | null;
  noteInformation?: NoteInformation | null;
}): InlineInfoToolContext {
  const context = args.subskillContext ?? {};
  const question = String(
    context.question_to_answer ?? context.question ?? args.userMessage,
  ).trim();
  return {
    active_flow: "prepare_attack_card",
    active_flow_status: "collecting",
    question_to_answer: question,
    active_flow_context: activeFlowContext(args.state),
    dispatcher_context: context,
    note_information: args.noteInformation ?? null,
  };
}

function appendAttackCardSubskillHistory(args: {
  state: ReturnType<typeof createInitialPrepareAttackCardLocalState> | null;
  skillId: "product_help" | "status_recap";
  userMessage: string;
  context: InlineInfoToolContext;
  reply: string;
}) {
  if (!args.state) return null;
  return {
    ...args.state,
    subskill_history: [
      ...(args.state.subskill_history ?? []),
      {
        skill_id: args.skillId,
        user_message: args.userMessage,
        question_to_answer: args.context.question_to_answer,
        active_flow_context: args.context.active_flow_context,
        reply_summary: args.reply.slice(0, 500),
        created_at: new Date().toISOString(),
      },
    ].slice(-RECENT_MESSAGE_LIMITS.subskillHistory),
  };
}

function buildAttackCardRuntimeHandoff(args: {
  state: ReturnType<typeof createInitialPrepareAttackCardLocalState> | null;
  draft: AttackCardHandoffDraft | null;
  activeHandoff: AttackCardHandoffState | null;
  status: AttackCardHandoffState["status"];
  missingFields: string[];
}) {
  if (!args.state) return null;
  return buildAttackCardHandoffState({
    draft: args.draft ?? args.activeHandoff?.draft ?? {
      operation_type: "prepare_attack_card",
      mode: "platform_handoff",
      executable_from_chat: false,
      target_summary: args.state.target_state.locked_value ??
        args.state.target_state.candidate_value ?? "",
      blocker_summary: args.state.blocker_state.locked_value ??
        args.state.blocker_state.candidate_value ?? "",
      recommendation: {
        technique_label: args.state.technique_state.technique_label ?? "",
        why_this_technique: args.state.technique_state.why_status ?? "",
        card_draft_summary: "",
        preserve: [],
        avoid: [],
        platform_destination: args.state.platform_destination,
        platform_steps: getHandoffTargetForOperation("prepare_attack_card")
          ?.platform_steps ?? [],
      },
      missing_decisions: args.missingFields,
    },
    target: {
      kind: args.state.target_state.kind ?? "personal_action",
      plan_item_id: args.state.target_state.plan_item_id,
      title: args.state.target_state.locked_value ??
        args.state.target_state.candidate_value,
    },
    localState: args.state,
    previous: args.activeHandoff,
    status: args.status,
  });
}

async function runPrepareAttackCardLocalRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  tempMemory: any;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  requestId?: string | null;
  history?: unknown;
  planSnapshot?: unknown;
  activeHandoff: AttackCardHandoffState | null;
  operationInput?: Record<string, unknown> | null;
  dispatcher?: PrepareAttackCardLocalDispatcher;
  visibleAgent?: PrepareAttackCardVisibleAgent;
}): Promise<OperationRuntimeResult | null> {
  const runtimeTrace: Array<Record<string, unknown>> = [];
  const previousLocalState = args.activeHandoff?.local_state ??
    createInitialPrepareAttackCardLocalState({
      activeState: args.activeHandoff,
      operationInput: args.operationInput,
    });
  const dbContextPack = buildPrepareAttackCardDbContextPack({
    planSnapshot: args.planSnapshot,
    operationInput: args.operationInput,
    activeHandoff: args.activeHandoff,
  });
  const microMemoryContext = buildPrepareAttackCardMicroMemoryContext({
    operationInput: args.operationInput,
  });
  const inboundNoteInformation = buildPrepareAttackCardInboundNote({
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    operationInput: args.operationInput,
    activeHandoff: args.activeHandoff,
  });
  runtimeTrace.push({
    component: "prepare_attack_card.local_flow",
    event: "db_context_pack_loaded",
    plan_items_count: Array.isArray((dbContextPack.plan as any)?.items)
      ? (dbContextPack.plan as any).items.length
      : 0,
    micro_memory_items_count: 0,
    selected_handler: args.routeDecision?.selected_handler ??
      "prepare_attack_card",
  });
  runtimeTrace.push({
    component: "prepare_attack_card.local_flow",
    event: "global_dispatcher_skipped",
    reason_code: "active_prepare_attack_card_uses_local_dispatcher",
    selected_handler: args.routeDecision?.selected_handler ??
      "prepare_attack_card",
  });
  if (inboundNoteInformation) {
    runtimeTrace.push({
      component: "prepare_attack_card.local_flow",
      event: "note_information_consumed",
      source_flow_id: inboundNoteInformation.source_flow_id,
      target_dispatcher: inboundNoteInformation.target_dispatcher,
      selected_handler: args.routeDecision?.selected_handler ??
        "prepare_attack_card",
    });
  }
  runtimeTrace.push(localRuntimeTraceBase({
    event: "local_dispatcher start",
    currentFieldId: previousLocalState.current_field_id,
    techniqueKey: previousLocalState.technique_state.technique_key,
    targetStatus: previousLocalState.target_state.status,
    blockerStatus: previousLocalState.blocker_state.status,
    missingFields: previousLocalState.platform_field_order.filter((fieldId) =>
      previousLocalState.platform_field_states[fieldId]?.status !== "locked"
    ),
    selectedHandler: args.routeDecision?.selected_handler ??
      "prepare_attack_card",
  }));
  const dispatcher = args.dispatcher ?? runPrepareAttackCardLocalDispatcher;
  const decision = await dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    active_state: args.activeHandoff,
    local_state: previousLocalState,
    route_decision: args.routeDecision,
    turn_frame: args.turnFrame,
    note_information_inbound: inboundNoteInformation,
    db_context_pack: dbContextPack,
    micro_memory_context: microMemoryContext,
    platform_context: {
      destination: previousLocalState.platform_destination,
      operation_type: "prepare_attack_card",
      surface_id: getHandoffTargetForOperation("prepare_attack_card")
        ?.surface_id ?? "attack_cards",
    },
    risk_context: {
      safety_risk_band: args.turnFrame?.safety?.risk_band ?? null,
      safety_reason_codes: args.turnFrame?.safety?.reason_codes ?? [],
    },
    available_inline_tools: ["product_help", "status_recap"],
    plan_snapshot: args.planSnapshot ?? null,
    last_handoff: args.activeHandoff?.draft ?? null,
  });
  if (!decision) {
    return {
      content:
        "Je garde la carte d'attaque en cours, mais je n'arrive pas a traiter ce tour dans le contrat local.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        operation_type: "prepare_attack_card",
        mode: "platform_handoff",
        executable_from_chat: false,
        status: "blocked",
        reason_code: "prepare_attack_card_local_dispatcher_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "local_dispatcher",
          reason_code: "prepare_attack_card_local_dispatcher_failed",
        }],
        runtime_trace: runtimeTrace,
      },
    };
  }
  runtimeTrace.push(localRuntimeTraceBase({
    event: "local_dispatcher decision",
    flowAction: decision.flow_action,
    visibleTask: decision.visible_task.kind,
    currentFieldId: decision.visible_task.conversation_context?.known_values
      ?.current_field?.field_id ?? null,
    techniqueKey: decision.technique_state.technique_key,
    targetStatus: decision.target_state.status,
    blockerStatus: decision.blocker_state.status,
    riskAssessment: decision.risk_assessment as any,
    selectedHandler: args.routeDecision?.selected_handler ??
      "prepare_attack_card",
  }));
  const reduced = reducePrepareAttackCardLocalDispatcherOutput({
    previous: previousLocalState,
    output: decision,
  });
  const missingFields = reduced.local_state?.platform_field_order.filter((
    fieldId,
  ) =>
    reduced.local_state?.platform_field_states[fieldId]?.status !== "locked"
  ) ??
    [];
  runtimeTrace.push(localRuntimeTraceBase({
    event: "reducer reduced",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    currentFieldId: reduced.local_state?.current_field_id ?? null,
    techniqueKey: reduced.local_state?.technique_state.technique_key ?? null,
    targetStatus: reduced.local_state?.target_state.status ?? null,
    blockerStatus: reduced.local_state?.blocker_state.status ?? null,
    missingFields,
    riskAssessment: reduced.risk_assessment as any,
    selectedHandler: "prepare_attack_card",
    stateMutationAudit: reduced.state_mutation_audit,
  }));

  if (
    reduced.exit_to_global_dispatcher ||
    reduced.handoff_to_local_flow ||
    reduced.reason_code === "prepare_attack_card_local_safety_preempt"
  ) {
    const targetDispatcher = reduced.note_information?.target_dispatcher ??
      reduced.target_dispatcher ?? "global";
    const exitMemo = {
      reason: targetDispatcher === "safety_crisis"
        ? "safety"
        : reduced.handoff_to_local_flow
        ? "bridge"
        : "topic_change",
      flow_summary: reduced.visible_task_context.state_summary,
      handoff_hint_for_global_dispatcher:
        decision.exit_memo?.handoff_hint_for_global_dispatcher ??
          reduced.note_information?.handoff_context_for_next_dispatcher ?? null,
      note_information: reduced.note_information,
      at: new Date().toISOString(),
    };
    const cleared = {
      ...clearPrepareAttackCardFrame(args.tempMemory),
      __last_prepare_attack_card_exit_memo: exitMemo,
    };
    runtimeTrace.push(localRuntimeTraceBase({
      event: targetDispatcher === "safety_crisis"
        ? "safety_preempt"
        : reduced.handoff_to_local_flow
        ? "handoff_to_local_flow"
        : "exit_to_global_dispatcher",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
      riskAssessment: reduced.risk_assessment as any,
      selectedHandler: "prepare_attack_card",
    }));
    return {
      content: "",
      nextTempMemory: cleared,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        operation_type: "prepare_attack_card",
        status: targetDispatcher === "safety_crisis"
          ? "blocked"
          : "topic_change",
        reason_code: targetDispatcher === "safety_crisis"
          ? "prepare_attack_card_local_safety_preempt"
          : reduced.handoff_to_local_flow
          ? "prepare_attack_card_handoff_to_local_flow"
          : "prepare_attack_card_local_exit_to_global_dispatcher",
        flow_action: decision.flow_action,
        visible_task: reduced.visible_task,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: targetDispatcher === "safety_crisis"
          ? [{ type: "prepare_attack_card", reason_code: "safety_preempt" }]
          : [],
        exit_memo: exitMemo,
        note_information: reduced.note_information,
        risk_assessment: reduced.risk_assessment,
        state_mutation_audit: reduced.state_mutation_audit,
        runtime_trace: runtimeTrace,
      },
    };
  }

  if (
    (reduced.get_info_product || reduced.get_info_db) && reduced.local_state
  ) {
    const toolContext = attackInlineInfoContext({
      state: reduced.local_state,
      userMessage: args.userMessage,
      subskillContext: reduced.subskill_context,
      noteInformation: reduced.note_information,
    });
    const info = reduced.get_info_product
      ? await runInlineGetInfoProductTool({
        userId: args.userId,
        userMessage: args.userMessage,
        history: args.history,
        turnFrame: args.turnFrame,
        context: toolContext,
        requestId: args.requestId ?? null,
      })
      : await runInlineGetInfoDbTool({
        supabase: args.supabase,
        userId: args.userId,
        userMessage: args.userMessage,
        userTimezone: args.userTimezone,
        history: args.history,
        turnFrame: args.turnFrame,
        routeDecision: args.routeDecision,
        tempMemory: args.tempMemory,
        requestId: args.requestId ?? null,
        objectTypes: ["attack_card"],
        context: toolContext,
      });
    const nextLocalState = appendAttackCardSubskillHistory({
      state: reduced.local_state,
      skillId: reduced.get_info_product ? "product_help" : "status_recap",
      userMessage: args.userMessage,
      context: toolContext,
      reply: info.content,
    });
    const nextHandoff = buildAttackCardRuntimeHandoff({
      state: nextLocalState,
      draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
      activeHandoff: args.activeHandoff,
      status: "collecting",
      missingFields,
    });
    const nextTempMemory = writePrepareAttackCardFrameToTempMemory(
      args.tempMemory,
      {
        pending: null,
        draftReview: null,
        active: null,
        recommendation: null,
        handoff: nextHandoff,
      },
    );
    runtimeTrace.push(...info.runtimeTrace);
    return {
      content: info.content ||
        "Je n'arrive pas a repondre a cette question maintenant, mais je garde la carte d'attaque en cours.",
      additionalContents: info.additionalContents,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        operation_type: "prepare_attack_card",
        mode: "platform_handoff",
        executable_from_chat: false,
        status: reduced.status,
        reason_code: reduced.reason_code,
        flow_action: decision.flow_action,
        visible_task: "none",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        handoff_state: nextHandoff,
        local_flow_state: nextLocalState,
        subskill_run: info.subskillRun,
        note_information: reduced.note_information,
        risk_assessment: reduced.risk_assessment,
        state_mutation_audit: reduced.state_mutation_audit,
        runtime_trace: runtimeTrace,
      },
    };
  }

  runtimeTrace.push(localRuntimeTraceBase({
    event: "visible_stage start",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    currentFieldId: reduced.local_state?.current_field_id ?? null,
    techniqueKey: reduced.local_state?.technique_state.technique_key ?? null,
    targetStatus: reduced.local_state?.target_state.status ?? null,
    blockerStatus: reduced.local_state?.blocker_state.status ?? null,
    missingFields,
    riskAssessment: reduced.risk_assessment as any,
    selectedHandler: "prepare_attack_card",
  }));
  const visibleAgent = args.visibleAgent ?? runPrepareAttackCardVisibleAgent;
  const visibleMessage = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: reduced.visible_task,
    visible_task: {
      kind: reduced.visible_task,
      conversation_context: reduced.visible_task_context,
    },
    trace_event: (event) => runtimeTrace.push(event),
  });
  runtimeTrace.push(localRuntimeTraceBase({
    event: visibleMessage ? "visible_stage complete" : "visible_stage retry",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    currentFieldId: reduced.local_state?.current_field_id ?? null,
    techniqueKey: reduced.local_state?.technique_state.technique_key ?? null,
    targetStatus: reduced.local_state?.target_state.status ?? null,
    blockerStatus: reduced.local_state?.blocker_state.status ?? null,
    missingFields,
    riskAssessment: reduced.risk_assessment as any,
    selectedHandler: "prepare_attack_card",
  }));
  if (!visibleMessage) {
    return {
      content:
        "Je garde la carte d'attaque en cours, mais je n'arrive pas a formuler correctement la reponse visible.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        operation_type: "prepare_attack_card",
        mode: "platform_handoff",
        executable_from_chat: false,
        status: "blocked",
        reason_code: "prepare_attack_card_visible_agent_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "visible_agent",
          reason_code: "prepare_attack_card_visible_agent_failed",
        }],
        risk_assessment: reduced.risk_assessment,
        state_mutation_audit: reduced.state_mutation_audit,
        runtime_trace: runtimeTrace,
      },
    };
  }
  if (reduced.status === "apply_attempt") {
    runtimeTrace.push(localRuntimeTraceBase({
      event: "apply_attempt no mutation",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
      currentFieldId: reduced.local_state?.current_field_id ?? null,
      techniqueKey: reduced.local_state?.technique_state.technique_key ?? null,
      targetStatus: reduced.local_state?.target_state.status ?? null,
      blockerStatus: reduced.local_state?.blocker_state.status ?? null,
      missingFields,
      riskAssessment: reduced.risk_assessment as any,
      selectedHandler: "prepare_attack_card",
    }));
  }
  if (reduced.draft) {
    runtimeTrace.push(localRuntimeTraceBase({
      event: "handoff_ready",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
      currentFieldId: reduced.local_state?.current_field_id ?? null,
      techniqueKey: reduced.local_state?.technique_state.technique_key ?? null,
      targetStatus: reduced.local_state?.target_state.status ?? null,
      blockerStatus: reduced.local_state?.blocker_state.status ?? null,
      missingFields,
      riskAssessment: reduced.risk_assessment as any,
      selectedHandler: "prepare_attack_card",
    }));
  }
  const nextHandoff = reduced.local_state
    ? buildAttackCardHandoffState({
      draft: reduced.draft ?? args.activeHandoff?.draft ?? {
        operation_type: "prepare_attack_card",
        mode: "platform_handoff",
        executable_from_chat: false,
        target_summary: reduced.local_state.target_state.locked_value ??
          reduced.local_state.target_state.candidate_value ?? "",
        blocker_summary: reduced.local_state.blocker_state.locked_value ??
          reduced.local_state.blocker_state.candidate_value ?? "",
        recommendation: {
          technique_label:
            reduced.local_state.technique_state.technique_label ?? "",
          why_this_technique: reduced.local_state.technique_state.why_status ??
            "",
          card_draft_summary: "",
          preserve: [],
          avoid: [],
          platform_destination: reduced.local_state.platform_destination,
          platform_steps: getHandoffTargetForOperation("prepare_attack_card")
            ?.platform_steps ?? [],
        },
        missing_decisions: missingFields,
      },
      target: {
        kind: reduced.local_state.target_state.kind ?? "personal_action",
        plan_item_id: reduced.local_state.target_state.plan_item_id,
        title: reduced.local_state.target_state.locked_value ??
          reduced.local_state.target_state.candidate_value,
      },
      localState: reduced.local_state,
      previous: args.activeHandoff,
      status: reduced.status === "apply_attempt"
        ? "apply_attempt"
        : reduced.status === "repeat_handoff"
        ? "repeat_handoff"
        : reduced.draft
        ? "handoff_delivered"
        : "collecting",
    })
    : null;
  const nextTempMemory = writePrepareAttackCardFrameToTempMemory(
    args.tempMemory,
    {
      pending: null,
      draftReview: null,
      active: null,
      recommendation: null,
      handoff: reduced.exit_to_global_dispatcher ? null : nextHandoff,
    },
  );
  const deliversPlatformHandoff = !reduced.exit_to_global_dispatcher &&
    (Boolean(reduced.draft) ||
      [
        "apply_attempt",
        "repeat_handoff",
        "handoff_delivered",
      ].includes(reduced.status) ||
      reduced.visible_task === "destination_short");
  return {
    content: visibleMessage,
    nextTempMemory,
    toolExecution: deliversPlatformHandoff ? "platform_handoff" : "blocked",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      operation_type: "prepare_attack_card",
      mode: "platform_handoff",
      executable_from_chat: false,
      status: reduced.status,
      reason_code: reduced.reason_code,
      flow_action: decision.flow_action,
      visible_task: reduced.visible_task,
      visible_task_context: reduced.visible_task_context,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      handoff_state: nextHandoff,
      risk_assessment: reduced.risk_assessment,
      state_mutation_audit: reduced.state_mutation_audit,
      runtime_trace: runtimeTrace,
      ...(deliversPlatformHandoff
        ? {
          platform_handoff: {
            operation_type: "prepare_attack_card",
            status: "delivered",
            surface_id: getHandoffTargetForOperation("prepare_attack_card")
              ?.surface_id ?? "attack_cards",
            reason_code: reduced.reason_code,
            executable_from_chat: false,
          },
        }
        : {}),
    },
  };
}

function operationInputFromLastPlanItemLocal(
  tempMemory: any,
): Record<string, unknown> | null {
  const raw = (tempMemory as any)?.__last_resolved_plan_item;
  const record = runtimeRecord(raw);
  const id = runtimeString(record.id);
  const title = runtimeString(record.title);
  if (!id || !title) return null;
  return {
    target: {
      kind: "plan_item",
      plan_item_id: id,
      title,
    },
    scope: {
      kind: "specific_plan_item",
      plan_item_id: id,
      title,
      current_summary: title,
    },
  };
}

function attackCardDispatcherOperationInput(
  turnFrame: TurnFrame | null,
  userMessage: string,
): Record<string, unknown> | null {
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "prepare_attack_card" &&
    candidate.confidence_band !== "low"
  );
  if (!intent) return null;
  return {
    ...(intent.operation_input ?? {}),
    ...(intent.payload_hint ?? {}),
    ...(intent.target_hint ? { target_label: intent.target_hint } : {}),
    user_message: userMessage,
    dispatcher_user_intent: intent.user_intent,
  };
}

function routeOrTurnFramePrefersDefenseCard(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
}): boolean {
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_defense_card"
  ) return true;
  return Boolean(
    args.turnFrame?.tool_skill_intents?.some((intent) =>
      intent.operation_type === "prepare_defense_card" &&
      intent.confidence_band !== "low"
    ),
  );
}

function operationRouteIsSelected(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  const frame = loadPrepareAttackCardFrameFromTempMemory(args.tempMemory);
  if (operationType(frame.pending) === "prepare_attack_card") return true;
  if (operationType(frame.draftReview) === "prepare_attack_card") return true;
  if (operationType(frame.active) === "prepare_attack_card") return true;
  if (operationType(frame.recommendation) === "prepare_attack_card") {
    return true;
  }
  if (isAttackCardHandoffState(frame.handoff)) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_attack_card"
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== "prepare_attack_card"
  ) return false;
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === "prepare_attack_card" &&
    intent.confidence_band !== "low"
  );
}

function legacyFrameOperationInput(
  frameValue: unknown,
): Record<string, unknown> | null {
  const frame = runtimeRecord(frameValue);
  if (operationType(frame) !== "prepare_attack_card") return null;
  const target = runtimeRecord(frame.target);
  const operationInput = runtimeRecord(frame.operation_input);
  const draft = runtimeRecord(frame.draft);
  const draftRoot = runtimeRecord(draft.draft);
  return {
    ...(Object.keys(operationInput).length ? operationInput : {}),
    ...(Object.keys(target).length ? { target } : {}),
    previous_draft: Object.keys(draft).length ? draft : null,
    intake_state: frame.intake_state ?? null,
    technique: draftRoot.technique ?? undefined,
    activation_keyword: draftRoot.activation_keyword ?? undefined,
  };
}

export async function maybeRunPrepareAttackCardOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyContextOutput: SafetySignalContext;
  sourceMessageId: string | null;
  requestId?: string | null;
  planSnapshot?: unknown;
  history?: unknown;
  runIntake?: unknown;
  runLocalDispatcher?: PrepareAttackCardLocalDispatcher;
  runVisibleAgent?: PrepareAttackCardVisibleAgent;
}): Promise<OperationRuntimeResult | null> {
  void args.runIntake;
  void args.sourceMessageId;
  void args.safetyContextOutput;
  const routeSelected = operationRouteIsSelected({
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  });
  if (!routeSelected) return null;
  if (
    routeOrTurnFramePrefersDefenseCard({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
    })
  ) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadPrepareAttackCardFrameFromTempMemory(nextTempMemory);
  const activeHandoff = isAttackCardHandoffState(frame.handoff)
    ? frame.handoff
    : null;
  const activeFrame = runtimeRecord(frame.active);
  const recommendationFrame = runtimeRecord(frame.recommendation);
  const operationInput = attackCardDispatcherOperationInput(
    args.turnFrame,
    args.userMessage,
  ) ?? operationInputFromLastPlanItemLocal(nextTempMemory) ??
    legacyFrameOperationInput(frame.pending) ??
    legacyFrameOperationInput(frame.draftReview) ??
    (operationType(activeFrame) === "prepare_attack_card"
      ? runtimeRecord(activeFrame.operation_input)
      : null) ??
    (operationType(recommendationFrame) === "prepare_attack_card"
      ? runtimeRecord(recommendationFrame.operation_input)
      : null);

  return await runPrepareAttackCardLocalRuntime({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: args.userMessage,
    userTimezone: args.userTimezone,
    tempMemory: nextTempMemory,
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    requestId: args.requestId ?? null,
    history: args.history,
    planSnapshot: args.planSnapshot ?? null,
    activeHandoff,
    operationInput,
    dispatcher: args.runLocalDispatcher,
    visibleAgent: args.runVisibleAgent,
  });
}
