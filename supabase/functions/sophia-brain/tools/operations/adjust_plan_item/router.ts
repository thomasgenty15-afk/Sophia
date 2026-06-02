import { buildClarificationRequest } from "../../../clarification/contract.ts";
import type { ClarificationToolOutput } from "../../../clarification/contract.ts";
import type {
  AdjustPlanHandoffDraft,
  AdjustPlanHandoffStatus,
  AdjustPlanOperationRuntimeResult,
  AdjustPlanRouterContext,
  AdjustPlanScopeKind,
  AdjustPlanUserIntent,
} from "./contract.ts";
import {
  buildAdjustPlanHandoffDraft,
  buildAdjustPlanHandoffDraftFromContext,
  reviseAdjustPlanHandoffDraft,
} from "./handoff.ts";
import { runAdjustPlanItemIntake } from "./intake.ts";
import { renderAdjustPlanHandoffDraft } from "./renderer.ts";
import {
  clearAdjustPlanExecutableLegacyState,
  isAdjustPlanHandoffState,
  loadAdjustPlanFrameFromTempMemory,
  writeAdjustPlanHandoffState,
} from "./state.ts";
import {
  adjustPlanSkillResult,
  ensureRuntimeHasSkillResult,
} from "./runtime_adapter.ts";

type OperationInput = Record<string, unknown> | null;
type HandoffFollowupDecision = {
  status: AdjustPlanHandoffStatus;
  userIntent: AdjustPlanUserIntent;
  reasonCode: string;
};

export type AdjustPlanLifecycleDeps = {
  [key: string]: unknown;
  operationRouteIsSelected?: (args: any) => boolean;
  clarifyAdjustPlanAmbiguity?: (args: {
    request: ReturnType<typeof buildClarificationRequest>;
  }) => Promise<ClarificationToolOutput>;
};

export type AdjustPlanRouterDeps = AdjustPlanLifecycleDeps;

function nowIso(): string {
  return new Date().toISOString();
}

function recentMessagesForIntake(history: any[]) {
  return (history ?? [])
    .map((turn: any) => ({
      role: turn?.role === "assistant" ? "assistant" as const : "user" as const,
      content: String(turn?.content ?? "").trim(),
    }))
    .filter((turn) => turn.content)
    .slice(-12);
}

function turnFrameHasAdjustPlanIntent(turnFrame: unknown): boolean {
  const frame = turnFrame as any;
  const intents = Array.isArray(frame?.tool_skill_intents)
    ? frame.tool_skill_intents
    : [];
  return intents.some((intent: any) =>
    intent?.operation_type === "adjust_plan_item" &&
    intent?.confidence_band !== "low"
  ) || frame?.tool_skill_opportunity?.operation_type === "adjust_plan_item";
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
      turnFrameHasAdjustPlanIntent(context.turnFrame) ||
    turnFrameHasAdjustPlanIntent(context.turnFrame);
}

function scopeFromOperationInput(value: OperationInput): AdjustPlanScopeKind {
  const kind = String((value as any)?.scope?.kind ?? "").trim();
  if (
    kind === "specific_plan_item" || kind === "action_cluster" ||
    kind === "current_week" || kind === "current_level" ||
    kind === "whole_plan"
  ) return kind;
  const granularity = String(
    (value as any)?.target_granularity?.value ??
      (value as any)?.target_granularity ?? "",
  ).trim();
  if (granularity === "current_level" || granularity === "whole_plan") {
    return granularity;
  }
  if (granularity === "current_week" || granularity === "action_cluster") {
    return granularity;
  }
  return "unknown";
}

function activeOperationInput(tempMemory: any): OperationInput {
  const active = tempMemory?.__adjust_plan_handoff_state ??
    tempMemory?.__active_tool_skill_intake ??
    tempMemory?.active_tool_skill_intake;
  const input = active?.operation_input ?? active?.known_context ??
    active?.draft?.operation_input;
  return input && typeof input === "object" ? input as OperationInput : null;
}

