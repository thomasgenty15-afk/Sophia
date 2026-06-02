import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import { runAdjustPlanItemIntake } from "./intake.ts";
import type {
  AdjustPlanOperationRuntimeResult,
  AdjustPlanRouterContext,
} from "./contract.ts";
import {
  adjustPlanSkillResult,
  ensureRuntimeHasSkillResult,
} from "./runtime_adapter.ts";
import { renderAdjustPlanHandoffDraft } from "./renderer.ts";
import { buildAdjustPlanHandoffDraft } from "./handoff.ts";
import {
  buildClarificationRequest,
  type ClarificationCandidate,
  type ClarificationToolOutput,
} from "../../../clarification/contract.ts";
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
  writeAdjustPlanHandoffState,
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
  clarifyAdjustPlanAmbiguity?: (args: {
    request: ReturnType<typeof buildClarificationRequest>;
  }) => Promise<ClarificationToolOutput>;
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
  const handoffDraft = buildAdjustPlanHandoffDraft({
    draft: args.pendingRaw.draft,
    operationInput: args.pendingRaw.operation_input ?? null,
    missingDecisions: missingSpecificPlanItemId(args.pendingRaw)
      ? ["retrouver l'action exacte dans la section Plan"]
      : [],
  });
  let nextTempMemory = clearAdjustPlanFrame(args.nextTempMemory);
  nextTempMemory = writeAdjustPlanHandoffState(nextTempMemory, {
    skill_id: "adjust_plan_item",
    mode: "platform_handoff",
    status: "handoff_delivered",
    scope: handoffDraft.scope.kind,
    draft: handoffDraft,
    turn_count: 0,
    max_turns: 3,
    no_chat_mutation: true,
  });
  const content = renderAdjustPlanHandoffDraft(handoffDraft);
  return {
    content,
    nextTempMemory,
    toolExecution: "blocked",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      status: "handoff_delivered",
      reason_code: "platform_handoff_no_chat_mutation",
      operation_id: operationId,
      handoff_draft: handoffDraft,
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [{
        type: "adjust_plan_item",
        reason_code: "complex_operation_redirect_to_platform",
      }],
      committed_effects: [],
      skill_result: adjustPlanSkillResult({
        status: "handoff_delivered",
        userIntent: "approve",
        reply: content,
        reasonCode: "platform_handoff_no_chat_mutation",
        blockedEffects: [{
          type: "adjust_plan_item",
          reason_code: "complex_operation_redirect_to_platform",
        }],
      }),
      ...adjustPlanCoachTrace(args.pendingRaw.operation_input),
    },
  };
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

