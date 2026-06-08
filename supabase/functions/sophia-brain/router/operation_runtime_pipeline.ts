/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { ActiveTransformationRuntime } from "../../_shared/v2-runtime.ts";
import {
  blocksDirectEffects,
  blocksToolSkills,
} from "../safety/safety_thresholds.ts";
import {
  isSafetyRoute,
  runtimeSafetyPregateForTurn,
} from "./safety_crisis_runtime.ts";
import { agendaBlockedReasonForOperation } from "./effect_ledger_adapter.ts";
import type { OperationRuntimeResult } from "./effect_ledger_adapter.ts";
import { isPlatformHandoffOperation } from "./turn_agenda.ts";
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
import { runSelectStatePotionHandoffSkill } from "../tools/operations/select_state_potion/handoff.ts";
import { maybeRunUpdateCoachPreferencesOperation } from "../tools/operations/update_coach_preferences/router.ts";
import { loadAdjustPlanFrameFromTempMemory } from "../tools/operations/adjust_plan_item/state.ts";
import { getHandoffTargetForOperation } from "../product_surface_registry/contract.ts";
import { maybeRunStatusRecapRuntime } from "../skills/status_recap/runtime.ts";
import { hasActiveStatusRecapFlow } from "../skills/status_recap/local_flow.ts";
import {
  hasPendingOrActiveAdjustPlanOperation,
  weeklyAdaptiveReviewStateForTurn,
  weeklyReviewAllowsAdjustPlanBridge,
} from "../skills/weekly_review/runtime.ts";

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
  isActiveCardDraftingOperation: (value: unknown) => boolean;
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
  runStatusRecapRuntime?: typeof maybeRunStatusRecapRuntime;
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

function surfaceIdForPlatformHandoff(operationType: string): string {
  return getHandoffTargetForOperation(operationType)?.surface_id ?? "platform";
}

function platformHandoffContent(operationType: string): string {
  const target = getHandoffTargetForOperation(operationType);
  if (!target) {
    return "Tu peux reprendre cette recommandation dans la plateforme. Je ne la modifie pas depuis le chat.";
  }
  return [
    `Tu peux reprendre cette recommandation ${target.user_facing_destination}.`,
    ...target.platform_steps.map((step) => `- ${step}`),
    "Je ne l'applique pas depuis le chat.",
  ].join("\n");
}

function platformHandoffOperationForTurn(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  pendingOperationConfirmation: unknown;
  activeOperationIntake: unknown;
}): string | null {
  const platformOperation = (operation: string | null): string | null =>
    operation;
  const selected = String(args.routeDecision?.selected_handler ?? "").trim();
  if (isPlatformHandoffOperation(selected)) return platformOperation(selected);
  for (const effect of args.routeDecision?.direct_effects_to_run ?? []) {
    const operation = String(effect ?? "").trim();
    if (isPlatformHandoffOperation(operation)) {
      return platformOperation(operation);
    }
  }
  const intent = (args.turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    isPlatformHandoffOperation(String(candidate.operation_type ?? "").trim())
  );
  if (intent) return platformOperation(String(intent.operation_type).trim());
  const opportunity = String(
    args.turnFrame?.tool_skill_opportunity?.operation_type ?? "",
  ).trim();
  if (
    isPlatformHandoffOperation(opportunity) &&
    args.routeDecision?.response_owner === "tool_skill"
  ) return platformOperation(opportunity);
  const pending = args.pendingOperationConfirmation &&
      typeof args.pendingOperationConfirmation === "object"
    ? String((args.pendingOperationConfirmation as any).operation_type ?? "")
      .trim()
    : "";
  if (isPlatformHandoffOperation(pending)) return platformOperation(pending);
  const active = args.activeOperationIntake &&
      typeof args.activeOperationIntake === "object"
    ? String(
      (args.activeOperationIntake as any).operation_type ??
        ((args.activeOperationIntake as any).mode === "platform_handoff"
          ? (args.activeOperationIntake as any).skill_id
          : ""),
    ).trim()
    : "";
  if (isPlatformHandoffOperation(active)) return platformOperation(active);
  return null;
}

const SPECIALIZED_PLATFORM_HANDOFF_OPERATIONS = new Set([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "update_coach_preferences",
]);

function turnRequestsChatExecutableEffect(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  operationType: string;
}): boolean {
  const candidates = [
    ...(args.routeDecision?.direct_effects_to_run ?? []),
    ...((args.turnFrame as any)?.direct_effects ?? []),
  ];
  return candidates.some((candidate) => {
    const operation = typeof candidate === "string" ? candidate : String(
      (candidate as any)?.operation_type ??
        (candidate as any)?.type ??
        (candidate as any)?.effect_type ??
        "",
    );
    return operation === args.operationType;
  });
}

