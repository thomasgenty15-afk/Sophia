/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { OperationRuntimeResult } from "../../router/effect_ledger_adapter.ts";
import { clearToolSkillFlowForDirectReminder } from "../../router/active_flow_state.ts";
import { withDirectEffectLocalContext } from "../../router/direct_effect_local_context.ts";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import {
  RECENT_MESSAGE_LIMITS,
  trimRecentChatMessages,
} from "../../context/recent_messages_policy.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  createNoteInformation,
  type NoteInformation,
} from "../../contracts/note_information.v1.ts";
import { SUPPORTED_COACH_PREFERENCE_KEYS } from "../../tools/operations/update_coach_preferences/status.ts";
import { loadStatusRecapProjection } from "./projection.ts";
import type {
  StatusRecapLocalDispatcher,
  StatusRecapReducerResult,
} from "./local_flow.ts";
import {
  buildStatusRecapDbContextPack,
  hasActiveStatusRecapFlow,
  readStatusRecapFlowState,
  reduceStatusRecapLocalDispatcherOutput,
  runStatusRecapLocalDispatcher,
  STATUS_RECAP_EXIT_MEMO_KEY,
  statusRecapProjectionSummary,
  writeStatusRecapFlowState,
} from "./local_flow.ts";
import type { StatusRecapVisibleAgent } from "./visible_agent.ts";
import { runStatusRecapVisibleAgent } from "./visible_agent.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function operationType(value: unknown): string {
  return isRecord(value) ? String(value.operation_type ?? "").trim() : "";
}

function hasActiveCardDraft(activeOperationIntake: unknown): boolean {
  const type = operationType(activeOperationIntake);
  return type === "prepare_attack_card" || type === "prepare_defense_card";
}

function routeIsSafety(routeDecision: RouteDecision | null): boolean {
  return routeDecision?.response_owner === "safety" ||
    routeDecision?.selected_handler === "safety_crisis";
}

function routeIsProductHelp(routeDecision: RouteDecision | null): boolean {
  return routeDecision?.response_owner === "product_help" ||
    routeDecision?.selected_handler === "product_help";
}

const EXPLICIT_TOOL_COMMAND_HANDLERS = new Set([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "update_coach_preferences",
  "create_one_shot_reminder",
  "cancel_one_shot_reminder",
  "create_recurring_reminder",
  "track_progress_plan_item",
]);

function routeIsExplicitToolCommand(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  activeOperationIntake: unknown;
}): boolean {
  if (operationType(args.activeOperationIntake)) return true;
  if (args.routeDecision?.response_owner === "tool_skill") return true;
  if (
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== "status_recap" &&
    args.routeDecision.selected_handler !== "product_help"
  ) {
    return EXPLICIT_TOOL_COMMAND_HANDLERS.has(
      args.routeDecision.selected_handler,
    );
  }
  return Boolean(args.turnFrame?.tool_skill_intents?.length);
}

function statusRecapRouteSignal(routeDecision: RouteDecision | null): boolean {
  if (!routeDecision) return false;
  if (routeDecision.selected_handler === "status_recap") {
    return true;
  }
  return false;
}

function recentMessagesFromHistory(
  history: unknown,
): Array<{ role: "user" | "assistant"; content: string }> {
  return trimRecentChatMessages(history, RECENT_MESSAGE_LIMITS.toolFlow);
}

