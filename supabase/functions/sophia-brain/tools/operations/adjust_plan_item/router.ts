import type {
  AdjustPlanHandoffDraft,
  AdjustPlanHandoffStatus,
  AdjustPlanOperationRuntimeResult,
  AdjustPlanRouterContext,
  AdjustPlanUserIntent,
} from "./contract.ts";
import {
  clearAdjustPlanNonHandoffState,
  loadAdjustPlanFrameFromTempMemory,
  writeAdjustPlanHandoffState,
} from "./state.ts";
import {
  type AdjustPlanLocalState,
  createInitialAdjustPlanLocalState,
  isAdjustPlanLocalState,
  reduceAdjustPlanLocalDispatcherOutput,
  runAdjustPlanLocalDispatcher,
} from "./local_flow.ts";
import {
  type AdjustPlanVisibleAgent,
  runAdjustPlanVisibleAgent,
} from "./visible_agent.ts";
import {
  type InlineInfoToolContext,
  runInlineGetInfoDbTool,
  runInlineGetInfoProductTool,
} from "../inline_info_tools.ts";
import {
  createNoteInformation,
  type NoteInformation,
} from "../../../contracts/note_information.v1.ts";
import {
  adjustPlanSkillResult,
  ensureRuntimeHasSkillResult,
} from "./runtime_adapter.ts";

export type AdjustPlanLifecycleDeps = {
  [key: string]: unknown;
  operationRouteIsSelected?: (args: any) => boolean;
  localDispatcher?: typeof runAdjustPlanLocalDispatcher;
  visibleAgent?: AdjustPlanVisibleAgent;
};

export type AdjustPlanRouterDeps = AdjustPlanLifecycleDeps;

function nowIso(): string {
  return new Date().toISOString();
}

function recentMessages(context: AdjustPlanRouterContext) {
  return (context.history ?? [])
    .map((turn: any) => ({
      role: turn?.role === "assistant" ? "assistant" as const : "user" as const,
      content: String(turn?.content ?? "").trim(),
    }))
    .filter((turn) => turn.content)
    .slice(-10);
}

function turnFrameHasAdjustPlanIntent(
  context: AdjustPlanRouterContext,
): boolean {
  const intents = Array.isArray(context.turnFrame?.tool_skill_intents)
    ? context.turnFrame.tool_skill_intents
    : [];
  return intents.some((intent: any) =>
    intent?.operation_type === "adjust_plan_item" &&
    intent?.confidence_band !== "low"
  );
}

function routeSelectsAdjustPlan(
  context: AdjustPlanRouterContext,
  deps: AdjustPlanLifecycleDeps,
): boolean {
  if (
    deps.operationRouteIsSelected?.({
      operationType: "adjust_plan_item",
      routeDecision: context.routeDecision,
      turnFrame: context.turnFrame,
      tempMemory: context.tempMemory,
    })
  ) return true;
  return context.routeDecision?.selected_handler === "adjust_plan_item" ||
    context.routeDecision?.response_owner === "tool_skill" &&
      turnFrameHasAdjustPlanIntent(context) ||
    turnFrameHasAdjustPlanIntent(context);
}

function traceForInputCoach(args: {
  status: AdjustPlanHandoffStatus;
  userIntent: AdjustPlanUserIntent;
  reasonCode: string;
  draft?: AdjustPlanHandoffDraft | null;
  reply: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    selected_handler: "adjust_plan_item",
    operation_type: "adjust_plan_item",
    mode: "platform_handoff",
    status: args.status,
    reason_code: args.reasonCode,
    operation_id: null,
    input_draft: args.draft ?? null,
    requested_effects: [],
    allowed_effects: [],
    blocked_effects: [],
    committed_effects: [],
    platform_handoff: {
      operation_type: "adjust_plan_item",
      status: args.status === "cancelled" ? "cancelled" : "delivered",
      surface_id: "plan",
      reason_code: args.reasonCode,
      no_chat_mutation: true,
      executable_from_chat: false,
    },
    skill_result: adjustPlanSkillResult({
      status: args.status === "cancelled"
        ? "cancelled"
        : args.status === "clarifying"
        ? "ask_question"
        : "handoff_delivered",
      userIntent: args.userIntent,
      reply: args.reply,
      reasonCode: args.reasonCode,
    }),
    ...(args.extra ?? {}),
  };
}