function routeOrStateRequestsToolSkill(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  activeOperationIntake: unknown;
  pendingOperationConfirmation: unknown;
  operationType: string;
}): boolean {
  if (args.routeDecision?.selected_handler === args.operationType) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.turnFrame?.tool_skill_opportunity?.operation_type ===
      args.operationType
  ) return true;
  if (
    (args.routeDecision?.direct_effects_to_run ?? []).includes(
      args.operationType,
    )
  ) return true;
  if (
    (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
      intent.operation_type === args.operationType &&
      intent.confidence_band !== "low"
    )
  ) return true;
  const activeOperation = String(
    (args.activeOperationIntake as any)?.operation_type ??
      ((args.activeOperationIntake as any)?.mode === "platform_handoff"
        ? (args.activeOperationIntake as any)?.skill_id
        : (args.activeOperationIntake as any)?.skill_id ?? ""),
  ).trim();
  if (activeOperation === args.operationType) return true;
  const pendingOperation = String(
    (args.pendingOperationConfirmation as any)?.operation_type ?? "",
  ).trim();
  return pendingOperation === args.operationType;
}

function routeIsProductHelp(routeDecision: RouteDecision | null): boolean {
  return routeDecision?.response_owner === "product_help" ||
    routeDecision?.selected_handler === "product_help";
}

function turnFrameHasRunnableDirectEffect(
  turnFrame: TurnFrame | null,
  effectType: string,
): boolean {
  return (turnFrame?.direct_effects ?? []).some((effect) =>
    effect.effect_type === effectType &&
    effect.explicitness === "explicit" &&
    effect.target_status === "identified" &&
    (effect.confidence_band === "high" || effect.confidence_band === "critical")
  );
}

function routeRequestsDirectEffect(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  effectType: string;
}): boolean {
  return Boolean(
    args.routeDecision?.direct_effects_to_run.includes(args.effectType),
  ) ||
    turnFrameHasRunnableDirectEffect(args.turnFrame, args.effectType);
}

function turnAgendaBlocksOperation(
  turnAgenda: unknown,
  operationType: string,
): boolean {
  return Boolean(
    agendaBlockedReasonForOperation(turnAgenda as any, operationType),
  );
}

