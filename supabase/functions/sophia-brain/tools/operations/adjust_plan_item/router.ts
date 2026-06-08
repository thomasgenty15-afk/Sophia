import type {
  AdjustPlanHandoffDraft,
  AdjustPlanHandoffStatus,
  AdjustPlanOperationRuntimeResult,
  AdjustPlanRouterContext,
  AdjustPlanUserIntent,
} from "./contract.ts";
import {
  generateAdjustPlanPlatformInputDraft,
  writeAdjustPlanPlatformInputReply,
} from "./generator.ts";
import type { AdjustPlanReplyRenderIntent } from "./renderer.ts";
import {
  clearAdjustPlanExecutableLegacyState,
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
} from "../inline_info_tools.ts";
import {
  adjustPlanSkillResult,
  ensureRuntimeHasSkillResult,
} from "./runtime_adapter.ts";

type FollowupDecision = {
  status: AdjustPlanHandoffStatus;
  userIntent: AdjustPlanUserIntent;
  reasonCode: string;
};

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
  ) || context.turnFrame?.tool_skill_opportunity?.operation_type ===
      "adjust_plan_item";
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

function structuredContinuationIntent(
  value: unknown,
): AdjustPlanHandoffStatus | null {
  const raw = String(value ?? "").trim();
  if (raw === "apply_attempt" || raw === "handoff_apply_attempt") {
    return "apply_attempt";
  }
  if (raw === "repeat_handoff" || raw === "repeat_draft") {
    return "repeat_draft";
  }
  if (raw === "revise_handoff" || raw === "revise_draft") {
    return "revise_draft";
  }
  if (raw === "cancelled" || raw === "cancel_handoff") return "cancelled";
  if (raw === "topic_change") return "topic_change";
  return null;
}

function decisionFromStatus(
  status: AdjustPlanHandoffStatus,
  reasonCode: string,
): FollowupDecision {
  if (status === "apply_attempt") {
    return { status, userIntent: "approve", reasonCode };
  }
  if (status === "repeat_draft") {
    return { status, userIntent: "explain", reasonCode };
  }
  if (status === "revise_draft") {
    return { status, userIntent: "revise", reasonCode };
  }
  if (status === "cancelled") {
    return { status, userIntent: "cancel", reasonCode };
  }
  if (status === "topic_change") {
    return { status, userIntent: "topic_change", reasonCode };
  }
  return { status, userIntent: "start", reasonCode };
}

function structuredFollowup(
  context: AdjustPlanRouterContext,
): FollowupDecision | null {
  const arbitration = (context.routeDecision as any)?.active_flow_arbitration;
  const arbitrationIntent = structuredContinuationIntent(
    arbitration?.continuation_intent,
  );
  if (arbitrationIntent) {
    return decisionFromStatus(
      arbitrationIntent,
      `active_input_coach_structured_${arbitrationIntent}`,
    );
  }
  const confirmation = context.turnFrame?.confirmation_response;
  if (confirmation && confirmation.confidence_band !== "low") {
    if (confirmation.kind === "yes") {
      return decisionFromStatus(
        "apply_attempt",
        "confirmation_yes_is_platform_input_apply_attempt",
      );
    }
    if (confirmation.kind === "no") {
      return decisionFromStatus(
        "cancelled",
        "confirmation_no_cancels_platform_input_coach",
      );
    }
    if (confirmation.kind === "topic_change") {
      return decisionFromStatus(
        "topic_change",
        "confirmation_topic_change_clears_platform_input_coach",
      );
    }
    if (confirmation.kind === "correction_to_pending") {
      return decisionFromStatus(
        "revise_draft",
        "confirmation_correction_revises_platform_input",
      );
    }
  }

  const intents = Array.isArray(context.turnFrame?.tool_skill_intents)
    ? context.turnFrame.tool_skill_intents
    : [];
  for (const intent of intents) {
    if (
      intent.operation_type !== "adjust_plan_item" ||
      intent.confidence_band === "low"
    ) continue;
    const continuation = structuredContinuationIntent(
      (intent.payload_hint as any)?.handoff_continuation_intent ??
        (intent.operation_input as any)?.handoff_continuation_intent,
    );
    if (continuation) {
      return decisionFromStatus(
        continuation,
        `tool_skill_intent_structured_${continuation}`,
      );
    }
    if (intent.user_intent === "explain_only") {
      return decisionFromStatus(
        "repeat_draft",
        "tool_skill_intent_explain_repeats_platform_input",
      );
    }
    if (
      intent.user_intent === "adjust" ||
      intent.user_intent === "update" ||
      intent.user_intent === "create" ||
      intent.user_intent === "select"
    ) {
      return decisionFromStatus(
        "revise_draft",
        "tool_skill_intent_revises_platform_input",
      );
    }
  }
  return null;
}

