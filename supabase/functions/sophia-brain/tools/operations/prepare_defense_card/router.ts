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
import {
  type DefenseCardHandoffDraft,
  type DefenseCardHandoffState,
  isDefenseCardHandoffState,
} from "./contract.ts";
import {
  createInitialPrepareDefenseCardLocalState,
  type PrepareDefenseCardLocalDispatcher,
  type PrepareDefenseCardLocalState,
  reducePrepareDefenseCardLocalDispatcherOutput,
  runPrepareDefenseCardLocalDispatcher,
} from "./local_flow.ts";
import {
  type PrepareDefenseCardVisibleAgent,
  runPrepareDefenseCardVisibleAgent,
} from "./visible_agent.ts";
import {
  type InlineInfoToolContext,
  runInlineGetInfoDbTool,
  runInlineGetInfoProductTool,
} from "../inline_info_tools.ts";

type OperationRuntimeResult = {
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

export function isPendingDefenseCardRecommendationOperation(
  value: unknown,
): value is {
  operation_type: "prepare_defense_card";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_defense_card" &&
      (record.surface_id === "defense_card" ||
        record.surface_id === "defense_cards"),
  );
}

function operationRouteIsSelected(args: {
  operationType: "prepare_defense_card";
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === args.operationType
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== args.operationType
  ) return false;

  const activeIntake = (args.tempMemory as any)?.__active_tool_skill_intake ??
    (args.tempMemory as any)?.active_tool_skill_intake ??
    null;
  const activeOperationType = String(
    (activeIntake as any)?.operation_type ?? "",
  );
  if (activeOperationType && activeOperationType !== args.operationType) {
    return false;
  }
  if (activeOperationType === args.operationType) return true;

  const pendingRecommendation = (args.tempMemory as any)
    ?.__pending_recommendation_operation;
  if (isPendingDefenseCardRecommendationOperation(pendingRecommendation)) {
    return true;
  }
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === args.operationType &&
    intent.confidence_band !== "low"
  );
}

function operationInputFromLastPlanItem(
  tempMemory: any,
): Record<string, unknown> | null {
  const item = (tempMemory as any)?.__last_resolved_plan_item;
  if (!item || typeof item !== "object") return null;
  const id = String((item as any).id ?? "").trim();
  const title = String((item as any).title ?? "").trim();
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

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function hasAttachmentSeed(value?: Record<string, unknown> | null): boolean {
  if (!value) return false;
  return Boolean(recordValue(value.attachment) || recordValue(value.target));
}

function selectedDefenseCardIntent(
  turnFrame: TurnFrame | null,
): NonNullable<TurnFrame["tool_skill_intents"]>[number] | null {
  const intents = (turnFrame?.tool_skill_intents ?? []).filter((intent) =>
    intent.operation_type === "prepare_defense_card" &&
    intent.confidence_band !== "low"
  );
  return intents.find((intent) => intent.explicitness === "explicit") ??
    intents[0] ?? null;
}

function operationInputFromTurnFrameIntent(
  turnFrame: TurnFrame | null,
  base?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const intent = selectedDefenseCardIntent(turnFrame);
  if (!intent) return null;
  const operationInput = recordValue(intent.operation_input) ?? {};
  const payloadHint = recordValue(intent.payload_hint) ?? {};
  const targetHint = textValue(intent.target_hint) ??
    textValue(operationInput.target_hint) ??
    textValue(payloadHint.target_hint);
  const riskBehavior = textValue(operationInput.risk_behavior) ??
    textValue(operationInput.risk_summary) ??
    textValue(payloadHint.risk_behavior) ??
    textValue(payloadHint.risk_summary);
  const triggerHint = textValue(operationInput.trigger) ??
    textValue(operationInput.trigger_hint) ??
    textValue(payloadHint.trigger) ??
    textValue(payloadHint.trigger_hint);
  const next: Record<string, unknown> = {
    ...operationInput,
    dispatcher_intent: {
      operation_type: intent.operation_type,
      explicitness: intent.explicitness,
      confidence_band: intent.confidence_band,
      ambiguity: intent.ambiguity,
      user_intent: intent.user_intent,
      target_hint: targetHint,
      risk_behavior: riskBehavior,
    },
  };
  if (targetHint && !textValue(next.target_hint)) {
    next.target_hint = targetHint;
  }
  if (triggerHint && !textValue(next.trigger_hint)) {
    next.trigger_hint = triggerHint;
  }
  if (!hasAttachmentSeed(next) && !hasAttachmentSeed(base)) {
    const title = targetHint ?? riskBehavior;
    if (title) {
      next.attachment = {
        kind: "free_risk_context",
        plan_item_id: null,
        title,
      };
    }
  }
  if (!recordValue(next.risk_situation)) {
    const label = riskBehavior ?? targetHint;
    if (label) {
      next.risk_situation = {
        label,
        description: targetHint && riskBehavior && targetHint !== riskBehavior
          ? targetHint
          : riskBehavior,
        timing_hint: triggerHint,
        context_hint: targetHint,
      };
    }
  }
  return Object.keys(next).length > 1 ? next : null;
}

function mergeOperationInputSeeds(
  base: Record<string, unknown> | null,
  incoming: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!base) return incoming;
  if (!incoming) return base;
  return { ...base, ...incoming };
}

