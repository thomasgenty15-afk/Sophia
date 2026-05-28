/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import {
  applyAttackCardSingleTechniquePreferenceForTest,
  attackCardCreatedLocation,
  attackCardOperationInputWithSingleTechniqueApproval,
  attackCardTargetFromPendingConfirmation,
  attackCardTargetFromQuestionCandidate,
  detectConfirmationKind,
  insertAttackCardFromDraft,
  isActiveAttackCardKeywordIntake,
  isAttackCardCancellationRequestForTest,
  isAttackCardExplicitApprovalForTest,
  isAttackCardLocationOrManagementQuestion,
  isExplicitDefenseCardIntentForTest,
  isMicroActionOnlyNotAttackCardForTest,
  isOperationEscapeMessage,
  isPendingAttackCardOperation,
  isPendingAttackCardRecommendationOperation,
  isPendingDefenseCardOperation,
  isPendingDefenseCardRecommendationOperation,
  loadActiveAttackKeywordOptions,
  loadCoachQuestionTendencyLow,
  loadRecentActiveAttackCardForUser,
  mergeAttackCardQuestionKnownSlots,
  operationInputFromLastPlanItem,
  type OperationRuntimeResult,
  operationRouteIsSelected,
  renderAttackCardSlotQuestion,
  userExplicitlyAsksForNewAttackCardForTest,
} from "../../../router/run.ts";
import { runPrepareAttackCardAiIntake } from "./ai_intake.ts";