function scopeKindFromStructuredAdjustPlanScope(
  value: unknown,
): AdjustPlanScopeKind {
  if (value === "specific_action") return "specific_plan_item";
  if (
    value === "specific_plan_item" ||
    value === "action_cluster" ||
    value === "current_week" ||
    value === "current_level" ||
    value === "whole_plan"
  ) return value;
  return "unknown";
}

function operationInputFromStructuredTurnFrame(
  context: AdjustPlanRouterContext,
): OperationInput {
  const intents = Array.isArray(context.turnFrame?.tool_skill_intents)
    ? context.turnFrame.tool_skill_intents
    : [];
  const intent = intents.find((candidate) =>
    candidate.operation_type === "adjust_plan_item" &&
    candidate.confidence_band !== "low"
  );
  if (!intent) return null;
  const operationInput = intent.operation_input;
  if (operationInput && typeof operationInput === "object") {
    return operationInput;
  }
  const payloadOperationInput = (intent.payload_hint as any)?.operation_input;
  if (payloadOperationInput && typeof payloadOperationInput === "object") {
    return payloadOperationInput as OperationInput;
  }
  const scopeKind = scopeKindFromStructuredAdjustPlanScope(
    intent.adjust_plan_scope ??
      (intent.payload_hint as any)?.adjust_plan_scope ??
      (intent.payload_hint as any)?.scope_kind,
  );
  if (scopeKind === "unknown" && !intent.target_hint) return null;
  return {
    scope: {
      kind: scopeKind,
      target_hint: intent.target_hint ?? null,
      label: intent.target_hint ?? null,
    },
    payload: intent.payload_hint ?? null,
  };
}

function mergeOperationInput(
  a: OperationInput,
  b: OperationInput,
): OperationInput {
  if (!a) return b;
  if (!b) return a;
  return {
    ...a,
    ...b,
    scope: (b as any).scope ?? (a as any).scope,
    intake_state: (a as any).intake_state ?? (b as any).intake_state,
    payload: (a as any).payload ?? (b as any).payload,
  };
}

function decisionFromStatus(
  status: AdjustPlanHandoffStatus,
  reasonCode: string,
): HandoffFollowupDecision | null {
  if (status === "apply_attempt") {
    return {
      status,
      userIntent: "approve",
      reasonCode,
    };
  }
  if (status === "repeat_handoff") {
    return {
      status,
      userIntent: "explain",
      reasonCode,
    };
  }
  if (status === "revise_handoff") {
    return {
      status,
      userIntent: "revise",
      reasonCode,
    };
  }
  if (status === "cancelled") {
    return {
      status,
      userIntent: "cancel",
      reasonCode,
    };
  }
  if (status === "topic_change") {
    return {
      status,
      userIntent: "topic_change",
      reasonCode,
    };
  }
  return null;
}

function structuredContinuationIntent(
  value: unknown,
): AdjustPlanHandoffStatus | null {
  const raw = String(value ?? "").trim();
  if (
    raw === "apply_attempt" ||
    raw === "repeat_handoff" ||
    raw === "revise_handoff" ||
    raw === "cancelled" ||
    raw === "topic_change"
  ) return raw;
  if (raw === "cancel_handoff") return "cancelled";
  return null;
}