function defenseCardFrameRecord(tempMemory: any) {
  const memory = tempMemory ?? {};
  return {
    active: isDefenseCardHandoffState(memory.__active_defense_card_handoff)
      ? memory.__active_defense_card_handoff
      : memory.__active_tool_skill_intake ??
        memory.active_tool_skill_intake ?? null,
    recommendation: memory.__pending_recommendation_operation ?? null,
  };
}

export function loadDefenseCardFrameFromTempMemory(tempMemory: any) {
  return defenseCardFrameRecord(tempMemory);
}

export function writeDefenseCardFrameToTempMemory(
  tempMemory: any,
  frame: {
    active?: Record<string, unknown> | null;
    recommendation?: Record<string, unknown> | null;
  },
) {
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  if ("active" in frame) {
    if (frame.active) {
      next.__active_tool_skill_intake = frame.active;
      if (isDefenseCardHandoffState(frame.active)) {
        next.__active_defense_card_handoff = frame.active;
      }
    } else {
      delete next.__active_tool_skill_intake;
      delete next.__active_defense_card_handoff;
    }
    delete next.active_tool_skill_intake;
  }
  if ("recommendation" in frame) {
    if (frame.recommendation) {
      next.__pending_recommendation_operation = frame.recommendation;
    } else {
      delete next.__pending_recommendation_operation;
    }
  }
  return next;
}

export function clearDefenseCardFrame(tempMemory: any) {
  return writeDefenseCardFrameToTempMemory(tempMemory, {
    active: null,
    recommendation: null,
  });
}

function recentMessagesFromHistory(history: unknown) {
  return recentChatMessagesFromHistory(history, RECENT_MESSAGE_LIMITS.toolFlow);
}

function defenseCardLocalRuntimeTraceBase(args: {
  event: string;
  flowAction?: string | null;
  visibleTask?: string | null;
  toolFit?: string | null;
  supportNeedStatus?: string | null;
  supportNeedReady?: boolean;
  slotsModified?: string[];
  exitToGlobalDispatcher?: boolean;
  aiCallCount?: number;
  riskAssessment?: Record<string, unknown> | null;
}) {
  return {
    component: "prepare_defense_card.local_flow",
    event: args.event,
    flow_action: args.flowAction ?? null,
    visible_task_kind: args.visibleTask ?? null,
    tool_fit: args.toolFit ?? null,
    support_need_status: args.supportNeedStatus ?? null,
    handoff_ready: args.supportNeedReady ?? false,
    slots_modified: args.slotsModified ?? [],
    exit_to_global_dispatcher: args.exitToGlobalDispatcher ?? false,
    ai_call_count: args.aiCallCount ?? null,
    risk_assessment: args.riskAssessment ?? null,
    selected_handler: "prepare_defense_card",
  };
}