/**
 * Chantier 5 (2026-05-28) — Router du tool prepare_attack_card.
 *
 * Cette fonction a été déplacée depuis `router/run.ts` vers son module
 * propre pour réduire la "glue layer" qui s'était accumulée dans le
 * fichier d'orchestration central. Voir
 * docs/agent-playbook/13-architecture-skills, chantier 5.
 *
 * Pour l'instant la fonction est physiquement déplacée mais les helpers
 * qu'elle utilise restent dans `router/run.ts` (exportés). Une session
 * ultérieure pourra rapatrier ces helpers ici (les attack-card-only) ou
 * dans un module partagé (les génériques). Cette première étape ne change
 * AUCUN comportement, c'est une relocation pure.
 *
 * Les 4 branches internes de cette fonction (pending_review, active_target,
 * pending_recommendation, fresh_start) restent dans cette fonction pour
 * cette première itération. Un découpage en sous-fonctions plus propres
 * est laissé à un chantier ultérieur.
 */
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
}): Promise<OperationRuntimeResult | null> {
  const routeSelected = operationRouteIsSelected({
    operationType: "prepare_attack_card",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  });
  if (!routeSelected) return null;
  if (isExplicitDefenseCardIntentForTest(args.userMessage)) return null;
  if (
    isAttackCardCancellationRequestForTest(args.userMessage) ||
    isMicroActionOnlyNotAttackCardForTest(args.userMessage)
  ) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;
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
  const activeAttackCardIntakeRaw = nextTempMemory.__active_tool_skill_intake ??
    nextTempMemory.active_tool_skill_intake ??
    null;
  const explicitAttackCardRoute =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_attack_card";
  const hasAttackCardFlow = isPendingAttackCardOperation(pendingRaw) ||
    isPendingAttackCardRecommendationOperation(pendingRecommendation) ||
    String((activeAttackCardIntakeRaw as any)?.operation_type ?? "") ===
      "prepare_attack_card";
  if (
    !explicitAttackCardRoute &&
    !isPendingAttackCardOperation(pendingRaw) &&
    String((activeAttackCardIntakeRaw as any)?.operation_type ?? "") !==
      "prepare_attack_card" &&
    args.routeDecision?.response_owner !== "tool_skill"
  ) {
    return null;
  }
  if (
    isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    !explicitAttackCardRoute &&
    args.routeDecision?.response_owner !== "tool_skill"
  ) {
    return null;
  }
  if (!explicitAttackCardRoute && !hasAttackCardFlow) return null;
  if (
    !isPendingAttackCardOperation(pendingRaw) &&
    !isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    !activeAttackCardIntakeRaw &&
    isAttackCardLocationOrManagementQuestion(args.userMessage)
  ) {
    return null;
  }
  if (
    isOperationEscapeMessage(args.userMessage) &&
    !isPendingAttackCardOperation(pendingRaw) &&
    !isActiveAttackCardKeywordIntake(activeAttackCardIntakeRaw)
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
    detectConfirmationKind({
      userMessage: args.userMessage,
      operationType: "prepare_attack_card",
      pendingContext: pendingRecommendation,
      requestId: args.requestId ?? null,
      structuredOnly: true,
    });
  const runAttackCardIntake = (
    input: Parameters<typeof runPrepareAttackCardAiIntake>[0],
  ) =>
    runPrepareAttackCardAiIntake({
      ...input,
      request_id: args.requestId ?? null,
    });
  let fallbackOperationInput = operationInputFromLastPlanItem(nextTempMemory);
  if (isPendingAttackCardOperation(pendingRaw)) {
    if (isAttackCardExplicitApprovalForTest(args.userMessage)) {
      const { data, error } = await insertAttackCardFromDraft({
        supabase: args.supabase,
        userId: args.userId,
        draft: pendingRaw.draft,
        operationId: pendingRaw.operation_id ?? null,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId ?? null,
        target: pendingRaw.target ?? null,
      });
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
      delete nextTempMemory.__pending_recommendation_operation;
      if (error || !data?.id) {
        return {
          content:
            "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
          nextTempMemory,
          toolExecution: "failed",
          executedTools: ["prepare_attack_card"],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "failed",
            operation_id: pendingRaw.operation_id ?? null,
            error: error?.message ?? "missing_inserted_id",
            draft_review_decision: {
              decision: "approve",
              confidence: "high",
              evidence: ["deterministic_explicit_attack_card_approval"],
            },
          },
        };
      }
      return {
        content:
          `C'est fait. J'ai créé cette carte d'attaque :\n\n${pendingRaw.draft.draft.title}\nTechnique : ${pendingRaw.draft.draft.technique_title}\n${pendingRaw.draft.draft.generated_asset}\n\nMode d'emploi : ${pendingRaw.draft.draft.mode_emploi}\n\n${
            attackCardCreatedLocation(
              pendingRaw.target,
              pendingRaw.draft.draft.technique,
            )
          }`,
        nextTempMemory,
        toolExecution: "success",
        executedTools: ["prepare_attack_card"],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "executed",
          operation_id: pendingRaw.operation_id ?? null,
          attack_card_id: data.id,
          draft_review_decision: {
            decision: "approve",
            confidence: "high",
            evidence: ["deterministic_explicit_attack_card_approval"],
          },
        },
      };
    }
    const pendingReviewOutput = await runAttackCardIntake({
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
    const draftReviewDecision =
      pendingReviewOutput.state_patch.draft_review_decision;
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
          content: pendingReviewOutput.confirmation?.message ??
            pendingReviewOutput.draft.confirmation_message,
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
        const nextQuestion = applyAttackCardSingleTechniquePreferenceForTest(
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
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: "Ok, je ne crée pas cette carte d'attaque.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "explain") {
      return {
        content: pendingRaw.draft?.confirmation_message ??
          pendingRaw.draft?.draft?.mode_emploi ??
          "",
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "draft_review_details",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
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
          content: pendingReviewOutput.confirmation?.message ??
            pendingReviewOutput.draft.confirmation_message,
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
      const nextQuestion = applyAttackCardSingleTechniquePreferenceForTest(
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

    const { data, error } = await insertAttackCardFromDraft({
      supabase: args.supabase,
      userId: args.userId,
      draft: pendingRaw.draft,
      operationId: pendingRaw.operation_id ?? null,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      target: pendingRaw.target ?? null,
    });
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    if (error || !data?.id) {
      return {
        content:
          "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
        nextTempMemory,
        toolExecution: "failed",
        executedTools: ["prepare_attack_card"],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "failed",
          operation_id: pendingRaw.operation_id ?? null,
          error: error?.message ?? "missing_inserted_id",
        },
      };
    }
    return {
      content:
        `C'est fait. J'ai créé cette carte d'attaque :\n\n${pendingRaw.draft.draft.title}\nTechnique : ${pendingRaw.draft.draft.technique_title}\n${pendingRaw.draft.draft.generated_asset}\n\nMode d'emploi : ${pendingRaw.draft.draft.mode_emploi}\n\n${
        attackCardCreatedLocation(
          pendingRaw.target,
          pendingRaw.draft.draft.technique,
        )
      }`,
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["prepare_attack_card"],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "executed",
        operation_id: pendingRaw.operation_id ?? null,
        attack_card_id: data.id,
      },
    };
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
    if (
      candidateOutput.status === "pending_confirmation" &&
      candidateOutput.pending_confirmation
    ) {
      const target = attackCardTargetFromPendingConfirmation(
        candidateOutput.pending_confirmation,
        { target: activeTargetCandidate },
      );
      if (
        isAttackCardExplicitApprovalForTest(args.userMessage) &&
        candidateOutput.draft
      ) {
        const { data, error } = await insertAttackCardFromDraft({
          supabase: args.supabase,
          userId: args.userId,
          draft: candidateOutput.draft,
          operationId:
            (candidateOutput.pending_confirmation as any)?.operation_id ??
              null,
          sourceMessageId: args.sourceMessageId,
          requestId: args.requestId ?? null,
          target,
        });
        delete nextTempMemory.__pending_tool_skill_confirmation;
        delete nextTempMemory.pending_tool_skill_confirmation;
        delete nextTempMemory.__active_tool_skill_intake;
        delete nextTempMemory.active_tool_skill_intake;
        delete nextTempMemory.__pending_recommendation_operation;
        if (error || !data?.id) {
          return {
            content:
              "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
            nextTempMemory,
            toolExecution: "failed",
            executedTools: ["prepare_attack_card"],
            toolSkillRun: {
              selected_handler: "prepare_attack_card",
              status: "failed",
              operation_id:
                (candidateOutput.pending_confirmation as any)?.operation_id ??
                  null,
              error: error?.message ?? "missing_inserted_id",
              draft_review_decision: {
                decision: "approve",
                confidence: "high",
                evidence: [
                  "active_intake_generated_draft_after_explicit_approval",
                ],
              },
            },
          };
        }
        return {
          content:
            `C'est fait. J'ai créé cette carte d'attaque :\n\n${candidateOutput.draft.draft.title}\nTechnique : ${candidateOutput.draft.draft.technique_title}\n${candidateOutput.draft.draft.generated_asset}\n\nMode d'emploi : ${candidateOutput.draft.draft.mode_emploi}\n\n${
              attackCardCreatedLocation(
                target,
                candidateOutput.draft.draft.technique,
              )
            }`,
          nextTempMemory,
          toolExecution: "success",
          executedTools: ["prepare_attack_card"],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "executed",
            operation_id:
              (candidateOutput.pending_confirmation as any)?.operation_id ??
                null,
            attack_card_id: data.id,
            draft_review_decision: {
              decision: "approve",
              confidence: "high",
              evidence: [
                "active_intake_generated_draft_after_explicit_approval",
              ],
            },
          },
        };
      }
      nextTempMemory.__pending_tool_skill_confirmation = {
        ...candidateOutput.pending_confirmation,
        target,
        created_at: new Date().toISOString(),
        turn_count: 0,
      };
      delete nextTempMemory.pending_tool_skill_confirmation;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
      return {
        content: candidateOutput.confirmation?.message ??
          candidateOutput.draft?.confirmation_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "pending_confirmation",
          operation_id:
            (candidateOutput.pending_confirmation as any)?.operation_id ??
              null,
          draft: candidateOutput.draft ?? null,
          target_slot_resolution: {
            status: "resolved_by_skill_intake",
            target: activeTargetCandidate,
          },
        },
      };
    }
    const nextQuestion = applyAttackCardSingleTechniquePreferenceForTest(
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
    const confirmation = await detectAttackCardConfirmation();
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

    if (
      recommendationOutput.status !== "pending_confirmation" ||
      !recommendationOutput.draft ||
      !recommendationOutput.pending_confirmation
    ) {
      delete nextTempMemory.__pending_recommendation_operation;
      if (recommendationOutput.status === "ask_question") {
        const nextQuestion = applyAttackCardSingleTechniquePreferenceForTest(
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

    nextTempMemory.__pending_tool_skill_confirmation = {
      ...recommendationOutput.pending_confirmation,
      target: attackCardTargetFromPendingConfirmation(
        recommendationOutput.pending_confirmation,
        pendingRecommendation.operation_input ?? null,
      ),
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.__pending_recommendation_operation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: recommendationOutput.confirmation?.message ??
        recommendationOutput.draft.confirmation_message,
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "pending_confirmation",
        source: "recommendation_tool",
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
        operation_id: String(
          recommendationOutput.pending_confirmation.operation_id ??
            "",
        ),
        draft: recommendationOutput.draft,
      },
    };
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
    !userExplicitlyAsksForNewAttackCardForTest(args.userMessage)
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

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    const target = attackCardTargetFromPendingConfirmation(
      output.pending_confirmation,
      fallbackOperationInput,
    );
    if (isAttackCardExplicitApprovalForTest(args.userMessage) && output.draft) {
      const { data, error } = await insertAttackCardFromDraft({
        supabase: args.supabase,
        userId: args.userId,
        draft: output.draft,
        operationId: (output.pending_confirmation as any)?.operation_id ?? null,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId ?? null,
        target,
      });
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
      delete nextTempMemory.__pending_recommendation_operation;
      if (error || !data?.id) {
        return {
          content:
            "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
          nextTempMemory,
          toolExecution: "failed",
          executedTools: ["prepare_attack_card"],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "failed",
            operation_id: (output.pending_confirmation as any)?.operation_id ??
              null,
            error: error?.message ?? "missing_inserted_id",
            draft_review_decision: {
              decision: "approve",
              confidence: "high",
              evidence: [
                "active_intake_generated_draft_after_explicit_approval",
              ],
            },
          },
        };
      }
      return {
        content:
          `C'est fait. J'ai créé cette carte d'attaque :\n\n${output.draft.draft.title}\nTechnique : ${output.draft.draft.technique_title}\n${output.draft.draft.generated_asset}\n\nMode d'emploi : ${output.draft.draft.mode_emploi}\n\n${
            attackCardCreatedLocation(
              target,
              output.draft.draft.technique,
            )
          }`,
        nextTempMemory,
        toolExecution: "success",
        executedTools: ["prepare_attack_card"],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "executed",
          operation_id: (output.pending_confirmation as any)?.operation_id ??
            null,
          attack_card_id: data.id,
          draft_review_decision: {
            decision: "approve",
            confidence: "high",
            evidence: [
              "active_intake_generated_draft_after_explicit_approval",
            ],
          },
        },
      };
    }
    nextTempMemory.__pending_tool_skill_confirmation = {
      ...output.pending_confirmation,
      target,
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: output.confirmation?.message ??
        "Tu veux que je crée cette carte d'attaque ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "pending_confirmation",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    const nextQuestion = applyAttackCardSingleTechniquePreferenceForTest(
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
    executedTools: output.status === "blocked_by_safety"
      ? []
      : ["prepare_attack_card"],
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
    },
  };
}