function runtimeResult(args: {
  content: string;
  nextTempMemory: any;
  status: AdjustPlanHandoffStatus;
  userIntent: AdjustPlanUserIntent;
  reasonCode: string;
  draft?: AdjustPlanHandoffDraft | null;
  extra?: Record<string, unknown>;
}): AdjustPlanOperationRuntimeResult {
  return {
    content: args.content,
    nextTempMemory: args.nextTempMemory,
    toolExecution: "platform_handoff",
    executedTools: [],
    toolSkillRun: traceForInputCoach({
      status: args.status,
      userIntent: args.userIntent,
      reasonCode: args.reasonCode,
      draft: args.draft ?? null,
      reply: args.content,
      extra: args.extra,
    }),
  };
}

function writeState(args: {
  tempMemory: any;
  status: AdjustPlanHandoffStatus;
  draft?: AdjustPlanHandoffDraft | null;
  localState?: AdjustPlanLocalState | null;
  previousTurnCount?: number;
  maxTurns?: number;
  createdAt?: string | null;
}): any {
  const now = nowIso();
  return writeAdjustPlanHandoffState(
    clearAdjustPlanNonHandoffState(args.tempMemory),
    {
      skill_id: "adjust_plan_item",
      mode: "platform_handoff",
      status: args.status,
      draft: args.draft ?? null,
      local_flow_state: args.localState ?? null,
      operation_input: null,
      turn_count: Number(args.previousTurnCount ?? 0),
      max_turns: Number(args.maxTurns ?? 6),
      created_at: args.createdAt ?? now,
      updated_at: now,
      no_chat_mutation: true,
    },
  );
}

function localStateFromActive(value: unknown): AdjustPlanLocalState | null {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return isAdjustPlanLocalState(record.local_flow_state)
    ? record.local_flow_state
    : null;
}

function buildInboundNoteInformation(args: {
  context: AdjustPlanRouterContext;
  activeHandoff: ReturnType<typeof loadAdjustPlanFrameFromTempMemory>[
    "handoff_state"
  ];
}): NoteInformation | null {
  if (args.activeHandoff?.local_flow_state) return null;
  return createNoteInformation({
    source_flow_id: "global_dispatcher",
    source_flow_presentation:
      "Global dispatcher selected adjust_plan_item for a non-mutant Plan adjustment handoff.",
    source_flow_state_summary:
      "First activation of adjust_plan_item from global routing.",
    handoff_reason: "explicit_user_request",
    target_dispatcher: "adjust_plan_item",
    handoff_context_for_next_dispatcher: JSON.stringify({
      selected_handler: args.context.routeDecision?.selected_handler ?? null,
      response_owner: args.context.routeDecision?.response_owner ?? null,
      reason_code: args.context.routeDecision?.reason_code ?? null,
      tool_skill_intents: args.context.turnFrame?.tool_skill_intents ?? [],
      plan_item_snapshot_count: Array.isArray(args.context.planItemSnapshot)
        ? args.context.planItemSnapshot.length
        : 0,
      no_chat_mutation: true,
    }),
    target_local_dispatcher_hint:
      "Start adjust_plan_item locally; do not execute Plan mutations from chat.",
    user_words: [args.context.userMessage],
    structured_context: {
      selected_handler: args.context.routeDecision?.selected_handler ?? null,
      response_owner: args.context.routeDecision?.response_owner ?? null,
      reason_code: args.context.routeDecision?.reason_code ?? null,
      tool_skill_intents: args.context.turnFrame?.tool_skill_intents ?? [],
      plan_item_snapshot_count: Array.isArray(args.context.planItemSnapshot)
        ? args.context.planItemSnapshot.length
        : 0,
      no_chat_mutation: true,
    },
    risk_score: 0,
    no_chat_mutation: {
      db_write_committed: false,
      executable_confirmation_generated: false,
    },
  });
}