function changedDefenseSlots(
  previous: PrepareDefenseCardLocalState | null,
  next: PrepareDefenseCardLocalState | null,
): string[] {
  if (!next) return [];
  if (!previous) {
    return [
      "tool_fit",
      "attachment",
      "risk_situation",
      "trigger",
      "defense_goal",
      "defense_response_hint",
      "support_need",
    ].filter((slot) => {
      const state = slot === "tool_fit"
        ? next.tool_fit_state.status
        : slot === "attachment"
        ? next.attachment_state.status
        : slot === "risk_situation"
        ? next.risk_state.status
        : slot === "trigger"
        ? next.trigger_state.status
        : slot === "defense_goal"
        ? next.defense_goal_state.status
        : slot === "defense_response_hint"
        ? next.defense_response_hint_state.status
        : next.support_need_state.status;
      return state !== "missing" && state !== "ambiguous";
    });
  }
  const changed: string[] = [];
  if (
    JSON.stringify(previous.tool_fit_state) !==
      JSON.stringify(next.tool_fit_state)
  ) changed.push("tool_fit");
  if (
    JSON.stringify(previous.attachment_state) !==
      JSON.stringify(next.attachment_state)
  ) changed.push("attachment");
  if (JSON.stringify(previous.risk_state) !== JSON.stringify(next.risk_state)) {
    changed.push("risk_situation");
  }
  if (
    JSON.stringify(previous.trigger_state) !==
      JSON.stringify(next.trigger_state)
  ) changed.push("trigger");
  if (
    JSON.stringify(previous.defense_goal_state) !==
      JSON.stringify(next.defense_goal_state)
  ) changed.push("defense_goal");
  if (
    JSON.stringify(previous.defense_response_hint_state) !==
      JSON.stringify(next.defense_response_hint_state)
  ) changed.push("defense_response_hint");
  if (
    JSON.stringify(previous.support_need_state) !==
      JSON.stringify(next.support_need_state)
  ) changed.push("support_need");
  return changed;
}

function defenseInlineInfoContext(args: {
  state: PrepareDefenseCardLocalState;
  userMessage: string;
  subskillContext: Record<string, unknown> | null;
}): InlineInfoToolContext {
  const context = args.subskillContext ?? {};
  const question = String(
    context.question_to_answer ?? context.question ?? args.userMessage,
  ).trim();
  return {
    active_flow: "prepare_defense_card",
    active_flow_status: "collecting",
    question_to_answer: question,
    active_flow_context: {
      route_kind: args.state.route_kind,
      platform_destination: args.state.platform_destination,
      tool_fit_state: args.state.tool_fit_state,
      attachment_state: args.state.attachment_state,
      risk_state: args.state.risk_state,
      trigger_state: args.state.trigger_state,
      defense_goal_state: args.state.defense_goal_state,
      defense_response_hint_state: args.state.defense_response_hint_state,
      support_need_state: args.state.support_need_state,
    },
    dispatcher_context: context,
  };
}

function appendDefenseCardSubskillHistory(args: {
  state: PrepareDefenseCardLocalState | null;
  skillId: "product_help" | "status_recap";
  userMessage: string;
  context: InlineInfoToolContext;
  reply: string;
}): PrepareDefenseCardLocalState | null {
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

function writeDefenseCardLocalHandoffState(args: {
  tempMemory: any;
  status: DefenseCardHandoffState["status"];
  draft: DefenseCardHandoffDraft | null;
  localState: PrepareDefenseCardLocalState;
  previous?: Record<string, unknown> | null;
}) {
  const now = new Date().toISOString();
  const previous = args.previous ?? null;
  const handoffState: DefenseCardHandoffState = {
    operation_type: "prepare_defense_card",
    skill_id: "prepare_defense_card",
    mode: "platform_handoff",
    status: args.status,
    draft: args.draft,
    local_state: args.localState,
    turn_count: Number(previous?.turn_count ?? 0) + 1,
    max_turns: Number(previous?.max_turns ?? 8),
    created_at: String(previous?.created_at ?? now),
    updated_at: now,
    no_chat_mutation: true,
    operation_input: recordValue(previous?.operation_input) ?? null,
  };
  return writeDefenseCardFrameToTempMemory(args.tempMemory, {
    active: handoffState,
  });
}

function buildPrepareDefenseCardInboundNote(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  operationInput?: Record<string, unknown> | null;
  activeHandoff: DefenseCardHandoffState | null;
}): NoteInformation | null {
  if (args.activeHandoff) return null;
  if (
    args.routeDecision?.response_owner !== "tool_skill" ||
    args.routeDecision.selected_handler !== "prepare_defense_card"
  ) return null;
  if (args.turnFrame?.note_information) {
    return normalizeNoteInformation(args.turnFrame.note_information, {
      source_flow_id: "global",
      handoff_reason: "explicit_user_request",
      target_dispatcher: "prepare_defense_card",
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
          .trim() || "prepare_defense_card selected by prior dispatcher.",
        unresolved_questions: [],
        recommended_next_focus: "prepare_defense_card",
      },
    });
  }
  return createNoteInformation({
    source_flow_id: "global",
    handoff_reason: "explicit_user_request",
    target_dispatcher: "prepare_defense_card",
    handoff_context_for_next_dispatcher: JSON.stringify({
      route_reason: args.routeDecision.reason_code ?? null,
      operation_input: args.operationInput ?? null,
      selected_handler: args.routeDecision.selected_handler,
    }),
    user_words: [],
    structured_context: {
      source_flow: "global",
      active_flow_summary:
        "Global dispatcher selected the initial local flow owner for this turn.",
      route_reason: args.routeDecision.reason_code ?? null,
      operation_input: args.operationInput ?? null,
      selected_handler: args.routeDecision.selected_handler,
      first_local_activation: true,
      unresolved_questions: [],
      recommended_next_focus: "prepare_defense_card",
    },
  });
}