function exitMemoForTempMemory(args: {
  reduced: StatusRecapReducerResult;
  decision: NonNullable<
    Awaited<ReturnType<StatusRecapLocalDispatcher>>
  >;
  userMessage: string;
  noteInformationInbound: NoteInformation | null;
}) {
  const targetDispatcher = args.decision.flow_action === "safety_preempt"
    ? "safety_crisis"
    : args.decision.flow_action === "handoff_to_local_flow"
    ? "other_local"
    : "global";
  const noteInformation = args.decision.note_information ??
    createNoteInformation({
      source_flow_id: "status_recap",
      handoff_reason: targetDispatcher === "safety_crisis"
        ? "safety"
        : args.decision.exit_memo.reason === "product_help" ||
            args.decision.exit_memo.reason === "explicit_tool_request" ||
            args.decision.exit_memo.reason === "preference_update"
        ? "explicit_user_request"
        : "topic_change",
      target_dispatcher: targetDispatcher,
      handoff_context_for_next_dispatcher: JSON.stringify({
        source_flow: "status_recap",
        target_dispatcher: targetDispatcher,
        handoff_reason: args.decision.exit_memo.reason,
        user_message_summary: args.decision.exit_memo.user_intent_summary ??
          args.userMessage,
        active_flow_summary: args.decision.status_intent.summary,
        collected_state: args.decision.exit_memo.local_flow_context,
        unresolved_questions: [],
        confidence: args.decision.confidence,
        evidence: args.decision.evidence,
        recommended_next_focus:
          args.decision.exit_memo.handoff_hint_for_global_dispatcher.why ??
            args.decision.exit_memo.user_intent_summary ??
            "Reprocess the current user message outside status_recap.",
        note_information_inbound: args.noteInformationInbound,
      }),
      user_words: [args.userMessage],
      structured_context: {
        source_flow: "status_recap",
        target_dispatcher: targetDispatcher,
        handoff_reason: args.decision.exit_memo.reason,
        user_message_summary: args.decision.exit_memo.user_intent_summary ??
          args.userMessage,
        active_flow_summary: args.decision.status_intent.summary,
        collected_state: args.decision.exit_memo.local_flow_context,
        unresolved_questions: [],
        confidence: args.decision.confidence,
        evidence: args.decision.evidence,
        recommended_next_focus:
          args.decision.exit_memo.handoff_hint_for_global_dispatcher.why ??
            args.decision.exit_memo.user_intent_summary ??
            "Reprocess the current user message outside status_recap.",
      },
      confidence: args.decision.confidence,
    });
  return {
    ...args.decision.exit_memo,
    note_information: noteInformation,
    at: new Date().toISOString(),
    reducer_reason_code: args.reduced.reason_code,
  };
}