function handoffFollowupFromStructuredContext(args: {
  context: AdjustPlanRouterContext;
  activeOperationType?: string | null;
}): HandoffFollowupDecision | null {
  const activeOperationType = args.activeOperationType ?? "adjust_plan_item";
  const arbitration = (args.context.routeDecision as any)
    ?.active_flow_arbitration;
  const arbitrationIntent = structuredContinuationIntent(
    arbitration?.continuation_intent,
  );
  if (arbitrationIntent) {
    return decisionFromStatus(
      arbitrationIntent,
      `active_handoff_structured_${arbitrationIntent}`,
    );
  }
  const confirmation = args.context.turnFrame?.confirmation_response;
  if (confirmation && confirmation.confidence_band !== "low") {
    if (confirmation.kind === "yes") {
      return decisionFromStatus(
        "apply_attempt",
        "confirmation_yes_is_handoff_apply_attempt",
      );
    }
    if (confirmation.kind === "no") {
      return decisionFromStatus(
        "cancelled",
        "confirmation_no_cancels_active_handoff",
      );
    }
    if (confirmation.kind === "topic_change") {
      return decisionFromStatus(
        "topic_change",
        "confirmation_topic_change_clears_active_handoff",
      );
    }
    if (confirmation.kind === "correction_to_pending") {
      return decisionFromStatus(
        "revise_handoff",
        "confirmation_correction_revises_active_handoff",
      );
    }
  }
  const intents = Array.isArray(args.context.turnFrame?.tool_skill_intents)
    ? args.context.turnFrame.tool_skill_intents
    : [];
  for (const intent of intents) {
    if (
      intent.operation_type !== activeOperationType ||
      intent.confidence_band === "low" ||
      intent.ambiguity !== "none"
    ) continue;
    const payloadIntent = structuredContinuationIntent(
      (intent.payload_hint as any)?.handoff_continuation_intent ??
        (intent.operation_input as any)?.handoff_continuation_intent,
    );
    if (payloadIntent) {
      return decisionFromStatus(
        payloadIntent,
        `tool_skill_intent_structured_${payloadIntent}`,
      );
    }
    if (intent.user_intent === "explain_only") {
      return decisionFromStatus(
        "repeat_handoff",
        "tool_skill_intent_explain_repeats_handoff",
      );
    }
    if (
      intent.user_intent === "adjust" ||
      intent.user_intent === "update" ||
      intent.user_intent === "create" ||
      intent.user_intent === "select"
    ) {
      return decisionFromStatus(
        "revise_handoff",
        "tool_skill_intent_updates_active_handoff",
      );
    }
  }
  return null;
}

export const __test__handoffFollowupFromStructuredContext =
  handoffFollowupFromStructuredContext;

