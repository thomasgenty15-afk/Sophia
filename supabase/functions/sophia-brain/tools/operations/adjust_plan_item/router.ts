import { createConfirmationToken } from "../../../confirmation/confirmation_token.ts";
import { executeAdjustPlanItem } from "./executor.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import { runAdjustPlanItemIntake } from "./intake.ts";
import type {
  AdjustPlanCommittedEffect,
  AdjustPlanEffect,
  AdjustPlanOperationRuntimeResult,
  AdjustPlanRouterContext,
  AdjustPlanSkillResult,
  AdjustPlanUserIntent,
} from "./contract.ts";
import {
  adjustmentExecutionAck as defaultAdjustmentExecutionAck,
  isAdjustPlanDraftRewriteRequest as defaultIsAdjustPlanDraftRewriteRequest,
  renderLastAdjustPlanDetails as defaultRenderLastAdjustPlanDetails,
  renderPendingAdjustPlanDraftDetails
    as defaultRenderPendingAdjustPlanDraftDetails,
  renderPendingAdjustPlanDraftQuestionAnswer
    as defaultRenderPendingAdjustPlanDraftQuestionAnswer,
  revisePendingAdjustPlanDraftDeterministically
    as defaultRevisePendingAdjustPlanDraftDeterministically,
  wholePlanDraftNuanceLine as defaultWholePlanDraftNuanceLine,
} from "./draft_review.ts";
import {
  clearAdjustPlanFrame,
  isPendingAdjustPlanDraftReview,
  isPendingAdjustPlanItemOperation,
  pendingOperationType,
  writeLastAdjustPlanExecution,
} from "./state.ts";
import {
  buildAdjustPlanConfirmationDecision,
  legacyAdjustPlanApproveReview,
} from "./confirmation.ts";
import {
  buildWeeklyCopyForwardPendingReview
    as defaultBuildWeeklyCopyForwardPendingReview,
  buildWeeklyExactAdjustPlanPendingReview
    as defaultBuildWeeklyExactAdjustPlanPendingReview,
  buildWeeklyLightRepeatPendingReview
    as defaultBuildWeeklyLightRepeatPendingReview,
  buildWeeklyMissionCarryOverPendingReview
    as defaultBuildWeeklyMissionCarryOverPendingReview,
  patchPendingAdjustPlanWithWeeklyExactProposal
    as defaultPatchPendingAdjustPlanWithWeeklyExactProposal,
  weeklyExactProposalFromConversation
    as defaultWeeklyExactProposalFromConversation,
} from "./weekly_bridge.ts";

type ExecutableAdjustPlanPending = {
  operation_id?: string;
  operation_type?: "adjust_plan_item";
  draft: PlanAdjustmentDraftV1;
  operation_input?: Record<string, unknown> | null;
};

export type AdjustPlanPatchWriter = (args: {
  draft: PlanAdjustmentDraftV1;
  operationInput?: Record<string, unknown> | null;
  operationId: string;
  requestId?: string | null;
  sourceMessageId?: string | null;
  patch: Record<string, unknown>;
}) => Promise<{
  plan_patch_id: string;
  bridge_plan_item_id?: string | null;
}>;

export type AdjustPlanRouterDeps = {
  writePlanPatch: AdjustPlanPatchWriter;
  renderExecutionAck?: (args: {
    draft?: PlanAdjustmentDraftV1 | null;
    operationInput?: Record<string, unknown> | null;
    fallbackAck?: string | null;
  }) => string;
};

type DraftReviewDecision = {
  decision?: string;
  confidence?: string;
  evidence?: unknown[];
  apply_after_revision?: boolean;
};

export type AdjustPlanLifecycleDeps = AdjustPlanRouterDeps & {
  isExplicitPendingApplyConfirmation: (message: string) => boolean;
  isWeeklyMissionCarryOverRequest: (message: string) => boolean;
  weeklyMissionCarryOverContext: (args: {
    userMessage: string;
    history: any[];
  }) => boolean;
  isCopyForwardWeeklyRequest: (message: string) => boolean;
  isWeeklyLightRepeatRequest: (message: string) => boolean;
  weeklyAdaptiveReviewStateForTurn: (args: {
    activeSkillState: unknown;
    tempMemory: any;
  }) => unknown;
  weeklyExactProposalFromConversation?: (args: {
    userMessage: string;
    history: any[];
    tempMemory: any;
    weeklyState?: unknown;
    planItemSnapshot?: any[] | null;
  }) => any | null;
  patchPendingAdjustPlanWithWeeklyExactProposal?: (args: {
    pending: any;
    proposal: any;
  }) => any;
  buildWeeklyMissionCarryOverPendingReview?: (args: {
    weeklyState?: unknown;
    planItemSnapshot?: any[] | null;
  }) => ExecutableAdjustPlanPending;
  buildWeeklyCopyForwardPendingReview?: (args: {
    planItemSnapshot?: any[] | null;
  }) => ExecutableAdjustPlanPending;
  buildWeeklyLightRepeatPendingReview?: (args: {
    weeklyState?: unknown;
    planItemSnapshot?: any[] | null;
  }) => ExecutableAdjustPlanPending;
  buildWeeklyExactAdjustPlanPendingReview?: (args: {
    proposal: any;
  }) => ExecutableAdjustPlanPending;
  isAdjustPlanDraftRewriteRequest?: (message: string) => boolean;
  renderPendingAdjustPlanDraftQuestionAnswer?: (
    raw: any,
    userMessage: string,
  ) => string | null;
  revisePendingAdjustPlanDraftDeterministically?: (args: {
    pending: { draft: PlanAdjustmentDraftV1 };
    userMessage: string;
  }) => PlanAdjustmentDraftV1 | null;
  normalizeRecommendationText: (value: unknown) => string;
  wholePlanDraftNuanceLine?: (userMessage: string) => string | null;
  renderPendingAdjustPlanDraftDetails?: (tempMemory: any) => string | null;
  renderLastAdjustPlanDetails?: (tempMemory: any) => string | null;
  isAdjustPlanExplainOnlyIntent: (turnFrame: any) => boolean;
  isAdjustPlanRevisionIntent: (turnFrame: any) => boolean;
  operationRouteIsSelected: (args: {
    operationType: string;
    routeDecision: any;
    turnFrame: any;
    tempMemory: any;
  }) => boolean;
  operationInputFromPlanAdjustmentScope: (
    message: string,
    turnFrame: any,
  ) => Record<string, unknown> | null;
  isVagueWholePlanWeeklyAdjustmentRequest: (
    message: string,
    scopedOperationInput: Record<string, unknown> | null,
  ) => boolean;
  isPendingAdjustPlanItemRecommendationOperation: (value: unknown) => boolean;
  isBroaderPlanAdjustmentInput: (
    value: Record<string, unknown> | null,
  ) => boolean;
  isAmbivalentAdjustPlanReflectionRequest: (message: string) => boolean;
  isOperationEscapeMessage: (message: string) => boolean;
  hasStrongToolSkillIntent: (
    turnFrame: any,
    operationType?: string,
  ) => boolean;
  readLastResolvedPlanItem: (tempMemory: any) => Record<string, unknown> | null;
  resolvePlanItemTargetFromToolSkillIntent: (
    turnFrame: any,
    operationType: string,
    planItems?: any[] | null,
  ) => any | null;
  writeLastResolvedPlanItem: (
    tempMemory: any,
    item: any,
    source: string,
  ) => any;
  mergeActiveAdjustPlanOperationInput: (args: {
    active: Record<string, unknown> | null;
    scoped: Record<string, unknown> | null;
  }) => Record<string, unknown> | null;
  operationInputFromLastPlanItem: (
    tempMemory: any,
  ) => Record<string, unknown> | null;
  planItemTitleFromOperationInput: (
    operationInput?: Record<string, unknown> | null,
  ) => string | null;
};