function clarificationCandidatesForMissingSlots(
  missingSlots: string[] = [],
): ClarificationCandidate[] {
  const candidates: ClarificationCandidate[] = [];
  const add = (
    id: string,
    label: string,
    description: string,
    evidence: string[],
  ) => {
    if (candidates.some((candidate) => candidate.id === id)) return;
    candidates.push({
      id,
      label,
      description,
      operation_type: "adjust_plan_item",
      surface_id: "plan",
      evidence,
    });
  };
  for (const slot of missingSlots) {
    if (slot.includes("scope") || slot.includes("target")) {
      add(
        "specific_plan_item",
        "une action précise",
        "L'utilisateur veut ajuster une action identifiable du plan.",
        [slot],
      );
      add(
        "current_week",
        "la semaine en cours",
        "L'utilisateur veut alléger ou réorganiser seulement la charge immédiate.",
        [slot],
      );
      add(
        "whole_plan",
        "tout le plan",
        "L'utilisateur remet la trajectoire ou l'objectif global en question.",
        [slot],
      );
    }
    if (slot.includes("adjustment") || slot.includes("change")) {
      add("reduce", "alléger", "Réduire la charge ou l'entrée.", [slot]);
      add("reschedule", "reporter", "Décaler dans le temps.", [slot]);
      add(
        "split",
        "découper",
        "Transformer une action trop grosse en étapes.",
        [
          slot,
        ],
      );
      add(
        "replace",
        "remplacer",
        "Substituer une action qui ne convient plus.",
        [
          slot,
        ],
      );
      add(
        "pause",
        "abandonner ou mettre en pause",
        "Sortir temporairement l'élément du plan.",
        [
          slot,
        ],
      );
    }
    if (slot.includes("reason")) {
      add(
        "timing_problem",
        "un problème de timing",
        "Le blocage vient du moment ou de la cadence.",
        [
          slot,
        ],
      );
      add(
        "energy_problem",
        "un problème d'énergie",
        "Le blocage vient de la fatigue ou de la charge.",
        [
          slot,
        ],
      );
      add(
        "meaning_problem",
        "un problème de sens",
        "L'action ne semble plus utile ou cohérente.",
        [
          slot,
        ],
      );
      add(
        "difficulty_problem",
        "un problème de difficulté",
        "Le niveau demandé est trop dur.",
        [
          slot,
        ],
      );
    }
  }
  if (candidates.length === 0) {
    add(
      "understand_only",
      "comprendre le blocage",
      "L'utilisateur veut analyser sans modifier le plan.",
      ["fallback"],
    );
    add(
      "modify_plan",
      "modifier le plan",
      "L'utilisateur veut une recommandation à reprendre dans Plan.",
      ["fallback"],
    );
  }
  return candidates.slice(0, 8);
}