function adjustPlanInlineInfoContext(args: {
  state: AdjustPlanLocalState;
  userMessage: string;
  subskillContext: Record<string, unknown> | null;
  planSnapshot: unknown;
  noteInformation?: Record<string, unknown> | null;
}): InlineInfoToolContext {
  const context = args.subskillContext ?? {};
  const question = String(
    context.question_to_answer ?? context.question ?? args.userMessage,
  ).trim();
  return {
    active_flow: "adjust_plan_item",
    active_flow_status: args.state.status,
    question_to_answer: question,
    active_flow_context: {
      stage: args.state.stage,
      scope: args.state.scope,
      adjustment_need: args.state.adjustment_need,
      platform_handoff: args.state.platform_handoff,
      plan_snapshot: args.planSnapshot,
    },
    dispatcher_context: context,
    note_information: args.noteInformation as any ?? null,
  };
}

function appendAdjustPlanSubskillHistory(args: {
  state: AdjustPlanLocalState | null;
  userMessage: string;
  context: InlineInfoToolContext;
  reply: string;
}): AdjustPlanLocalState | null {
  if (!args.state) return null;
  return {
    ...args.state,
    subskill_history: [
      ...(args.state.subskill_history ?? []),
      {
        skill_id: "status_recap",
        user_message: args.userMessage,
        question_to_answer: args.context.question_to_answer,
        active_flow_context: args.context.active_flow_context,
        reply_summary: args.reply.slice(0, 500),
        created_at: new Date().toISOString(),
      },
    ].slice(-8),
  };
}

function withInlineToolConversationContext(args: {
  base: any;
  targetDispatcher: "status_recap" | "product_help";
  answer: string;
  nextFocus?: string | null;
}) {
  return {
    ...(args.base ?? {}),
    field_or_stage: "inline",
    inline_tool_result: {
      target_dispatcher: args.targetDispatcher,
      answer_summary: args.answer,
      next_focus: args.nextFocus ??
        "Revenir a l'ajustement du Plan avec les elements deja collectes.",
    },
    context_summary: [
      String(args.base?.context_summary ?? args.base?.state_summary ?? "")
        .trim(),
      args.answer ? `Reponse inline: ${args.answer.slice(0, 500)}` : "",
    ].filter(Boolean).join("\n"),
  };
}

function statusForLocalRuntime(
  status: string,
): AdjustPlanHandoffStatus {
  if (status === "apply_attempt") return "apply_attempt";
  if (status === "repeat_handoff") return "repeat_draft";
  if (status === "cancelled") return "cancelled";
  if (status === "topic_change") return "topic_change";
  if (status === "blocked") return "blocked";
  if (status === "handoff_delivered") return "draft_delivered";
  return "clarifying";
}

function userIntentForLocalRuntime(
  visibleTask: string,
): AdjustPlanUserIntent {
  if (visibleTask === "apply_attempt") return "approve";
  if (visibleTask === "cancel_close") return "cancel";
  if (visibleTask === "repeat_plan_handoff") return "explain";
  if (visibleTask === "explain_handoff") return "explain";
  if (visibleTask === "revise_plan_handoff") return "revise";
  if (visibleTask.startsWith("clarify_")) return "clarify";
  return "start";
}