type SkillOwnedLifecycleDepKeys =
  | "renderExecutionAck"
  | "weeklyExactProposalFromConversation"
  | "patchPendingAdjustPlanWithWeeklyExactProposal"
  | "buildWeeklyMissionCarryOverPendingReview"
  | "buildWeeklyCopyForwardPendingReview"
  | "buildWeeklyLightRepeatPendingReview"
  | "buildWeeklyExactAdjustPlanPendingReview"
  | "isAdjustPlanDraftRewriteRequest"
  | "renderPendingAdjustPlanDraftQuestionAnswer"
  | "revisePendingAdjustPlanDraftDeterministically"
  | "wholePlanDraftNuanceLine"
  | "renderPendingAdjustPlanDraftDetails"
  | "renderLastAdjustPlanDetails";

type ResolvedAdjustPlanLifecycleDeps =
  & Omit<AdjustPlanLifecycleDeps, SkillOwnedLifecycleDepKeys>
  & Required<Pick<AdjustPlanLifecycleDeps, SkillOwnedLifecycleDepKeys>>;

type RuntimeAdapterInput = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  skillResult: AdjustPlanSkillResult;
  toolSkillRun?: Record<string, unknown>;
  toolExecution?: AdjustPlanOperationRuntimeResult["toolExecution"];
};

function adjustPlanEffect(args: {
  operationId: string;
  draft: PlanAdjustmentDraftV1;
}): AdjustPlanEffect {
  return {
    type: "adjust_plan_item",
    operation_id: args.operationId,
    draft: args.draft,
  };
}

function adjustPlanSkillResult(args: {
  handled?: boolean;
  status: AdjustPlanSkillResult["status"];
  userIntent: AdjustPlanUserIntent;
  reply: string | null;
  reasonCode: string;
  draft?: PlanAdjustmentDraftV1 | null;
  operationId?: string | null;
  requestedEffects?: AdjustPlanEffect[];
  allowedEffects?: AdjustPlanEffect[];
  blockedEffects?: Array<{ type: string; reason_code: string }>;
  committedEffects?: AdjustPlanCommittedEffect[];
  pendingConfirmation?: Record<string, unknown> | null;
  subSkillTrace?: unknown;
  updatedState?: AdjustPlanSkillResult["updated_state"];
}): AdjustPlanSkillResult {
  const requestedEffects = args.requestedEffects ??
    (args.draft && args.operationId
      ? [adjustPlanEffect({ operationId: args.operationId, draft: args.draft })]
      : []);
  return {
    handled: args.handled ?? true,
    status: args.status,
    user_intent: args.userIntent,
    updated_state: args.updatedState,
    reply: args.reply,
    requested_effects: requestedEffects,
    allowed_effects: args.allowedEffects ?? [],
    blocked_effects: args.blockedEffects ?? [],
    committed_effects: args.committedEffects ?? [],
    pending_confirmation: args.pendingConfirmation ?? null,
    debug: {
      reason_code: args.reasonCode,
      sub_skill_trace: args.subSkillTrace,
    },
  };
}

function adaptSkillResultToRuntime(
  input: RuntimeAdapterInput,
): AdjustPlanOperationRuntimeResult {
  const committed = input.skillResult.committed_effects;
  const toolExecution = input.toolExecution ??
    (committed.length > 0
      ? "success"
      : input.skillResult.status === "failed"
      ? "failed"
      : input.skillResult.status === "blocked" ||
          input.skillResult.status === "cancelled" ||
          input.skillResult.status === "revised"
      ? "blocked"
      : "none");
  return {
    content: input.content,
    additionalContents: input.additionalContents,
    nextTempMemory: input.nextTempMemory,
    toolExecution,
    executedTools: committed.length > 0 ? ["adjust_plan_item"] : [],
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      status: input.skillResult.status,
      reason_code: input.skillResult.debug.reason_code,
      requested_effects: input.skillResult.requested_effects,
      allowed_effects: input.skillResult.allowed_effects,
      blocked_effects: input.skillResult.blocked_effects,
      committed_effects: committed,
      skill_result: input.skillResult,
      user_intent: input.skillResult.user_intent,
      ...(input.toolSkillRun ?? {}),
    },
  };
}

function skillStatusFromRuntimeStatus(
  value: unknown,
  toolExecution: AdjustPlanOperationRuntimeResult["toolExecution"],
): AdjustPlanSkillResult["status"] {
  const status = String(value ?? "");
  if (
    status === "draft_review" || status === "draft_review_from_recommendation"
  ) {
    return "draft_review";
  }
  if (status === "draft_review_updated") return "revised";
  if (
    status === "draft_review_details" ||
    status === "answered_last_adjustment_details"
  ) {
    return "explained";
  }
  if (
    status === "draft_review_cancelled" ||
    status === "recommendation_cancelled"
  ) return "cancelled";
  if (status === "pending_confirmation") return "pending_confirmation";
  if (status === "ask_question" || status === "collecting") {
    return "ask_question";
  }
  if (toolExecution === "failed") return "failed";
  if (toolExecution === "success") return "executed";
  if (toolExecution === "blocked") return "blocked";
  return "ask_question";
}