function sanitizeClarificationContent(content: string): string {
  const cleaned = String(content ?? "")
    .replace(
      /\bJe dois d['’]abord verrouiller la derni[eè]re pr[eé]cision pour reprendre le brouillon proprement\s*:\s*/gi,
      "",
    )
    .replace(
      /\s*pour reprendre le brouillon proprement\s*[:;,]?\s*/gi,
      " ",
    )
    .replace(
      /\bJe dois reprendre le brouillon proprement\.?\s*/gi,
      "",
    )
    .replace(
      /\bAvant de reprendre le brouillon proprement,?\s*/gi,
      "",
    )
    .replace(/\bavant de te le montrer\.?\s*/gi, "")
    .replace(/\bavant de te montrer quoi que ce soit\.?\s*/gi, "")
    .replace(/\bavant de te montrer[^.?!]*[.?!]?\s*/gi, "")
    .replace(/\s+([.,])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || content;
}

function currentLevelAffectedItemsOnlyHandoff(args: {
  missingSlots: string[];
  operationInput: Record<string, unknown> | null;
}): boolean {
  const missing = args.missingSlots.map((slot) => String(slot).trim()).filter(
    Boolean,
  );
  if (!missing.length) return false;
  const scope = scopeFromOperationInput(args.operationInput);
  return scope === "current_level" &&
    missing.every((slot) => slot === "current_level.affected_items");
}

function actionGuidanceCanHandoff(args: {
  missingSlots: string[];
  operationInput: Record<string, unknown> | null;
}): boolean {
  if (scopeFromOperationInput(args.operationInput) !== "specific_plan_item") {
    return false;
  }
  const missing = args.missingSlots.map((slot) => String(slot).trim()).filter(
    Boolean,
  );
  const allowedMissingSlots = new Set([
    "draft_generation_retry_needed",
    "specific_plan_item.action_request_category",
    "specific_plan_item.reason",
  ]);
  if (
    missing.length > 0 &&
    !missing.every((slot) => allowedMissingSlots.has(slot))
  ) {
    return false;
  }
  const guidance = (args.operationInput as any)?.coaching_guidance;
  if (!guidance || typeof guidance !== "object") return false;
  const questions = Array.isArray(guidance.questions_to_clarify)
    ? guidance.questions_to_clarify.filter((question: unknown) =>
      String(question ?? "").trim()
    )
    : [];
  const recommendation = String(guidance.recommendation ?? "").trim();
  const confidence = String(guidance.confidence ?? "").trim();
  if (
    questions.length > 0 &&
    !(
      confidence === "high" &&
      missing.some((slot) => slot.startsWith("specific_plan_item."))
    )
  ) {
    return false;
  }
  return Boolean(recommendation) &&
    (confidence === "high" || confidence === "medium");
}

function wholePlanGuidanceCanHandoff(args: {
  missingSlots: string[];
  operationInput: Record<string, unknown> | null;
}): boolean {
  if (scopeFromOperationInput(args.operationInput) !== "whole_plan") {
    return false;
  }
  const missing = args.missingSlots.map((slot) => String(slot).trim()).filter(
    Boolean,
  );
  if (
    missing.length > 0 &&
    !missing.every((slot) => slot === "draft_generation_retry_needed")
  ) {
    return false;
  }
  const guidance = (args.operationInput as any)?.coaching_guidance;
  if (!guidance || typeof guidance !== "object") return false;
  const questions = Array.isArray(guidance.questions_to_clarify)
    ? guidance.questions_to_clarify.filter((question: unknown) =>
      String(question ?? "").trim()
    )
    : [];
  if (questions.length > 0) return false;
  const recommendation = String(guidance.recommendation ?? "").trim();
  if (!recommendation) return false;
  const candidateOperation = String(guidance.candidate_operation ?? "").trim();
  const changeFamily = String(guidance.change_family ?? "").trim();
  return candidateOperation === "reorder" ||
    changeFamily === "sequence_order_issue";
}

export const __test__sanitizeClarificationContent =
  sanitizeClarificationContent;
export const __test__currentLevelAffectedItemsOnlyHandoff =
  currentLevelAffectedItemsOnlyHandoff;
export const __test__actionGuidanceCanHandoff = actionGuidanceCanHandoff;
export const __test__wholePlanGuidanceCanHandoff = wholePlanGuidanceCanHandoff;

function traceForHandoff(args: {
  status: AdjustPlanHandoffStatus;
  userIntent: AdjustPlanUserIntent;
  reasonCode: string;
  draft?: AdjustPlanHandoffDraft | null;
  reply: string;
  missingSlots?: string[];
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    selected_handler: "adjust_plan_item",
    operation_type: "adjust_plan_item",
    status: args.status,
    reason_code: args.reasonCode,
    operation_id: null,
    handoff_draft: args.draft ?? null,
    missing_slots: args.missingSlots ?? [],
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
    },
    skill_result: adjustPlanSkillResult({
      status: args.status === "cancelled"
        ? "cancelled"
        : args.draft
        ? "handoff_delivered"
        : "ask_question",
      userIntent: args.userIntent,
      reply: args.reply,
      reasonCode: args.reasonCode,
    }),
    ...(args.extra ?? {}),
  };
}

function result(args: {
  content: string;
  nextTempMemory: any;
  status: AdjustPlanHandoffStatus;
  userIntent: AdjustPlanUserIntent;
  reasonCode: string;
  draft?: AdjustPlanHandoffDraft | null;
  missingSlots?: string[];
  extra?: Record<string, unknown>;
}): AdjustPlanOperationRuntimeResult {
  return {
    content: args.content,
    nextTempMemory: args.nextTempMemory,
    toolExecution: "platform_handoff" as any,
    executedTools: [],
    toolSkillRun: traceForHandoff({
      status: args.status,
      userIntent: args.userIntent,
      reasonCode: args.reasonCode,
      draft: args.draft ?? null,
      reply: args.content,
      missingSlots: args.missingSlots,
      extra: args.extra,
    }),
  };
}

async function maybeClarificationQuestion(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
  missingSlots: string[];
  knownContext: OperationInput;
}): Promise<string | null> {
  if (!args.deps.clarifyAdjustPlanAmbiguity) return null;
  const request = buildClarificationRequest({
    owner: "adjust_plan_handoff",
    ambiguity_kind: args.missingSlots.some((slot) => slot.includes("scope"))
      ? "scope"
      : "target",
    user_message: args.context.userMessage,
    recent_messages: recentMessagesForIntake(args.context.history),
    active_flow_state: null,
    known_context: args.knownContext ?? {},
    candidates: [
      {
        id: "specific_plan_item",
        label: "une action précise",
        description: "Ajuster une action du plan.",
        operation_type: "adjust_plan_item",
        surface_id: "plan",
        evidence: args.missingSlots,
      },
      {
        id: "current_week",
        label: "la semaine en cours",
        description: "Alléger seulement la charge immédiate.",
        operation_type: "adjust_plan_item",
        surface_id: "plan",
        evidence: args.missingSlots,
      },
      {
        id: "whole_plan",
        label: "tout le plan",
        description: "Revoir la trajectoire globale.",
        operation_type: "adjust_plan_item",
        surface_id: "plan",
        evidence: args.missingSlots,
      },
    ],
  });
  const output = await args.deps.clarifyAdjustPlanAmbiguity({ request });
  return output.status === "ask" || output.status === "still_ambiguous"
    ? output.question?.trim() || null
    : null;
}