async function runPrepareDefenseCardLocalRuntime(args: {
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
  activeHandoff: DefenseCardHandoffState | null;
  operationInput?: Record<string, unknown> | null;
  dispatcher?: PrepareDefenseCardLocalDispatcher;
  visibleAgent?: PrepareDefenseCardVisibleAgent;
}): Promise<OperationRuntimeResult> {
  const runtimeTrace: Array<Record<string, unknown>> = [];
  let aiCallCount = 0;
  const previousLocalState = (args.activeHandoff as any)?.local_state ??
    createInitialPrepareDefenseCardLocalState({
      activeState: args.activeHandoff,
      operationInput: args.operationInput,
    });
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "active flow entry",
    toolFit: previousLocalState.tool_fit_state.status,
    supportNeedStatus: previousLocalState.support_need_state.status,
    supportNeedReady: previousLocalState.support_need_state.status === "locked",
    aiCallCount,
  }));
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "local_dispatcher called",
    toolFit: previousLocalState.tool_fit_state.status,
    supportNeedStatus: previousLocalState.support_need_state.status,
    aiCallCount,
  }));
  const inboundNoteInformation = buildPrepareDefenseCardInboundNote({
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    operationInput: args.operationInput,
    activeHandoff: args.activeHandoff,
  });
  if (inboundNoteInformation) {
    runtimeTrace.push({
      component: "prepare_defense_card.local_flow",
      event: "note_information_consumed",
      note_information: inboundNoteInformation,
      source_flow_id: inboundNoteInformation.source_flow_id,
      target_dispatcher: inboundNoteInformation.target_dispatcher,
      selected_handler: args.routeDecision?.selected_handler ??
        "prepare_defense_card",
    });
  }
  const dispatcher = args.dispatcher ?? runPrepareDefenseCardLocalDispatcher;
  aiCallCount += 1;
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
    plan_snapshot: args.planSnapshot ?? null,
    last_handoff: args.activeHandoff?.draft ?? null,
  });
  if (!decision) {
    runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
      event: "local_dispatcher failed",
      aiCallCount,
    }));
    return {
      content: "",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        status: "blocked",
        reason_code: "prepare_defense_card_local_dispatcher_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "local_dispatcher",
          reason_code: "prepare_defense_card_local_dispatcher_failed",
        }],
        pending_confirmation: null,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "local_dispatcher decision",
    flowAction: decision.flow_action,
    visibleTask: decision.visible_task.kind,
    toolFit: decision.tool_fit_state.status,
    supportNeedStatus: decision.support_need_state.status,
    supportNeedReady: decision.support_need_state.status === "locked",
    slotsModified: Object.keys(decision.slot_updates ?? {}),
    exitToGlobalDispatcher:
      decision.flow_action === "exit_to_global_dispatcher",
    aiCallCount,
    riskAssessment: decision.risk_assessment as any,
  }));
  const reduced = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: previousLocalState,
    output: decision,
  });
  const slotsModified = changedDefenseSlots(
    previousLocalState,
    reduced.local_state,
  );
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "reducer reduced",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    toolFit: reduced.local_state?.tool_fit_state.status ?? null,
    supportNeedStatus: reduced.local_state?.support_need_state.status ?? null,
    supportNeedReady: Boolean(reduced.draft),
    slotsModified,
    exitToGlobalDispatcher: reduced.exit_to_global_dispatcher,
    aiCallCount,
    riskAssessment: reduced.risk_assessment as any,
  }));
  if (reduced.exit_to_global_dispatcher) {
    const exitReason = decision.exit_memo?.reason &&
        decision.exit_memo.reason !== "none"
      ? decision.exit_memo.reason
      : "topic_change";
    const exitMemo = {
      reason: exitReason,
      flow_summary: decision.exit_memo?.flow_summary ?? null,
      handoff_hint_for_global_dispatcher:
        decision.exit_memo?.handoff_hint_for_global_dispatcher ?? null,
      note_information: reduced.note_information,
      at: new Date().toISOString(),
    };
    const cleared = {
      ...clearDefenseCardFrame(args.tempMemory),
      __last_prepare_defense_card_exit_memo: exitMemo,
    };
    runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
      event: "exit_to_global_dispatcher",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
      exitToGlobalDispatcher: true,
      aiCallCount,
      riskAssessment: reduced.risk_assessment as any,
    }));
    return {
      content: "",
      nextTempMemory: cleared,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        status: "topic_change",
        reason_code: "prepare_defense_card_local_exit_to_global_dispatcher",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        pending_confirmation: null,
        exit_memo: exitMemo,
        note_information: reduced.note_information,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  if (reduced.safety_preempt) {
    const exitMemo = {
      reason: "safety",
      flow_summary: decision.exit_memo?.flow_summary ??
        reduced.visible_task_context.state_summary,
      handoff_hint_for_global_dispatcher:
        decision.exit_memo?.handoff_hint_for_global_dispatcher ?? null,
      note_information: reduced.note_information,
      at: new Date().toISOString(),
    };
    const cleared = {
      ...clearDefenseCardFrame(args.tempMemory),
      __last_prepare_defense_card_exit_memo: exitMemo,
    };
    runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
      event: "safety_preempt",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
      exitToGlobalDispatcher: false,
      aiCallCount,
      riskAssessment: reduced.risk_assessment as any,
    }));
    return {
      content: "",
      nextTempMemory: cleared,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        status: reduced.status,
        reason_code: reduced.reason_code,
        flow_action: decision.flow_action,
        visible_task_kind: reduced.visible_task,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: reduced.blocked_effects,
        pending_confirmation: null,
        exit_memo: exitMemo,
        note_information: reduced.note_information,
        target_dispatcher: reduced.target_dispatcher,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  if (
    (reduced.get_info_product || reduced.get_info_db) && reduced.local_state
  ) {
    const toolContext = defenseInlineInfoContext({
      state: reduced.local_state,
      userMessage: args.userMessage,
      subskillContext: reduced.subskill_context,
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
        objectTypes: ["defense_card"],
        context: toolContext,
      });
    const nextLocalState = appendDefenseCardSubskillHistory({
      state: reduced.local_state,
      skillId: reduced.get_info_product ? "product_help" : "status_recap",
      userMessage: args.userMessage,
      context: toolContext,
      reply: info.content,
    });
    const nextTempMemory = nextLocalState
      ? writeDefenseCardLocalHandoffState({
        tempMemory: args.tempMemory,
        status: "collecting",
        draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
        localState: nextLocalState,
        previous: args.activeHandoff as any,
      })
      : args.tempMemory;
    runtimeTrace.push(...info.runtimeTrace);
    return {
      content: info.content ||
        "Je n'arrive pas à répondre à cette question maintenant, mais je garde la carte de défense en cours.",
      additionalContents: info.additionalContents,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        status: reduced.status,
        reason_code: reduced.reason_code,
        flow_action: decision.flow_action,
        visible_task_kind: "none",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        pending_confirmation: null,
        local_flow_state: nextLocalState,
        subskill_run: info.subskillRun,
        risk_assessment: reduced.risk_assessment,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "visible_prompt called",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    toolFit: reduced.local_state?.tool_fit_state.status ?? null,
    supportNeedStatus: reduced.local_state?.support_need_state.status ?? null,
    supportNeedReady: Boolean(reduced.draft),
    slotsModified,
    aiCallCount,
    riskAssessment: reduced.risk_assessment as any,
  }));
  const visibleAgent = args.visibleAgent ?? runPrepareDefenseCardVisibleAgent;
  aiCallCount += 1;
  const visibleMessage = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: reduced.visible_task,
    conversation_context: reduced.visible_task_context,
    trace_event: (event) => runtimeTrace.push(event),
  });
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: visibleMessage ? "visible_prompt complete" : "visible_prompt failed",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    toolFit: reduced.local_state?.tool_fit_state.status ?? null,
    supportNeedStatus: reduced.local_state?.support_need_state.status ?? null,
    supportNeedReady: Boolean(reduced.draft),
    slotsModified,
    aiCallCount,
    riskAssessment: reduced.risk_assessment as any,
  }));
  if (!visibleMessage) {
    return {
      content: "",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        status: "blocked",
        reason_code: "prepare_defense_card_visible_agent_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "visible_agent",
          reason_code: "prepare_defense_card_visible_agent_failed",
        }],
        pending_confirmation: null,
        risk_assessment: reduced.risk_assessment,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  const nextHandoff = reduced.local_state
    ? {
      skill_id: "prepare_defense_card" as const,
      mode: "platform_handoff" as const,
      status: reduced.status === "apply_attempt"
        ? "apply_attempt" as const
        : reduced.status === "repeat_handoff"
        ? "repeat_handoff" as const
        : reduced.status === "cancelled"
        ? "cancelled" as const
        : reduced.draft
        ? "handoff_delivered" as const
        : "collecting" as const,
      draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
      local_state: reduced.local_state,
      turn_count: Number((args.activeHandoff as any)?.turn_count ?? 0) + 1,
      max_turns: Number((args.activeHandoff as any)?.max_turns ?? 8),
      created_at: String(
        (args.activeHandoff as any)?.created_at ?? new Date().toISOString(),
      ),
      updated_at: new Date().toISOString(),
      no_chat_mutation: true as const,
    }
    : null;
  const nextTempMemory = nextHandoff && reduced.local_state
    ? writeDefenseCardLocalHandoffState({
      tempMemory: args.tempMemory,
      status: nextHandoff.status,
      draft: nextHandoff.draft,
      localState: reduced.local_state,
      previous: args.activeHandoff as any,
    })
    : clearDefenseCardFrame(args.tempMemory);
  const deliversPlatformHandoff = Boolean(reduced.draft) ||
    [
      "apply_attempt",
      "repeat_handoff",
      "handoff_delivered",
      "cancelled",
    ].includes(reduced.status) ||
    reduced.visible_task === "destination_short";
  return {
    content: visibleMessage,
    nextTempMemory,
    toolExecution: deliversPlatformHandoff ? "platform_handoff" : "blocked",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_defense_card",
      operation_type: "prepare_defense_card",
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      status: reduced.status,
      reason_code: reduced.reason_code,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      pending_confirmation: null,
      handoff_state: nextHandoff,
      risk_assessment: reduced.risk_assessment,
      runtime_trace: runtimeTrace,
      ai_call_count: aiCallCount,
      ...(deliversPlatformHandoff
        ? {
          platform_handoff: {
            operation_type: "prepare_defense_card",
            status: reduced.status === "cancelled" ? "cancelled" : "delivered",
            surface_id: "defense_cards",
            reason_code: reduced.reason_code,
            no_chat_mutation: true,
            draft: reduced.draft,
          },
        }
        : {}),
    },
  };
}