function ensureRuntimeHasSkillResult(
  result: AdjustPlanOperationRuntimeResult,
): AdjustPlanOperationRuntimeResult {
  const existing = (result.toolSkillRun as any)?.skill_result;
  if (existing && typeof existing === "object") return result;
  const committed =
    Array.isArray((result.toolSkillRun as any)?.committed_effects)
      ? (result.toolSkillRun as any).committed_effects
      : [];
  const skillResult = adjustPlanSkillResult({
    status: skillStatusFromRuntimeStatus(
      (result.toolSkillRun as any)?.status,
      result.toolExecution,
    ),
    userIntent: "unknown",
    reply: result.content,
    reasonCode: String(
      (result.toolSkillRun as any)?.reason_code ?? "runtime_adapter",
    ),
    committedEffects: committed,
  });
  return adaptSkillResultToRuntime({
    content: result.content,
    additionalContents: result.additionalContents,
    nextTempMemory: result.nextTempMemory,
    skillResult,
    toolExecution: result.toolExecution,
    toolSkillRun: result.toolSkillRun,
  });
}

function resolveSkillLifecycleDeps(
  deps: AdjustPlanLifecycleDeps,
): ResolvedAdjustPlanLifecycleDeps {
  return {
    ...deps,
    renderExecutionAck: deps.renderExecutionAck ??
      defaultAdjustmentExecutionAck,
    weeklyExactProposalFromConversation:
      deps.weeklyExactProposalFromConversation ??
        defaultWeeklyExactProposalFromConversation,
    patchPendingAdjustPlanWithWeeklyExactProposal:
      deps.patchPendingAdjustPlanWithWeeklyExactProposal ??
        defaultPatchPendingAdjustPlanWithWeeklyExactProposal,
    buildWeeklyMissionCarryOverPendingReview:
      deps.buildWeeklyMissionCarryOverPendingReview ??
        defaultBuildWeeklyMissionCarryOverPendingReview,
    buildWeeklyCopyForwardPendingReview:
      deps.buildWeeklyCopyForwardPendingReview ??
        defaultBuildWeeklyCopyForwardPendingReview,
    buildWeeklyLightRepeatPendingReview:
      deps.buildWeeklyLightRepeatPendingReview ??
        defaultBuildWeeklyLightRepeatPendingReview,
    buildWeeklyExactAdjustPlanPendingReview:
      deps.buildWeeklyExactAdjustPlanPendingReview ??
        defaultBuildWeeklyExactAdjustPlanPendingReview,
    renderPendingAdjustPlanDraftQuestionAnswer:
      deps.renderPendingAdjustPlanDraftQuestionAnswer ??
        defaultRenderPendingAdjustPlanDraftQuestionAnswer,
    isAdjustPlanDraftRewriteRequest: deps.isAdjustPlanDraftRewriteRequest ??
      defaultIsAdjustPlanDraftRewriteRequest,
    revisePendingAdjustPlanDraftDeterministically:
      deps.revisePendingAdjustPlanDraftDeterministically ??
        defaultRevisePendingAdjustPlanDraftDeterministically,
    wholePlanDraftNuanceLine: deps.wholePlanDraftNuanceLine ??
      defaultWholePlanDraftNuanceLine,
    renderPendingAdjustPlanDraftDetails:
      deps.renderPendingAdjustPlanDraftDetails ??
        defaultRenderPendingAdjustPlanDraftDetails,
    renderLastAdjustPlanDetails: deps.renderLastAdjustPlanDetails ??
      defaultRenderLastAdjustPlanDetails,
  };
}

function adjustPlanCoachTrace(
  operationInput?: Record<string, unknown> | null,
): Record<string, unknown> {
  const input = operationInput && typeof operationInput === "object"
    ? operationInput as Record<string, unknown>
    : {};
  return {
    coaching_guidance: input.coaching_guidance ?? null,
    coaching_guidance_audit: input.coaching_guidance_audit ?? null,
  };
}

function pendingScopeKind(
  pendingRaw: ExecutableAdjustPlanPending,
): string {
  return String(
    (pendingRaw.operation_input as any)?.scope?.kind ??
      (pendingRaw.operation_input as any)?.intake_state?.scope?.kind ??
      (pendingRaw.draft as any)?.draft?.patch?.scope_kind ??
      (pendingRaw.draft as any)?.draft?.adjust_plan_result?.scope ??
      "",
  ).trim();
}

function missingSpecificPlanItemId(
  pendingRaw: ExecutableAdjustPlanPending,
): boolean {
  const scopeKind = pendingScopeKind(pendingRaw);
  return (!scopeKind || scopeKind === "specific_plan_item") &&
    !String((pendingRaw.operation_input as any)?.scope?.plan_item_id ?? "")
      .trim();
}