async function maybeClarifyAdjustPlan(args: {
  deps: ResolvedAdjustPlanLifecycleDeps;
  context: AdjustPlanRouterContext;
  missingSlots: string[];
  activeFlowState?: unknown;
  knownContext?: Record<string, unknown> | null;
}): Promise<string | null> {
  if (!args.deps.clarifyAdjustPlanAmbiguity) return null;
  const candidates = clarificationCandidatesForMissingSlots(args.missingSlots);
  const request = buildClarificationRequest({
    owner: "adjust_plan_handoff",
    ambiguity_kind: args.missingSlots.some((slot) => slot.includes("scope"))
      ? "scope"
      : "target",
    user_message: args.context.userMessage,
    recent_messages: recentMessagesForIntake(args.context.history),
    active_flow_state: args.activeFlowState,
    known_context: args.knownContext ?? {},
    candidates,
  });
  const output = await args.deps.clarifyAdjustPlanAmbiguity({ request });
  return output.status === "ask" || output.status === "still_ambiguous"
    ? output.question?.trim() || null
    : null;
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
  const activeHandoff = nextTempMemory.__adjust_plan_handoff_state;
  if (
    activeHandoff?.skill_id === "adjust_plan_item" &&
    activeHandoff?.mode === "platform_handoff" &&
    activeHandoff?.draft
  ) {
    const handoffDraft = activeHandoff.draft;
    const content = renderAdjustPlanHandoffDraft(handoffDraft);
    nextTempMemory.__adjust_plan_handoff_state = {
      ...activeHandoff,
      status: "handoff_delivered",
      turn_count: Number(activeHandoff.turn_count ?? 0) + 1,
      max_turns: Number(activeHandoff.max_turns ?? 3),
      no_chat_mutation: true,
    };
    return {
      content,
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "handoff_delivered",
        reason_code: "active_platform_handoff_no_chat_mutation",
        handoff_draft: handoffDraft,
        requested_effects: [],
        allowed_effects: [],
        blocked_effects: [{
          type: "adjust_plan_item",
          reason_code: "complex_operation_redirect_to_platform",
        }],
        committed_effects: [],
        skill_result: adjustPlanSkillResult({
          status: "handoff_delivered",
          userIntent: "approve",
          reply: content,
          reasonCode: "active_platform_handoff_no_chat_mutation",
          blockedEffects: [{
            type: "adjust_plan_item",
            reason_code: "complex_operation_redirect_to_platform",
          }],
        }),
      },
    };
  }

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
    const handoffDraft = buildAdjustPlanHandoffDraft({
      draft: pending.draft,
      operationInput: pending.operation_input ?? null,
    });
    Object.assign(
      nextTempMemory,
      writeAdjustPlanHandoffState(nextTempMemory, {
        skill_id: "adjust_plan_item",
        mode: "platform_handoff",
        status: "handoff_delivered",
        scope: handoffDraft.scope.kind,
        draft: handoffDraft,
        turn_count: 0,
        max_turns: 3,
        no_chat_mutation: true,
      }),
    );
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    const content = renderAdjustPlanHandoffDraft(handoffDraft);
    return {
      content,
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "handoff_delivered",
        reason_code: reasonCode,
        operation_id: pending.operation_id ?? null,
        handoff_draft: handoffDraft,
        requested_effects: [],
        allowed_effects: [],
        blocked_effects: [{
          type: "adjust_plan_item",
          reason_code: "complex_operation_redirect_to_platform",
        }],
        committed_effects: [],
        skill_result: adjustPlanSkillResult({
          status: "handoff_delivered",
          userIntent: "weekly_bridge",
          reply: content,
          reasonCode,
          blockedEffects: [{
            type: "adjust_plan_item",
            reason_code: "complex_operation_redirect_to_platform",
          }],
        }),
        ...adjustPlanCoachTrace(pending.operation_input),
      },
    };
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
      const handoffDraft = buildAdjustPlanHandoffDraft({
        draft: deterministicRevisedDraft,
        operationInput: pendingDraftReview.operation_input ?? null,
      });
      Object.assign(
        nextTempMemory,
        writeAdjustPlanHandoffState(nextTempMemory, {
          skill_id: "adjust_plan_item",
          mode: "platform_handoff",
          status: "handoff_delivered",
          scope: handoffDraft.scope.kind,
          draft: handoffDraft,
          turn_count: 0,
          max_turns: 3,
          no_chat_mutation: true,
        }),
      );
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      const content = renderAdjustPlanHandoffDraft(handoffDraft);
      return {
        content,
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "handoff_delivered",
          reason_code: "platform_handoff_revised_no_chat_mutation",
          operation_id: pendingDraftReview.operation_id ?? null,
          handoff_draft: handoffDraft,
          requested_effects: [],
          allowed_effects: [],
          blocked_effects: [{
            type: "adjust_plan_item",
            reason_code: "complex_operation_redirect_to_platform",
          }],
          committed_effects: [],
          skill_result: adjustPlanSkillResult({
            status: "handoff_delivered",
            userIntent: "revise",
            reply: content,
            reasonCode: "platform_handoff_revised_no_chat_mutation",
            blockedEffects: [{
              type: "adjust_plan_item",
              reason_code: "complex_operation_redirect_to_platform",
            }],
          }),
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
        const handoffDraft = buildAdjustPlanHandoffDraft({
          draft: output.draft,
          operationInput: (revisedPendingRaw as any).operation_input ?? null,
        });
        Object.assign(
          nextTempMemory,
          writeAdjustPlanHandoffState(nextTempMemory, {
            skill_id: "adjust_plan_item",
            mode: "platform_handoff",
            status: "handoff_delivered",
            scope: handoffDraft.scope.kind,
            draft: handoffDraft,
            turn_count: 0,
            max_turns: 3,
            no_chat_mutation: true,
          }),
        );
        delete nextTempMemory.__pending_tool_skill_confirmation;
        delete nextTempMemory.pending_tool_skill_confirmation;
        const content = renderAdjustPlanHandoffDraft(handoffDraft);
        return {
          content,
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: "handoff_delivered",
            reason_code: "platform_handoff_revised_no_chat_mutation",
            operation_id: (output.pending_confirmation as any)?.operation_id ??
              pendingDraftReview.operation_id ?? null,
            previous_operation_id: pendingDraftReview.operation_id ?? null,
            handoff_draft: handoffDraft,
            requested_effects: [],
            allowed_effects: [],
            blocked_effects: [{
              type: "adjust_plan_item",
              reason_code: "complex_operation_redirect_to_platform",
            }],
            committed_effects: [],
            skill_result: adjustPlanSkillResult({
              status: "handoff_delivered",
              userIntent: "revise",
              reply: content,
              reasonCode: "platform_handoff_revised_no_chat_mutation",
              blockedEffects: [{
                type: "adjust_plan_item",
                reason_code: "complex_operation_redirect_to_platform",
              }],
            }),
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
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    return await executePending(pendingRaw);
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
      const handoffDraft = buildAdjustPlanHandoffDraft({
        draft: output.draft,
        operationInput: output.state_patch.operation_input ??
          (output.pending_confirmation as any).operation_input ??
          (pendingRecommendation as any).operation_input ??
          null,
      });
      Object.assign(
        nextTempMemory,
        writeAdjustPlanHandoffState(nextTempMemory, {
          skill_id: "adjust_plan_item",
          mode: "platform_handoff",
          status: "handoff_delivered",
          scope: handoffDraft.scope.kind,
          draft: handoffDraft,
          turn_count: 0,
          max_turns: 3,
          no_chat_mutation: true,
        }),
      );
      return {
        content: renderAdjustPlanHandoffDraft(handoffDraft),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "handoff_delivered",
          reason_code: "platform_handoff_from_recommendation",
          operation_id: (output.pending_confirmation as any)?.operation_id ??
            null,
          recommendation_id: (pendingRecommendation as any)
            ?.recommendation_id ?? null,
          handoff_draft: handoffDraft,
          requested_effects: [],
          allowed_effects: [],
          blocked_effects: [{
            type: "adjust_plan_item",
            reason_code: "complex_operation_redirect_to_platform",
          }],
          committed_effects: [],
          skill_result: adjustPlanSkillResult({
            status: "handoff_delivered",
            userIntent: "start",
            reply: renderAdjustPlanHandoffDraft(handoffDraft),
            reasonCode: "platform_handoff_from_recommendation",
            blockedEffects: [{
              type: "adjust_plan_item",
              reason_code: "complex_operation_redirect_to_platform",
            }],
          }),
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
    const handoffDraft = buildAdjustPlanHandoffDraft({
      draft: output.draft,
      operationInput: output.state_patch.operation_input ??
        (output.pending_confirmation as any).operation_input ??
        fallbackOperationInput,
    });
    Object.assign(
      nextTempMemory,
      writeAdjustPlanHandoffState(nextTempMemory, {
        skill_id: "adjust_plan_item",
        mode: "platform_handoff",
        status: "handoff_delivered",
        scope: handoffDraft.scope.kind,
        draft: handoffDraft,
        turn_count: 0,
        max_turns: 3,
        no_chat_mutation: true,
      }),
    );
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    const content = renderAdjustPlanHandoffDraft(handoffDraft);
    return {
      content,
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "handoff_delivered",
        reason_code: "platform_handoff_no_chat_mutation",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        handoff_draft: handoffDraft,
        requested_effects: [],
        allowed_effects: [],
        blocked_effects: [{
          type: "adjust_plan_item",
          reason_code: "complex_operation_redirect_to_platform",
        }],
        committed_effects: [],
        skill_result: adjustPlanSkillResult({
          status: "handoff_delivered",
          userIntent: "start",
          reply: content,
          reasonCode: "platform_handoff_no_chat_mutation",
          blockedEffects: [{
            type: "adjust_plan_item",
            reason_code: "complex_operation_redirect_to_platform",
          }],
        }),
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
  const clarificationQuestion = output.status === "ask_question"
    ? await maybeClarifyAdjustPlan({
      deps: skillDeps,
      context,
      missingSlots: output.state_patch.missing_slots,
      activeFlowState: output.state_patch.tool_skill_state ?? null,
      knownContext: output.state_patch.operation_input ??
        fallbackOperationInput,
    })
    : null;

  return {
    content: clarificationQuestion ??
      output.next_question?.question ??
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