export async function maybeRunPrepareDefenseCardOperation(args: {
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
  runLocalDispatcher?: PrepareDefenseCardLocalDispatcher;
  runVisibleAgent?: PrepareDefenseCardVisibleAgent;
}): Promise<OperationRuntimeResult | null> {
  const defenseCardRouteSelected = operationRouteIsSelected({
    operationType: "prepare_defense_card",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  });
  if (!defenseCardRouteSelected) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadDefenseCardFrameFromTempMemory(nextTempMemory);
  const pendingRecommendation = frame.recommendation;
  const explicitDefenseCardRoute =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_defense_card";
  const activeDefenseIntakeRaw = frame.active;
  const hasDefenseCardFlow =
    isPendingDefenseCardRecommendationOperation(pendingRecommendation) ||
    String((activeDefenseIntakeRaw as any)?.operation_type ?? "") ===
      "prepare_defense_card";
  const hasTurnFrameDefenseIntent = Boolean(
    selectedDefenseCardIntent(args.turnFrame),
  );
  if (
    !explicitDefenseCardRoute &&
    !hasDefenseCardFlow &&
    !hasTurnFrameDefenseIntent &&
    args.routeDecision?.response_owner !== "tool_skill"
  ) {
    return null;
  }
  const lastPlanOperationInput = operationInputFromLastPlanItem(nextTempMemory);
  const fallbackOperationInput = mergeOperationInputSeeds(
    lastPlanOperationInput,
    operationInputFromTurnFrameIntent(args.turnFrame, lastPlanOperationInput),
  );

  return await runPrepareDefenseCardLocalRuntime({
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
    activeHandoff: activeDefenseIntakeRaw &&
        String((activeDefenseIntakeRaw as any)?.operation_type ?? "") ===
          "prepare_defense_card"
      ? activeDefenseIntakeRaw as DefenseCardHandoffState
      : null,
    operationInput: fallbackOperationInput,
    dispatcher: args.runLocalDispatcher,
    visibleAgent: args.runVisibleAgent,
  });
}
