/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { ActiveTransformationRuntime } from "../../_shared/v2-runtime.ts";
import { blocksDirectEffects } from "../safety/safety_thresholds.ts";
import {
  isSafetyRoute,
  runtimeSafetyPregateForTurn,
} from "./safety_crisis_runtime.ts";
import { agendaBlockedReasonForOperation } from "./effect_ledger_adapter.ts";
import type { OperationRuntimeResult } from "./effect_ledger_adapter.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";
import {
  clearActiveToolFlow,
  clearPendingToolConfirmation,
  clearToolSkillFlowForDirectReminder,
  pendingOperationType,
  readActiveFlowState,
} from "./active_flow_state.ts";
import {
  maybeRunOneShotReminderDirectEffect,
} from "../tools/always_on/one_shot_reminder/router.ts";
import { createTrackProgressPlanItemWrite } from "../tools/always_on/track_progress_plan_item/db.ts";
import {
  applyTrackProgressDirectEffectFailureState,
  applyTrackProgressDirectEffectRuntimeState,
  runTrackProgressPlanItemDirectEffect,
  TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY,
} from "../tools/always_on/track_progress_plan_item/router.ts";
import { maybeRunCreateRecurringReminderOperation } from "../tools/operations/create_recurring_reminder/router.ts";
import { maybeRunPrepareAttackCardOperation } from "../tools/operations/prepare_attack_card/router.ts";
import { maybeRunPrepareDefenseCardOperation } from "../tools/operations/prepare_defense_card/router.ts";
import { maybeRunSelectStatePotionOperation } from "../tools/operations/select_state_potion/router.ts";
import { maybeRunUpdateCoachPreferencesOperation } from "../tools/operations/update_coach_preferences/router.ts";
import { loadAdjustPlanFrameFromTempMemory } from "../tools/operations/adjust_plan_item/state.ts";
import { maybeRunStatusRecapRuntime } from "../skills/status_recap/runtime.ts";
import {
  hasPendingOrActiveAdjustPlanOperation,
  isCopyForwardWeeklyRequest,
  isExplicitPendingApplyConfirmation,
  isWeeklyLightRepeatRequest,
  isWeeklyMissionCarryOverRequest,
  weeklyAdaptiveReviewStateForTurn,
  weeklyMissionCarryOverContext,
  weeklyReviewAllowsAdjustPlanBridge,
} from "../skills/weekly_review/runtime.ts";

function normalizeRuntimeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

type RunAdjustPlanItemOperation = (input: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  history: any[];
  tempMemory: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: any;
  sourceMessageId: string | null;
  requestId?: string | null;
  forceFullAi?: boolean;
  enableAdjustPlanCoachGuidance?: boolean;
}) => Promise<OperationRuntimeResult | null>;

type OperationRuntimePipelineGuards = {
  explicitlySafeWorkReminderRequest: (message: string) => boolean;
  detectExplicitNoToolRequest: (message: string) => boolean;
  detectsExplicitAttackCardCreationRequest: (message: string) => boolean;
  isActiveCardDraftingOperation: (value: unknown) => boolean;
  isExplicitOperationCommand: (message: string) => boolean;
  writeAdjustPlanPendingDraftReview: (
    tempMemory: any,
    review: null,
  ) => any;
};

export type OperationRuntimePipelineInput = {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  history: any[];
  tempMemory: any;
  state: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: any;
  sourceMessageId: string | null;
  requestId?: string | null;
  v2Runtime: ActiveTransformationRuntime | null;
  turnAgenda: unknown;
  activeSkillState: unknown;
  activeOperationIntake: unknown;
  pendingOperationConfirmation: unknown;
  trackProgressBlockedReasonCode?: string | null;
  fullAiRequested: boolean;
  clientNow?: Date | null;
  enableAdjustPlanCoachGuidance?: boolean;
  runAdjustPlanItemOperation: RunAdjustPlanItemOperation;
  guards: OperationRuntimePipelineGuards;
};

