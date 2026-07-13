/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { ActiveTransformationRuntime } from "../../_shared/v2-runtime.ts";
import {
  buildCoachingRecommendationSkillSignal,
  isLocalChildFlowHandoff,
  turnFrameWithChildFlowHandoff,
} from "../../_shared/local_child_flow_handoff.ts";
import { blocksDirectEffects } from "../safety/safety_thresholds.ts";
import {
  isSafetyRoute,
  runtimeSafetyContextForTurn,
} from "./safety_crisis_runtime.ts";
import type { OperationRuntimeResult } from "./effect_ledger_adapter.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";
import {
  clearLegacyRuntimeStateForDirectEffect,
  readActiveFlowState,
} from "./active_flow_state.ts";
import {
  oneShotDirectEffectFromWeeklyReviewLocalDispatcherOutput,
  readWeeklyReviewState,
  recentMessagesFromHistory as weeklyRecentMessagesFromHistory,
  runWeeklyReviewLocalDispatcher,
  runWeeklyReviewLocalRuntime,
} from "../skills/weekly_review/runtime.ts";
import {
  applyOneShotReminderPendingClarification,
  maybeRunOneShotReminderDirectEffect,
  recurringNotSupportedDirectEffectResult,
  safetyCrisisDeferredDirectEffectResult,
} from "../tools/always_on/one_shot_reminder/router.ts";
import { withDirectEffectConfirmationContext } from "./direct_effect_local_context.ts";
import {
  createTrackProgressPlanItemWrite,
  createTrackProgressSameDayEvidenceCheck,
} from "../tools/always_on/track_progress_plan_item/db.ts";
import {
  applyTrackProgressDirectEffectFailureState,
  applyTrackProgressDirectEffectRuntimeState,
  freshLastTrackCommit,
  runTrackProgressPlanItemDirectEffect,
  TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY,
} from "../tools/always_on/track_progress_plan_item/router.ts";

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
  safetyContextOutput: any;
  sourceMessageId: string | null;
  requestId?: string | null;
  v2Runtime: ActiveTransformationRuntime | null;
  trackProgressBlockedReasonCode?: string | null;
  clientNow?: Date | null;
  allowDirectEffectMessageIntakeFallback?: boolean;
  weeklyReviewLocalDispatcher?: typeof runWeeklyReviewLocalDispatcher;
  weeklyReviewVisibleAgent?: Parameters<
    typeof runWeeklyReviewLocalRuntime
  >[0]["visibleAgent"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function operationRuntimeFromTrackProgress(args: {
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
  // Un resultat sans texte (effet bloque/decline sans fallback) reste trace:
  // le jeter rendait le blocage invisible du ledger et de la trace QA
  // (globaleval15 T5, requested/blocked jamais enregistres). content vide
  // ne court-circuite jamais la composition (routeIsPureDirectEffect exige
  // un content non vide) — seul le toolSkillRun est enregistre.
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

export function turnFrameHasRunnableDirectEffect(
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

function routePermitsTrackProgressRuntime(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
}): boolean {
  return routeRequestsDirectEffect({
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    effectType: "track_progress_plan_item",
  }) || args.routeDecision?.selected_handler === "track_progress_plan_item";
}

function routeWithDirectEffect(args: {
  routeDecision: RouteDecision | null;
  effectType: string;
  reasonCode: string;
}): RouteDecision | null {
  if (!args.routeDecision) return null;
  if (args.routeDecision.direct_effects_to_run.includes(args.effectType)) {
    return args.routeDecision;
  }
  return {
    ...args.routeDecision,
    direct_effects_to_run: [
      ...args.routeDecision.direct_effects_to_run,
      args.effectType,
    ],
    reason_code: args.reasonCode,
  };
}

function routeWithCoachingChildFlowHandoff(
  routeDecision: RouteDecision | null,
): RouteDecision | null {
  if (!routeDecision) return null;
  return {
    ...routeDecision,
    response_owner: "coaching_recommendation",
    selected_handler: "coaching_recommendation",
    reason_code: "local_child_flow_handoff_to_coaching_recommendation",
    active_flow_arbitration: {
      decision: "handoff_to_child_flow",
      active_owner: "weekly_adaptive_review_v1",
      selected_owner: "coaching_recommendation",
      resume_policy: "return_to_parent_after_child_flow",
      reason_code:
        "weekly_review_handoff_to_coaching_recommendation_child_flow",
    },
  };
}

function turnFrameWithDirectEffectObject(args: {
  turnFrame: TurnFrame | null;
  effect: TurnFrame["direct_effects"][number] | null;
}): TurnFrame | null {
  if (!args.turnFrame || !args.effect) return args.turnFrame;
  if (
    args.turnFrame.direct_effects.some((effect) =>
      effect.effect_type === args.effect?.effect_type &&
      effect.explicitness === "explicit" &&
      effect.confidence_band !== "low"
    )
  ) {
    return args.turnFrame;
  }
  return {
    ...args.turnFrame,
    direct_effects: [
      ...args.turnFrame.direct_effects,
      args.effect,
    ],
  };
}

function oneShotReminderOperationRuntimeFromDirectEffect(args: {
  tempMemory: any;
  result: Awaited<ReturnType<typeof maybeRunOneShotReminderDirectEffect>>;
}): OperationRuntimeResult | null {
  if (!args.result.detected || !args.result.reply) return null;
  // P2-3d: le clarify replace en attente se persiste (ou se supersède) —
  // mutation IN-PLACE volontaire: l'objet est aussi référencé par
  // state.temp_memory, et seule la mutation in-place survit à la
  // reconstruction de temp_memory par le companion (leçon P1-2).
  applyOneShotReminderPendingClarification({
    temp_memory: args.tempMemory as Record<string, unknown>,
    pending_clarification: args.result.pending_clarification ?? null,
  });
  return {
    content: args.result.reply,
    nextTempMemory: clearLegacyRuntimeStateForDirectEffect(args.tempMemory),
    toolExecution: args.result.status === "success" ||
        args.result.status === "cancelled" ||
        args.result.status === "replaced"
      ? "success"
      : args.result.status === "failed"
      ? "failed"
      : args.result.status === "no_reminder"
      ? "none"
      : "blocked",
    executedTools: args.result.committed_effects.length > 0
      ? args.result.executed_tools
      : [],
    toolSkillRun: {
      selected_handler: args.result.intent === "cancel"
        ? "cancel_one_shot_reminder"
        : "create_one_shot_reminder",
      status: args.result.status,
      reason: args.result.debug.reason_code,
      requested_effects: args.result.requested_effects,
      allowed_effects: args.result.allowed_effects,
      committed_effects: args.result.committed_effects,
      blocked_effects: args.result.blocked_effects,
    },
  };
}

function hasRuntimeEffects(runtime: OperationRuntimeResult | null): boolean {
  const run = runtime?.toolSkillRun ?? {};
  return (
    Array.isArray((run as any).requested_effects) &&
    (run as any).requested_effects.length > 0
  ) || (
    Array.isArray((run as any).allowed_effects) &&
    (run as any).allowed_effects.length > 0
  ) || (
    Array.isArray((run as any).committed_effects) &&
    (run as any).committed_effects.length > 0
  ) || (
    Array.isArray((run as any).blocked_effects) &&
    (run as any).blocked_effects.length > 0
  );
}

export function turnFrameWithDirectEffectRuntime(
  turnFrame: TurnFrame | null,
  runtime: OperationRuntimeResult | null,
): TurnFrame | null {
  if (!turnFrame || !runtime || !hasRuntimeEffects(runtime)) return turnFrame;
  return withDirectEffectConfirmationContext({
    ...turnFrame,
    direct_effect_lane: {
      selected_handler: runtime.toolSkillRun.selected_handler ?? null,
      toolExecution: runtime.toolExecution,
      executedTools: runtime.executedTools,
      requested_effects: Array.isArray(
          runtime.toolSkillRun.requested_effects,
        )
        ? runtime.toolSkillRun.requested_effects
        : [],
      allowed_effects: Array.isArray(runtime.toolSkillRun.allowed_effects)
        ? runtime.toolSkillRun.allowed_effects
        : [],
      committed_effects: Array.isArray(
          runtime.toolSkillRun.committed_effects,
        )
        ? runtime.toolSkillRun.committed_effects
        : [],
      blocked_effects: Array.isArray(runtime.toolSkillRun.blocked_effects)
        ? runtime.toolSkillRun.blocked_effects
        : [],
      visible_confirmation_hint: runtime.content,
    },
  } as TurnFrame);
}

function mergeEffectArray(
  directRun: Record<string, unknown>,
  visibleRun: Record<string, unknown>,
  key:
    | "requested_effects"
    | "allowed_effects"
    | "committed_effects"
    | "blocked_effects"
    | "superseded_effects",
): unknown[] {
  return [
    ...(Array.isArray(directRun[key]) ? directRun[key] as unknown[] : []),
    ...(Array.isArray(visibleRun[key]) ? visibleRun[key] as unknown[] : []),
  ];
}

function dedupeCommittedEffects(effects: unknown[]): {
  kept: unknown[];
  superseded: unknown[];
} {
  const seen = new Set<string>();
  const kept: unknown[] = [];
  // P2-6 (eva-global17 R1-B03): l'absorption silencieuse du doublon faisait
  // mentir la comptabilité (requested=2, allowed=2, committed=1, rien ne
  // solde la 2e entrée). Le doublon reçoit un statut terminal explicite
  // `superseded_by_dedup` — la somme des statuts terminaux = requested.
  const superseded: unknown[] = [];
  for (const effect of effects) {
    const type = String((effect as any)?.type ?? "").trim();
    const id = String((effect as any)?.id ?? "").trim();
    // Sans id on ne peut pas identifier l'écriture: on conserve l'entrée.
    if (!type || !id) {
      kept.push(effect);
      continue;
    }
    const key = `${type}:${id}`;
    if (seen.has(key)) {
      superseded.push({
        ...(effect as Record<string, unknown>),
        reason_code: "superseded_by_dedup",
      });
      continue;
    }
    seen.add(key);
    kept.push(effect);
  }
  return { kept, superseded };
}

export function mergeDirectEffectRuntimeIntoVisibleRuntime(args: {
  directRuntime: OperationRuntimeResult | null;
  visibleRuntime: OperationRuntimeResult | null;
}): OperationRuntimeResult | null {
  if (!args.directRuntime) return args.visibleRuntime;
  if (!args.visibleRuntime) return args.directRuntime;
  const visibleContent = String(args.visibleRuntime.content ?? "").trim();
  const directRun = args.directRuntime.toolSkillRun ?? {};
  const visibleRun = args.visibleRuntime.toolSkillRun ?? {};
  // Convergence idempotente (P0, harness S1 T2): la même écriture exécutée
  // par deux lanes du tour (pre-loop + executor local/re-exec) rend le MÊME
  // committed (même id) — le ledger du tour la porte UNE fois, pas deux.
  const dedupedCommitted = dedupeCommittedEffects(mergeEffectArray(
    directRun,
    visibleRun,
    "committed_effects",
  ));
  const committedEffects = dedupedCommitted.kept;
  const supersededEffects = [
    ...mergeEffectArray(directRun, visibleRun, "superseded_effects"),
    ...dedupedCommitted.superseded,
  ];
  const blockedEffects = mergeEffectArray(
    directRun,
    visibleRun,
    "blocked_effects",
  );
  const executedTools = [
    ...new Set([
      ...args.directRuntime.executedTools,
      ...args.visibleRuntime.executedTools,
    ]),
  ];
  return {
    ...args.visibleRuntime,
    content: visibleContent,
    toolExecution: args.directRuntime.toolExecution !== "none"
      ? args.directRuntime.toolExecution
      : args.visibleRuntime.toolExecution,
    executedTools,
    toolSkillRun: {
      ...visibleRun,
      requested_effects: mergeEffectArray(
        directRun,
        visibleRun,
        "requested_effects",
      ),
      allowed_effects: mergeEffectArray(
        directRun,
        visibleRun,
        "allowed_effects",
      ),
      committed_effects: committedEffects,
      blocked_effects: blockedEffects,
      superseded_effects: supersededEffects,
      direct_effect_lane: {
        selected_handler: directRun.selected_handler ?? null,
        status: directRun.status ?? null,
        reason: directRun.reason ?? directRun.reason_code ?? null,
        toolExecution: args.directRuntime.toolExecution,
        executedTools: args.directRuntime.executedTools,
        requested_effects: Array.isArray(directRun.requested_effects)
          ? directRun.requested_effects
          : [],
        allowed_effects: Array.isArray(directRun.allowed_effects)
          ? directRun.allowed_effects
          : [],
        committed_effects: Array.isArray(directRun.committed_effects)
          ? directRun.committed_effects
          : [],
        blocked_effects: Array.isArray(directRun.blocked_effects)
          ? directRun.blocked_effects
          : [],
      },
    },
  };
}

export type DirectEffectLaneResult = {
  operationRuntime: OperationRuntimeResult | null;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
  routeOrFrameChanged: boolean;
};

/**
 * Lane track_progress executable hors pipeline (idempotente par
 * source_message_id via TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY): utilisee par
 * le pipeline pre-boucle ET par la re-execution apres sortie de flow local
 * (le dispatcher global etant saute pendant un flow actif, un report
 * d'action qui provoque l'exit doit pouvoir committer sur le meme tour).
 */
export async function runTrackProgressRuntimeLane(params: {
  tempMemory: any;
  turnFrame: TurnFrame;
  sourceMessageId: string | null;
  userMessage: string;
  planItemSnapshot: unknown[];
  supabase: OperationRuntimePipelineInput["supabase"];
  userId: string;
  channel: string;
  v2Runtime: OperationRuntimePipelineInput["v2Runtime"];
  trackProgressBlockedReasonCode: string | null;
  /** Fenetre d'evidence de cible (F2): derniers messages, les deux roles. */
  evidenceMessages?: string[];
}): Promise<OperationRuntimeResult | null> {
  const sourceMessageId = params.sourceMessageId ??
    params.turnFrame.source_message_id;
  const alreadyLogged =
    (params.tempMemory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
      ?.source_message_id &&
    sourceMessageId &&
    (params.tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
        .source_message_id === sourceMessageId;
  if (alreadyLogged) return null;
  try {
    const previousSourceMessageId = String(
      (params.tempMemory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
        ?.source_message_id ?? "",
    ).trim();
    const blockedReason = params.trackProgressBlockedReasonCode ?? null;
    const result = await runTrackProgressPlanItemDirectEffect({
      turn_frame: params.turnFrame,
      message: params.userMessage,
      plan_snapshot: params.planItemSnapshot ?? [],
      no_mutation_requested: Boolean(blockedReason),
      blocked_reason_code: blockedReason,
      evidence_messages: params.evidenceMessages ?? [],
      // P2-4a: bascule de cible vs commit du tour précédent → clarify.
      last_track_commit: freshLastTrackCommit(params.tempMemory),
      same_day_evidence_check: createTrackProgressSameDayEvidenceCheck({
        supabase: params.supabase,
        userId: params.userId,
      }),
      write_progress: createTrackProgressPlanItemWrite({
        supabase: params.supabase,
        userId: params.userId,
        source: params.channel,
        sourceMessageId,
        runtime: params.v2Runtime,
      }),
      recent_writes_idempotency: {
        source_message_ids: previousSourceMessageId
          ? [previousSourceMessageId]
          : [],
      },
    });
    return operationRuntimeFromTrackProgress({
      tempMemory: params.tempMemory,
      result,
      sourceMessageId,
    });
  } catch (_error) {
    applyTrackProgressDirectEffectFailureState({
      temp_memory: params.tempMemory,
      source_message_id: sourceMessageId,
      reason_code: "track_progress_direct_effect_failed",
    });
    return null;
  }
}

export async function runDirectEffectLane(
  args: OperationRuntimePipelineInput & {
    allowMessageIntakeFallback?: boolean;
  },
): Promise<DirectEffectLaneResult> {
  let routeDecision = args.routeDecision;
  let turnFrame = args.turnFrame;
  let routeOrFrameChanged = false;

  const routeSafetyActive = isSafetyRoute(routeDecision);
  const { riskBand: runtimeSafetyRiskBand } = runtimeSafetyContextForTurn({
    safetyContextOutput: args.safetyContextOutput,
    routeDecision,
    turnFrame,
    tempMemory: args.tempMemory,
    userMessage: args.userMessage,
  });

  const shouldRunOneShotReminderDirectEffect = turnFrameHasRunnableDirectEffect(
    turnFrame,
    "create_one_shot_reminder",
  );

  if (!shouldRunOneShotReminderDirectEffect) {
    return {
      operationRuntime: null,
      routeDecision,
      turnFrame,
      tempMemory: args.tempMemory,
      routeOrFrameChanged,
    };
  }

  // Cadence a l'intake (alex-r1 B02): une demande RECURRENTE (cardinality
  // decidee par le dispatcher) ne s'arme JAMAIS — direct_effects_to_run
  // reste propre, et l'outcome canonique du tool (blocked/
  // recurring_not_supported) est synthetise pour que le contrat de
  // confirmation garde sa guidance honnete (Initiatives).
  const recurringCreateEffect = (turnFrame?.direct_effects ?? []).find(
    (effect) =>
      effect.effect_type === "create_one_shot_reminder" &&
      String(
        (effect.payload_hint as Record<string, unknown>)?.cardinality ?? "",
      ) === "recurring" &&
      String(
        (effect.payload_hint as Record<string, unknown>)?.intent ?? "",
      ) !== "cancel",
  );
  if (recurringCreateEffect) {
    const operationRuntime = oneShotReminderOperationRuntimeFromDirectEffect({
      tempMemory: args.tempMemory,
      result: recurringNotSupportedDirectEffectResult(),
    });
    return {
      operationRuntime,
      routeDecision: routeDecision
        ? {
          ...routeDecision,
          blocked_paths: [
            ...routeDecision.blocked_paths,
            {
              path: "create_one_shot_reminder",
              reason_code: "recurring_not_supported",
            },
          ],
        }
        : routeDecision,
      turnFrame,
      tempMemory: operationRuntime?.nextTempMemory ?? args.tempMemory,
      routeOrFrameChanged: true,
    };
  }

  // P3-A (alex-safety-escalation R1-B01): la ROUTE décide, plus le bypass
  // routeSafetyActive (c'est lui qui laissait committer un rappel au milieu
  // d'une crise suicidaire). Crise (active_safety_priority / idéation) →
  // différé honnête synthétisé, ZÉRO exécution — parité avec track_progress.
  const crisisBlockReasons = new Set([
    "active_safety_priority",
    "distress_ideation_safety_priority",
  ]);
  const routeBlocksReminderForCrisis = Boolean(
    routeDecision?.blocked_paths.some((blocked) =>
      blocked.path === "direct_effects.create_one_shot_reminder" &&
      crisisBlockReasons.has(String(blocked.reason_code ?? ""))
    ),
  );
  if (routeBlocksReminderForCrisis) {
    const operationRuntime = oneShotReminderOperationRuntimeFromDirectEffect({
      tempMemory: args.tempMemory,
      result: safetyCrisisDeferredDirectEffectResult(),
    });
    return {
      operationRuntime,
      routeDecision,
      turnFrame,
      tempMemory: operationRuntime?.nextTempMemory ?? args.tempMemory,
      routeOrFrameChanged: true,
    };
  }
  // V5-1 dans le bon sens (rose-hard15 T10): en détresse medium NON-crise,
  // la route (distress_support_priority) admet les direct effects — le
  // rappel bénin explicite est SERVI (confirmation sobre en fin via la
  // traîne de composition), au lieu d'être bloqué par le seuil de band.
  const reminderAllowedDespiteBand = Boolean(
    args.routeDecision?.direct_effects_to_run.includes(
      "create_one_shot_reminder",
    ),
  );

  routeDecision = routeWithDirectEffect({
    routeDecision,
    effectType: "create_one_shot_reminder",
    reasonCode: "direct_effect_lane_message_intake",
  });
  routeOrFrameChanged = routeDecision !== args.routeDecision ||
    turnFrame !== args.turnFrame;

  const oneShotReminderDirectEffect =
    (!blocksDirectEffects(runtimeSafetyRiskBand as any) ||
        reminderAllowedDespiteBand)
      ? await maybeRunOneShotReminderDirectEffect({
        supabase: args.supabase,
        userId: args.userId,
        message: args.userMessage,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId ?? undefined,
        now: args.clientNow && Number.isFinite(args.clientNow.getTime())
          ? args.clientNow
          : undefined,
        userTimezone: args.userTimezone,
        turnFrame,
        noMutationRequested: false,
        contextMessages: (args.history ?? [])
          .filter((m: any) =>
            m?.role === "user" && typeof m?.content === "string"
          )
          .map((m: any) => String(m.content))
          .filter((c: string) =>
            c.trim() && c.trim() !== args.userMessage.trim()
          )
          .slice(-6)
          .reverse(),
      })
      : null;
  const operationRuntime = oneShotReminderDirectEffect
    ? oneShotReminderOperationRuntimeFromDirectEffect({
      tempMemory: args.tempMemory,
      result: oneShotReminderDirectEffect,
    })
    : null;
  return {
    operationRuntime,
    routeDecision,
    turnFrame,
    tempMemory: operationRuntime?.nextTempMemory ?? args.tempMemory,
    routeOrFrameChanged,
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
  runtimeSafetySignalContext: any;
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
  let routeOrFrameChanged = false;

  const routeSafetyActive = isSafetyRoute(routeDecision);
  const {
    riskBand: runtimeSafetyRiskBand,
    safetyContextOutput: runtimeSafetySignalContext,
  } = runtimeSafetyContextForTurn({
    safetyContextOutput: args.safetyContextOutput,
    routeDecision,
    turnFrame,
    tempMemory,
    userMessage: args.userMessage,
  });

  const activeFlowState = readActiveFlowState(tempMemory);
  const weeklyState = !routeSafetyActive
    ? readWeeklyReviewState({
      activeSkillState: activeFlowState.activeSkillState,
      tempMemory,
    })
    : null;
  const weeklyDispatcherOutput = isRecord(weeklyState)
    ? await (args.weeklyReviewLocalDispatcher ??
      runWeeklyReviewLocalDispatcher)({
        user_id: args.userId,
        request_id: args.requestId ?? null,
        user_message: args.userMessage,
        recent_messages: weeklyRecentMessagesFromHistory(args.history),
        weekly_state: weeklyState,
        turn_frame: turnFrame,
      }).catch((error) => {
        console.warn("[WeeklyReview] pre-dispatch failed", error);
        return null;
      })
    : null;
  const weeklyOneShotDirectEffect =
    oneShotDirectEffectFromWeeklyReviewLocalDispatcherOutput(
      weeklyDispatcherOutput,
      { turnFrame },
    );
  const turnFrameBeforeWeeklyDirectEffect = turnFrame;
  turnFrame = turnFrameWithDirectEffectObject({
    turnFrame,
    effect: weeklyOneShotDirectEffect,
  });
  routeOrFrameChanged = routeOrFrameChanged ||
    turnFrame !== turnFrameBeforeWeeklyDirectEffect;
  // Cette lane n'appartient qu'au bilan hebdo: quand il est actif, le runtime
  // weekly retourne plus bas sans passer par la lane principale (ligne ~711),
  // donc elle doit couvrir les effets route pendant ce flow. Hors bilan hebdo,
  // la lane principale s'en charge — la faire tourner ici aussi exécuterait le
  // reminder deux fois dans le même tour (auto-collision: la 2e passe voit
  // l'écriture de la 1re et rend un duplicate_pending contredisant le commit).
  const weeklyShouldRunOneShotDirectEffect = Boolean(
    weeklyOneShotDirectEffect,
  ) || (isRecord(weeklyState) && routeRequestsDirectEffect({
    routeDecision,
    turnFrame,
    effectType: "create_one_shot_reminder",
  }));
  const weeklyDirectEffectLane = weeklyShouldRunOneShotDirectEffect
    ? await runDirectEffectLane({
      ...args,
      routeDecision,
      turnFrame,
      tempMemory,
      allowMessageIntakeFallback: false,
    })
    : null;
  if (weeklyDirectEffectLane) {
    routeDecision = weeklyDirectEffectLane.routeDecision;
    turnFrame = weeklyDirectEffectLane.turnFrame;
    tempMemory = weeklyDirectEffectLane.tempMemory;
    routeOrFrameChanged = routeOrFrameChanged ||
      weeklyDirectEffectLane.routeOrFrameChanged;
    turnFrame = turnFrameWithDirectEffectRuntime(
      turnFrame,
      weeklyDirectEffectLane.operationRuntime,
    ) ??
      (turnFrame ? withDirectEffectConfirmationContext(turnFrame) : turnFrame);
  }
  const weeklyReviewRuntime = isRecord(weeklyState)
    ? await runWeeklyReviewLocalRuntime({
      supabase: args.supabase,
      userId: args.userId,
      tempMemory,
      activeSkillState: activeFlowState.activeSkillState,
      userMessage: args.userMessage,
      history: args.history,
      requestId: args.requestId ?? null,
      v2Runtime: args.v2Runtime,
      loggedMessageId: args.sourceMessageId ?? null,
      turnFrame,
      precomputedDispatcherOutput: weeklyDispatcherOutput,
      visibleAgent: args.weeklyReviewVisibleAgent,
    })
    : null;
  if (weeklyReviewRuntime) {
    const mergedWeeklyRuntime = mergeDirectEffectRuntimeIntoVisibleRuntime({
      directRuntime: weeklyDirectEffectLane?.operationRuntime ?? null,
      visibleRuntime: weeklyReviewRuntime,
    }) ?? weeklyReviewRuntime;
    tempMemory = mergedWeeklyRuntime.nextTempMemory ?? tempMemory;
    const run = mergedWeeklyRuntime.toolSkillRun ?? {};
    const childFlowHandoff = isLocalChildFlowHandoff(run.child_flow_handoff)
      ? run.child_flow_handoff
      : null;
    if (
      childFlowHandoff &&
      childFlowHandoff.child_flow === "coaching_recommendation"
    ) {
      routeDecision = routeWithCoachingChildFlowHandoff(routeDecision);
      const activation = run.child_flow_note_information &&
          typeof run.child_flow_note_information === "object"
        ? {
          handoff: childFlowHandoff,
          skill_signal: buildCoachingRecommendationSkillSignal(
            childFlowHandoff.child_flow_context,
          ),
          note_information: run.child_flow_note_information as any,
        }
        : null;
      if (turnFrame && activation) {
        turnFrame = turnFrameWithChildFlowHandoff(turnFrame, activation);
      }
      return {
        operationRuntime: mergedWeeklyRuntime,
        routeDecision,
        turnFrame,
        tempMemory,
        statePatch: { temp_memory: tempMemory },
        routeSafetyActive,
        runtimeSafetyRiskBand,
        runtimeSafetySignalContext,
        weeklyReviewStateForTurn: tempMemory,
        weeklyReviewBlocksToolSkillRuntime: true,
        routeOrFrameChanged: true,
      };
    }
    return {
      operationRuntime: mergedWeeklyRuntime,
      routeDecision,
      turnFrame,
      tempMemory,
      statePatch: { temp_memory: tempMemory },
      routeSafetyActive,
      runtimeSafetyRiskBand,
      runtimeSafetySignalContext,
      weeklyReviewStateForTurn: tempMemory,
      weeklyReviewBlocksToolSkillRuntime: true,
      routeOrFrameChanged,
    };
  }

  const trackProgressRuntime: OperationRuntimeResult | null =
    !routeSafetyActive && turnFrame &&
      routePermitsTrackProgressRuntime({ routeDecision, turnFrame })
      ? await runTrackProgressRuntimeLane({
        tempMemory,
        turnFrame,
        sourceMessageId: args.sourceMessageId ?? null,
        userMessage: args.userMessage,
        planItemSnapshot: args.planItemSnapshot ?? [],
        supabase: args.supabase,
        userId: args.userId,
        channel: args.channel,
        v2Runtime: args.v2Runtime,
        trackProgressBlockedReasonCode: args.trackProgressBlockedReasonCode ??
          null,
        evidenceMessages: (args.history ?? [])
          .slice(-2)
          .map((entry: any) => String(entry?.content ?? ""))
          .filter(Boolean),
      })
      : null;

  const directEffectLane = await runDirectEffectLane({
    ...args,
    routeDecision,
    turnFrame,
    tempMemory,
    allowMessageIntakeFallback:
      args.allowDirectEffectMessageIntakeFallback === true,
  });
  routeDecision = directEffectLane.routeDecision;
  turnFrame = directEffectLane.turnFrame;
  tempMemory = directEffectLane.tempMemory;
  routeOrFrameChanged = routeOrFrameChanged ||
    directEffectLane.routeOrFrameChanged;

  const operationRuntime = mergeDirectEffectRuntimeIntoVisibleRuntime({
    directRuntime: directEffectLane.operationRuntime,
    visibleRuntime: trackProgressRuntime,
  });

  return {
    operationRuntime,
    routeDecision,
    turnFrame: turnFrameWithDirectEffectRuntime(turnFrame, operationRuntime),
    tempMemory: operationRuntime?.nextTempMemory ?? tempMemory,
    statePatch: operationRuntime
      ? { temp_memory: operationRuntime.nextTempMemory }
      : undefined,
    routeSafetyActive,
    runtimeSafetyRiskBand,
    runtimeSafetySignalContext,
    weeklyReviewStateForTurn: null,
    weeklyReviewBlocksToolSkillRuntime: false,
    routeOrFrameChanged,
  };
}