function writeState(args: {
  tempMemory: any;
  status: AdjustPlanHandoffStatus;
  draft?: AdjustPlanHandoffDraft | null;
  operationInput?: OperationInput;
  previousTurnCount?: number;
  maxTurns?: number;
}): any {
  const created = nowIso();
  return writeAdjustPlanHandoffState(
    clearAdjustPlanExecutableLegacyState(args.tempMemory),
    {
      skill_id: "adjust_plan_item",
      mode: "platform_handoff",
      status: args.status,
      scope: args.draft?.scope.kind ?? scopeFromOperationInput(
        args.operationInput ?? null,
      ),
      draft: args.draft ?? null,
      operation_input: args.operationInput ?? null,
      turn_count: Number(args.previousTurnCount ?? 0),
      max_turns: Number(args.maxTurns ?? 6),
      created_at: created,
      updated_at: created,
      no_chat_mutation: true,
    },
  );
}

async function runIntakeToHandoff(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
  operationInput: OperationInput;
  previousTurnCount: number;
  source: "direct_user_request" | "active_handoff_revision" | "legacy_pending";
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const output = await runAdjustPlanItemIntake({
    user_id: args.context.userId,
    channel: args.context.channel,
    timezone: args.context.userTimezone,
    message: args.context.userMessage,
    source: args.source === "direct_user_request"
      ? "direct_user_request"
      : "recommendation_tool",
    trigger_message_id: args.context.sourceMessageId ??
      args.context.requestId ?? crypto.randomUUID(),
    safety_pregate_risk_band: args.context.safetyPregateOutput.risk_band,
    turn_count: args.previousTurnCount,
    recent_messages: recentMessagesForIntake(args.context.history),
    plan_snapshot: { items: args.context.planItemSnapshot ?? [] },
    operation_input: args.operationInput,
    force_ai_slot_filling: args.context.forceFullAi === true,
    force_coach_guidance: args.context.enableAdjustPlanCoachGuidance === true,
  });

  const operationInput = output.state_patch.operation_input ??
    args.operationInput;
  if (output.status === "pending_confirmation" && output.draft) {
    const draft = buildAdjustPlanHandoffDraft({
      draft: output.draft,
      operationInput,
    });
    const content = renderAdjustPlanHandoffDraft(draft);
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: "handoff_delivered",
      draft,
      operationInput,
      previousTurnCount: 0,
    });
    return result({
      content,
      nextTempMemory,
      status: "handoff_delivered",
      userIntent: "start",
      reasonCode: "platform_handoff_no_chat_mutation",
      draft,
      extra: {
        coaching_guidance: output.state_patch.operation_input
          ?.coaching_guidance ?? null,
        coaching_guidance_audit: output.state_patch.operation_input
          ?.coaching_guidance_audit ?? null,
      },
    });
  }

  const guidance = (operationInput as any)?.coaching_guidance;
  if (
    guidance &&
    (guidance.readiness === "draft_ready" ||
      Number(args.previousTurnCount) >= 3)
  ) {
    const draft = buildAdjustPlanHandoffDraftFromContext({
      userMessage: args.context.userMessage,
      operationInput,
      coachingGuidance: guidance,
    });
    const content = renderAdjustPlanHandoffDraft(draft);
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: "handoff_delivered",
      draft,
      operationInput,
      previousTurnCount: 0,
    });
    return result({
      content,
      nextTempMemory,
      status: "handoff_delivered",
      userIntent: "start",
      reasonCode: "platform_handoff_from_coaching_guidance",
      draft,
      extra: {
        coaching_guidance: guidance,
        coaching_guidance_audit: (operationInput as any)
          ?.coaching_guidance_audit ?? null,
      },
    });
  }

  const missingSlots = output.state_patch.missing_slots ?? [];
  if (
    currentLevelAffectedItemsOnlyHandoff({ missingSlots, operationInput })
  ) {
    const draft = buildAdjustPlanHandoffDraftFromContext({
      userMessage: args.context.userMessage,
      operationInput,
      coachingGuidance: guidance ?? null,
    });
    const handoffDraft: AdjustPlanHandoffDraft = {
      ...draft,
      missing_decisions: draft.missing_decisions.length
        ? draft.missing_decisions
        : [
          "choisir dans Plan les actions prioritaires à garder sur la période concernée",
        ],
    };
    const content = renderAdjustPlanHandoffDraft(handoffDraft);
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: "handoff_delivered",
      draft: handoffDraft,
      operationInput,
      previousTurnCount: 0,
    });
    return result({
      content,
      nextTempMemory,
      status: "handoff_delivered",
      userIntent: "start",
      reasonCode: "current_level_partial_scope_platform_handoff",
      draft: handoffDraft,
      missingSlots,
      extra: {
        coaching_guidance: guidance ?? null,
        coaching_guidance_audit:
          (operationInput as any)?.coaching_guidance_audit ?? null,
      },
    });
  }
  if (
    actionGuidanceCanHandoff({ missingSlots, operationInput })
  ) {
    const draft = buildAdjustPlanHandoffDraftFromContext({
      userMessage: args.context.userMessage,
      operationInput,
      coachingGuidance: guidance ?? null,
    });
    const content = renderAdjustPlanHandoffDraft(draft);
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: "handoff_delivered",
      draft,
      operationInput,
      previousTurnCount: 0,
    });
    return result({
      content,
      nextTempMemory,
      status: "handoff_delivered",
      userIntent: "start",
      reasonCode: "action_guidance_platform_handoff",
      draft,
      missingSlots,
      extra: {
        coaching_guidance: guidance ?? null,
        coaching_guidance_audit:
          (operationInput as any)?.coaching_guidance_audit ?? null,
      },
    });
  }
  if (
    wholePlanGuidanceCanHandoff({ missingSlots, operationInput })
  ) {
    const draft = buildAdjustPlanHandoffDraftFromContext({
      userMessage: args.context.userMessage,
      operationInput,
      coachingGuidance: guidance ?? null,
    });
    const content = renderAdjustPlanHandoffDraft(draft);
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: "handoff_delivered",
      draft,
      operationInput,
      previousTurnCount: 0,
    });
    return result({
      content,
      nextTempMemory,
      status: "handoff_delivered",
      userIntent: "start",
      reasonCode: "whole_plan_guidance_platform_handoff",
      draft,
      missingSlots,
      extra: {
        coaching_guidance: guidance ?? null,
        coaching_guidance_audit:
          (operationInput as any)?.coaching_guidance_audit ?? null,
      },
    });
  }
  const clarification = output.status === "ask_question"
    ? await maybeClarificationQuestion({
      context: args.context,
      deps: args.deps,
      missingSlots,
      knownContext: operationInput,
    })
    : null;
  const content = sanitizeClarificationContent(
    clarification ??
      output.next_question?.question ??
      output.ack ??
      "Je peux te guider, mais il me manque une précision avant de formuler la recommandation à reprendre dans Plan.",
  );
  const nextTempMemory = writeState({
    tempMemory: args.context.tempMemory,
    status: "clarifying",
    operationInput,
    previousTurnCount: args.previousTurnCount + 1,
  });
  return result({
    content,
    nextTempMemory,
    status: "clarifying",
    userIntent: "clarify",
    reasonCode: "adjust_plan_handoff_clarifying",
    missingSlots,
    extra: {
      coaching_guidance: guidance ?? null,
      coaching_guidance_audit:
        (operationInput as any)?.coaching_guidance_audit ??
          null,
    },
  });
}