async function runAdjustPlanLocalFlow(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
  activeHandoff: ReturnType<typeof loadAdjustPlanFrameFromTempMemory>[
    "handoff_state"
  ];
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const localDispatcher = args.deps.localDispatcher ??
    runAdjustPlanLocalDispatcher;
  const visibleAgent = args.deps.visibleAgent ?? runAdjustPlanVisibleAgent;
  const previousLocalState = localStateFromActive(args.activeHandoff) ??
    createInitialAdjustPlanLocalState();
  const noteInformationInbound = buildInboundNoteInformation({
    context: args.context,
    activeHandoff: args.activeHandoff,
  });
  const dispatcherOutput = await localDispatcher({
    user_id: args.context.userId,
    request_id: args.context.requestId ?? null,
    user_message: args.context.userMessage,
    recent_messages: recentMessages(args.context),
    active_state: args.activeHandoff,
    local_state: previousLocalState,
    route_decision: args.context.routeDecision,
    turn_frame: args.context.turnFrame,
    note_information_inbound: noteInformationInbound,
    plan_snapshot: { items: args.context.planItemSnapshot ?? [] },
    db_context_pack: {
      source: "supabase",
      freshness: "same_turn",
      confidence: "high",
      plan_items: args.context.planItemSnapshot ?? [],
      surface_capabilities: {
        plan_handoff_destination: "Plan",
        chat_can_mutate_plan: false,
      },
      evidence: ["adjust_plan_item.plan_item_snapshot"],
    },
    micro_memory_context: {
      items: [],
      exclusions: ["not_loaded_for_adjust_plan_item_v1"],
      budget: {
        max_items: 0,
        reason: "No candidate-specific memory loader wired in V1.",
      },
    },
  });
  if (!dispatcherOutput) {
    return runtimeResult({
      content:
        "Je garde l'ajustement du plan en cours, mais je n'arrive pas a traiter correctement ce tour. Reessaie dans un instant.",
      nextTempMemory: args.context.tempMemory,
      status: "blocked",
      userIntent: "unknown",
      reasonCode: "adjust_plan_item_local_dispatcher_failed",
      extra: {
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        committed_effects: [],
        blocked_effects: [{
          type: "local_flow_runtime",
          reason_code: "adjust_plan_item_local_dispatcher_failed",
        }],
      },
    });
  }
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: previousLocalState,
    output: dispatcherOutput,
  });
  if (reduced.exit_to_global_dispatcher) {
    const nextTempMemory = {
      ...writeAdjustPlanHandoffState(
        clearAdjustPlanNonHandoffState(args.context.tempMemory),
        null,
      ),
      __last_adjust_plan_item_exit_memo: {
        reason: reduced.exit_memo?.reason ?? "topic_change",
        flow_summary: reduced.exit_memo?.user_intent_summary ??
          previousLocalState.last_handoff_summary ??
          null,
        handoff_hint_for_global_dispatcher: JSON.stringify(
          reduced.exit_memo?.handoff_hint_for_global_dispatcher ?? {},
        ),
        at: new Date().toISOString(),
      },
    };
    return runtimeResult({
      content: "",
      nextTempMemory,
      status: "topic_change",
      userIntent: "topic_change",
      reasonCode: reduced.reason_code,
      extra: {
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        exit_memo: reduced.exit_memo,
        note_information: reduced.note_information,
      },
    });
  }
  if (reduced.handoff_to_local_flow) {
    const targetDispatcher = reduced.note_information?.target_dispatcher ??
      reduced.target_dispatcher ?? "other_local";
    const nextTempMemory = {
      ...writeAdjustPlanHandoffState(
        clearAdjustPlanNonHandoffState(args.context.tempMemory),
        null,
      ),
      __last_adjust_plan_item_exit_memo: {
        reason: "bridge",
        target_dispatcher: targetDispatcher,
        flow_summary: reduced.conversation_context?.state_summary ??
          previousLocalState.last_handoff_summary ??
          null,
        handoff_hint_for_global_dispatcher: null,
        note_information: reduced.note_information,
        at: new Date().toISOString(),
      },
    };
    return runtimeResult({
      content: "",
      nextTempMemory,
      status: "topic_change",
      userIntent: "topic_change",
      reasonCode: reduced.reason_code,
      extra: {
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        target_dispatcher: targetDispatcher,
        flow_action: dispatcherOutput.flow_action,
        visible_task: { kind: "none" },
        note_information: reduced.note_information,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
      },
    });
  }
  if (reduced.reason_code === "adjust_plan_item_local_safety_preempt") {
    const nextTempMemory = {
      ...writeAdjustPlanHandoffState(
        clearAdjustPlanNonHandoffState(args.context.tempMemory),
        null,
      ),
      __last_adjust_plan_item_exit_memo: {
        reason: "safety",
        target_dispatcher: "safety_crisis",
        flow_summary: reduced.conversation_context?.state_summary ??
          previousLocalState.last_handoff_summary ??
          null,
        handoff_hint_for_global_dispatcher: null,
        note_information: reduced.note_information,
        at: new Date().toISOString(),
      },
    };
    return runtimeResult({
      content: "",
      nextTempMemory,
      status: "blocked",
      userIntent: "topic_change",
      reasonCode: reduced.reason_code,
      extra: {
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        target_dispatcher: "safety_crisis",
        flow_action: dispatcherOutput.flow_action,
        visible_task: { kind: "none" },
        note_information: reduced.note_information,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "adjust_plan_item",
          reason_code: "safety_preempt",
        }],
      },
    });
  }
  if (reduced.get_info_db && reduced.local_state) {
    if (!args.context.supabase) {
      return {
        content:
          "Je garde l'ajustement du plan en cours, mais je n'arrive pas à lire l'état du plan sur ce tour.",
        nextTempMemory: args.context.tempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          operation_type: "adjust_plan_item",
          mode: "platform_handoff",
          status: "blocked",
          reason_code: "adjust_plan_item_get_info_db_missing_supabase",
          committed_effects: [],
          blocked_effects: [{
            type: "get_info_db",
            reason_code: "missing_supabase_context",
          }],
          no_chat_mutation: true,
          executable_from_chat: false,
        },
      };
    }
    const toolContext = adjustPlanInlineInfoContext({
      state: reduced.local_state,
      userMessage: args.context.userMessage,
      subskillContext: reduced.subskill_context,
      planSnapshot: args.context.planItemSnapshot ?? [],
      noteInformation: reduced.note_information as any ?? null,
    });
    const info = await runInlineGetInfoDbTool({
      supabase: args.context.supabase,
      userId: args.context.userId,
      userMessage: args.context.userMessage,
      userTimezone: args.context.userTimezone,
      history: args.context.history,
      turnFrame: args.context.turnFrame,
      routeDecision: args.context.routeDecision,
      tempMemory: args.context.tempMemory,
      requestId: args.context.requestId ?? null,
      objectTypes: ["plan_item"],
      context: toolContext,
    });
    const inlineConversationContext = withInlineToolConversationContext({
      base: reduced.conversation_context,
      targetDispatcher: "status_recap",
      answer: info.content,
    });
    const traceEvents: Record<string, unknown>[] = [...info.runtimeTrace];
    const visibleInlineMessage = await visibleAgent({
      user_id: args.context.userId,
      request_id: args.context.requestId ?? null,
      stage: "inline_tool_return",
      conversation_context: inlineConversationContext,
      trace_event: (event) => traceEvents.push(event),
    });
    const nextLocalState = appendAdjustPlanSubskillHistory({
      state: reduced.local_state,
      userMessage: args.context.userMessage,
      context: toolContext,
      reply: info.content,
    });
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: statusForLocalRuntime(reduced.status),
      draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
      localState: nextLocalState,
      previousTurnCount: Number(args.activeHandoff?.turn_count ?? 0) + 1,
      maxTurns: Number(args.activeHandoff?.max_turns ?? 8),
      createdAt: args.activeHandoff?.created_at ?? null,
    });
    return {
      content: visibleInlineMessage ||
        info.content ||
        "Je n'arrive pas à lire cet état maintenant, mais je garde l'ajustement du plan en cours.",
      additionalContents: info.additionalContents,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        operation_type: "adjust_plan_item",
        mode: "platform_handoff",
        status: statusForLocalRuntime(reduced.status),
        reason_code: reduced.reason_code,
        flow_action: dispatcherOutput.flow_action,
        visible_task: { kind: "none" },
        conversation_context: inlineConversationContext,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        pending_confirmation: null,
        local_flow_state: nextLocalState,
        subskill_run: info.subskillRun,
        risk_score: reduced.risk_score,
        runtime_trace: traceEvents,
      },
    };
  }
  if (reduced.get_info_product && reduced.local_state) {
    const toolContext = adjustPlanInlineInfoContext({
      state: reduced.local_state,
      userMessage: args.context.userMessage,
      subskillContext: reduced.subskill_context,
      planSnapshot: args.context.planItemSnapshot ?? [],
      noteInformation: reduced.note_information as any ?? null,
    });
    const info = await runInlineGetInfoProductTool({
      userId: args.context.userId,
      userMessage: args.context.userMessage,
      history: args.context.history,
      turnFrame: args.context.turnFrame,
      context: toolContext,
      requestId: args.context.requestId ?? null,
    });
    const inlineConversationContext = withInlineToolConversationContext({
      base: reduced.conversation_context,
      targetDispatcher: "product_help",
      answer: info.content,
    });
    const traceEvents: Record<string, unknown>[] = [...info.runtimeTrace];
    const visibleInlineMessage = await visibleAgent({
      user_id: args.context.userId,
      request_id: args.context.requestId ?? null,
      stage: "inline_tool_return",
      conversation_context: inlineConversationContext,
      trace_event: (event) => traceEvents.push(event),
    });
    const nextLocalState = appendAdjustPlanSubskillHistory({
      state: reduced.local_state,
      userMessage: args.context.userMessage,
      context: toolContext,
      reply: info.content,
    });
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: statusForLocalRuntime(reduced.status),
      draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
      localState: nextLocalState,
      previousTurnCount: Number(args.activeHandoff?.turn_count ?? 0) + 1,
      maxTurns: Number(args.activeHandoff?.max_turns ?? 8),
      createdAt: args.activeHandoff?.created_at ?? null,
    });
    return {
      content: visibleInlineMessage || info.content ||
        "Je garde l'ajustement du plan en cours, mais je n'arrive pas à répondre à cette question produit maintenant.",
      additionalContents: info.additionalContents,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        operation_type: "adjust_plan_item",
        mode: "platform_handoff",
        status: statusForLocalRuntime(reduced.status),
        reason_code: reduced.reason_code,
        flow_action: dispatcherOutput.flow_action,
        visible_task: { kind: "inline_tool_return" },
        conversation_context: inlineConversationContext,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        pending_confirmation: null,
        local_flow_state: nextLocalState,
        subskill_run: info.subskillRun,
        risk_score: reduced.risk_score,
        runtime_trace: traceEvents,
      },
    };
  }
  const traceEvents: Record<string, unknown>[] = [];
  const visibleMessage = await visibleAgent({
    user_id: args.context.userId,
    request_id: args.context.requestId ?? null,
    stage: reduced.visible_task,
    conversation_context: reduced.conversation_context!,
    trace_event: (event) => traceEvents.push(event),
  });
  if (!visibleMessage) {
    const recoveryMessage = reduced.conversation_context
      ? await visibleAgent({
        user_id: args.context.userId,
        request_id: args.context.requestId ?? null,
        stage: "contract_recovery",
        conversation_context: reduced.conversation_context,
        validation_errors_to_fix: ["visible_agent_failed"],
        trace_event: (event) => traceEvents.push(event),
      })
      : null;
    const nextTempMemory = reduced.local_state
      ? writeState({
        tempMemory: args.context.tempMemory,
        status: statusForLocalRuntime(reduced.status),
        draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
        localState: reduced.local_state,
        previousTurnCount: Number(args.activeHandoff?.turn_count ?? 0) + 1,
        maxTurns: Number(args.activeHandoff?.max_turns ?? 8),
        createdAt: args.activeHandoff?.created_at ?? null,
      })
      : args.context.tempMemory;
    return runtimeResult({
      content: recoveryMessage ||
        "Je garde l'ajustement du plan en cours. Il me manque une precision pour formuler correctement la proposition a reprendre dans Plan.",
      nextTempMemory,
      status: "blocked",
      userIntent: "unknown",
      reasonCode: "adjust_plan_item_visible_agent_failed",
      extra: {
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        committed_effects: [],
        blocked_effects: [{
          type: "local_flow_runtime",
          reason_code: "adjust_plan_item_visible_agent_failed",
        }],
        local_flow_state: reduced.local_state,
        visible_task: { kind: reduced.visible_task },
        conversation_context: reduced.conversation_context,
        runtime_trace: traceEvents,
      },
    });
  }
  const shouldKeepState = Boolean(reduced.local_state) &&
    reduced.status !== "cancelled";
  const nextTempMemory = shouldKeepState
    ? writeState({
      tempMemory: args.context.tempMemory,
      status: statusForLocalRuntime(reduced.status),
      draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
      localState: reduced.local_state,
      previousTurnCount: Number(args.activeHandoff?.turn_count ?? 0) + 1,
      maxTurns: Number(args.activeHandoff?.max_turns ?? 8),
      createdAt: args.activeHandoff?.created_at ?? null,
    })
    : writeAdjustPlanHandoffState(
      clearAdjustPlanNonHandoffState(args.context.tempMemory),
      null,
    );
  return runtimeResult({
    content: visibleMessage,
    nextTempMemory,
    status: statusForLocalRuntime(reduced.status),
    userIntent: userIntentForLocalRuntime(reduced.visible_task),
    reasonCode: reduced.reason_code,
    draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
    extra: {
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      pending_confirmation: null,
      flow_action: dispatcherOutput.flow_action,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      local_flow_state: reduced.local_state,
      visible_task: { kind: reduced.visible_task },
      conversation_context: reduced.conversation_context,
      risk_score: reduced.risk_score,
      runtime_trace: traceEvents,
      platform_handoff: reduced.draft
        ? {
          operation_type: "adjust_plan_item",
          status: reduced.status === "cancelled" ? "cancelled" : "delivered",
          surface_id: "plan",
          reason_code: reduced.reason_code,
          no_chat_mutation: true,
          executable_from_chat: false,
          draft: reduced.draft,
        }
        : undefined,
    },
  });
}

export async function maybeRunAdjustPlanItemOperation(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const activeHandoff = loadAdjustPlanFrameFromTempMemory(
    args.context.tempMemory,
  ).handoff_state;
  const selected = routeSelectsAdjustPlan(args.context, args.deps);
  if (!selected && !activeHandoff) return null;

  const localRuntime = await runAdjustPlanLocalFlow({
    context: args.context,
    deps: args.deps,
    activeHandoff,
  });
  if (localRuntime) return ensureRuntimeHasSkillResult(localRuntime);
  return ensureRuntimeHasSkillResult(runtimeResult({
    content:
      "Je garde l'ajustement du plan dans ce flow local, mais je n'arrive pas a traiter ce tour correctement.",
    nextTempMemory: args.context.tempMemory,
    status: "blocked",
    userIntent: "unknown",
    reasonCode: "adjust_plan_item_local_runtime_null_no_legacy_fallback",
    extra: {
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "local_flow_runtime",
        reason_code: "adjust_plan_item_local_runtime_null_no_legacy_fallback",
      }],
    },
  }));
}