function concurrentOperationSelected(
  context: AdjustPlanRouterContext,
): boolean {
  const handler = String(context.routeDecision?.selected_handler ?? "").trim();
  if (!handler) return false;
  if (
    handler === "adjust_plan_item" ||
    handler === "product_help" ||
    handler === "status_recap" ||
    handler === "normal_reply"
  ) return false;
  return true;
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
    mode: "platform_input_coaching",
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
    clearAdjustPlanExecutableLegacyState(args.tempMemory),
    {
      skill_id: "adjust_plan_item",
      mode: "platform_input_coaching",
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

function adjustPlanInlineInfoContext(args: {
  state: AdjustPlanLocalState;
  userMessage: string;
  subskillContext: Record<string, unknown> | null;
  planSnapshot: unknown;
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
  const dispatcherOutput = await localDispatcher({
    user_id: args.context.userId,
    request_id: args.context.requestId ?? null,
    user_message: args.context.userMessage,
    recent_messages: recentMessages(args.context),
    active_state: args.activeHandoff,
    local_state: previousLocalState,
    route_decision: args.context.routeDecision,
    turn_frame: args.context.turnFrame,
    plan_snapshot: { items: args.context.planItemSnapshot ?? [] },
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
        clearAdjustPlanExecutableLegacyState(args.context.tempMemory),
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
          mode: "platform_input_coaching",
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
      content: info.content ||
        "Je n'arrive pas à lire cet état maintenant, mais je garde l'ajustement du plan en cours.",
      additionalContents: info.additionalContents,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        operation_type: "adjust_plan_item",
        mode: "platform_input_coaching",
        status: statusForLocalRuntime(reduced.status),
        reason_code: reduced.reason_code,
        flow_action: dispatcherOutput.flow_action,
        visible_task: { kind: "none" },
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        pending_confirmation: null,
        local_flow_state: nextLocalState,
        subskill_run: info.subskillRun,
        risk_score: reduced.risk_score,
        runtime_trace: info.runtimeTrace,
      },
    };
  }
  const traceEvents: Record<string, unknown>[] = [];
  const visibleMessage = await visibleAgent({
    user_id: args.context.userId,
    request_id: args.context.requestId ?? null,
    stage: reduced.visible_task,
    user_message: args.context.userMessage,
    recent_messages: recentMessages(args.context),
    local_state: reduced.local_state,
    draft: reduced.draft,
    trace_event: (event) => traceEvents.push(event),
  });
  if (!visibleMessage) {
    return runtimeResult({
      content:
        "Je garde l'ajustement du plan en cours, mais je n'arrive pas a formuler correctement la prochaine reponse. Reessaie dans un instant.",
      nextTempMemory: args.context.tempMemory,
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
      clearAdjustPlanExecutableLegacyState(args.context.tempMemory),
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
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      local_flow_state: reduced.local_state,
      visible_task: { kind: reduced.visible_task },
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

async function buildDraft(args: {
  context: AdjustPlanRouterContext;
  previous?: AdjustPlanHandoffDraft | null;
  revisionRequest?: string | null;
}): Promise<AdjustPlanHandoffDraft> {
  return await generateAdjustPlanPlatformInputDraft({
    user_message: args.context.userMessage,
    conversation_context: recentMessages(args.context),
    previous_draft: args.previous ?? null,
    user_revision_request: args.revisionRequest ?? null,
    request_id: args.context.requestId ?? null,
    user_id: args.context.userId,
    force_real_ai: args.context.forceFullAi === true,
  });
}

async function writeVisibleReply(args: {
  context: AdjustPlanRouterContext;
  draft: AdjustPlanHandoffDraft;
  previous?: AdjustPlanHandoffDraft | null;
  intent: AdjustPlanReplyRenderIntent;
}): Promise<string> {
  return await writeAdjustPlanPlatformInputReply({
    user_message: args.context.userMessage,
    draft: args.draft,
    previous_draft: args.previous ?? null,
    conversation_context: recentMessages(args.context),
    intent: args.intent,
    request_id: args.context.requestId ?? null,
    user_id: args.context.userId,
    force_real_ai: args.context.forceFullAi === true,
  });
}

async function startInputCoach(args: {
  context: AdjustPlanRouterContext;
  previous?: AdjustPlanHandoffDraft | null;
  revisionRequest?: string | null;
  status?: AdjustPlanHandoffStatus;
  reasonCode: string;
  userIntent: AdjustPlanUserIntent;
  previousTurnCount?: number;
  maxTurns?: number;
  createdAt?: string | null;
}): Promise<AdjustPlanOperationRuntimeResult> {
  const draft = await buildDraft({
    context: args.context,
    previous: args.previous ?? null,
    revisionRequest: args.revisionRequest ?? null,
  });
  const status = args.status ?? "draft_delivered";
  const content = await writeVisibleReply({
    context: args.context,
    draft,
    previous: args.previous ?? null,
    intent: status === "revise_draft" ? "revise" : "start",
  });
  const nextTempMemory = writeState({
    tempMemory: args.context.tempMemory,
    status,
    draft,
    previousTurnCount: args.previousTurnCount ?? 0,
    maxTurns: args.maxTurns,
    createdAt: args.createdAt ?? null,
  });
  return runtimeResult({
    content,
    nextTempMemory,
    status,
    userIntent: args.userIntent,
    reasonCode: args.reasonCode,
    draft,
  });
}

async function handleActiveInputCoach(args: {
  context: AdjustPlanRouterContext;
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const active = loadAdjustPlanFrameFromTempMemory(args.context.tempMemory)
    .handoff_state;
  if (!active) return null;
  if (
    concurrentOperationSelected(args.context) &&
    !turnFrameHasAdjustPlanIntent(args.context)
  ) {
    return null;
  }
  const structured = structuredFollowup(args.context);
  if (
    structured?.status === "cancelled" || structured?.status === "topic_change"
  ) {
    const nextTempMemory = writeAdjustPlanHandoffState(
      clearAdjustPlanExecutableLegacyState(args.context.tempMemory),
      null,
    );
    return runtimeResult({
      content:
        "Ok, je laisse cette formulation de côté. Ton plan reste inchangé ici.",
      nextTempMemory,
      status: structured.status,
      userIntent: structured.userIntent,
      reasonCode: structured.reasonCode,
    });
  }
  if (structured?.status === "apply_attempt") {
    const draft = active.draft ?? await buildDraft({ context: args.context });
    const content = await writeVisibleReply({
      context: args.context,
      draft,
      previous: active.draft ?? null,
      intent: "apply_attempt",
    });
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: "apply_attempt",
      draft,
      previousTurnCount: Number(active.turn_count ?? 0) + 1,
      maxTurns: active.max_turns,
      createdAt: active.created_at,
    });
    return runtimeResult({
      content,
      nextTempMemory,
      status: "apply_attempt",
      userIntent: "approve",
      reasonCode: structured.reasonCode,
      draft,
    });
  }
  if (structured?.status === "repeat_draft") {
    const draft = active.draft ?? await buildDraft({ context: args.context });
    const content = await writeVisibleReply({
      context: args.context,
      draft,
      previous: active.draft ?? null,
      intent: "repeat",
    });
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: "repeat_draft",
      draft,
      previousTurnCount: Number(active.turn_count ?? 0) + 1,
      maxTurns: active.max_turns,
      createdAt: active.created_at,
    });
    return runtimeResult({
      content,
      nextTempMemory,
      status: "repeat_draft",
      userIntent: "explain",
      reasonCode: structured.reasonCode,
      draft,
    });
  }
  if (structured?.status === "revise_draft" || !structured) {
    return await startInputCoach({
      context: args.context,
      previous: active.draft ?? null,
      revisionRequest: args.context.userMessage,
      status: "revise_draft",
      reasonCode: structured?.reasonCode ??
        "active_platform_input_coach_default_revision",
      userIntent: "revise",
      previousTurnCount: Number(active.turn_count ?? 0) + 1,
      maxTurns: active.max_turns,
      createdAt: active.created_at,
    });
  }
  return null;
}

export async function maybeRunAdjustPlanItemOperation(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const activeHandoff = loadAdjustPlanFrameFromTempMemory(
    args.context.tempMemory,
  ).handoff_state;
  const selected = routeSelectsAdjustPlan(args.context, args.deps);
  if (!selected) return null;

  const localRuntime = await runAdjustPlanLocalFlow({
    context: args.context,
    deps: args.deps,
    activeHandoff,
  });
  if (localRuntime) return ensureRuntimeHasSkillResult(localRuntime);

  const active = await handleActiveInputCoach({ context: args.context });
  if (active) return ensureRuntimeHasSkillResult(active);

  const runtime = await startInputCoach({
    context: args.context,
    status: "draft_delivered",
    reasonCode: "adjust_plan_platform_input_coach_start",
    userIntent: "start",
  });
  return ensureRuntimeHasSkillResult(runtime);
}