async function handleActiveHandoff(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const active = loadAdjustPlanFrameFromTempMemory(args.context.tempMemory)
    .handoff_state;
  if (!active) return null;
  const followup = handoffFollowupFromStructuredContext({
    context: args.context,
    activeOperationType: "adjust_plan_item",
  });
  if (!followup) {
    return await runIntakeToHandoff({
      context: args.context,
      deps: args.deps,
      operationInput: active.operation_input ?? null,
      previousTurnCount: Number(active.turn_count ?? 0) + 1,
      source: "active_handoff_revision",
    });
  }
  if (followup.status === "cancelled" || followup.status === "topic_change") {
    const nextTempMemory = writeAdjustPlanHandoffState(
      clearAdjustPlanExecutableLegacyState(args.context.tempMemory),
      null,
    );
    return result({
      content:
        "Ok, je laisse cet ajustement de côté. Le plan reste inchangé ici.",
      nextTempMemory,
      status: followup.status,
      userIntent: followup.userIntent,
      reasonCode: followup.reasonCode,
    });
  }
  const draft = active.draft ?? null;
  if (
    followup.status === "apply_attempt" ||
    followup.status === "repeat_handoff"
  ) {
    if (!draft) {
      return await runIntakeToHandoff({
        context: args.context,
        deps: args.deps,
        operationInput: active.operation_input ?? null,
        previousTurnCount: Number(active.turn_count ?? 0),
        source: "direct_user_request",
      });
    }
    const content = renderAdjustPlanHandoffDraft(draft, {
      destinationOnly: false,
      compact: false,
    });
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: followup.status,
      draft,
      operationInput: active.operation_input ?? null,
      previousTurnCount: Number(active.turn_count ?? 0) + 1,
      maxTurns: active.max_turns,
    });
    return result({
      content,
      nextTempMemory,
      status: followup.status,
      userIntent: followup.userIntent,
      reasonCode: followup.reasonCode,
      draft,
    });
  }
  if (followup.status === "revise_handoff") {
    if (draft) {
      const revisedDraft = reviseAdjustPlanHandoffDraft({
        previous: draft,
        revisionRequest: args.context.userMessage,
      });
      const content = renderAdjustPlanHandoffDraft(revisedDraft);
      const nextTempMemory = writeState({
        tempMemory: args.context.tempMemory,
        status: "revise_handoff",
        draft: revisedDraft,
        operationInput: active.operation_input ?? null,
        previousTurnCount: Number(active.turn_count ?? 0) + 1,
        maxTurns: active.max_turns,
      });
      return result({
        content,
        nextTempMemory,
        status: "revise_handoff",
        userIntent: "revise",
        reasonCode: followup.reasonCode,
        draft: revisedDraft,
      });
    }
    const mergedInput = mergeOperationInput(active.operation_input ?? null, {
      previous_handoff_draft: draft,
      revision_request: args.context.userMessage,
    });
    const revised = await runIntakeToHandoff({
      context: args.context,
      deps: args.deps,
      operationInput: mergedInput,
      previousTurnCount: Number(active.turn_count ?? 0) + 1,
      source: "active_handoff_revision",
    });
    if (revised) return revised;
  }
  if (draft) {
    const content = renderAdjustPlanHandoffDraft(draft);
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: "repeat_handoff",
      draft,
      operationInput: active.operation_input ?? null,
      previousTurnCount: Number(active.turn_count ?? 0) + 1,
      maxTurns: active.max_turns,
    });
    return result({
      content,
      nextTempMemory,
      status: "repeat_handoff",
      userIntent: "explain",
      reasonCode: "active_handoff_repeat_fallback",
      draft,
    });
  }
  return null;
}