function platformHandoffRuntimeResult(args: {
  operationType: string;
  tempMemory: any;
}): OperationRuntimeResult {
  const surfaceId = surfaceIdForPlatformHandoff(args.operationType);
  return {
    content: platformHandoffContent(args.operationType),
    nextTempMemory: args.tempMemory,
    toolExecution: "platform_handoff",
    executedTools: [],
    toolSkillRun: {
      selected_handler: args.operationType,
      operation_type: args.operationType,
      status: "handoff_delivered",
      reason_code: "complex_operation_redirect_to_platform",
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
      platform_handoff: {
        operation_type: args.operationType,
        status: "delivered",
        surface_id: surfaceId,
        reason_code: "complex_operation_redirect_to_platform",
        no_chat_mutation: true,
      },
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

  const clarificationRequired = routeDecision?.reason_code ===
      "clarification_required" ||
    (routeDecision?.blocked_paths ?? []).some((path) =>
      path.path === "operation_runtime_pipeline" &&
      path.reason_code === "clarification_required"
    );
  if (clarificationRequired && routeDecision) {
    const clarificationRoute: RouteDecision = {
      ...routeDecision,
      response_owner: "orientation_clarification",
      selected_handler: "orientation_clarification",
      reason_code: "clarification_required",
      direct_effects_to_run: [],
    };
    const routeSafetyActive = isSafetyRoute(clarificationRoute);
    const {
      riskBand: runtimeSafetyRiskBand,
      pregateOutput: runtimeSafetyPregateOutput,
    } = runtimeSafetyPregateForTurn({
      safetyPregateOutput: args.safetyPregateOutput,
      routeDecision: clarificationRoute,
      turnFrame,
      tempMemory,
      userMessage: args.userMessage,
    });
    return {
      operationRuntime: null,
      routeDecision: clarificationRoute,
      turnFrame,
      tempMemory,
      statePatch,
      routeSafetyActive,
      runtimeSafetyRiskBand,
      runtimeSafetyPregateOutput,
      weeklyReviewStateForTurn,
      weeklyReviewBlocksToolSkillRuntime,
      routeOrFrameChanged: true,
    };
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
  });

  const platformHandoffOperation = platformHandoffOperationForTurn({
    routeDecision,
    turnFrame,
    pendingOperationConfirmation: args.pendingOperationConfirmation,
    activeOperationIntake: args.activeOperationIntake,
  });
  if (
    platformHandoffOperation &&
    !SPECIALIZED_PLATFORM_HANDOFF_OPERATIONS.has(platformHandoffOperation) &&
    !routeSafetyActive &&
    !weeklyReviewBlocksToolSkillRuntime &&
    !(
      platformHandoffOperation === "select_state_potion" &&
      turnRequestsChatExecutableEffect({
        routeDecision,
        turnFrame,
        operationType: "create_one_shot_reminder",
      })
    )
  ) {
    if (platformHandoffOperation === "select_state_potion") {
      const potionHandoffRuntime = await runSelectStatePotionHandoffSkill({
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
      });
      if (potionHandoffRuntime) {
        return {
          operationRuntime: potionHandoffRuntime,
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
    }
    return {
      operationRuntime: platformHandoffRuntimeResult({
        operationType: platformHandoffOperation,
        tempMemory,
      }),
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

  const shouldRunAdjustRuntime =
    routeDecision?.selected_handler === "adjust_plan_item" ||
    routeDecision?.direct_effects_to_run?.includes("adjust_plan_item") ||
    turnFrame?.tool_skill_opportunity?.operation_type ===
      "adjust_plan_item" ||
    (turnFrame?.tool_skill_intents ?? []).some((intent) =>
      intent.operation_type === "adjust_plan_item" &&
      intent.confidence_band !== "low"
    ) ||
    Boolean(
      loadAdjustPlanFrameFromTempMemory(tempMemory).pending_draft_review ||
        loadAdjustPlanFrameFromTempMemory(tempMemory).pending_confirmation ||
        loadAdjustPlanFrameFromTempMemory(tempMemory).handoff_state,
    );

  const pendingAdjustPlanRuntime = !routeSafetyActive &&
      !weeklyReviewBlocksToolSkillRuntime &&
      (loadAdjustPlanFrameFromTempMemory(tempMemory).pending_draft_review ||
        loadAdjustPlanFrameFromTempMemory(tempMemory).pending_confirmation ||
        loadAdjustPlanFrameFromTempMemory(tempMemory).handoff_state)
    ? await runAdjust()
    : null;
  const activeRecurringReminderHandoff = Boolean(
    (tempMemory as any)?.__recurring_reminder_handoff_state ||
      String((args.activeOperationIntake as any)?.operation_type ?? "")
          .trim() === "create_recurring_reminder" ||
      String((args.pendingOperationConfirmation as any)?.operation_type ?? "")
          .trim() === "create_recurring_reminder" ||
      routeDecision?.selected_handler === "create_recurring_reminder",
  );
  const shouldRunRecurringReminder = activeRecurringReminderHandoff ||
    routeOrStateRequestsToolSkill({
      routeDecision,
      turnFrame,
      activeOperationIntake: args.activeOperationIntake,
      pendingOperationConfirmation: args.pendingOperationConfirmation,
      operationType: "create_recurring_reminder",
    });
  const weeklyReviewAllowsReminderRuntime = !weeklyReviewStateForTurn ||
    routeRequestsDirectEffect({
      routeDecision,
      turnFrame,
      effectType: "create_one_shot_reminder",
    }) ||
    (turnFrame?.tool_skill_intents ?? []).some((intent) =>
      intent.operation_type === "create_recurring_reminder" &&
      intent.confidence_band !== "low"
    );
  const runRecurringReminder = () =>
    weeklyReviewAllowsReminderRuntime
      ? maybeRunCreateRecurringReminderOperation({
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
      : Promise.resolve(null);
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
            no_mutation_requested: Boolean(blockedReason) ||
              turnAgendaBlocksOperation(
                args.turnAgenda,
                "track_progress_plan_item",
              ),
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

  const shouldRunOneShotReminderDirectEffect =
    !routeIsProductHelp(routeDecision) &&
    routeRequestsDirectEffect({
      routeDecision,
      turnFrame,
      effectType: "create_one_shot_reminder",
    });
  const oneShotReminderDirectEffect = shouldRunOneShotReminderDirectEffect &&
      !routeSafetyActive &&
      !blocksDirectEffects(runtimeSafetyRiskBand as any)
    ? await maybeRunOneShotReminderDirectEffect({
      supabase: args.supabase,
      userId: args.userId,
      message: args.userMessage,
      requestId: args.requestId ?? undefined,
      now: args.clientNow && Number.isFinite(args.clientNow.getTime())
        ? args.clientNow
        : undefined,
      turnFrame,
      pendingToolSkillConfirmation: args.pendingOperationConfirmation,
      noMutationRequested: turnAgendaBlocksOperation(
        args.turnAgenda,
        "create_one_shot_reminder",
      ) ||
        turnAgendaBlocksOperation(args.turnAgenda, "cancel_one_shot_reminder"),
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

  const routeIsCardToolSkill =
    routeDecision?.selected_handler === "prepare_defense_card" ||
    routeDecision?.selected_handler === "prepare_attack_card";
  const activeStatusRecapFlow = hasActiveStatusRecapFlow(tempMemory);
  const routeRequestsStatusRecap = activeStatusRecapFlow ||
    routeDecision?.selected_handler === "status_only_no_mutation_check" ||
    String(routeDecision?.reason_code ?? "").includes("status_only") ||
    String(routeDecision?.reason_code ?? "").includes("status_recap") ||
    String(routeDecision?.reason_code ?? "").includes("recap") ||
    ((turnFrame?.skill_signals.entry as any)?.status_recap?.detected === true &&
      (turnFrame?.skill_signals.entry as any)?.status_recap?.confidence_band !==
        "low");
  const structuredCardCommand = (turnFrame?.tool_skill_intents ?? []).some((
    intent,
  ) =>
    (intent.operation_type === "prepare_attack_card" ||
      intent.operation_type === "prepare_defense_card") &&
    intent.user_intent !== "explain_only" &&
    intent.confidence_band !== "low"
  );
  const shouldRunSelectStatePotion = routeOrStateRequestsToolSkill({
    routeDecision,
    turnFrame,
    activeOperationIntake: args.activeOperationIntake,
    pendingOperationConfirmation: args.pendingOperationConfirmation,
    operationType: "select_state_potion",
  });
  const shouldRunPrepareAttackCard = routeOrStateRequestsToolSkill({
    routeDecision,
    turnFrame,
    activeOperationIntake: args.activeOperationIntake,
    pendingOperationConfirmation: args.pendingOperationConfirmation,
    operationType: "prepare_attack_card",
  });
  const shouldRunPrepareDefenseCard = routeOrStateRequestsToolSkill({
    routeDecision,
    turnFrame,
    activeOperationIntake: args.activeOperationIntake,
    pendingOperationConfirmation: args.pendingOperationConfirmation,
    operationType: "prepare_defense_card",
  });
  const shouldRunUpdateCoachPreferences = routeOrStateRequestsToolSkill({
    routeDecision,
    turnFrame,
    activeOperationIntake: args.activeOperationIntake,
    pendingOperationConfirmation: args.pendingOperationConfirmation,
    operationType: "update_coach_preferences",
  });
  const statusRecapRuntime = !routeSafetyActive &&
      routeRequestsStatusRecap &&
      !activeRecurringReminderHandoff &&
      (!routeIsProductHelp(routeDecision) || activeStatusRecapFlow) &&
      !routeIsCardToolSkill &&
      !structuredCardCommand &&
      !args.guards.isActiveCardDraftingOperation(args.activeOperationIntake)
    ? await (args.runStatusRecapRuntime ?? maybeRunStatusRecapRuntime)({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      userTimezone: args.userTimezone,
      tempMemory,
      turnFrame,
      routeDecision,
      activeOperationIntake: args.activeOperationIntake,
      history: args.history,
      requestId: args.requestId ?? null,
    })
    : null;

  const operationRuntime =
    routeSafetyActive || weeklyReviewBlocksToolSkillRuntime ||
      (routeIsProductHelp(routeDecision) && !activeStatusRecapFlow)
      ? null
      : pendingAdjustPlanRuntime ??
        trackProgressRuntime ??
        oneShotReminderOperationRuntime ??
        (activeRecurringReminderHandoff && shouldRunRecurringReminder
          ? await runRecurringReminder()
          : null) ??
        statusRecapRuntime ??
        (!activeRecurringReminderHandoff && shouldRunRecurringReminder
          ? await runRecurringReminder()
          : null) ??
        (shouldRunSelectStatePotion
          ? await runSelectStatePotionHandoffSkill({
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
          })
          : null) ??
        (shouldRunAdjustRuntime ? await runAdjust() : null) ??
        (shouldRunPrepareAttackCard
          ? await maybeRunPrepareAttackCardOperation({
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
            history: args.history,
          })
          : null) ??
        (shouldRunPrepareDefenseCard
          ? await maybeRunPrepareDefenseCardOperation({
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
            history: args.history,
          })
          : null) ??
        (shouldRunUpdateCoachPreferences
          ? await maybeRunUpdateCoachPreferencesOperation({
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
          })
          : null);

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
