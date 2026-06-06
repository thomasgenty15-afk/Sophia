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
      operation_input: null,
      turn_count: Number(args.previousTurnCount ?? 0),
      max_turns: Number(args.maxTurns ?? 6),
      created_at: args.createdAt ?? now,
      updated_at: now,
      no_chat_mutation: true,
    },
  );
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
  const active = await handleActiveInputCoach({ context: args.context });
  if (active) return ensureRuntimeHasSkillResult(active);

  const selected = routeSelectsAdjustPlan(args.context, args.deps);
  if (!selected) return null;
  const runtime = await startInputCoach({
    context: args.context,
    status: "draft_delivered",
    reasonCode: "adjust_plan_platform_input_coach_start",
    userIntent: "start",
  });
  return ensureRuntimeHasSkillResult(runtime);
}