export async function executePendingAdjustPlanDraft(args: {
  context: Pick<
    AdjustPlanRouterContext,
    | "userId"
    | "safetyPregateOutput"
    | "sourceMessageId"
    | "requestId"
    | "confirmationSecret"
  >;
  nextTempMemory: any;
  pendingRaw: ExecutableAdjustPlanPending;
  deps: AdjustPlanRouterDeps;
}): Promise<AdjustPlanOperationRuntimeResult> {
  const operationId = String(
    args.pendingRaw.operation_id ?? crypto.randomUUID(),
  );
  if (missingSpecificPlanItemId(args.pendingRaw)) {
    let nextTempMemory = clearAdjustPlanFrame(args.nextTempMemory);
    nextTempMemory = { ...nextTempMemory };
    const content =
      'Je ne l\'applique pas automatiquement, parce que je n\'ai pas retrouvé cette action comme item réel du dashboard. Proposition prête à copier : remplace "ranger tous mes papiers" par "trier seulement trois documents". Applique-la depuis ton dashboard pour que le plan canonique reste exact.';
    const requestedEffect = adjustPlanEffect({
      operationId,
      draft: args.pendingRaw.draft,
    });
    return adaptSkillResultToRuntime({
      content,
      nextTempMemory,
      toolExecution: "blocked",
      skillResult: adjustPlanSkillResult({
        status: "blocked",
        userIntent: "approve",
        reply: content,
        reasonCode: "not_executed_missing_plan_item_id",
        requestedEffects: [requestedEffect],
        blockedEffects: [{
          type: "adjust_plan_item",
          reason_code: "not_executed_missing_plan_item_id",
        }],
      }),
      toolSkillRun: {
        status: "not_executed_missing_plan_item_id",
        operation_id: operationId,
        ...adjustPlanCoachTrace(args.pendingRaw.operation_input),
      },
    });
  }

  const token = await createConfirmationToken({
    user_id: args.context.userId,
    operation_id: operationId,
    operation_type: "adjust_plan_item",
    draft: args.pendingRaw.draft,
    source_message_id: args.context.sourceMessageId ??
      args.context.requestId ??
      crypto.randomUUID(),
    pending_confirmation_id: operationId,
    secret: args.context.confirmationSecret,
  });
  const executed = await executeAdjustPlanItem({
    operation_id: operationId,
    user_id: args.context.userId,
    draft: args.pendingRaw.draft,
    token,
    safety_pregate_risk_band: args.context.safetyPregateOutput.risk_band,
    pending_confirmation_lookup: async (id) =>
      id === operationId ? { consumed: false } : null,
    token_consumption_check: async () => false,
    write_plan_patch: async (patch) => {
      if (!patch || Object.keys(patch).length === 0) {
        throw new Error("plan_patch_empty");
      }
      return await args.deps.writePlanPatch({
        draft: args.pendingRaw.draft,
        operationInput: args.pendingRaw.operation_input ?? null,
        operationId,
        requestId: args.context.requestId ?? null,
        sourceMessageId: args.context.sourceMessageId,
        patch,
      });
    },
    secret: args.context.confirmationSecret,
  });

  let nextTempMemory = clearAdjustPlanFrame(args.nextTempMemory);
  if (executed.status !== "executed") {
    const requestedEffect = adjustPlanEffect({
      operationId,
      draft: args.pendingRaw.draft,
    });
    return adaptSkillResultToRuntime({
      content: executed.ack,
      nextTempMemory,
      toolExecution: "blocked",
      skillResult: adjustPlanSkillResult({
        status: "blocked",
        userIntent: "approve",
        reply: executed.ack,
        reasonCode: executed.reason_code,
        requestedEffects: [requestedEffect],
        blockedEffects: [{
          type: "adjust_plan_item",
          reason_code: executed.reason_code,
        }],
        updatedState: executed.tool_skill_state,
      }),
      toolSkillRun: {
        status: executed.status,
        operation_id: operationId,
        ...adjustPlanCoachTrace(args.pendingRaw.operation_input),
      },
    });
  }

  nextTempMemory = writeLastAdjustPlanExecution(nextTempMemory, {
    operation_id: operationId,
    plan_patch_id: executed.plan_patch_id,
    draft: args.pendingRaw.draft,
    operation_input: args.pendingRaw.operation_input ?? null,
    created_at: new Date().toISOString(),
  });
  const renderExecutionAck = args.deps.renderExecutionAck ??
    defaultAdjustmentExecutionAck;
  const content = renderExecutionAck({
    draft: args.pendingRaw.draft,
    operationInput: args.pendingRaw.operation_input ?? null,
    fallbackAck: executed.ack,
  }) || executed.ack;
  const requestedEffect = adjustPlanEffect({
    operationId,
    draft: args.pendingRaw.draft,
  });
  const committedEffect: AdjustPlanCommittedEffect = {
    ...requestedEffect,
    plan_patch_id: executed.plan_patch_id,
    bridge_plan_item_id: executed.bridge_plan_item_id ?? null,
  };
  return adaptSkillResultToRuntime({
    content,
    nextTempMemory,
    skillResult: adjustPlanSkillResult({
      status: "executed",
      userIntent: "approve",
      reply: content,
      reasonCode: "adjust_plan_executed",
      requestedEffects: [requestedEffect],
      allowedEffects: [requestedEffect],
      committedEffects: [committedEffect],
      updatedState: executed.tool_skill_state,
    }),
    toolSkillRun: {
      operation_id: operationId,
      plan_patch_id: executed.plan_patch_id,
      bridge_plan_item_id: executed.bridge_plan_item_id ?? null,
      ...adjustPlanCoachTrace(args.pendingRaw.operation_input),
    },
  });
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

async function maybeRunAdjustPlanItemOperationRuntime(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const { context, deps } = args;
  const skillDeps = resolveSkillLifecycleDeps(deps);
  const nextTempMemory = { ...(context.tempMemory ?? {}) };
  const pendingDraftReview =
    nextTempMemory.__pending_adjust_plan_draft_review ?? null;
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  if (pendingOperationType(pendingRaw) === "prepare_attack_card") return null;
  const activeOperationType = String(
    (nextTempMemory.__active_tool_skill_intake ??
      nextTempMemory.active_tool_skill_intake)?.operation_type ?? "",
  ).trim();

  const executePending = async (
    pendingRaw: ExecutableAdjustPlanPending,
  ) =>
    await executePendingAdjustPlanDraft({
      context,
      nextTempMemory,
      pendingRaw,
      deps: skillDeps,
    });

  const queueWeeklyPendingReview = (
    pending: ExecutableAdjustPlanPending,
    reasonCode: string,
  ): AdjustPlanOperationRuntimeResult => {
    nextTempMemory.__pending_adjust_plan_draft_review = {
      ...pending,
      phase: "draft_review",
      operation_input: pending.operation_input ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      turn_count: 0,
      revision_history: [],
    };
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    const content = pending.draft.confirmation_message ||
      "Je te propose ce brouillon d'ajustement. Je n'applique rien tant que tu ne me le confirmes pas clairement.";
    return adaptSkillResultToRuntime({
      content,
      nextTempMemory,
      toolExecution: "blocked",
      skillResult: adjustPlanSkillResult({
        status: "draft_review",
        userIntent: "weekly_bridge",
        reply: content,
        reasonCode,
        draft: pending.draft,
        operationId: pending.operation_id ?? null,
        blockedEffects: [{
          type: "adjust_plan_item",
          reason_code: "requires_confirmation",
        }],
      }),
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "draft_review",
        reason_code: reasonCode,
        operation_id: pending.operation_id ?? null,
        draft: pending.draft,
        ...adjustPlanCoachTrace(pending.operation_input),
      },
    });
  };

  const directWeeklyMissionCarryOverApply =
    skillDeps.isExplicitPendingApplyConfirmation(context.userMessage) &&
    (skillDeps.isWeeklyMissionCarryOverRequest(context.userMessage) ||
      skillDeps.weeklyMissionCarryOverContext({
        userMessage: context.userMessage,
        history: context.history,
      }));
  if (directWeeklyMissionCarryOverApply) {
    const pendingMissionCarryOver = skillDeps
      .buildWeeklyMissionCarryOverPendingReview({
        weeklyState: skillDeps.weeklyAdaptiveReviewStateForTurn({
          activeSkillState: null,
          tempMemory: nextTempMemory,
        }),
        planItemSnapshot: context.planItemSnapshot,
      });
    const confirmationDecision = buildAdjustPlanConfirmationDecision({
      user_message: context.userMessage,
      turn_frame: context.turnFrame,
      pending_confirmation: pendingMissionCarryOver,
      local_review: legacyAdjustPlanApproveReview(true),
      request_id: context.requestId ?? null,
    });
    if (confirmationDecision.executable) {
      return await executePending(pendingMissionCarryOver);
    }
    return queueWeeklyPendingReview(
      pendingMissionCarryOver,
      "weekly_mission_carry_over_requires_confirmation",
    );
  }

  const directWeeklyCopyForwardApply =
    skillDeps.isExplicitPendingApplyConfirmation(context.userMessage) &&
    skillDeps.isCopyForwardWeeklyRequest(context.userMessage);
  if (directWeeklyCopyForwardApply) {
    const pendingCopyForward = skillDeps.buildWeeklyCopyForwardPendingReview({
      planItemSnapshot: context.planItemSnapshot,
    });
    const confirmationDecision = buildAdjustPlanConfirmationDecision({
      user_message: context.userMessage,
      turn_frame: context.turnFrame,
      pending_confirmation: pendingCopyForward,
      local_review: legacyAdjustPlanApproveReview(true),
      request_id: context.requestId ?? null,
    });
    if (confirmationDecision.executable) {
      return await executePending(pendingCopyForward);
    }
    return queueWeeklyPendingReview(
      pendingCopyForward,
      "weekly_copy_forward_requires_confirmation",
    );
  }

  const directWeeklyLightRepeatApply =
    skillDeps.isExplicitPendingApplyConfirmation(context.userMessage) &&
    skillDeps.isWeeklyLightRepeatRequest(context.userMessage);
  if (directWeeklyLightRepeatApply) {
    const pendingLightRepeat = skillDeps.buildWeeklyLightRepeatPendingReview({
      weeklyState: skillDeps.weeklyAdaptiveReviewStateForTurn({
        activeSkillState: null,
        tempMemory: nextTempMemory,
      }),
      planItemSnapshot: context.planItemSnapshot,
    });
    const confirmationDecision = buildAdjustPlanConfirmationDecision({
      user_message: context.userMessage,
      turn_frame: context.turnFrame,
      pending_confirmation: pendingLightRepeat,
      local_review: legacyAdjustPlanApproveReview(true),
      request_id: context.requestId ?? null,
    });
    if (confirmationDecision.executable) {
      return await executePending(pendingLightRepeat);
    }
    return queueWeeklyPendingReview(
      pendingLightRepeat,
      "weekly_light_repeat_requires_confirmation",
    );
  }

  if (isPendingAdjustPlanDraftReview(pendingDraftReview)) {
    if (activeOperationType && activeOperationType !== "adjust_plan_item") {
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
    }
    const weeklyStateForPendingAdjust = skillDeps
      .weeklyAdaptiveReviewStateForTurn({
        activeSkillState: null,
        tempMemory: nextTempMemory,
      });
    const weeklyExactProposalForPending = skillDeps
      .weeklyExactProposalFromConversation({
        userMessage: context.userMessage,
        history: context.history,
        tempMemory: nextTempMemory,
        weeklyState: weeklyStateForPendingAdjust,
        planItemSnapshot: context.planItemSnapshot,
      });
    const effectivePendingDraftReview = weeklyExactProposalForPending
      ? skillDeps.patchPendingAdjustPlanWithWeeklyExactProposal({
        pending: pendingDraftReview,
        proposal: weeklyExactProposalForPending,
      })
      : pendingDraftReview;
    if (weeklyExactProposalForPending) {
      nextTempMemory.__weekly_exact_adjust_plan_proposal =
        weeklyExactProposalForPending;
      nextTempMemory.__pending_adjust_plan_draft_review =
        effectivePendingDraftReview;
    }
    const legacyApproveDecision = buildAdjustPlanConfirmationDecision({
      user_message: context.userMessage,
      turn_frame: context.turnFrame,
      pending_confirmation: effectivePendingDraftReview,
      local_review: legacyAdjustPlanApproveReview(
        skillDeps.isExplicitPendingApplyConfirmation(context.userMessage),
      ),
      request_id: context.requestId ?? null,
    });
    if (legacyApproveDecision.executable) {
      return await executePending(effectivePendingDraftReview);
    }

    const pendingDraftQuestionAnswer =
      skillDeps.isAdjustPlanDraftRewriteRequest(
          context.userMessage,
        )
        ? null
        : skillDeps.renderPendingAdjustPlanDraftQuestionAnswer(
          effectivePendingDraftReview,
          context.userMessage,
        );
    if (pendingDraftQuestionAnswer) {
      return {
        content: pendingDraftQuestionAnswer,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_details",
          operation_id: effectivePendingDraftReview.operation_id ?? null,
          draft_review_decision: {
            decision: "explain",
            confidence: "high",
            evidence: ["pre_validation_detail_request_deterministic_answer"],
            apply_after_revision: false,
          },
        },
      };
    }

    const deterministicRevisedDraft = skillDeps
      .revisePendingAdjustPlanDraftDeterministically({
        pending: pendingDraftReview,
        userMessage: context.userMessage,
      });
    if (deterministicRevisedDraft) {
      const revisedConstraintAck =
        /\b(2|deux)\s+actions?\s+(maximum|max|au plus)|\bmaximum\s+(2|deux)\s+actions?\b/
            .test(skillDeps.normalizeRecommendationText(context.userMessage))
          ? "C'est corrigé dans le brouillon: la prochaine étape reste limitée à deux actions maximum. Je n'applique rien tant que tu ne me le confirmes pas clairement."
          : skillDeps.wholePlanDraftNuanceLine(context.userMessage)
          ? `C'est corrigé dans le brouillon: ${
            skillDeps.wholePlanDraftNuanceLine(context.userMessage)
          } Je n'applique rien tant que tu ne me le confirmes pas clairement.`
          : "C'est corrigé dans le brouillon: on garde 2 fois par semaine, sans créneau fixe, avec une phrase neutre. Je n'applique rien tant que tu ne me le confirmes pas clairement.";
      nextTempMemory.__pending_adjust_plan_draft_review = {
        ...pendingDraftReview,
        draft: deterministicRevisedDraft,
        updated_at: new Date().toISOString(),
        turn_count: 0,
        revision_history: [
          ...(pendingDraftReview.revision_history ?? []),
          {
            user_request: context.userMessage,
            changed: ["instruction"],
            apply_after_revision: false,
            created_at: new Date().toISOString(),
            source: "deterministic_simple_revision",
          },
        ],
      };
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: revisedConstraintAck,
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_updated",
          operation_id: pendingDraftReview.operation_id ?? null,
          draft: deterministicRevisedDraft,
          draft_review_decision: {
            decision: "revise",
            confidence: "high",
            evidence: ["deterministic_simple_revision"],
            apply_after_revision: false,
          },
        },
      };
    }

    const output = await runAdjustPlanItemIntake({
      user_id: context.userId,
      channel: context.channel,
      timezone: context.userTimezone,
      message: context.userMessage,
      source: "direct_user_request",
      trigger_message_id: context.sourceMessageId ?? context.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: context.safetyPregateOutput.risk_band,
      turn_count: Number(pendingDraftReview.turn_count ?? 0) + 1,
      recent_messages: recentMessagesForIntake(context.history),
      plan_snapshot: { items: context.planItemSnapshot ?? [] },
      operation_input: {
        ...(pendingDraftReview.operation_input ?? {}),
        previous_draft: pendingDraftReview.draft,
        revision_request: context.userMessage,
      },
      force_ai_slot_filling: true,
      force_coach_guidance: context.enableAdjustPlanCoachGuidance === true,
    });
    const draftReviewDecision = output.state_patch
      .draft_review_decision as DraftReviewDecision | undefined;
    const confirmationDecision = buildAdjustPlanConfirmationDecision({
      user_message: context.userMessage,
      turn_frame: context.turnFrame,
      pending_confirmation: effectivePendingDraftReview,
      local_review: draftReviewDecision,
      request_id: context.requestId ?? null,
    });
    if (!draftReviewDecision && confirmationDecision.decision === "unclear") {
      return null;
    }
    if (confirmationDecision.decision === "reject") {
      delete nextTempMemory.__pending_adjust_plan_draft_review;
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content:
          "Ok, je n'applique pas cet ajustement. On garde ton plan tel quel pour l'instant; observe encore une journée, et si le besoin d'alléger se confirme, on reprendra proprement.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_cancelled",
          operation_id: pendingDraftReview.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
          ...adjustPlanCoachTrace(
            output.state_patch.operation_input ??
              pendingDraftReview.operation_input ?? null,
          ),
        },
      };
    }
    if (confirmationDecision.decision === "explain") {
      const detailReply = skillDeps.renderPendingAdjustPlanDraftQuestionAnswer(
        effectivePendingDraftReview,
        context.userMessage,
      ) ?? skillDeps.renderPendingAdjustPlanDraftDetails({
        __pending_adjust_plan_draft_review: effectivePendingDraftReview,
      });
      if (detailReply) {
        return {
          content: detailReply,
          nextTempMemory,
          toolExecution: "none",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: "draft_review_details",
            operation_id: effectivePendingDraftReview.operation_id ?? null,
            confirmation_decision: confirmationDecision,
            draft_review_decision: draftReviewDecision,
            ...adjustPlanCoachTrace(
              output.state_patch.operation_input ??
                pendingDraftReview.operation_input ?? null,
            ),
          },
        };
      }
    }
    if (
      confirmationDecision.decision === "topic_change" ||
      confirmationDecision.decision === "unrelated"
    ) {
      delete nextTempMemory.__pending_adjust_plan_draft_review;
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: output.ack ??
          "Ok, je laisse cet ajustement de côté et je ne l'applique pas.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "topic_change",
          operation_id: pendingDraftReview.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (confirmationDecision.decision === "revise") {
      if (
        output.status === "pending_confirmation" && output.pending_confirmation
      ) {
        const revisedPendingRaw = {
          ...output.pending_confirmation,
          phase: "draft_review",
          operation_input: output.state_patch.operation_input ??
            (output.pending_confirmation as any).operation_input ??
            pendingDraftReview.operation_input ??
            null,
          created_at: pendingDraftReview.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
          turn_count: 0,
          revision_history: [
            ...(pendingDraftReview.revision_history ?? []),
            {
              user_request: context.userMessage,
              changed: ["draft_regenerated"],
              apply_after_revision:
                draftReviewDecision?.apply_after_revision === true,
              created_at: new Date().toISOString(),
            },
          ],
          supersedes_operation_id: pendingDraftReview.operation_id ?? null,
        };
        if (draftReviewDecision?.apply_after_revision === true) {
          delete nextTempMemory.__pending_adjust_plan_draft_review;
          delete nextTempMemory.__pending_tool_skill_confirmation;
          delete nextTempMemory.pending_tool_skill_confirmation;
          return await executePending(revisedPendingRaw as any);
        }
        nextTempMemory.__pending_adjust_plan_draft_review = {
          ...revisedPendingRaw,
        };
        delete nextTempMemory.__pending_tool_skill_confirmation;
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: output.confirmation?.message ??
            output.draft?.confirmation_message ??
            "",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: "draft_review_updated",
            operation_id: (output.pending_confirmation as any)?.operation_id ??
              pendingDraftReview.operation_id ?? null,
            previous_operation_id: pendingDraftReview.operation_id ?? null,
            draft: output.draft ?? null,
            confirmation_decision: confirmationDecision,
            draft_review_decision: draftReviewDecision,
            ...adjustPlanCoachTrace(
              output.state_patch.operation_input ??
                (revisedPendingRaw as any).operation_input ?? null,
            ),
          },
        };
      }
      nextTempMemory.__pending_adjust_plan_draft_review = {
        ...pendingDraftReview,
        turn_count: Number(pendingDraftReview.turn_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: output.next_question?.question ??
          "Je peux ajuster le brouillon, mais il me manque une précision avant de te proposer une version propre.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: output.status,
          operation_id: pendingDraftReview.operation_id ?? null,
          missing_slots: output.state_patch.missing_slots,
          draft_review: true,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
          ...adjustPlanCoachTrace(
            output.state_patch.operation_input ??
              pendingDraftReview.operation_input ?? null,
          ),
        },
      };
    }
    if (
      confirmationDecision.decision === "approve" &&
      confirmationDecision.executable
    ) {
      return await executePending(effectivePendingDraftReview);
    }
    return null;
  }

  const weeklyStateForExactApply = skillDeps.weeklyAdaptiveReviewStateForTurn({
    activeSkillState: null,
    tempMemory: nextTempMemory,
  });
  if (
    weeklyStateForExactApply &&
    (skillDeps.isExplicitPendingApplyConfirmation(context.userMessage) ||
      skillDeps.isWeeklyMissionCarryOverRequest(context.userMessage)) &&
    skillDeps.isWeeklyMissionCarryOverRequest(context.userMessage)
  ) {
    const pendingMissionCarryOver = skillDeps
      .buildWeeklyMissionCarryOverPendingReview({
        weeklyState: weeklyStateForExactApply,
        planItemSnapshot: context.planItemSnapshot,
      });
    return queueWeeklyPendingReview(
      pendingMissionCarryOver,
      "weekly_mission_carry_over_requires_confirmation",
    );
  }
  if (
    weeklyStateForExactApply &&
    (skillDeps.isExplicitPendingApplyConfirmation(context.userMessage) ||
      skillDeps.isCopyForwardWeeklyRequest(context.userMessage)) &&
    skillDeps.isCopyForwardWeeklyRequest(context.userMessage)
  ) {
    const pendingCopyForward = skillDeps.buildWeeklyCopyForwardPendingReview({
      planItemSnapshot: context.planItemSnapshot,
    });
    return queueWeeklyPendingReview(
      pendingCopyForward,
      "weekly_copy_forward_requires_confirmation",
    );
  }
  if (
    weeklyStateForExactApply &&
    (skillDeps.isExplicitPendingApplyConfirmation(context.userMessage) ||
      skillDeps.isWeeklyLightRepeatRequest(context.userMessage)) &&
    skillDeps.isWeeklyLightRepeatRequest(context.userMessage)
  ) {
    const pendingLightRepeat = skillDeps.buildWeeklyLightRepeatPendingReview({
      weeklyState: weeklyStateForExactApply,
      planItemSnapshot: context.planItemSnapshot,
    });
    return queueWeeklyPendingReview(
      pendingLightRepeat,
      "weekly_light_repeat_requires_confirmation",
    );
  }
  const weeklyExactProposalForImmediateApply = skillDeps
    .weeklyExactProposalFromConversation({
      userMessage: context.userMessage,
      history: context.history,
      tempMemory: nextTempMemory,
      weeklyState: weeklyStateForExactApply,
      planItemSnapshot: context.planItemSnapshot,
    });
  if (
    weeklyStateForExactApply &&
    weeklyExactProposalForImmediateApply &&
    skillDeps.isExplicitPendingApplyConfirmation(context.userMessage)
  ) {
    nextTempMemory.__weekly_exact_adjust_plan_proposal =
      weeklyExactProposalForImmediateApply;
    const pendingFromWeeklyExact = skillDeps
      .buildWeeklyExactAdjustPlanPendingReview(
        {
          proposal: weeklyExactProposalForImmediateApply,
        },
      );
    return queueWeeklyPendingReview(
      pendingFromWeeklyExact,
      "weekly_exact_adjust_plan_requires_confirmation",
    );
  }
  if (activeOperationType && activeOperationType !== "adjust_plan_item") {
    return null;
  }
  if (
    !activeOperationType &&
    pendingOperationType(pendingRaw) !== "adjust_plan_item" &&
    !skillDeps.isPendingAdjustPlanItemRecommendationOperation(
      nextTempMemory.__pending_recommendation_operation,
    ) &&
    skillDeps.isAmbivalentAdjustPlanReflectionRequest(context.userMessage)
  ) {
    return null;
  }
  if (
    skillDeps.isAdjustPlanExplainOnlyIntent(context.turnFrame) &&
    !skillDeps.isAdjustPlanRevisionIntent(context.turnFrame)
  ) {
    const detailReply = skillDeps.renderPendingAdjustPlanDraftDetails(
      nextTempMemory,
    ) ?? skillDeps.renderLastAdjustPlanDetails(nextTempMemory);
    if (detailReply) {
      return {
        content: detailReply,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "answered_last_adjustment_details",
        },
      };
    }
  }

  const adjustPlanRouteSelected = skillDeps.operationRouteIsSelected({
    operationType: "adjust_plan_item",
    routeDecision: context.routeDecision,
    turnFrame: context.turnFrame,
    tempMemory: context.tempMemory,
  });
  const scopedOperationInput = skillDeps.operationInputFromPlanAdjustmentScope(
    context.userMessage,
    context.turnFrame,
  );
  if (!adjustPlanRouteSelected && !scopedOperationInput) return null;
  if (
    !activeOperationType &&
    pendingOperationType(pendingRaw) !== "adjust_plan_item" &&
    !skillDeps.isPendingAdjustPlanItemRecommendationOperation(
      nextTempMemory.__pending_recommendation_operation,
    ) &&
    skillDeps.isVagueWholePlanWeeklyAdjustmentRequest(
      context.userMessage,
      scopedOperationInput,
    )
  ) {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "adjust_plan_item",
      operation_input: scopedOperationInput,
      status: "collecting",
      created_at: new Date().toISOString(),
      reason_code: "whole_plan_vague_needs_context",
    };
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content:
        "Oui, là ça touche plutôt le plan global. Avant de proposer une nouvelle organisation, il me manque le point précis: qu'est-ce qui ne colle plus aujourd'hui ? L'objectif, l'ordre des étapes, la charge, ou les actions elles-mêmes ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "collecting",
        reason_code: "whole_plan_vague_needs_context",
        missing_slots: ["whole_plan_change_reason"],
        ...adjustPlanCoachTrace(scopedOperationInput),
      },
    };
  }

  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;

  if (isPendingAdjustPlanItemOperation(pendingRaw)) {
    nextTempMemory.__pending_adjust_plan_draft_review = {
      ...pendingRaw,
      phase: "draft_review",
      operation_input: pendingRaw.operation_input ?? null,
      updated_at: new Date().toISOString(),
      turn_count: Number(pendingRaw.turn_count ?? 0),
    };
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    return await maybeRunAdjustPlanItemOperation({
      context: { ...context, tempMemory: nextTempMemory },
      deps,
    });
  }

  if (
    skillDeps.isPendingAdjustPlanItemRecommendationOperation(
      pendingRecommendation,
    )
  ) {
    const confirmationDecision = buildAdjustPlanConfirmationDecision({
      user_message: context.userMessage,
      turn_frame: context.turnFrame,
      pending_confirmation: pendingRecommendation,
      local_review: (pendingRecommendation as any)?.draft_review_decision ??
        null,
      request_id: context.requestId ?? null,
    });
    const correctionScopeInput = scopedOperationInput;
    if (
      confirmationDecision.decision === "revise" ||
      (confirmationDecision.decision === "approve" &&
        skillDeps.isBroaderPlanAdjustmentInput(correctionScopeInput))
    ) {
      delete nextTempMemory.__pending_recommendation_operation;
      delete nextTempMemory.__last_resolved_plan_item;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
    } else {
      if (confirmationDecision.decision === "reject") {
        delete nextTempMemory.__pending_recommendation_operation;
        return {
          content: "Ok, on ne touche pas au plan pour l'instant.",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: "recommendation_cancelled",
            recommendation_id: (pendingRecommendation as any)
              ?.recommendation_id ?? null,
            confirmation_decision: confirmationDecision,
          },
        };
      }
      if (confirmationDecision.decision !== "approve") return null;

      const output = await runAdjustPlanItemIntake({
        user_id: context.userId,
        channel: context.channel,
        timezone: context.userTimezone,
        message: context.userMessage,
        source: "recommendation_tool",
        trigger_message_id: context.sourceMessageId ?? context.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: context.safetyPregateOutput.risk_band,
        plan_snapshot: { items: context.planItemSnapshot ?? [] },
        operation_input: (pendingRecommendation as any).operation_input ?? null,
        force_ai_slot_filling: context.forceFullAi === true,
        force_coach_guidance: context.enableAdjustPlanCoachGuidance === true,
      });
      if (
        output.status !== "pending_confirmation" ||
        !output.pending_confirmation || !output.draft
      ) {
        delete nextTempMemory.__pending_recommendation_operation;
        return {
          content: output.next_question?.question ??
            "Il me manque l'action exacte à alléger. Tu veux que je réduise quelle action du plan ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: output.status,
            missing_slots: output.state_patch.missing_slots,
            source: "recommendation_tool",
            ...adjustPlanCoachTrace(
              output.state_patch.operation_input ??
                (pendingRecommendation as any).operation_input ?? null,
            ),
          },
        };
      }

      delete nextTempMemory.__pending_recommendation_operation;
      nextTempMemory.__pending_adjust_plan_draft_review = {
        ...output.pending_confirmation,
        phase: "draft_review",
        operation_input: output.state_patch.operation_input ??
          (output.pending_confirmation as any).operation_input ??
          (pendingRecommendation as any).operation_input ??
          null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        turn_count: 0,
        revision_history: [],
      };
      return {
        content: output.confirmation?.message ??
          output.draft?.confirmation_message ??
          "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_from_recommendation",
          operation_id: (output.pending_confirmation as any)?.operation_id ??
            null,
          recommendation_id: (pendingRecommendation as any)
            ?.recommendation_id ?? null,
          draft: output.draft,
          ...adjustPlanCoachTrace(
            output.state_patch.operation_input ??
              (output.pending_confirmation as any).operation_input ??
              (pendingRecommendation as any).operation_input ?? null,
          ),
        },
      };
    }
  }

  const hasActiveAdjustPlanIntake =
    (nextTempMemory.__active_tool_skill_intake as any)?.operation_type ===
      "adjust_plan_item";
  if (
    !hasActiveAdjustPlanIntake && !adjustPlanRouteSelected &&
    !scopedOperationInput
  ) return null;

  if (
    skillDeps.isOperationEscapeMessage(context.userMessage) &&
    !skillDeps.hasStrongToolSkillIntent(
      context.turnFrame,
      "adjust_plan_item",
    ) &&
    !hasActiveAdjustPlanIntake
  ) return null;
  if (skillDeps.isBroaderPlanAdjustmentInput(scopedOperationInput)) {
    delete nextTempMemory.__last_resolved_plan_item;
  }
  const activeAdjustPlanOperationInput =
    (nextTempMemory.__active_tool_skill_intake as any)?.operation_input &&
      typeof (nextTempMemory.__active_tool_skill_intake as any)
          .operation_input === "object"
      ? (nextTempMemory.__active_tool_skill_intake as any)
        .operation_input as Record<string, unknown>
      : null;
  let item = scopedOperationInput
    ? null
    : skillDeps.readLastResolvedPlanItem(nextTempMemory);
  if (!scopedOperationInput && !item) {
    const intentItem = skillDeps.resolvePlanItemTargetFromToolSkillIntent(
      context.turnFrame,
      "adjust_plan_item",
      context.planItemSnapshot,
    );
    if (intentItem) {
      Object.assign(
        nextTempMemory,
        skillDeps.writeLastResolvedPlanItem(
          nextTempMemory,
          intentItem,
          "tool_skill_intent_target_hint",
        ),
      );
      item = skillDeps.readLastResolvedPlanItem(nextTempMemory);
    }
  }
  const fallbackOperationInput = skillDeps.mergeActiveAdjustPlanOperationInput({
    active: activeAdjustPlanOperationInput,
    scoped: scopedOperationInput,
  }) ?? skillDeps.operationInputFromLastPlanItem(nextTempMemory);
  const output = await runAdjustPlanItemIntake({
    user_id: context.userId,
    channel: context.channel,
    timezone: context.userTimezone,
    message: context.userMessage,
    source: "direct_user_request",
    trigger_message_id: context.sourceMessageId ?? context.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: context.safetyPregateOutput.risk_band,
    turn_count: Number(
      (nextTempMemory.__active_tool_skill_intake as any)?.turn_count ?? 0,
    ),
    plan_snapshot: { items: context.planItemSnapshot ?? [] },
    operation_input: fallbackOperationInput,
    force_ai_slot_filling: context.forceFullAi === true,
    force_coach_guidance: context.enableAdjustPlanCoachGuidance === true,
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory.__pending_adjust_plan_draft_review = {
      ...output.pending_confirmation,
      phase: "draft_review",
      operation_input: output.state_patch.operation_input ??
        (output.pending_confirmation as any).operation_input ??
        fallbackOperationInput,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      turn_count: 0,
      revision_history: [],
    };
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: output.confirmation?.message ??
        output.draft?.confirmation_message ??
        "",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "draft_review",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
        ...adjustPlanCoachTrace(
          output.state_patch.operation_input ??
            (output.pending_confirmation as any).operation_input ??
            fallbackOperationInput,
        ),
      },
    };
  }

  if (output.status === "ask_question") {
    const previousTurnCount = Number(
      (nextTempMemory.__active_tool_skill_intake as any)?.turn_count ?? 0,
    );
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "adjust_plan_item",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ??
        fallbackOperationInput,
      turn_count: previousTurnCount + 1,
      updated_at: new Date().toISOString(),
    };
  }

  return {
    content: output.next_question?.question ??
      output.ack ??
      output.confirmation?.message ??
      output.draft?.confirmation_message ??
      "J'ai bien compris l'ajustement. Je te prépare une proposition concrète, et rien n'est appliqué tant que tu ne confirmes pas clairement.",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety"
      ? "blocked"
      : "blocked",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      status: output.status,
      plan_item_id: item?.id ?? null,
      target_title: item?.title ??
        skillDeps.planItemTitleFromOperationInput(fallbackOperationInput),
      missing_slots: output.state_patch.missing_slots,
      ...adjustPlanCoachTrace(
        output.state_patch.operation_input ??
          fallbackOperationInput,
      ),
    },
  };
}

export async function maybeRunAdjustPlanItemOperation(args: {
  context: AdjustPlanRouterContext;
  deps: AdjustPlanLifecycleDeps;
}): Promise<AdjustPlanOperationRuntimeResult | null> {
  const result = await maybeRunAdjustPlanItemOperationRuntime(args);
  return result ? ensureRuntimeHasSkillResult(result) : null;
}