function legacyPendingDraft(tempMemory: any): {
  draft: any;
  operation_input?: OperationInput;
  operation_id?: string | null;
} | null {
  const frame = loadAdjustPlanFrameFromTempMemory(tempMemory);
  const pending = frame.pending_draft_review ?? frame.pending_confirmation;
  if (!pending?.draft) return null;
  return {
    draft: pending.draft,
    operation_input: pending.operation_input ?? null,
    operation_id: pending.operation_id ?? null,
  };
}

export async function maybeRunAdjustPlanItemOperation(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const active = await handleActiveHandoff(args);
  if (active) return ensureRuntimeHasSkillResult(active);

  const pending = legacyPendingDraft(args.context.tempMemory);
  if (pending) {
    const followup = handoffFollowupFromStructuredContext({
      context: args.context,
      activeOperationType: "adjust_plan_item",
    }) ?? {
      status: "handoff_delivered" as const,
      userIntent: "start" as const,
      reasonCode: "legacy_pending_converted_to_platform_handoff",
    };
    if (followup.status === "cancelled" || followup.status === "topic_change") {
      const nextTempMemory = writeAdjustPlanHandoffState(
        clearAdjustPlanExecutableLegacyState(args.context.tempMemory),
        null,
      );
      return ensureRuntimeHasSkillResult(result({
        content:
          "Ok, je laisse cet ajustement de côté. Le plan reste inchangé ici.",
        nextTempMemory,
        status: followup.status,
        userIntent: followup.userIntent,
        reasonCode: followup.reasonCode,
      }));
    }
    const baseDraft = buildAdjustPlanHandoffDraft({
      draft: pending.draft,
      operationInput: pending.operation_input ?? null,
    });
    const draft = followup.status === "revise_handoff"
      ? reviseAdjustPlanHandoffDraft({
        previous: baseDraft,
        revisionRequest: args.context.userMessage,
      })
      : baseDraft;
    const content = renderAdjustPlanHandoffDraft(draft);
    const nextTempMemory = writeState({
      tempMemory: args.context.tempMemory,
      status: followup.status === "apply_attempt" ||
          followup.status === "repeat_handoff" ||
          followup.status === "revise_handoff"
        ? followup.status
        : "handoff_delivered",
      draft,
      operationInput: pending.operation_input ?? null,
    });
    return ensureRuntimeHasSkillResult(result({
      content,
      nextTempMemory,
      status: followup.status === "apply_attempt" ||
          followup.status === "repeat_handoff" ||
          followup.status === "revise_handoff"
        ? followup.status
        : "handoff_delivered",
      userIntent: followup.status === "apply_attempt" ||
          followup.status === "repeat_handoff" ||
          followup.status === "revise_handoff"
        ? followup.userIntent
        : "start",
      reasonCode: followup.status === "apply_attempt"
        ? "legacy_pending_apply_attempt_no_chat_mutation"
        : followup.status === "repeat_handoff"
        ? "legacy_pending_repeat_platform_handoff"
        : followup.status === "revise_handoff"
        ? "legacy_pending_revised_platform_handoff"
        : "legacy_pending_converted_to_platform_handoff",
      draft,
    }));
  }

  const activeInput = activeOperationInput(args.context.tempMemory);
  const scopedInput = operationInputFromStructuredTurnFrame(args.context);
  const operationInput = mergeOperationInput(activeInput, scopedInput);
  const selected = routeSelectsAdjustPlan(args.context, args.deps) ||
    isAdjustPlanHandoffState(
      (args.context.tempMemory ?? {}).__adjust_plan_handoff_state,
    ) ||
    Boolean(activeInput);
  if (!selected && !operationInput) return null;

  const runtime = await runIntakeToHandoff({
    context: args.context,
    deps: args.deps,
    operationInput,
    previousTurnCount: Number(
      ((args.context.tempMemory ?? {}).__adjust_plan_handoff_state as any)
        ?.turn_count ?? 0,
    ),
    source: "direct_user_request",
  });
  return runtime ? ensureRuntimeHasSkillResult(runtime) : null;
}