function operationRuntimeFromTrackProgress(args: {
  tempMemory: any;
  result: Awaited<ReturnType<typeof runTrackProgressPlanItemDirectEffect>>;
  sourceMessageId?: string | null;
}): OperationRuntimeResult | null {
  const state = applyTrackProgressDirectEffectRuntimeState({
    temp_memory: args.tempMemory,
    result: args.result,
    source_message_id: args.sourceMessageId ?? null,
  });
  if (!args.result.detected || args.result.status === "ignored") return null;
  const content = String(args.result.reply ?? "").trim();
  if (!content) return null;
  return {
    content,
    nextTempMemory: args.tempMemory,
    toolExecution: state.toolExecution,
    executedTools: state.executedTools,
    toolSkillRun: {
      selected_handler: "track_progress_plan_item",
      status: args.result.status,
      reason: args.result.debug.reason_code,
      requested_effects: args.result.requested_effects,
      allowed_effects: args.result.allowed_effects,
      committed_effects: args.result.committed_effects,
      blocked_effects: args.result.blocked_effects,
    },
  };
}

export type OperationRuntimePipelineResult = {
  operationRuntime: OperationRuntimeResult | null;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
  statePatch?: { temp_memory: any };
  routeSafetyActive: boolean;
  runtimeSafetyRiskBand: RiskBand;
  runtimeSafetyPregateOutput: any;
  weeklyReviewStateForTurn: unknown;
  weeklyReviewBlocksToolSkillRuntime: boolean;
  routeOrFrameChanged: boolean;
};

