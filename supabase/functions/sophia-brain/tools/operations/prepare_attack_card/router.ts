/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  buildConfirmationDecisionFromSkillReview,
  normalizeSkillConfirmationReview,
  type SkillConfirmationReview,
} from "../../../router/confirmation_contract.ts";
import { createConfirmationToken } from "../../../confirmation/confirmation_token.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import { loadCoachQuestionTendencyLow } from "../update_coach_preferences/runtime_policy.ts";
import {
  isPendingDefenseCardOperation,
  isPendingDefenseCardRecommendationOperation,
} from "../prepare_defense_card/router.ts";
import {
  applyAttackCardSingleTechniquePreference,
  attackCardOperationInputWithSingleTechniqueApproval,
  attackCardTargetFromPendingConfirmation,
  attackCardTargetFromQuestionCandidate,
  isActiveAttackCardKeywordIntake,
  isAttackCardLocationOrManagementQuestion,
  isPendingAttackCardOperation,
  isPendingAttackCardRecommendationOperation,
  loadActiveAttackKeywordOptions,
  loadRecentActiveAttackCardForUser,
  mergeAttackCardQuestionKnownSlots,
  renderAttackCardSlotQuestion,
  userExplicitlyAsksForNewAttackCard,
} from "./run_support.ts";
import {
  decidePrepareAttackCardNextStep,
  type PrepareAttackCardCommittedEffect,
  type PrepareAttackCardConstraint,
  type PrepareAttackCardEffect,
  type PrepareAttackCardSkillResult,
  type PrepareAttackCardUserIntent,
} from "./contract.ts";
import { runPrepareAttackCardAiIntake } from "./ai_intake.ts";
import type { AttackCardDraftV1 } from "./generator.ts";
import { executePrepareAttackCard } from "./executor.ts";
import { insertAttackCardFromDraft } from "./persistence.ts";
import {
  renderAttackCardBlockedCreateReply,
  renderAttackCardCancelledReply,
  renderAttackCardDraftOnlyReply,
  renderAttackCardExecutedReply,
  renderAttackCardExplanationReply,
  renderAttackCardFailedReply,
  renderAttackCardPendingConfirmationReply,
} from "./renderer.ts";

export type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

function envString(name: string, fallback = ""): string {
  try {
    return String(Deno.env.get(name) ?? fallback);
  } catch {
    return fallback;
  }
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
  return next;
}

export function clearPrepareAttackCardFrame(tempMemory: any) {
  return writePrepareAttackCardFrameToTempMemory(tempMemory, {
    pending: null,
    draftReview: null,
    active: null,
    recommendation: null,
  });
}

function committedRuntimeTools(
  committedEffects: PrepareAttackCardCommittedEffect[],
): string[] {
  return committedEffects.length > 0 ? ["prepare_attack_card"] : [];
}

function adaptPrepareAttackCardResultToOperationRuntime(args: {
  result: PrepareAttackCardSkillResult;
  nextTempMemory: any;
  extraToolSkillRun?: Record<string, unknown>;
}): OperationRuntimeResult {
  const committedEffects = args.result.committed_effects;
  const executedTools = committedRuntimeTools(committedEffects);
  return {
    content: args.result.reply ?? "",
    nextTempMemory: args.nextTempMemory,
    toolExecution: committedEffects.length > 0
      ? "success"
      : args.result.status === "failed"
      ? "failed"
      : args.result.status === "explained"
      ? "none"
      : "blocked",
    executedTools,
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      status: args.result.status,
      user_intent: args.result.user_intent,
      requested_effects: args.result.requested_effects,
      allowed_effects: args.result.allowed_effects,
      committed_effects: committedEffects,
      blocked_effects: args.result.blocked_effects,
      pending_confirmation: args.result.pending_confirmation ?? null,
      debug: args.result.debug,
      ...(args.extraToolSkillRun ?? {}),
    },
  };
}

function withPrepareAttackCardReply(
  result: PrepareAttackCardSkillResult,
  patch: Partial<PrepareAttackCardSkillResult> & { reply: string },
): PrepareAttackCardSkillResult {
  return {
    ...result,
    ...patch,
    committed_effects: patch.committed_effects ?? result.committed_effects,
  };
}

function technicalAttackCardRuntime(args: {
  output: Awaited<ReturnType<typeof runPrepareAttackCardAiIntake>>;
  nextTempMemory: any;
  operationId?: string | null;
  source?: string | null;
  recommendationId?: string | null;
}): OperationRuntimeResult {
  const reasonCode = String(
    args.output.reason_code ??
      args.output.readiness?.reason ?? "structured_intake_failed",
  );
  return {
    content: args.output.ack ??
      "Je n'arrive pas à préparer cette carte proprement là. On peut reprendre dans un instant.",
    nextTempMemory: args.nextTempMemory,
    toolExecution: "failed",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      status: "technical_blocked",
      reason_code: reasonCode,
      operation_id: args.operationId ?? null,
      source: args.source ?? args.output.source,
      recommendation_id: args.recommendationId ?? null,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "prepare_attack_card",
        reason_code: reasonCode,
      }],
      pending_confirmation: null,
      should_preserve_pending: args.output.should_preserve_pending ?? true,
      retryable: args.output.retryable ?? true,
      technical_source: args.output.technical_source ?? "technical_fallback",
      debug: {
        reason_code: args.output.readiness?.reason ?? reasonCode,
        evidence: [],
      },
    },
  };
}