export async function maybeRunStatusRecapRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  activeOperationIntake: unknown;
  planItemSnapshot?: unknown;
  history?: unknown;
  requestId?: string | null;
  runLocalDispatcher?: StatusRecapLocalDispatcher;
  runVisibleAgent?: StatusRecapVisibleAgent;
}): Promise<OperationRuntimeResult | null> {
  const activeStatusFlow = hasActiveStatusRecapFlow(args.tempMemory);
  if (routeIsSafety(args.routeDecision)) return null;
  if (hasActiveCardDraft(args.activeOperationIntake)) return null;
  if (!activeStatusFlow && routeIsProductHelp(args.routeDecision)) return null;
  if (
    !activeStatusFlow &&
    routeIsExplicitToolCommand({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      activeOperationIntake: args.activeOperationIntake,
    })
  ) return null;

  const shouldActivate = activeStatusFlow ||
    statusRecapRouteSignal(args.routeDecision);
  if (!shouldActivate) return null;

  const projection = await loadStatusRecapProjection({
    supabase: args.supabase,
    userId: args.userId,
    userTimezone: args.userTimezone,
  });
  const previousState = readStatusRecapFlowState(args.tempMemory);
  const projectionSummary = statusRecapProjectionSummary(projection);
  const dbContextPack = buildStatusRecapDbContextPack(projectionSummary);
  const noteInformationInbound = args.turnFrame?.note_information ??
    (!activeStatusFlow && statusRecapRouteSignal(args.routeDecision)
      ? createNoteInformation({
        source_flow_id: "global_dispatcher",
        handoff_reason: "explicit_user_request",
        target_dispatcher: "status_recap",
        handoff_context_for_next_dispatcher:
          "Run status_recap local dispatcher. Read DB context only; do not mutate or answer from global.",
        user_words: [args.userMessage],
        structured_context: {
          source_flow: "global_dispatcher",
          target_dispatcher: "status_recap",
          handoff_reason: "explicit_user_request",
          user_message_summary: args.userMessage,
          active_flow_summary: "No prior status_recap state.",
          collected_state: {},
          unresolved_questions: [],
          confidence: "medium",
          evidence: [args.routeDecision?.reason_code ?? "status_recap_route"],
          recommended_next_focus:
            "Ground the answer in the target DB status projection.",
        },
        confidence: "medium",
      })
      : null);
  const dispatcher = args.runLocalDispatcher ?? runStatusRecapLocalDispatcher;
  console.info("[StatusRecap] local_dispatcher_called", {
    active_status_flow: activeStatusFlow,
    db_context_pack_loaded: true,
    projection_summary: projectionSummary,
    note_information_consumed: Boolean(noteInformationInbound),
    micro_memory_context_count: 0,
  });
  const decision = await dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    current_user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    active_flow_state: previousState,
    note_information_inbound: noteInformationInbound,
    db_context_pack: dbContextPack,
    micro_memory_context: [],
    platform_context: withDirectEffectLocalContext({
      timezone: args.userTimezone,
      channel: args.turnFrame?.channel ?? "web",
    }, args.planItemSnapshot ?? null),
    risk_context: {
      safety_risk_band: args.turnFrame?.safety.risk_band ?? null,
      risk_score: 0,
    },
    available_inline_tools: [],
    last_answer_summary: previousState?.last_answer_summary ?? null,
    route_decision: args.routeDecision,
    turn_frame: args.turnFrame,
  });
  if (!decision) {
    return {
      content:
        "Je n'arrive pas à lire l'état correctement sur ce tour, donc je préfère ne rien affirmer.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "status_recap",
        status: "blocked",
        reason_code: "status_recap_local_dispatcher_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "status_recap",
          reason_code: "local_dispatcher_failed",
        }],
        toolExecution: "blocked",
        executedTools: [],
      },
    };
  }
  console.info("[StatusRecap] local_dispatcher_decision", {
    flow_action: decision.flow_action,
    status_intent_kind: decision.status_intent.kind,
    target_objects: decision.target_objects,
    visible_task_kind: decision.visible_task.kind,
    projection_used: decision.status_intent.requires_db_projection,
    projection_summary: projectionSummary,
    toolExecution: "none",
    executedTools: [],
  });
  const reduced = reduceStatusRecapLocalDispatcherOutput({
    previous: previousState,
    output: decision,
    projection,
    currentUserMessage: args.userMessage,
    noteInformationInbound,
  });
  if (reduced.status === "safety") {
    const exitMemo = exitMemoForTempMemory({
      reduced,
      decision,
      userMessage: args.userMessage,
      noteInformationInbound,
    });
    const nextTempMemory = {
      ...writeStatusRecapFlowState(args.tempMemory, reduced.local_state),
      [STATUS_RECAP_EXIT_MEMO_KEY]: exitMemo,
    };
    console.info("[StatusRecap] safety_preempt", {
      note_information_created: true,
      target_dispatcher: "safety_crisis",
      toolExecution: "none",
      executedTools: [],
    });
    return {
      content: "",
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "status_recap",
        status: "safety_preempt",
        reason_code: reduced.reason_code,
        operation_suggestions: [],
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: reduced.blocked_effects,
        state_mutation_audit: reduced.state_mutation_audit,
        exit_memo: exitMemo,
        note_information: exitMemo.note_information,
        flow_action: decision.flow_action,
        status_intent: decision.status_intent.kind,
        target_objects: decision.target_objects,
        pending_state_present: Boolean(previousState),
        direct_handoff_flag: decision.flow_action === "handoff_to_local_flow",
        visible_task: {
          kind: reduced.visible_task,
          conversation_context: reduced.conversation_context,
        },
        risk_score: decision.risk_score,
        projection_used: decision.status_intent.requires_db_projection,
        projection_summary: projectionSummary,
        toolExecution: "none",
        executedTools: [],
      },
    };
  }
  if (reduced.exit_to_global_dispatcher || reduced.handoff_to_local_flow) {
    const exitMemo = exitMemoForTempMemory({
      reduced,
      decision,
      userMessage: args.userMessage,
      noteInformationInbound,
    });
    const nextTempMemory = {
      ...writeStatusRecapFlowState(args.tempMemory, reduced.local_state),
      [STATUS_RECAP_EXIT_MEMO_KEY]: exitMemo,
    };
    console.info("[StatusRecap] exit_to_global_dispatcher", {
      exit_memo_reason: decision.exit_memo.reason,
      note_information_created: true,
      global_dispatcher_second_pass_after_status_exit: true,
      toolExecution: "none",
      executedTools: [],
    });
    return {
      content: "",
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "status_recap",
        status: reduced.handoff_to_local_flow
          ? "handoff_to_local_flow"
          : "topic_change",
        reason_code: reduced.reason_code,
        operation_suggestions: [],
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: reduced.blocked_effects,
        state_mutation_audit: reduced.state_mutation_audit,
        exit_memo: exitMemo,
        note_information: exitMemo.note_information,
        flow_action: decision.flow_action,
        status_intent: decision.status_intent.kind,
        target_objects: decision.target_objects,
        pending_state_present: Boolean(previousState),
        direct_handoff_flag: decision.flow_action === "handoff_to_local_flow",
        visible_task: {
          kind: reduced.visible_task,
          conversation_context: reduced.conversation_context,
        },
        projection_used: decision.status_intent.requires_db_projection,
        projection_summary: projectionSummary,
        toolExecution: "none",
        executedTools: [],
      },
    };
  }
  const visibleAgent = args.runVisibleAgent ?? runStatusRecapVisibleAgent;
  const visible = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: reduced.visible_task,
    conversation_context: reduced.conversation_context,
  });
  const content = String(visible ?? "").trim();
  if (!content) {
    return {
      content:
        "Je n'arrive pas à formuler le status correctement, donc je préfère ne rien affirmer.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "status_recap",
        status: "blocked",
        reason_code: "status_recap_visible_agent_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "status_recap",
          reason_code: "visible_agent_failed",
        }],
        toolExecution: "blocked",
        executedTools: [],
      },
    };
  }
  const explicitSupportedCoachPreferences = projection.coach_preferences.filter(
    (
      pref,
    ) =>
      pref.source_type !== "system_default" &&
      (SUPPORTED_COACH_PREFERENCE_KEYS as readonly string[]).includes(pref.key),
  );
  const baseTempMemory = clearToolSkillFlowForDirectReminder(
    args.tempMemory ?? {},
  );
  const nextTempMemory = reduced.local_state?.status === "closed"
    ? writeStatusRecapFlowState(baseTempMemory, null)
    : writeStatusRecapFlowState(baseTempMemory, reduced.local_state);
  return {
    content,
    nextTempMemory,
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "status_recap",
      status: reduced.status === "blocked" ? "blocked" : "answered",
      reason_code: reduced.reason_code,
      flow_action: decision.flow_action,
      projection_used: decision.status_intent.requires_db_projection,
      intent: decision.status_intent.kind,
      target_objects: decision.target_objects,
      visible_task: {
        kind: reduced.visible_task,
        conversation_context: reduced.conversation_context,
      },
      visible_task_kind: reduced.visible_task,
      visible_prompt_id: `status_recap.visible.${reduced.visible_task}`,
      conversation_context: reduced.conversation_context,
      note_information_inbound: noteInformationInbound,
      operation_suggestions: [],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      state_mutation_audit: reduced.state_mutation_audit,
      attack_card_found: projection.attack_cards.length > 0,
      defense_card_found: projection.defense_cards.length > 0,
      reminder_found: projection.one_shot_reminders.pending.length > 0,
      coach_preference_found: explicitSupportedCoachPreferences.length > 0,
      recent_effect_history_count: projection.recent_effect_history.length,
      projection_summary: projectionSummary,
      local_flow_state: reduced.local_state,
      pending_state_present: Boolean(previousState),
      direct_handoff_flag: decision.flow_action === "handoff_to_local_flow",
      evidence: reduced.evidence,
      toolExecution: "none",
      executedTools: [],
    },
  };
}