export async function runOperationRuntimePipeline(
  args: OperationRuntimePipelineInput,
): Promise<OperationRuntimePipelineResult> {
  let routeDecision = args.routeDecision;
  let turnFrame = args.turnFrame;
  let tempMemory = args.tempMemory;
  let statePatch: { temp_memory: any } | undefined;
  let routeOrFrameChanged = false;

  const weeklyReviewStateForTurn = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory,
  });
  const weeklyReviewBlocksToolSkillRuntime = Boolean(
    weeklyReviewStateForTurn && !isSafetyRoute(routeDecision) &&
      !hasPendingOrActiveAdjustPlanOperation(tempMemory) &&
      !weeklyReviewAllowsAdjustPlanBridge({
        routeDecision,
        turnFrame,
        userMessage: args.userMessage,
        history: args.history,
      }),
  );

  if (
    weeklyReviewBlocksToolSkillRuntime &&
    turnFrame &&
    routeDecision &&
    routeDecision.response_owner === "tool_skill"
  ) {
    routeDecision = {
      ...routeDecision,
      response_owner: "conversation_handler",
      selected_handler: "weekly_adaptive_review_v1",
      reason_code: "active_weekly_review_blocks_tool_skill_runtime",
      direct_effects_to_run: [],
      blocked_paths: [
        ...routeDecision.blocked_paths,
        {
          path: "tool_skill",
          reason_code: "active_weekly_review_blocks_tool_skill_runtime",
        },
      ],
    };
    turnFrame = {
      ...turnFrame,
      tool_skill_intents: [],
      tool_skill_opportunity: {
        type: "none",
        operation_type: null,
        surface_id: null,
        confidence_band: "low",
        should_offer: false,
        prop_reason: null,
        source_span: null,
        target_hint: null,
        target_status: "none",
        suggested_question_intent: null,
        offer_timing: "never",
        must_not_execute: true,
      },
    };
    routeOrFrameChanged = true;
  }

  if (
    routeDecision?.response_owner === "tool_skill" &&
    routeDecision.selected_handler
  ) {
    const selectedOperation = String(routeDecision.selected_handler);
    const activeFlowState = readActiveFlowState(tempMemory);
    const activeOperation = String(
      (activeFlowState.activeToolSkillIntake as any)?.operation_type ?? "",
    ).trim();
    const pendingOperation = pendingOperationType(
      activeFlowState.pendingToolSkillConfirmation,
    );
    if (
      routeDecision.active_flow_arbitration?.decision === "suspend_active" &&
      activeOperation && activeOperation !== selectedOperation
    ) {
      tempMemory = { ...(tempMemory ?? {}) };
      tempMemory = clearActiveToolFlow(tempMemory);
      if (pendingOperation && pendingOperation !== selectedOperation) {
        tempMemory = clearPendingToolConfirmation(tempMemory);
      }
      if (selectedOperation !== "adjust_plan_item") {
        tempMemory = args.guards.writeAdjustPlanPendingDraftReview(
          tempMemory,
          null,
        );
      }
      statePatch = { temp_memory: tempMemory };
    }
  }

  const routeSafetyActive = isSafetyRoute(routeDecision);
  const {
    riskBand: runtimeSafetyRiskBand,
    pregateOutput: runtimeSafetyPregateOutput,
  } = runtimeSafetyPregateForTurn({
    safetyPregateOutput: args.safetyPregateOutput,
    routeDecision,
    turnFrame,
    tempMemory,
    userMessage: args.userMessage,
    allowExplicitSafeWorkReminderDowngrade:
      args.guards.explicitlySafeWorkReminderRequest,
  });

  const runAdjust = () =>
    args.runAdjustPlanItemOperation({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      channel: args.channel,
      userTimezone: args.userTimezone,
      history: args.history,
      tempMemory,
      planItemSnapshot: args.planItemSnapshot,
      turnFrame,
      routeDecision,
      safetyPregateOutput: runtimeSafetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      forceFullAi: args.fullAiRequested,
      enableAdjustPlanCoachGuidance: args.enableAdjustPlanCoachGuidance,
    });

  const pendingAdjustPlanRuntime = !routeSafetyActive &&
      !weeklyReviewBlocksToolSkillRuntime &&
      loadAdjustPlanFrameFromTempMemory(tempMemory).pending_draft_review
    ? await runAdjust()
    : null;
  const directWeeklyAdjustPlanRuntime = !routeSafetyActive &&
      !weeklyReviewBlocksToolSkillRuntime &&
      isExplicitPendingApplyConfirmation(args.userMessage) &&
      (isWeeklyMissionCarryOverRequest(args.userMessage) ||
        weeklyMissionCarryOverContext({
          userMessage: args.userMessage,
          history: args.history,
        }) ||
        isCopyForwardWeeklyRequest(args.userMessage) ||
        isWeeklyLightRepeatRequest(args.userMessage))
    ? await runAdjust()
    : null;
  const weeklyReviewAllowsReminderRuntime = !weeklyReviewStateForTurn ||
    /\b(rappel|rappeler|rappelle|reminder|programme un rappel|programmer un rappel)\b/
      .test(normalizeRuntimeText(args.userMessage));

  const trackProgressRuntime: OperationRuntimeResult | null =
    !routeSafetyActive && !weeklyReviewBlocksToolSkillRuntime && turnFrame
      ? await (async () => {
        const sourceMessageId = args.sourceMessageId ??
          turnFrame.source_message_id;
        const alreadyLogged =
          (tempMemory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
            ?.source_message_id &&
          sourceMessageId &&
          (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
              .source_message_id === sourceMessageId;
        if (alreadyLogged) return null;
        try {
          const previousSourceMessageId = String(
            (tempMemory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
              ?.source_message_id ?? "",
          ).trim();
          const blockedReason = agendaBlockedReasonForOperation(
            args.turnAgenda as any,
            "track_progress_plan_item",
          ) ?? args.trackProgressBlockedReasonCode ?? null;
          const result = await runTrackProgressPlanItemDirectEffect({
            turn_frame: turnFrame,
            message: args.userMessage,
            plan_snapshot: args.planItemSnapshot ?? [],
            pending_tool_skill_confirmation: args.pendingOperationConfirmation,
            no_mutation_requested:
              args.guards.detectExplicitNoToolRequest(args.userMessage) ||
              Boolean(blockedReason),
            blocked_reason_code: blockedReason,
            write_progress: createTrackProgressPlanItemWrite({
              supabase: args.supabase,
              userId: args.userId,
              source: args.channel,
              sourceMessageId,
              runtime: args.v2Runtime,
            }),
            recent_writes_idempotency: {
              source_message_ids: previousSourceMessageId
                ? [previousSourceMessageId]
                : [],
            },
          });
          return operationRuntimeFromTrackProgress({
            tempMemory,
            result,
            sourceMessageId,
          });
        } catch (_error) {
          applyTrackProgressDirectEffectFailureState({
            temp_memory: tempMemory,
            source_message_id: sourceMessageId,
            reason_code: "track_progress_direct_effect_failed",
          });
          return null;
        }
      })()
      : null;

  const oneShotReminderDirectEffect = !routeSafetyActive &&
      !blocksDirectEffects(runtimeSafetyRiskBand as any)
    ? await maybeRunOneShotReminderDirectEffect({
      supabase: args.supabase,
      userId: args.userId,
      message: args.userMessage,
      requestId: args.requestId ?? undefined,
      now: args.clientNow && Number.isFinite(args.clientNow.getTime())
        ? args.clientNow
        : undefined,
      pendingToolSkillConfirmation: args.pendingOperationConfirmation,
      noMutationRequested:
        args.guards.detectExplicitNoToolRequest(args.userMessage) ||
        Boolean(
          agendaBlockedReasonForOperation(
            args.turnAgenda as any,
            "create_one_shot_reminder",
          ) ??
            agendaBlockedReasonForOperation(
              args.turnAgenda as any,
              "cancel_one_shot_reminder",
            ),
        ),
      contextMessages: (args.history ?? [])
        .filter((m: any) =>
          m?.role === "user" && typeof m?.content === "string"
        )
        .map((m: any) => String(m.content))
        .filter((c: string) => c.trim() && c.trim() !== args.userMessage.trim())
        .slice(-6)
        .reverse(),
    })
    : null;
  const oneShotReminderOperationRuntime: OperationRuntimeResult | null =
    oneShotReminderDirectEffect?.detected && oneShotReminderDirectEffect.reply
      ? {
        content: oneShotReminderDirectEffect.reply,
        nextTempMemory: clearToolSkillFlowForDirectReminder(tempMemory),
        toolExecution: oneShotReminderDirectEffect.status === "success" ||
            oneShotReminderDirectEffect.status === "cancelled" ||
            oneShotReminderDirectEffect.status === "replaced"
          ? "success"
          : oneShotReminderDirectEffect.status === "failed"
          ? "failed"
          : oneShotReminderDirectEffect.status === "no_reminder"
          ? "none"
          : "blocked",
        executedTools: oneShotReminderDirectEffect.committed_effects.length > 0
          ? oneShotReminderDirectEffect.executed_tools
          : [],
        toolSkillRun: {
          selected_handler: oneShotReminderDirectEffect.intent === "cancel"
            ? "cancel_one_shot_reminder"
            : "create_one_shot_reminder",
          status: oneShotReminderDirectEffect.status,
          reason: oneShotReminderDirectEffect.debug.reason_code,
          requested_effects: oneShotReminderDirectEffect.requested_effects,
          allowed_effects: oneShotReminderDirectEffect.allowed_effects,
          committed_effects: oneShotReminderDirectEffect.committed_effects,
          blocked_effects: oneShotReminderDirectEffect.blocked_effects,
        },
      }
      : null;

  const routeIsProductHelp = routeDecision?.response_owner === "product_help" ||
    routeDecision?.selected_handler === "product_help";
  const messageIsExplicitOperationCommand = args.guards
    .isExplicitOperationCommand(args.userMessage);
  const routeIsCardToolSkill =
    routeDecision?.selected_handler === "prepare_defense_card" ||
    routeDecision?.selected_handler === "prepare_attack_card";
  const messageIsExplicitCardCommand = args.guards
    .detectsExplicitAttackCardCreationRequest(args.userMessage);
  const statusRecapRuntime = !routeSafetyActive &&
      !routeIsProductHelp &&
      !messageIsExplicitOperationCommand &&
      !routeIsCardToolSkill &&
      !messageIsExplicitCardCommand &&
      !args.guards.isActiveCardDraftingOperation(args.activeOperationIntake)
    ? await maybeRunStatusRecapRuntime({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      userTimezone: args.userTimezone,
      tempMemory,
      turnFrame,
      routeDecision,
      activeOperationIntake: args.activeOperationIntake,
    })
    : null;

  const operationRuntime =
    routeSafetyActive || weeklyReviewBlocksToolSkillRuntime
      ? null
      : pendingAdjustPlanRuntime ??
        directWeeklyAdjustPlanRuntime ??
        trackProgressRuntime ??
        oneShotReminderOperationRuntime ??
        statusRecapRuntime ??
        (weeklyReviewAllowsReminderRuntime
          ? await maybeRunCreateRecurringReminderOperation({
            supabase: args.supabase,
            userId: args.userId,
            userMessage: args.userMessage,
            channel: args.channel,
            userTimezone: args.userTimezone,
            tempMemory,
            turnFrame,
            routeDecision,
            safetyPregateOutput: runtimeSafetyPregateOutput,
            sourceMessageId: args.sourceMessageId,
            requestId: args.requestId ?? null,
            v2Runtime: args.v2Runtime ?? null,
            planItemSnapshot: (args.planItemSnapshot ?? null) as any,
          })
          : null) ??
        await maybeRunSelectStatePotionOperation({
          supabase: args.supabase,
          userId: args.userId,
          userMessage: args.userMessage,
          channel: args.channel,
          userTimezone: args.userTimezone,
          tempMemory,
          turnFrame,
          routeDecision,
          safetyPregateOutput: runtimeSafetyPregateOutput,
          sourceMessageId: args.sourceMessageId,
          requestId: args.requestId ?? null,
          history: args.history,
        }) ??
        await runAdjust() ??
        await maybeRunPrepareAttackCardOperation({
          supabase: args.supabase,
          userId: args.userId,
          userMessage: args.userMessage,
          channel: args.channel,
          userTimezone: args.userTimezone,
          tempMemory,
          turnFrame,
          routeDecision,
          safetyPregateOutput: runtimeSafetyPregateOutput,
          sourceMessageId: args.sourceMessageId,
          requestId: args.requestId ?? null,
          planSnapshot: { items: args.planItemSnapshot ?? [] },
        }) ??
        await maybeRunPrepareDefenseCardOperation({
          supabase: args.supabase,
          userId: args.userId,
          userMessage: args.userMessage,
          channel: args.channel,
          userTimezone: args.userTimezone,
          tempMemory,
          turnFrame,
          routeDecision,
          safetyPregateOutput: runtimeSafetyPregateOutput,
          sourceMessageId: args.sourceMessageId,
          requestId: args.requestId ?? null,
          planSnapshot: { items: args.planItemSnapshot ?? [] },
        }) ??
        await maybeRunUpdateCoachPreferencesOperation({
          supabase: args.supabase,
          userId: args.userId,
          userMessage: args.userMessage,
          channel: args.channel,
          userTimezone: args.userTimezone,
          tempMemory,
          turnFrame,
          routeDecision,
          safetyPregateOutput: runtimeSafetyPregateOutput,
          sourceMessageId: args.sourceMessageId,
          requestId: args.requestId ?? null,
        });

  return {
    operationRuntime,
    routeDecision,
    turnFrame,
    tempMemory,
    statePatch,
    routeSafetyActive,
    runtimeSafetyRiskBand,
    runtimeSafetyPregateOutput,
    weeklyReviewStateForTurn,
    weeklyReviewBlocksToolSkillRuntime,
    routeOrFrameChanged,
  };
}