function operationInputFromLastPlanItemLocal(
  tempMemory: any,
): Record<string, unknown> | null {
  const raw = (tempMemory as any)?.__last_resolved_plan_item;
  if (!raw || typeof raw !== "object") return null;
  const id = String((raw as any).id ?? "").trim();
  const title = String((raw as any).title ?? "").trim();
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

function detectStructuredAttackCardConfirmation(
  turnFrame: TurnFrame | null,
): "yes" | "no" | null {
  const confirmation = turnFrame?.confirmation_response;
  if (!confirmation || confirmation.confidence_band === "low") return null;
  return confirmation.kind === "yes" || confirmation.kind === "no"
    ? confirmation.kind
    : null;
}

function attackCardReviewFromPending(
  pendingRaw: Record<string, unknown>,
): SkillConfirmationReview | null {
  const operationInput = pendingRaw.operation_input &&
      typeof pendingRaw.operation_input === "object" &&
      !Array.isArray(pendingRaw.operation_input)
    ? pendingRaw.operation_input as Record<string, unknown>
    : null;
  return normalizeSkillConfirmationReview(
    pendingRaw.draft_review_decision ??
      operationInput?.draft_review_decision,
  );
}

function userIntentFromConfirmationReview(
  review: SkillConfirmationReview | null,
): PrepareAttackCardUserIntent {
  if (review?.decision === "approve") return "create";
  if (review?.decision === "reject") return "reject";
  if (review?.decision === "revise") return "revise";
  if (review?.decision === "explain") return "explain";
  if (review?.decision === "preview") return "draft_only";
  if (review?.decision === "status") return "status_question";
  if (review?.decision === "topic_change") return "topic_change";
  return "unknown";
}

function constraintsFromConfirmationReview(
  review: SkillConfirmationReview | null,
): PrepareAttackCardConstraint[] {
  return review?.decision === "preview"
    ? [
      { kind: "draft_only" as const, evidence: review.evidence ?? [] },
      { kind: "no_create" as const, evidence: review.evidence ?? [] },
    ]
    : [];
}

function localOperationType(value: unknown): string {
  const record = value && typeof value === "object" ? value as any : null;
  return String(record?.operation_type ?? "").trim();
}

function operationRouteIsSelected(args: {
  operationType: "prepare_attack_card";
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  const frame = loadPrepareAttackCardFrameFromTempMemory(args.tempMemory);
  const pendingType = localOperationType(frame.pending);
  if (pendingType === args.operationType) return true;
  if (pendingType && pendingType !== args.operationType) return false;
  const activeType = localOperationType(frame.active);
  if (activeType === args.operationType) return true;
  if (activeType && activeType !== args.operationType) return false;
  if (isPendingAttackCardOperation(frame.draftReview)) return true;
  if (isPendingAttackCardRecommendationOperation(frame.recommendation)) {
    return true;
  }
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === args.operationType
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== args.operationType
  ) return false;
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === args.operationType &&
    intent.confidence_band !== "low"
  );
}

function buildAttackCardPendingFrame(args: {
  pendingConfirmation: Record<string, unknown>;
  draft: AttackCardDraftV1;
  target: Record<string, unknown>;
  supersedesOperationId?: string | null;
}): Record<string, unknown> {
  return {
    ...args.pendingConfirmation,
    operation_type: "prepare_attack_card",
    draft: args.draft,
    target: args.target,
    phase: "awaiting_create_confirmation",
    executable: true,
    created_at: new Date().toISOString(),
    turn_count: 0,
    ...(args.supersedesOperationId
      ? { supersedes_operation_id: args.supersedesOperationId }
      : {}),
  };
}

function buildAttackCardDraftReviewFrame(args: {
  pendingConfirmation: Record<string, unknown>;
  draft: AttackCardDraftV1;
  target: Record<string, unknown>;
  supersedesOperationId?: string | null;
}): Record<string, unknown> {
  return {
    ...buildAttackCardPendingFrame(args),
    phase: "draft_review",
    executable: false,
  };
}

export function applyPrepareAttackCardInitialDraftDecision(args: {
  output: Awaited<ReturnType<typeof runPrepareAttackCardAiIntake>>;
  target: Record<string, unknown>;
  fallbackOperationInput?: Record<string, unknown> | null;
  tempMemory: any;
  supersedesOperationId?: string | null;
  source?: string;
}): OperationRuntimeResult | null {
  if (
    args.output.status !== "pending_confirmation" ||
    !args.output.pending_confirmation ||
    !args.output.draft
  ) {
    return null;
  }
  const pendingFrame = buildAttackCardPendingFrame({
    pendingConfirmation: args.output.pending_confirmation as Record<
      string,
      unknown
    >,
    draft: args.output.draft,
    target: args.target,
    supersedesOperationId: args.supersedesOperationId ?? null,
  });
  const skillDecision = decidePrepareAttackCardNextStep({
    pendingRaw: pendingFrame,
    user_intent: args.output.user_intent,
    constraints: args.output.constraints,
    draft_review_decision: args.output.state_patch.draft_review_decision ??
      null,
  });
  if (skillDecision.status === "draft_ready") {
    const next = writePrepareAttackCardFrameToTempMemory(args.tempMemory, {
      pending: null,
      draftReview: buildAttackCardDraftReviewFrame({
        pendingConfirmation: args.output.pending_confirmation as Record<
          string,
          unknown
        >,
        draft: args.output.draft,
        target: args.target,
        supersedesOperationId: args.supersedesOperationId ?? null,
      }),
      active: null,
      recommendation: args.source === "recommendation_tool" ? null : undefined,
    });
    return adaptPrepareAttackCardResultToOperationRuntime({
      result: withPrepareAttackCardReply(skillDecision, {
        reply: renderAttackCardDraftOnlyReply(args.output.draft),
      }),
      nextTempMemory: next,
      extraToolSkillRun: {
        operation_id: (args.output.pending_confirmation as any)?.operation_id ??
          null,
        draft: args.output.draft,
        source: args.source ?? "direct_user_request",
      },
    });
  }
  const next = writePrepareAttackCardFrameToTempMemory(args.tempMemory, {
    pending: pendingFrame,
    draftReview: null,
    active: null,
    recommendation: args.source === "recommendation_tool" ? null : undefined,
  });
  return adaptPrepareAttackCardResultToOperationRuntime({
    result: withPrepareAttackCardReply(skillDecision, {
      status: "pending_confirmation",
      reply: renderAttackCardPendingConfirmationReply(args.output.draft),
      pending_confirmation: pendingFrame,
    }),
    nextTempMemory: next,
    extraToolSkillRun: {
      operation_id: (args.output.pending_confirmation as any)?.operation_id ??
        null,
      draft: args.output.draft,
      source: args.source ?? "direct_user_request",
    },
  });
}

function routeOrTurnFramePrefersDefenseCard(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
}): boolean {
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_defense_card"
  ) {
    return true;
  }
  return Boolean(
    args.turnFrame?.tool_skill_intents?.some((intent) =>
      intent.operation_type === "prepare_defense_card" &&
      intent.confidence_band !== "low"
    ),
  );
}

async function executeConfirmedAttackCardDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  sourceMessageId: string | null;
  requestId?: string | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  pendingRaw: any;
  target: PrepareAttackCardEffect["target"];
  draft: AttackCardDraftV1;
  operationId: string;
}): Promise<
  | { ok: true; committed_effect: PrepareAttackCardCommittedEffect }
  | { ok: false; reason_code: string; ack: string }
> {
  const token = await createConfirmationToken({
    user_id: args.userId,
    operation_id: args.operationId,
    operation_type: "prepare_attack_card",
    draft: args.draft,
    source_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    pending_confirmation_id: args.operationId,
    secret: envString(
      "CONFIRMATION_TOKEN_SECRET",
      envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
    ),
  });
  try {
    const executed = await executePrepareAttackCard({
      operation_id: args.operationId,
      user_id: args.userId,
      target: args.target,
      draft: args.draft,
      token,
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      pending_confirmation_lookup: async (id) =>
        id === args.operationId ? { consumed: false } : null,
      token_consumption_check: async () => false,
      write_attack_card: async () => {
        const { data, error } = await insertAttackCardFromDraft({
          supabase: args.supabase,
          userId: args.userId,
          draft: args.draft,
          operationId: args.operationId,
          sourceMessageId: args.sourceMessageId,
          requestId: args.requestId ?? null,
          target: args.pendingRaw?.target ?? args.target,
        });
        if (error || !data?.attack_card_id) {
          throw new Error(error?.message ?? "missing_inserted_id");
        }
        return { attack_card_id: data.attack_card_id };
      },
      secret: envString(
        "CONFIRMATION_TOKEN_SECRET",
        envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
      ),
    });
    return executed.status === "executed"
      ? {
        ok: true,
        committed_effect: {
          type: "create_attack_card",
          operation_id: args.operationId,
          attack_card_id: executed.attack_card_id,
          target: args.target,
          draft: args.draft,
        },
      }
      : {
        ok: false,
        reason_code: executed.reason_code,
        ack: executed.ack,
      };
  } catch (error) {
    return {
      ok: false,
      reason_code: error instanceof Error ? error.message : "write_failed",
      ack:
        "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
    };
  }
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
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  planSnapshot?: unknown;
  runIntake?: typeof runPrepareAttackCardAiIntake;
}): Promise<OperationRuntimeResult | null> {
  const initialFrame = loadPrepareAttackCardFrameFromTempMemory(
    args.tempMemory,
  );
  const routeSelected = operationRouteIsSelected({
    operationType: "prepare_attack_card",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  }) || isPendingAttackCardOperation(initialFrame.draftReview);
  if (!routeSelected) return null;
  if (
    routeOrTurnFramePrefersDefenseCard({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
    })
  ) return null;
  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadPrepareAttackCardFrameFromTempMemory(nextTempMemory);
  const pendingRaw = frame.pending;
  const draftReviewRaw = frame.draftReview;
  const pendingRecommendation = frame.recommendation;
  if (
    isPendingDefenseCardOperation(pendingRaw) ||
    isPendingDefenseCardRecommendationOperation(pendingRecommendation) ||
    String(
        (nextTempMemory.__active_tool_skill_intake ??
          nextTempMemory.active_tool_skill_intake ?? {})?.operation_type ?? "",
      ) === "prepare_defense_card"
  ) {
    return null;
  }
  const activeAttackCardIntakeRaw = frame.active;
  const explicitAttackCardRoute =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_attack_card";
  const hasAttackCardFlow = isPendingAttackCardOperation(pendingRaw) ||
    isPendingAttackCardOperation(draftReviewRaw) ||
    isPendingAttackCardRecommendationOperation(pendingRecommendation) ||
    String((activeAttackCardIntakeRaw as any)?.operation_type ?? "") ===
      "prepare_attack_card";
  if (
    !explicitAttackCardRoute &&
    !isPendingAttackCardOperation(pendingRaw) &&
    !isPendingAttackCardOperation(draftReviewRaw) &&
    !isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    String((activeAttackCardIntakeRaw as any)?.operation_type ?? "") !==
      "prepare_attack_card" &&
    args.routeDecision?.response_owner !== "tool_skill"
  ) {
    return null;
  }
  if (
    isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    !explicitAttackCardRoute &&
    args.routeDecision?.response_owner !== "tool_skill" &&
    !detectStructuredAttackCardConfirmation(args.turnFrame)
  ) {
    return null;
  }
  if (!explicitAttackCardRoute && !hasAttackCardFlow) return null;
  if (
    !isPendingAttackCardOperation(pendingRaw) &&
    !isPendingAttackCardOperation(draftReviewRaw) &&
    !isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    !activeAttackCardIntakeRaw &&
    isAttackCardLocationOrManagementQuestion(args.userMessage)
  ) {
    return null;
  }
  const occupiedAttackKeywords = await loadActiveAttackKeywordOptions({
    supabase: args.supabase,
    userId: args.userId,
  });
  const preferSingleTechniqueQuestion = await loadCoachQuestionTendencyLow(
    args.supabase,
    args.userId,
  );
  const withOccupiedAttackKeywords = (
    input: Record<string, unknown> | null | undefined,
  ) => ({
    ...(input ?? {}),
    occupied_activation_keywords: occupiedAttackKeywords,
  });
  const detectAttackCardConfirmation = () =>
    detectStructuredAttackCardConfirmation(args.turnFrame);
  const runAttackCardIntake = (
    input: Parameters<typeof runPrepareAttackCardAiIntake>[0],
  ) =>
    (args.runIntake ?? runPrepareAttackCardAiIntake)({
      ...input,
      request_id: args.requestId ?? null,
    });
  let fallbackOperationInput = operationInputFromLastPlanItemLocal(
    nextTempMemory,
  );
  if (isPendingAttackCardOperation(pendingRaw)) {
    if (detectAttackCardConfirmation() === "yes") {
      const skillDecision = decidePrepareAttackCardNextStep({
        pendingRaw,
        user_intent: "create",
        constraints: [],
        draft_review_decision: {
          decision: "approve",
          evidence: ["structured_confirmation_response"],
        },
      });
      const effect = skillDecision.allowed_effects[0];
      if (effect) {
        const executed = await executeConfirmedAttackCardDraft({
          supabase: args.supabase,
          userId: args.userId,
          sourceMessageId: args.sourceMessageId,
          requestId: args.requestId ?? null,
          safetyPregateOutput: args.safetyPregateOutput,
          pendingRaw,
          target: effect.target,
          draft: effect.draft,
          operationId: effect.operation_id,
        });
        const cleared = clearPrepareAttackCardFrame(nextTempMemory);
        if (!executed.ok) {
          return adaptPrepareAttackCardResultToOperationRuntime({
            result: withPrepareAttackCardReply(skillDecision, {
              status: "failed",
              reply: renderAttackCardFailedReply(),
              allowed_effects: skillDecision.allowed_effects,
            }),
            nextTempMemory: cleared,
            extraToolSkillRun: {
              operation_id: effect.operation_id,
              error: executed.reason_code,
              confirmation_decision: {
                decision: "approve",
                source: "structured_confirmation_response",
              },
            },
          });
        }
        const committed = executed.committed_effect;
        return adaptPrepareAttackCardResultToOperationRuntime({
          result: withPrepareAttackCardReply(skillDecision, {
            status: "executed",
            reply: renderAttackCardExecutedReply(committed),
            committed_effects: [committed],
          }),
          nextTempMemory: cleared,
          extraToolSkillRun: {
            operation_id: effect.operation_id,
            attack_card_id: committed.attack_card_id,
            confirmation_decision: {
              decision: "approve",
              source: "structured_confirmation_response",
            },
          },
        });
      }
    }
    const injectedDraftReviewDecision = attackCardReviewFromPending(
      pendingRaw as unknown as Record<string, unknown>,
    );
    const pendingReviewOutput = injectedDraftReviewDecision
      ? {
        status: "draft_review_decision",
        user_intent: userIntentFromConfirmationReview(
          injectedDraftReviewDecision,
        ),
        constraints: constraintsFromConfirmationReview(
          injectedDraftReviewDecision,
        ),
        ack: null,
        pending_confirmation: null,
        draft: null,
        next_question: null,
        phase: "confirmation",
        state_patch: {
          missing_slots: [],
          operation_input: null,
          tool_skill_state: null,
          draft_review_decision: injectedDraftReviewDecision,
        },
      } as unknown as Awaited<ReturnType<typeof runPrepareAttackCardAiIntake>>
      : await runAttackCardIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        plan_snapshot: args.planSnapshot ?? {},
        operation_input: withOccupiedAttackKeywords({
          previous_draft: pendingRaw.draft,
          target: attackCardTargetFromPendingConfirmation(
            pendingRaw as unknown as Record<string, unknown>,
            null,
          ),
          technique: pendingRaw.draft?.draft?.technique ?? undefined,
          activation_keyword: pendingRaw.draft?.draft?.activation_keyword ??
            undefined,
          intake_state: (pendingRaw as any).intake_state ?? undefined,
        }),
      });
    if (pendingReviewOutput.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: pendingReviewOutput,
        nextTempMemory,
        operationId: pendingRaw.operation_id ?? null,
      });
    }
    const draftReviewDecision =
      pendingReviewOutput.state_patch.draft_review_decision;
    const confirmationDecision = buildConfirmationDecisionFromSkillReview({
      pending: {
        operation_id: pendingRaw.operation_id ?? null,
        operation_type: "prepare_attack_card",
        effect_type: "attack_card.create",
        summary: pendingRaw.draft?.draft?.title ?? null,
        draft: pendingRaw.draft,
        expires_after_turns: pendingRaw.expires_after_turns ?? null,
      },
      review: draftReviewDecision,
      reason_code_prefix: "prepare_attack_card",
    });
    if (confirmationDecision.decision === "unrelated") return null;
    if (
      confirmationDecision.decision === "topic_change" &&
      !explicitAttackCardRoute
    ) {
      return null;
    }
    const skillDecision = decidePrepareAttackCardNextStep({
      pendingRaw,
      user_intent: pendingReviewOutput.user_intent,
      constraints: pendingReviewOutput.constraints,
      draft_review_decision: draftReviewDecision,
    });
    if (skillDecision.status === "draft_ready") {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardDraftOnlyReply(pendingRaw.draft),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
          confirmation_decision: confirmationDecision,
        },
      });
    }
    if (skillDecision.status === "explained") {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardExplanationReply(pendingRaw.draft),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
          confirmation_decision: confirmationDecision,
        },
      });
    }
    if (!skillDecision.handled) {
      if (skillDecision.status === "topic_change") {
        const cleared = clearPrepareAttackCardFrame(nextTempMemory);
        return adaptPrepareAttackCardResultToOperationRuntime({
          result: withPrepareAttackCardReply(skillDecision, {
            reply: "Ok, je laisse cette carte d'attaque de côté.",
          }),
          nextTempMemory: cleared,
          extraToolSkillRun: {
            operation_id: pendingRaw.operation_id ?? null,
          },
        });
      }
      return null;
    }
    if (!draftReviewDecision) {
      if (
        pendingReviewOutput.status === "pending_confirmation" &&
        pendingReviewOutput.pending_confirmation &&
        pendingReviewOutput.draft
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...pendingReviewOutput.pending_confirmation,
          target: attackCardTargetFromPendingConfirmation(
            pendingReviewOutput.pending_confirmation,
            {
              target: pendingRaw.target ?? null,
              intake_state: (pendingRaw as any).intake_state ?? undefined,
            },
          ),
          created_at: new Date().toISOString(),
          turn_count: 0,
          supersedes_operation_id: pendingRaw.operation_id ?? null,
        };
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: renderAttackCardPendingConfirmationReply(
            pendingReviewOutput.draft,
          ),
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "pending_confirmation_updated",
            operation_id: String(
              pendingReviewOutput.pending_confirmation.operation_id ??
                pendingRaw.operation_id ??
                "",
            ),
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: pendingReviewOutput.draft,
            draft_review_decision: null,
          },
        };
      }
      if (pendingReviewOutput.status === "ask_question") {
        const nextQuestion = applyAttackCardSingleTechniquePreference(
          pendingReviewOutput.next_question,
          { preferSingleTechnique: preferSingleTechniqueQuestion },
        );
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "prepare_attack_card",
          phase: pendingReviewOutput.phase,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          operation_input: mergeAttackCardQuestionKnownSlots(
            pendingReviewOutput.state_patch.operation_input ??
              pendingReviewOutput.next_question?.known_slots ?? null,
            nextQuestion,
          ),
          tool_skill_state: pendingReviewOutput.state_patch.tool_skill_state ??
            null,
          turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        return {
          content: renderAttackCardSlotQuestion(nextQuestion),
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: pendingReviewOutput.status,
            operation_id: pendingRaw.operation_id ?? null,
            missing_slots: pendingReviewOutput.state_patch.missing_slots,
            slot_state: nextQuestion ?? null,
            draft_review_decision: null,
          },
        };
      }
      return {
        content: pendingReviewOutput.ack ??
          "Je n'ai pas réussi à relire cette validation techniquement. Je préfère ne rien créer sans confirmation claire.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: pendingReviewOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          draft_review_decision: null,
        },
      };
    }
    if (draftReviewDecision.decision === "reject") {
      const cleared = clearPrepareAttackCardFrame(nextTempMemory);
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: "cancelled",
          reply: renderAttackCardCancelledReply(),
        }),
        nextTempMemory: cleared,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      });
    }
    if (draftReviewDecision.decision === "explain") {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: "explained",
          reply: renderAttackCardExplanationReply(pendingRaw.draft),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      });
    }
    if (draftReviewDecision.decision === "revise") {
      if (
        pendingReviewOutput.status === "pending_confirmation" &&
        pendingReviewOutput.pending_confirmation &&
        pendingReviewOutput.draft
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...pendingReviewOutput.pending_confirmation,
          target: attackCardTargetFromPendingConfirmation(
            pendingReviewOutput.pending_confirmation,
            null,
          ),
          created_at: new Date().toISOString(),
          turn_count: 0,
          supersedes_operation_id: pendingRaw.operation_id ?? null,
        };
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: renderAttackCardPendingConfirmationReply(
            pendingReviewOutput.draft,
          ),
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "pending_confirmation_updated",
            operation_id: String(
              pendingReviewOutput.pending_confirmation.operation_id ??
                pendingRaw.operation_id ??
                "",
            ),
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: pendingReviewOutput.draft,
            draft_review_decision: draftReviewDecision,
          },
        };
      }

      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      const nextQuestion = applyAttackCardSingleTechniquePreference(
        pendingReviewOutput.next_question,
        { preferSingleTechnique: preferSingleTechniqueQuestion },
      );
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_attack_card",
        phase: pendingReviewOutput.phase,
        missing_slots: pendingReviewOutput.state_patch.missing_slots,
        slot_state: nextQuestion ?? null,
        operation_input: mergeAttackCardQuestionKnownSlots(
          pendingReviewOutput.state_patch.operation_input ?? {
            ...(pendingReviewOutput.next_question?.known_slots ?? {}),
          },
          nextQuestion,
        ),
        tool_skill_state: pendingReviewOutput.state_patch.tool_skill_state ??
          null,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
      };
      return {
        content: renderAttackCardSlotQuestion(nextQuestion),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: pendingReviewOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision !== "approve") return null;

    const effect = skillDecision.allowed_effects[0];
    if (!effect) {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: "blocked",
          reply: renderAttackCardBlockedCreateReply(),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
        },
      });
    }
    const executed = await executeConfirmedAttackCardDraft({
      supabase: args.supabase,
      userId: args.userId,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      safetyPregateOutput: args.safetyPregateOutput,
      pendingRaw,
      target: effect.target,
      draft: effect.draft,
      operationId: effect.operation_id,
    });
    const cleared = clearPrepareAttackCardFrame(nextTempMemory);
    if (!executed.ok) {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: "failed",
          reply: renderAttackCardFailedReply(),
          allowed_effects: skillDecision.allowed_effects,
        }),
        nextTempMemory: cleared,
        extraToolSkillRun: {
          operation_id: effect.operation_id,
          error: executed.reason_code,
        },
      });
    }
    const committed = executed.committed_effect;
    return adaptPrepareAttackCardResultToOperationRuntime({
      result: withPrepareAttackCardReply(skillDecision, {
        status: "executed",
        reply: renderAttackCardExecutedReply(committed),
        committed_effects: [committed],
      }),
      nextTempMemory: cleared,
      extraToolSkillRun: {
        operation_id: effect.operation_id,
        attack_card_id: committed.attack_card_id,
      },
    });
  }

  if (isPendingAttackCardOperation(draftReviewRaw)) {
    const draftReviewOutput = await runAttackCardIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "direct_user_request",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      turn_count: Number(draftReviewRaw.turn_count ?? 0) + 1,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: withOccupiedAttackKeywords({
        previous_draft: draftReviewRaw.draft,
        target: attackCardTargetFromPendingConfirmation(
          draftReviewRaw as unknown as Record<string, unknown>,
          null,
        ),
        technique: draftReviewRaw.draft?.draft?.technique ?? undefined,
        activation_keyword: draftReviewRaw.draft?.draft?.activation_keyword ??
          undefined,
        intake_state: (draftReviewRaw as any).intake_state ?? undefined,
      }),
    });
    if (draftReviewOutput.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: draftReviewOutput,
        nextTempMemory,
        operationId: draftReviewRaw.operation_id ?? null,
      });
    }
    const draftReviewDecision =
      draftReviewOutput.state_patch.draft_review_decision;
    const skillDecision = decidePrepareAttackCardNextStep({
      pendingRaw: draftReviewRaw,
      user_intent: draftReviewOutput.user_intent,
      constraints: draftReviewOutput.constraints,
      draft_review_decision: draftReviewDecision,
    });

    if (skillDecision.status === "draft_ready") {
      const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
        draftReview: {
          ...(draftReviewRaw as Record<string, unknown>),
          turn_count: Number(draftReviewRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        },
      });
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardDraftOnlyReply(draftReviewRaw.draft),
        }),
        nextTempMemory: next,
        extraToolSkillRun: {
          operation_id: draftReviewRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
        },
      });
    }

    if (skillDecision.status === "explained") {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardExplanationReply(draftReviewRaw.draft),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: draftReviewRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
        },
      });
    }

    if (
      skillDecision.status === "cancelled" ||
      skillDecision.status === "topic_change"
    ) {
      const cleared = clearPrepareAttackCardFrame(nextTempMemory);
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: skillDecision.status === "topic_change"
            ? "topic_change"
            : "cancelled",
          reply: skillDecision.status === "topic_change"
            ? "Ok, je laisse cette carte d'attaque de côté."
            : renderAttackCardCancelledReply(),
        }),
        nextTempMemory: cleared,
        extraToolSkillRun: {
          operation_id: draftReviewRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
        },
      });
    }

    if (skillDecision.status === "pending_confirmation") {
      const pending = {
        ...(draftReviewRaw as Record<string, unknown>),
        phase: "awaiting_create_confirmation",
        executable: true,
        turn_count: 0,
        updated_at: new Date().toISOString(),
      };
      const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
        pending,
        draftReview: null,
        active: null,
      });
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardPendingConfirmationReply(draftReviewRaw.draft),
          pending_confirmation: pending,
        }),
        nextTempMemory: next,
        extraToolSkillRun: {
          operation_id: draftReviewRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
        },
      });
    }

    if (
      draftReviewOutput.status === "pending_confirmation" &&
      draftReviewOutput.pending_confirmation &&
      draftReviewOutput.draft
    ) {
      const target = attackCardTargetFromPendingConfirmation(
        draftReviewOutput.pending_confirmation,
        { target: draftReviewRaw.target ?? null },
      );
      const runtime = applyPrepareAttackCardInitialDraftDecision({
        output: draftReviewOutput,
        target,
        tempMemory: nextTempMemory,
        supersedesOperationId: draftReviewRaw.operation_id ?? null,
      });
      if (runtime) return runtime;
    }

    if (draftReviewOutput.status === "ask_question") {
      const nextQuestion = applyAttackCardSingleTechniquePreference(
        draftReviewOutput.next_question,
        { preferSingleTechnique: preferSingleTechniqueQuestion },
      );
      const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
        draftReview: null,
        active: {
          operation_type: "prepare_attack_card",
          phase: draftReviewOutput.phase,
          missing_slots: draftReviewOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          operation_input: mergeAttackCardQuestionKnownSlots(
            draftReviewOutput.state_patch.operation_input ?? {
              previous_draft: draftReviewRaw.draft,
              target: draftReviewRaw.target ?? null,
              ...(draftReviewOutput.next_question?.known_slots ?? {}),
            },
            nextQuestion,
          ),
          tool_skill_state: draftReviewOutput.state_patch.tool_skill_state ??
            null,
          turn_count: Number(draftReviewRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        },
      });
      return {
        content: renderAttackCardSlotQuestion(nextQuestion),
        nextTempMemory: next,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "revised",
          operation_id: draftReviewRaw.operation_id ?? null,
          missing_slots: draftReviewOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          draft_review_decision: draftReviewDecision ?? null,
          committed_effects: [],
        },
      };
    }

    return adaptPrepareAttackCardResultToOperationRuntime({
      result: withPrepareAttackCardReply(skillDecision, {
        reply: renderAttackCardBlockedCreateReply(),
      }),
      nextTempMemory,
      extraToolSkillRun: {
        operation_id: draftReviewRaw.operation_id ?? null,
        draft_review_decision: draftReviewDecision ?? null,
      },
    });
  }

  const activeAttackCardIntake = activeAttackCardIntakeRaw as any;
  const activeTargetQuestion = activeAttackCardIntake?.operation_type ===
      "prepare_attack_card"
    ? activeAttackCardIntake.slot_state ?? activeAttackCardIntake.next_question
    : null;
  const activeTargetCandidate = attackCardTargetFromQuestionCandidate(
    activeTargetQuestion?.candidate,
  );
  const activeKnownSlots = attackCardOperationInputWithSingleTechniqueApproval(
    activeAttackCardIntake?.operation_input ??
      activeTargetQuestion?.known_slots ??
      {},
    args.userMessage,
  ) ?? {};
  if (activeTargetCandidate) {
    const candidateOutput = await runAttackCardIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "direct_user_request",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      turn_count: Number(activeAttackCardIntake.turn_count ?? 0) + 1,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: withOccupiedAttackKeywords({
        ...activeKnownSlots,
        target_candidate: activeTargetCandidate,
      }),
    });
    if (candidateOutput.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: candidateOutput,
        nextTempMemory,
      });
    }
    if (
      candidateOutput.status === "pending_confirmation" &&
      candidateOutput.pending_confirmation &&
      candidateOutput.draft
    ) {
      const target = attackCardTargetFromPendingConfirmation(
        candidateOutput.pending_confirmation,
        { target: activeTargetCandidate },
      );
      const runtime = applyPrepareAttackCardInitialDraftDecision({
        output: candidateOutput,
        target,
        tempMemory: nextTempMemory,
      });
      if (runtime) {
        runtime.toolSkillRun = {
          ...(runtime.toolSkillRun ?? {}),
          target_slot_resolution: {
            status: "resolved_by_skill_intake",
            target: activeTargetCandidate,
          },
        };
        return runtime;
      }
    }
    const nextQuestion = applyAttackCardSingleTechniquePreference(
      candidateOutput.next_question,
      { preferSingleTechnique: preferSingleTechniqueQuestion },
    );
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "prepare_attack_card",
      phase: candidateOutput.phase,
      missing_slots: candidateOutput.state_patch.missing_slots,
      slot_state: nextQuestion ?? null,
      operation_input: mergeAttackCardQuestionKnownSlots(
        candidateOutput.state_patch.operation_input ?? {
          ...activeKnownSlots,
          target_candidate: activeTargetCandidate,
          ...(candidateOutput.next_question?.known_slots ?? {}),
        },
        nextQuestion,
      ),
      tool_skill_state: candidateOutput.state_patch.tool_skill_state ?? null,
      turn_count: Number(activeAttackCardIntake.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: renderAttackCardSlotQuestion(nextQuestion),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: candidateOutput.status,
        missing_slots: candidateOutput.state_patch.missing_slots,
        slot_state: nextQuestion ?? null,
        target_slot_resolution: {
          status: "handled_by_skill_intake",
          target: activeTargetCandidate,
        },
      },
    };
  }

  if (
    activeAttackCardIntake?.operation_type === "prepare_attack_card" &&
    activeAttackCardIntake?.operation_input
  ) {
    fallbackOperationInput =
      attackCardOperationInputWithSingleTechniqueApproval(
        activeAttackCardIntake.operation_input,
        args.userMessage,
      ) ?? activeAttackCardIntake.operation_input;
  }

  if (isPendingAttackCardRecommendationOperation(pendingRecommendation)) {
    const confirmation = detectAttackCardConfirmation();
    if (confirmation === "no") {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: "Ok, je ne crée pas cette carte d'attaque.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "recommendation_cancelled",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes" && !explicitAttackCardRoute) return null;

    const recommendationOutput = await runAttackCardIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: withOccupiedAttackKeywords(
        pendingRecommendation.operation_input ?? null,
      ),
    });
    if (recommendationOutput.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: recommendationOutput,
        nextTempMemory,
        source: "recommendation_tool",
        recommendationId: pendingRecommendation.recommendation_id ?? null,
      });
    }

    if (
      recommendationOutput.status !== "pending_confirmation" ||
      !recommendationOutput.draft ||
      !recommendationOutput.pending_confirmation
    ) {
      delete nextTempMemory.__pending_recommendation_operation;
      if (recommendationOutput.status === "ask_question") {
        const nextQuestion = applyAttackCardSingleTechniquePreference(
          recommendationOutput.next_question,
          { preferSingleTechnique: preferSingleTechniqueQuestion },
        );
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "prepare_attack_card",
          phase: recommendationOutput.phase,
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          operation_input: mergeAttackCardQuestionKnownSlots(
            recommendationOutput.state_patch.operation_input ?? {
              ...(pendingRecommendation.operation_input ?? {}),
              ...(recommendationOutput.next_question?.known_slots ?? {}),
            },
            nextQuestion,
          ),
          tool_skill_state: recommendationOutput.state_patch.tool_skill_state ??
            null,
          turn_count: 1,
          updated_at: new Date().toISOString(),
        };
        return {
          content: renderAttackCardSlotQuestion(
            nextQuestion,
            recommendationOutput.state_patch.missing_slots.includes("target")
              ? "Il manque la cible à rattacher à cette carte."
              : "Il me manque encore un choix pour préparer cette carte.",
          ),
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: recommendationOutput.status,
            source: "recommendation_tool",
            missing_slots: recommendationOutput.state_patch.missing_slots,
            slot_state: nextQuestion ?? null,
          },
        };
      }
      return {
        content: renderAttackCardSlotQuestion(
          recommendationOutput.next_question,
          recommendationOutput.state_patch.missing_slots.includes("target")
            ? "Il manque la cible à rattacher à cette carte."
            : "Il me manque encore un choix pour préparer cette carte.",
        ),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: recommendationOutput.status,
          source: "recommendation_tool",
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: recommendationOutput.next_question ?? null,
        },
      };
    }

    const runtime = applyPrepareAttackCardInitialDraftDecision({
      output: recommendationOutput,
      target: attackCardTargetFromPendingConfirmation(
        recommendationOutput.pending_confirmation,
        pendingRecommendation.operation_input ?? null,
      ),
      tempMemory: nextTempMemory,
      source: "recommendation_tool",
    });
    if (runtime) {
      runtime.toolSkillRun = {
        ...(runtime.toolSkillRun ?? {}),
        source: "recommendation_tool",
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
      };
      return runtime;
    }
  }

  // Chantier 4 (2026-05-28) — Garde-fou: si une carte d'attaque active a
  // été créée très récemment (< 5 min) ET que le user ne demande PAS
  // explicitement une nouvelle carte, on court-circuite le slot filling et
  // on demande de clarifier. Empêche le handler de produire le bug
  // historique A2-r4 T8 ("Je n'ai pas encore créé de carte d'attaque, on
  // commence juste la préparation") alors qu'une carte fraîche existe.
  // Voir docs/agent-playbook/13-architecture-skills, chantier 4.
  const recentActiveCard = await loadRecentActiveAttackCardForUser({
    supabase: args.supabase,
    userId: args.userId,
    maxAgeSeconds: 300,
  });
  if (
    recentActiveCard &&
    !userExplicitlyAsksForNewAttackCard(args.userMessage)
  ) {
    const minutes = Math.max(1, Math.round(recentActiveCard.ageSeconds / 60));
    const ageLabel = recentActiveCard.ageSeconds < 60
      ? "il y a moins d'une minute"
      : `il y a ${minutes} min`;
    const clarification = [
      `Avant que je relance une préparation : tu as déjà une carte d'attaque active "${recentActiveCard.title}" (créée ${ageLabel}).`,
      "",
      "Tu veux qu'on en prépare une nouvelle, ou tu utilises celle-là ?",
    ].join("\n");
    return {
      content: clarification,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "duplicate_active_attack_card_guard",
        recent_active_attack_card_id: recentActiveCard.id,
        recent_active_attack_card_age_seconds: recentActiveCard.ageSeconds,
        recent_active_attack_card_title: recentActiveCard.title,
      },
    };
  }

  const output = await runAttackCardIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(activeAttackCardIntake?.turn_count ?? 0),
    plan_snapshot: args.planSnapshot ?? {},
    operation_input: {
      ...(fallbackOperationInput ?? {}),
      occupied_activation_keywords: occupiedAttackKeywords,
    },
  });
  if (output.status === "technical_blocked") {
    return technicalAttackCardRuntime({
      output,
      nextTempMemory,
    });
  }

  if (
    output.status === "pending_confirmation" &&
    output.pending_confirmation &&
    output.draft
  ) {
    const target = attackCardTargetFromPendingConfirmation(
      output.pending_confirmation,
      fallbackOperationInput,
    );
    const runtime = applyPrepareAttackCardInitialDraftDecision({
      output,
      target,
      fallbackOperationInput,
      tempMemory: nextTempMemory,
    });
    if (runtime) return runtime;
  }

  if (output.status === "ask_question") {
    const nextQuestion = applyAttackCardSingleTechniquePreference(
      output.next_question,
      { preferSingleTechnique: preferSingleTechniqueQuestion },
    );
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "prepare_attack_card",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      slot_state: nextQuestion ?? null,
      operation_input: mergeAttackCardQuestionKnownSlots(
        output.state_patch.operation_input ??
          output.next_question?.known_slots ?? null,
        nextQuestion,
      ),
      tool_skill_state: output.state_patch.tool_skill_state ?? null,
      turn_count: 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: renderAttackCardSlotQuestion(nextQuestion),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "ask_question",
        missing_slots: output.state_patch.missing_slots,
        slot_state: nextQuestion ?? null,
      },
    };
  }

  return {
    content: output.ack ??
      "Je n'ai pas pu préparer cette carte depuis le chat pour l'instant.",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "prepare_attack_card",
        reason_code: output.status === "blocked_by_safety"
          ? "blocked_by_safety"
          : output.readiness?.reason ?? "intake_failed",
      }],
    },
  };
}
