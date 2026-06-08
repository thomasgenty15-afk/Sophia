/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type AgentMode,
  getUserState,
  insertChatMessage,
  logMessage,
  normalizeScope,
  updateUserState,
} from "../state-manager.ts";
import {
  buildContextString,
  loadContextForMode,
  type OnDemandTriggers,
} from "../context/loader.ts";
import { getUserTimeContext } from "../../_shared/user_time_context.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
  searchWithGeminiGrounding,
} from "../../_shared/gemini.ts";
import { logCoachingObservabilityEvent } from "../../_shared/coaching-observability.ts";
import { debounceAndBurstMerge } from "./debounce.ts";
import { buildLastAssistantInfo } from "./dispatcher_flow.ts";
import {
  clearMachineStateTempMemory,
  detectMagicResetCommand,
} from "./magic_reset.ts";
import { DEFAULT_SIGNALS, type DispatcherSignals } from "./dispatcher.ts";
import {
  buildSurfaceRuntimeDecision,
  readSurfaceState,
} from "../surface_state.ts";
import { runAgentAndVerify } from "./agent_exec.ts";
import { buildToolAckContract } from "../tool_ack.ts";
import {
  type BrainTracePhase,
  logBrainTrace,
} from "../../_shared/brain-trace.ts";
import {
  createEffectLedger,
  summarizeEffectLedgerForTrace,
} from "./effect_ledger.ts";
import {
  applyCompactStartGuard,
  applyIncompleteRecapGuard,
  applyNonDurableMemoryPromiseGuard,
  applyUnexecutedEffectClaimGuard,
} from "./final_response_guards.ts";
export {
  applyCompactStartGuard,
  applyIncompleteRecapGuard,
  applyNonDurableMemoryPromiseGuard,
  applyUnexecutedEffectClaimGuard,
} from "./final_response_guards.ts";

const ORIENTATION_CLARIFICATION_TOOL_SKILL_HANDLERS = new Set([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "update_coach_preferences",
]);

const ORIENTATION_CLARIFICATION_CONVERSATION_SKILL_HANDLERS = new Set([
  "demotivation_repair",
  "emotional_repair",
  "product_help",
  "safety_crisis",
]);

export function resolveOrientationClarificationToolSkillHandler(args: {
  status: string;
  selectedCandidateId?: string | null;
  selectedCandidateOperationType?: string | null;
}): string | null {
  if (args.status !== "resolved") return null;
  const selectedCandidateId = String(args.selectedCandidateId ?? "").trim();
  const selectedOperationType = String(
    args.selectedCandidateOperationType ?? "",
  ).trim();
  const candidate = selectedOperationType || selectedCandidateId;
  return ORIENTATION_CLARIFICATION_TOOL_SKILL_HANDLERS.has(candidate)
    ? candidate
    : null;
}

export function resolveOrientationClarificationConversationSkillHandler(args: {
  status: string;
  selectedCandidateId?: string | null;
}): string | null {
  if (args.status !== "resolved") return null;
  const selectedCandidateId = String(args.selectedCandidateId ?? "").trim();
  return ORIENTATION_CLARIFICATION_CONVERSATION_SKILL_HANDLERS.has(
      selectedCandidateId,
    )
    ? selectedCandidateId
    : null;
}

function confidenceRankForOrientation(value: unknown): number {
  return value === "critical"
    ? 4
    : value === "high"
    ? 3
    : value === "medium"
    ? 2
    : value === "low"
    ? 1
    : 0;
}

function detectedSignalConfidence(turnFrame: TurnFrame, id: string): number {
  const entry = turnFrame.skill_signals?.entry?.[id];
  if (entry?.detected === true) {
    return confidenceRankForOrientation(entry.confidence_band);
  }
  const lifecycle = turnFrame.skill_signals?.lifecycle?.[id];
  if (lifecycle?.detected === true) {
    return confidenceRankForOrientation(lifecycle.confidence_band);
  }
  return 0;
}

export function currentTurnSupportsOrientationToolResolution(args: {
  turnFrame: TurnFrame;
  operationType: string | null | undefined;
}): boolean {
  const operationType = String(args.operationType ?? "").trim();
  if (!operationType) return false;
  if (detectedSignalConfidence(args.turnFrame, operationType) >= 2) return true;
  const opportunity = args.turnFrame.tool_skill_opportunity;
  if (
    opportunity?.operation_type === operationType &&
    opportunity.type !== "none" &&
    (opportunity.should_offer ||
      confidenceRankForOrientation(opportunity.confidence_band) >= 2)
  ) {
    return true;
  }
  return args.turnFrame.tool_skill_intents.some((intent) =>
    intent.operation_type === operationType &&
    intent.user_intent !== "explain_only" &&
    !(intent.rejected_operations ?? []).includes(operationType) &&
    confidenceRankForOrientation(intent.confidence_band) >= 2 &&
    (intent.ambiguity === "none" || intent.ambiguity === "target_ambiguous")
  );
}

export function currentTurnConversationSkillOverrideForOrientation(args: {
  status: string;
  turnFrame: TurnFrame;
  resolvedToolSkillHandler?: string | null;
  selectedCandidateOperationType?: string | null;
  selectedCandidateConfidence?: string | null;
}): string | null {
  if (args.status !== "resolved") return null;
  const resolvedToolSkillHandler = String(args.resolvedToolSkillHandler ?? "")
    .trim();
  if (!resolvedToolSkillHandler) return null;
  const selectedCandidateOperationType = String(
    args.selectedCandidateOperationType ?? "",
  ).trim();
  const selectedCandidateConfidence = confidenceRankForOrientation(
    args.selectedCandidateConfidence,
  );
  if (
    selectedCandidateOperationType === resolvedToolSkillHandler &&
    selectedCandidateConfidence >= 2
  ) return null;
  if (
    currentTurnSupportsOrientationToolResolution({
      turnFrame: args.turnFrame,
      operationType: resolvedToolSkillHandler,
    })
  ) return null;

  let best: { id: string; rank: number } | null = null;
  for (const skillId of ORIENTATION_CLARIFICATION_CONVERSATION_SKILL_HANDLERS) {
    const rank = detectedSignalConfidence(args.turnFrame, skillId);
    if (rank < 2) continue;
    if (!best || rank > best.rank) best = { id: skillId, rank };
  }
  return best?.id ?? null;
}

export function shouldBypassOrientationClarificationForExplicitToolRoute(args: {
  routeDecision: RouteDecision;
  turnFrame: TurnFrame;
}): boolean {
  if (args.routeDecision.response_owner !== "tool_skill") return false;
  const selectedHandler = String(
    args.routeDecision.selected_handler ?? "",
  ).trim();
  if (!ORIENTATION_CLARIFICATION_TOOL_SKILL_HANDLERS.has(selectedHandler)) {
    return false;
  }
  const reasonCode = String(args.routeDecision.reason_code ?? "");
  const explicitReason = reasonCode.startsWith("central_arbitrator_") ||
    reasonCode.endsWith("_interrupts_active_handoff");
  if (!explicitReason) return false;
  const hasAttackCardIntent = args.turnFrame.tool_skill_intents.some((intent) =>
    intent.operation_type === "prepare_attack_card" &&
    intent.user_intent !== "explain_only" &&
    intent.confidence_band !== "low" &&
    intent.ambiguity === "none"
  );
  const hasDefenseCardIntent = args.turnFrame.tool_skill_intents.some((
    intent,
  ) =>
    intent.operation_type === "prepare_defense_card" &&
    intent.user_intent !== "explain_only" &&
    intent.confidence_band !== "low" &&
    intent.ambiguity === "none"
  );
  if (hasAttackCardIntent && hasDefenseCardIntent) return false;
  return args.turnFrame.tool_skill_intents.some((intent) =>
    intent.operation_type === selectedHandler &&
    intent.explicitness === "explicit" &&
    intent.confidence_band !== "low" &&
    intent.ambiguity === "none"
  );
}

function targetToolSkillFromHandoffInterrupt(
  reasonCode: string | null | undefined,
): string | null {
  const match = String(reasonCode ?? "").trim().match(
    /^([a-z_]+)_interrupts_active_handoff$/,
  );
  const candidate = match?.[1] ?? "";
  return ORIENTATION_CLARIFICATION_TOOL_SKILL_HANDLERS.has(candidate)
    ? candidate
    : null;
}

import {
  applyCoachResponseStylePreferences,
  loadCoachResponseStylePreferences,
  userRequestsShortStyle,
} from "./response_style_policy.ts";
export { applyCoachResponseStylePreferences } from "./response_style_policy.ts";
import { isActiveCardDraftingOperation } from "./active_operation_guards.ts";
import { logMemoryObservabilityEvent } from "../../_shared/memory-observability.ts";
import { runMemoryV2ActiveLoader } from "../../_shared/memory/runtime/active_loader.ts";
import {
  type DispatcherRunStats,
  runDispatcher,
} from "../dispatcher/dispatcher.v2.ts";
import { logConversationTurn } from "../observability/trace_logger.ts";
import {
  type AgendaTask,
  buildTurnAgenda,
  summarizeTurnAgenda,
  type TurnAgenda,
  type TurnAgendaSummary,
} from "./turn_agenda.ts";
import { resolveFlowInterruptions } from "./turn_interruption_policy.ts";
import {
  arbitrateActiveHandoffFlow,
  extractActiveHandoffFromTempMemory,
  shouldBypassOrientationClarificationForActiveHandoff,
} from "./handoff_flow_arbitration.ts";
import {
  buildUserTurnSnapshot,
  type UserTurnSnapshot,
} from "./user_turn_snapshot.ts";
import {
  type EffectGateOrchestratorResult,
  runEffectGateOrchestrator,
} from "../routers/effect_gate_orchestrator.ts";
import { runConversationRouters } from "../routers/routers.ts";
import { arbitrateTurnIntent } from "./turn_intent_arbitrator.ts";
import { runSafetyPregate } from "../safety/safety_pregate.ts";
import {
  blocksDirectEffects,
  blocksToolSkills,
  isAtLeast,
} from "../safety/safety_thresholds.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  applySafetyCrisisExitStateIfNeeded,
  directSafetyCrisisReplyOverride as directSafetyCrisisReplyOverrideRuntime,
  isSafetyRoute,
  runtimeSafetyPregateForTurn,
  selectedConversationSkillForRoute,
  suppressToolSignalsForSafetyRoute,
  withActiveSafetyFlowCaution,
} from "./safety_crisis_runtime.ts";
export { directSafetyCrisisReplyOverride } from "./safety_crisis_runtime.ts";
import {
  hasExplicitOneShotReminderDirectEffectOverride,
  oneShotReminderManagementReply,
} from "../tools/always_on/one_shot_reminder/router.ts";
import {
  type AttackKeywordMatch,
  buildAttackKeywordContextOverride,
  loadAttackKeywordMatch,
} from "../tools/operations/prepare_attack_card/run_support.ts";
import { maybeRunPrepareAttackCardOperation } from "../tools/operations/prepare_attack_card/router.ts";
import { maybeRunPrepareDefenseCardOperation } from "../tools/operations/prepare_defense_card/router.ts";
import { isAttackCardHandoffState } from "../tools/operations/prepare_attack_card/state.ts";
import {
  readPostMorningNudgeActiveState,
  runPostMorningNudgeLocalRuntime,
} from "../post_morning_nudge.ts";
import {
  maybeRunFlowOpportunityVerificationRuntime,
} from "../skills/flow_opportunity_verification/runtime.ts";
import {
  hasActiveFlowOpportunityState,
} from "../skills/flow_opportunity_verification/state.ts";
import { clearConversationFlowForCoachPreference } from "../tools/operations/update_coach_preferences/route_guards.ts";
import { maybeRunUpdateCoachPreferencesOperation } from "../tools/operations/update_coach_preferences/router.ts";
import { loadCoachPreferenceRuntimeContext } from "../tools/operations/update_coach_preferences/runtime_policy.ts";
import { createConfirmationToken } from "../confirmation/confirmation_token.ts";
import {
  isPendingAdjustPlanDraftReview,
  isPendingAdjustPlanItemOperation,
  isPendingAdjustPlanItemRecommendationOperation,
  writeAdjustPlanPendingDraftReview,
} from "../tools/operations/adjust_plan_item/state.ts";
export { renderAdjustPlanDraftDetails } from "../tools/operations/adjust_plan_item/draft_review.ts";
import {
  applyWeeklyConclusionGuard,
  applyWeeklyConcreteOrganizationGuard,
  applyWeeklyForgottenProgressAckGuard,
  applyWeeklyRepeatedClarificationGuard,
  buildWeeklyTurnSlotAddon,
  cleanWeeklyVisibleResponse,
  hasPendingOrActiveAdjustPlanOperation,
  isWeeklyAdaptiveReviewActive,
  maybeLogWeeklyForgottenProgressParallel,
  runWeeklyReviewLocalRuntime,
  shouldKeepWeeklyAdaptiveReviewInConversation,
  summarizeWeeklyAdaptiveReviewForAddon,
  weeklyAdaptiveReviewStateForTurn,
  weeklyMissionCarryOverContext,
  weeklyReviewAllowsAdjustPlanBridge,
} from "../skills/weekly_review/runtime.ts";
import {
  buildTechniqueHistoryForSelector,
  readCoachingInterventionMemory,
  reconcileCoachingInterventionStateFromUserTurn,
} from "../coaching_intervention_tracking.ts";
import {
  buildCoachingCustomizationContext,
  buildCoachingHistorySnapshot,
  deriveCoachingFollowUpAudit,
  findCoachingDeprioritizedTechniques,
} from "../coaching_intervention_observability.ts";
import { readMomentumStateV2 } from "../momentum_state.ts";
import {
  type ActiveTransformationRuntime,
  getActiveLoad,
  getActiveTransformationRuntime,
} from "../../_shared/v2-runtime.ts";
import type { ProductRecommendation } from "../recommendation/recommendation_types.ts";
import {
  loadPlanSnapshotForTurn,
  type V2PlanItemSnapshotItem,
} from "./plan_snapshot_runtime.ts";
export {
  buildV2PlanItemSnapshot,
  computeStreakFromEntries,
} from "./plan_snapshot_runtime.ts";
import {
  buildDispatcherActiveRuntimeContext,
  buildLastLocalFlowExitContext,
  clearActiveToolFlow,
  clearLastLocalFlowExitContext,
  clearPendingToolConfirmation,
  clearToolSkillFlow,
  clearToolSkillFlowForDirectReminder,
  pendingConfirmationOwnedByToolSkill,
  pendingOperationType,
  readActiveFlowState,
  restoreSuspendedPlatformHandoffForOperation,
  suspendActivePlatformHandoff,
} from "./active_flow_state.ts";
import {
  executedToolsForStatus,
  recordAgendaEffectsInLedger,
  recordRecommendationEffectInLedger,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";
export { recordToolSkillEffectsInLedger as recordToolSkillEffectsInLedgerForTest } from "./effect_ledger_adapter.ts";
export { isFaitPrevuFragileRecapRequest } from "../skills/status_recap/runtime.ts";
import { runOperationRuntimePipeline } from "./operation_runtime_pipeline.ts";
import { runFinalResponsePipeline } from "./final_response_pipeline.ts";
import { applyMemoryV2ResponseGroundingGuardrail } from "./memory_response_grounding_guard.ts";
import { resolveAgentChatModel } from "./agent_model_selection.ts";
export { resolveAgentChatModel } from "./agent_model_selection.ts";
import { classifyStaleBilanResponse } from "./stale_bilan_runtime.ts";
export {
  deterministicStaleBilanDecision,
  type StaleBilanDecision,
} from "./stale_bilan_runtime.ts";
import {
  ensureVisibleSophiaEmoji,
  stripDeprecatedProductVocabulary,
  stripHiddenHtmlComments,
} from "./response_visibility_formatting.ts";
export { effectiveResponseOwnerForOperationRuntime } from "./operation_response_owner.ts";
import { handleOperationRuntimeResponse } from "./operation_runtime_response_handler.ts";
import {
  buildActivePlanSnapshotAddon,
  buildResolvedPlanTargetAddon,
  compactListText,
  planItemTitleFromAdjustmentDraft,
  readLastResolvedPlanItem,
  resolvePlanItemTargetFromText,
  writeLastResolvedPlanItem,
} from "./plan_targeting_support.ts";
export { operationInputFromLastPlanItem } from "./plan_targeting_support.ts";
import {
  directConversationSkillReplyOverride,
  enforceRecommendationToolVisibleReply,
  normalizeRecommendationText,
  prepareRecommendationRuntimeForTurn,
} from "./recommendation_runtime_support.ts";
import { runSelectStatePotionHandoffSkill } from "../tools/operations/select_state_potion/handoff.ts";
import { loadStatePotionHandoffStateFromTempMemory } from "../tools/operations/select_state_potion/state.ts";
import {
  attachDynamicAddons,
  DEFAULT_DISPATCHER_MEMORY_PLAN,
  detectCheckupIntent,
  dispatcherSignalsFromTurnFrame,
  isCheckupActive,
  parseInvestigationStartedMs,
  resolveBinaryConsentLite,
  resolvePlanItemIdFromSnapshot,
  resolvePlanItemTitleFromSnapshot,
  selectTargetMode,
  stabilizeOnboardingFlag,
  withTimeout,
  ymdToUtcNoonDate,
} from "./turn_context_runtime.ts";
import {
  coachingDimensionForLog,
  mapMomentumStateV2ToCoachingContext,
  maybeAttachCoachingInterventionAddon,
  resolveCoachingTargetPlanItem,
} from "./coaching_intervention_runtime_support.ts";
export {
  mapMomentumStateV2ToCoachingContext,
  resolveCoachingTargetPlanItem,
} from "./coaching_intervention_runtime_support.ts";
import {
  buildConversationRiskFlowExitAddon,
  buildRecentConversationContinuityAddon,
  normalizeRouteText,
} from "./conversation_route_runtime_support.ts";
import {
  maybeStartActiveSkillClarification,
  maybeStartDispatcherClarification,
} from "./clarification_arbitrator.ts";
import {
  detectConfirmationKind,
  hasStrongToolSkillIntent,
  maybeRunAdjustPlanItemOperation,
} from "./adjust_plan_operation_bridge.ts";
export {
  detectConfirmationKind,
  maybeRunAdjustPlanItemOperation,
} from "./adjust_plan_operation_bridge.ts";
import { maybeLogDefenseCardWinParallel } from "./defense_card_win_runtime.ts";
import { persistNormalReplyTurn } from "./normal_reply_persistence_pipeline.ts";
export {
  attachPendingRecommendationOperation,
  buildRecommendationFromToolSkillOpportunity,
  directConversationSkillReplyOverride,
  enforceRecommendationToolVisibleReply,
} from "./recommendation_runtime_support.ts";

function envFlagEnabled(name: string): boolean {
  const raw = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseJsonish(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "").trim();
  if (!text) return {};
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    return {};
  }
}

function buildDispatcherLlmRunner(meta?: {
  requestId?: string;
  model?: string;
  forceRealAi?: boolean;
}) {
  if (!envFlagEnabled("SOPHIA_DISPATCHER_LLM_ENABLED") && !meta?.forceRealAi) {
    return undefined;
  }
  return async (input: {
    system_prompt: string;
    user_prompt: string;
    json_mode: true;
    model_name: string;
  }) => {
    try {
      const model = String(
        Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
          input.model_name ??
          meta?.model ??
          getGlobalAiModel("gemini-2.5-flash"),
      ).trim();
      const raw = await generateWithGemini(
        input.system_prompt,
        input.user_prompt,
        0.1,
        input.json_mode,
        [],
        "auto",
        {
          requestId: meta?.requestId,
          model,
          source: "dispatcher-v2-llm",
          forceRealAi: true,
          forceInitialModel: true,
          maxRetries: 1,
        },
      );
      return parseJsonish(raw);
    } catch (error) {
      console.warn(
        "[Router] dispatcher LLM failed; falling back to heuristic",
        {
          requestId: meta?.requestId ?? null,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return {};
    }
  };
}

function envInt(name: string, fallback: number): number {
  try {
    const raw = String((globalThis as any)?.Deno?.env?.get?.(name) ?? "")
      .trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  } catch {
    return fallback;
  }
}

export async function processMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  history: any[],
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
    scope?: string;
    whatsappMode?: "onboarding" | "normal";
    evalRunId?: string | null;
    forceBrainTrace?: boolean;
    enableAdjustPlanCoachGuidance?: boolean;
    clientNowIso?: string | null;
  },
  opts?: {
    logMessages?: boolean;
    forceMode?: AgentMode;
    contextOverride?: string;
    messageMetadata?: Record<string, unknown>;
    disableForcedRouting?: boolean;
    forceOnboardingFlow?: boolean;
    disableDebounce?: boolean;
    debounceWaitMs?: number;
    roadmapContext?: {
      cycleId: string | null;
      transformations: any[];
      isFirstOnboarding: boolean;
      previousTransformation?: { title?: string | null } | null;
    };
  },
) {
  const turnStartMs = Date.now();
  let dispatcherLatencyMs: number | undefined;
  let contextLatencyMs: number | undefined;
  let agentLatencyMs: number | undefined;
  let researchLatencyMs: number | undefined;

  const channel = meta?.channel ?? "web";
  const scope = normalizeScope(
    meta?.scope,
    channel === "whatsapp" ? "whatsapp" : "web",
  );

  const trace = async (
    event: string,
    phase: BrainTracePhase,
    payload: Record<string, unknown> = {},
    level: "debug" | "info" | "warn" | "error" = "info",
  ) => {
    await logBrainTrace({
      supabase,
      userId,
      meta: {
        requestId: meta?.requestId,
        evalRunId: (meta as any)?.evalRunId ?? null,
        forceBrainTrace: (meta as any)?.forceBrainTrace,
      },
      event,
      phase,
      level,
      payload,
    });
  };

  const logMessages = opts?.logMessages !== false;

  let loggedMessageId: string | null = null;
  if (logMessages) {
    const inserted = await insertChatMessage(
      supabase,
      userId,
      scope,
      "user",
      userMessage,
      undefined,
      opts?.messageMetadata ?? {},
      { selectId: true },
    );
    loggedMessageId = inserted?.id ?? null;
  }
  await trace("brain:user_message_logged", "io", {
    logged_message_id: loggedMessageId,
    log_messages: logMessages,
    scope,
    channel,
  }, "debug");
  const effectLedger = createEffectLedger(
    meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
  );

  if (loggedMessageId && !opts?.disableDebounce) {
    const debounced = await debounceAndBurstMerge({
      supabase,
      userId,
      scope,
      loggedMessageId,
      userMessage,
      debounceWaitMs: opts?.debounceWaitMs,
    });
    if (debounced.aborted) {
      await trace("brain:debounce_aborted", "io", {
        reason: debounced.abortReason ?? "debounceAndBurstMerge",
        logged_message_id: debounced.loggedMessageId ?? loggedMessageId,
        latest_message_id: debounced.latestMessageId ?? null,
      }, "debug");
      try {
        const abortTurnFrame: TurnFrame = {
          turn_id: meta?.requestId ?? loggedMessageId,
          source_message_id: loggedMessageId,
          user_id: userId,
          channel,
          safety: { risk_band: "none", reason_codes: [], evidence: [] },
          conversation_risk: {
            score: 0,
            threshold: 8,
            should_exit_flows: false,
            reason_codes: [],
            previous_scores: [],
            matrix: [],
            context_summary: null,
          },
          direct_effects: [],
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
          skill_signals: {},
          memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
        };
        const abortRouteDecision: RouteDecision = {
          route_version: "v1",
          response_owner: "normal_reply",
          selected_handler: "debounce_abort",
          blocked_paths: [{ path: "response", reason_code: "debounce_abort" }],
          direct_effects_to_run: [],
          reason_code: "debounce_abort",
          memory_used_for_route: false,
          memory_item_ids_used_for_route: [],
          memory_use_kind: "none",
        };
        await logConversationTurn({
          turn_id: abortTurnFrame.turn_id,
          user_id: userId,
          source_message_id: loggedMessageId,
          ts: new Date().toISOString(),
          safety_pregate: {
            detected: false,
            evidence: [],
            risk_band: "none",
            reason_codes: [],
            allow_side_effects: true,
            layer_contributions: {
              lexical: false,
              heuristic: false,
              dispatcher_llm: false,
            },
          } as any,
          dispatcher_run: {
            latency_ms: 0,
            tokens_in: 0,
            tokens_out: 0,
            prompt_version: "debounce_abort",
            model_used: null,
            memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
          },
          turn_frame: abortTurnFrame,
          route_decision: abortRouteDecision,
          direct_effects: [],
          tool_skill_run: {
            status: "aborted",
            reason_code: debounced.abortReason ?? "debounceAndBurstMerge",
            logged_message_id: debounced.loggedMessageId ?? loggedMessageId,
            latest_message_id: debounced.latestMessageId ?? null,
          },
          confirmation_token_outcomes: [],
          memory_write_candidates_emitted: 0,
          response_owner: "normal_reply",
          total_latency_ms: Date.now() - turnStartMs,
        }, { supabase });
      } catch (error) {
        console.warn(
          "[Router] debounce abort trace failed (non-blocking):",
          error,
        );
      }
      return {
        content: "",
        mode: "companion" as AgentMode,
        aborted: true,
        abort_reason: debounced.abortReason ?? "debounceAndBurstMerge",
        logged_message_id: debounced.loggedMessageId ?? loggedMessageId,
        latest_message_id: debounced.latestMessageId ?? null,
      };
    }
    userMessage = debounced.userMessage;
  }

  let state = await getUserState(supabase, userId, scope);
  let tempMemory: any = (state as any)?.temp_memory ?? {};
  await trace("brain:user_state_loaded", "context", {
    current_mode: (state as any)?.current_mode ?? null,
    has_temp_memory: Boolean(tempMemory && typeof tempMemory === "object"),
    has_investigation_state: Boolean((state as any)?.investigation_state),
  }, "debug");

  const onboarding = stabilizeOnboardingFlag(tempMemory);
  tempMemory = onboarding.tempMemory;
  const coachingMemoryBeforeReconcile = readCoachingInterventionMemory(
    tempMemory,
  );
  tempMemory = await reconcileCoachingInterventionStateFromUserTurn({
    tempMemory,
    userMessage,
    history,
    meta: {
      requestId: meta?.requestId,
      forceRealAi: meta?.forceRealAi,
      model: meta?.model,
      userId,
    },
  });
  const coachingMemoryAfterReconcile = readCoachingInterventionMemory(
    tempMemory,
  );
  const coachingFollowUpAudit = deriveCoachingFollowUpAudit({
    before: coachingMemoryBeforeReconcile,
    after: coachingMemoryAfterReconcile,
  });
  if (coachingFollowUpAudit) {
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "coaching_followup_classified",
      payload: {
        momentum_state: readMomentumStateV2(tempMemory).current_state ?? null,
        follow_up_outcome: coachingFollowUpAudit.follow_up_outcome,
        helpful: coachingFollowUpAudit.helpful,
        blocker_type: coachingFollowUpAudit.blocker_type,
        recommended_technique: coachingFollowUpAudit.technique_id,
        intervention_id: coachingFollowUpAudit.intervention_id,
        previous_status: coachingFollowUpAudit.previous_status,
        next_status: coachingFollowUpAudit.next_status,
        follow_up_needed: false,
        selector_source: coachingFollowUpAudit.selector_source,
        customization_context: {
          target_action_title: coachingFollowUpAudit.target_action_title ??
            null,
        },
        outcome_reason: coachingFollowUpAudit.outcome_reason,
        history_snapshot: buildCoachingHistorySnapshot(
          buildTechniqueHistoryForSelector(tempMemory),
        ),
      },
    });
  }

  // Magic Reset Check (abracadabra)
  const magicResetVariant = detectMagicResetCommand(userMessage);
  if (magicResetVariant) {
    const { tempMemory: cleared, clearedKeys } = clearMachineStateTempMemory({
      tempMemory,
    });
    tempMemory = cleared;
    await trace("brain:magic_reset_command", "routing", {
      variant: magicResetVariant,
      cleared_keys: clearedKeys,
      cleared_count: clearedKeys.length,
    }, "warn");

    // Force immediate persist to ensure reset sticks even if later logic fails
    await updateUserState(supabase, userId, scope, { temp_memory: tempMemory });
  }

  const { lastAssistantMessage } = buildLastAssistantInfo(history);
  let v2Runtime: ActiveTransformationRuntime | null = null;
  const v2RuntimeStartMs = Date.now();
  try {
    v2Runtime = await withTimeout(
      getActiveTransformationRuntime(supabase, userId),
      envInt("SOPHIA_V2_RUNTIME_PREFETCH_TIMEOUT_MS", 1500),
      "v2_runtime_prefetch",
    );
    await trace("brain:v2_runtime_prefetched", "context", {
      load_ms: Date.now() - v2RuntimeStartMs,
      has_cycle: Boolean(v2Runtime.cycle),
      has_transformation: Boolean(v2Runtime.transformation),
      has_plan: Boolean(v2Runtime.plan),
    }, "debug");
  } catch (error) {
    console.warn(
      "[Router] V2 runtime prefetch failed (non-blocking):",
      error,
    );
    await trace("brain:v2_runtime_prefetch_failed", "context", {
      load_ms: Date.now() - v2RuntimeStartMs,
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  let attackKeywordContextOverride = "";
  let attackKeywordMatchForTurn: AttackKeywordMatch | null = null;
  try {
    const attackKeywordMatch = await loadAttackKeywordMatch({
      supabase,
      userId,
      userMessage,
      runtime: v2Runtime,
    });
    if (attackKeywordMatch) {
      attackKeywordMatchForTurn = attackKeywordMatch;
      attackKeywordContextOverride = buildAttackKeywordContextOverride({
        match: attackKeywordMatch,
      });
      await trace("brain:attack_keyword_trigger_detected", "routing", {
        activation_keyword:
          attackKeywordMatch.payload.activation_keyword_normalized,
        scope_kind: attackKeywordMatch.scopeKind,
        transformation_id: attackKeywordMatch.transformationId,
      }, "info");
    }
  } catch (error) {
    await trace("brain:attack_keyword_trigger_failed", "routing", {
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  const planItemSnapshot: V2PlanItemSnapshotItem[] | undefined =
    await loadPlanSnapshotForTurn({
      supabase,
      userId,
      runtime: v2Runtime,
      onError: (phase, error) => {
        console.warn(
          phase === "primary"
            ? "[Router] V2 plan item snapshot load failed (non-blocking):"
            : "[Router] V2 plan item snapshot fallback failed (non-blocking):",
          error,
        );
      },
    });
  const clientNow = meta?.clientNowIso ? new Date(meta.clientNowIso) : null;
  const userTime = await getUserTimeContext({
    supabase,
    userId,
    now: clientNow && Number.isFinite(clientNow.getTime())
      ? clientNow
      : undefined,
  }).catch(() => null as any);

  const currentMessagePlanTarget = resolvePlanItemTargetFromText(
    userMessage,
    planItemSnapshot,
  );
  if (currentMessagePlanTarget) {
    tempMemory = writeLastResolvedPlanItem(
      tempMemory,
      currentMessagePlanTarget,
      "user_message",
    );
  }
  const preContextualPlanTarget = readLastResolvedPlanItem(tempMemory);

  if (currentMessagePlanTarget) {
    tempMemory = writeLastResolvedPlanItem(
      tempMemory,
      currentMessagePlanTarget,
      "user_message",
    );
  } else if (preContextualPlanTarget) {
    tempMemory = {
      ...(tempMemory ?? {}),
      __last_resolved_plan_item: preContextualPlanTarget,
    };
  }
  const recentMessagesForTurnFrame = history.slice(-8).map((message: any) => ({
    role: message?.role === "assistant"
      ? "assistant" as const
      : "user" as const,
    content: String(message?.content ?? ""),
  }));
  const safetyPregateOutput = withActiveSafetyFlowCaution(
    runSafetyPregate({
      user_message: userMessage,
      recent_messages: recentMessagesForTurnFrame,
      user_id: userId,
      channel,
    }),
    tempMemory,
  );
  let turnFrame: TurnFrame | null = null;
  let routeDecision: RouteDecision | null = null;
  let orientationClarificationReply: string | null = null;
  let userTurnSnapshot: UserTurnSnapshot | null = null;
  let turnAgenda: TurnAgenda | null = null;
  let turnAgendaSummary: TurnAgendaSummary | null = null;
  let dispatcherSignals: DispatcherSignals = DEFAULT_SIGNALS;
  let directEffectGateResult: EffectGateOrchestratorResult | null = null;
  let conversationRiskForPersist:
    | NonNullable<
      TurnFrame["conversation_risk"]
    >
    | null = null;
  let conversationRiskHistoryForPersist: number[] = Array.isArray(
      (tempMemory as any)?.__conversation_risk_history,
    )
    ? ((tempMemory as any).__conversation_risk_history as unknown[])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .slice(-5)
    : [];
  const dispatcherV2Stats: DispatcherRunStats[] = [];
  const activeFlowStateForTurn = readActiveFlowState(tempMemory);
  let activeSkillState = activeFlowStateForTurn.activeSkillState;
  let activeOperationIntake = activeFlowStateForTurn.activeToolSkillIntake;
  const activeOperationTypeForLocalFlow = String(
    (activeOperationIntake as any)?.operation_type ??
      ((activeOperationIntake as any)?.mode === "platform_handoff"
        ? (activeOperationIntake as any)?.skill_id
        : (activeOperationIntake as any)?.skill_id ?? ""),
  ).trim();
  const activeAttackCardHandoffForLocalFlow = isAttackCardHandoffState(
      (tempMemory as any)?.__active_attack_card_handoff,
    )
    ? (tempMemory as any).__active_attack_card_handoff
    : null;
  const activeStatePotionHandoffForLocalFlow =
    loadStatePotionHandoffStateFromTempMemory(tempMemory);
  const activeLocalFlowOperationType = activeAttackCardHandoffForLocalFlow
    ? "prepare_attack_card"
    : activeStatePotionHandoffForLocalFlow
    ? "select_state_potion"
    : activeOperationTypeForLocalFlow;
  const activeSubskillId = String(
    (activeStatePotionHandoffForLocalFlow as any)?.active_subskill_id ?? "",
  ).trim();
  const activeLocalFlowHandler = activeLocalFlowOperationType ===
      "prepare_attack_card"
    ? "prepare_attack_card"
    : activeSubskillId.startsWith(
        "select_state_potion.",
      )
    ? activeSubskillId
    : activeStatePotionHandoffForLocalFlow?.clarte_state?.selected_potion ===
        "clarte"
    ? "select_state_potion.clarte"
    : activeLocalFlowOperationType;
  const activePotionSubskillName = activeLocalFlowHandler.startsWith(
      "select_state_potion.",
    )
    ? activeLocalFlowHandler.slice("select_state_potion.".length)
    : "";
  const activeLocalFlowReasonCode = activeLocalFlowOperationType ===
      "prepare_attack_card"
    ? "active_prepare_attack_card_local_dispatcher"
    : activeLocalFlowOperationType === "adjust_plan_item"
    ? "active_adjust_plan_item_local_dispatcher"
    : activeLocalFlowOperationType === "prepare_defense_card"
    ? "active_prepare_defense_card_local_dispatcher"
    : activeLocalFlowOperationType === "update_coach_preferences"
    ? "active_update_coach_preferences_local_dispatcher"
    : activePotionSubskillName
    ? `active_${activePotionSubskillName}_local_dispatcher`
    : "active_select_state_potion_local_dispatcher";
  const activeLocalFlowBlockedReasonCode = activeLocalFlowOperationType ===
      "prepare_attack_card"
    ? "active_prepare_attack_card_uses_local_dispatcher"
    : activeLocalFlowOperationType === "adjust_plan_item"
    ? "active_adjust_plan_item_uses_local_dispatcher"
    : activeLocalFlowOperationType === "prepare_defense_card"
    ? "active_prepare_defense_card_uses_local_dispatcher"
    : activeLocalFlowOperationType === "update_coach_preferences"
    ? "active_update_coach_preferences_uses_local_dispatcher"
    : activePotionSubskillName
    ? `active_${activePotionSubskillName}_uses_local_dispatcher`
    : "active_select_state_potion_uses_local_dispatcher";
  let activeOperationIntakeForDispatcher = activeOperationIntake;
  let pendingOperationConfirmation =
    readActiveFlowState(tempMemory).pendingToolSkillConfirmation;
  let pendingOperationConfirmationForGlobalRouting =
    pendingConfirmationOwnedByToolSkill(pendingOperationConfirmation)
      ? null
      : pendingOperationConfirmation;
  const activePostMorningNudgeState = readPostMorningNudgeActiveState(
    tempMemory,
  );
  const activeWeeklyReviewLocalState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState,
    tempMemory,
  });
  if (activeWeeklyReviewLocalState) {
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: "weekly_adaptive_review_v1",
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: "active_weekly_review_uses_local_dispatcher",
      }],
      direct_effects_to_run: [],
      reason_code: "active_weekly_review_local_dispatcher",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    const localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyPregateOutput.risk_band,
        reason_codes: safetyPregateOutput.reason_codes ?? [],
        evidence: safetyPregateOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: conversationRiskHistoryForPersist,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
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
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    const weeklyRuntime = await runWeeklyReviewLocalRuntime({
      supabase,
      userId,
      tempMemory,
      activeSkillState,
      userMessage,
      history,
      requestId: meta?.requestId ?? null,
      v2Runtime: v2Runtime ?? null,
      loggedMessageId,
    });
    if (weeklyRuntime) {
      const localRuntimeReason = String(
        (weeklyRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "weekly_review_local_exit_to_global_dispatcher" ||
        localRuntimeReason === "weekly_review_safety_preempt"
      ) {
        tempMemory = weeklyRuntime.nextTempMemory ?? tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        await updateUserState(supabase, userId, scope, {
          temp_memory: tempMemory,
        });
        await trace(
          "brain:active_weekly_review_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            source_dispatcher_local: "weekly_adaptive_review.local_dispatcher",
            flow_action: (weeklyRuntime.toolSkillRun as any)?.flow_action ??
              null,
            "visible_task.kind":
              (weeklyRuntime.toolSkillRun as any)?.visible_task ?? null,
            exit_to_global_dispatcher: true,
            "exit_memo.reason":
              (weeklyRuntime.toolSkillRun as any)?.exit_memo?.reason ??
                null,
            global_dispatcher_second_pass_after_local_exit: true,
            local_runtime: weeklyRuntime.toolSkillRun,
          },
          "info",
        );
      } else {
        await trace(
          "brain:active_weekly_review_local_dispatcher",
          "routing",
          {
            global_dispatcher_skipped_due_weekly_review: true,
            skipped_global_dispatcher: true,
            source_dispatcher_local: "weekly_adaptive_review.local_dispatcher",
            flow_action: (weeklyRuntime.toolSkillRun as any)?.flow_action ??
              null,
            "visible_task.kind":
              (weeklyRuntime.toolSkillRun as any)?.visible_task ?? null,
            reason_code: (weeklyRuntime.toolSkillRun as any)?.reason_code ??
              null,
            toolExecution: weeklyRuntime.toolExecution,
            executedTools: weeklyRuntime.executedTools,
          },
          "info",
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState: null,
          operationRuntime: weeklyRuntime,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          turnAgendaSummary: null,
          safetyPregateOutput,
          weeklyReviewStateForTurn: weeklyAdaptiveReviewStateForTurn({
            activeSkillState: null,
            tempMemory: weeklyRuntime.nextTempMemory,
          }),
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: 0,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
    } else {
      await trace(
        "brain:active_weekly_review_local_runtime_null",
        "routing",
        {
          global_dispatcher_skipped_due_weekly_review: true,
          skipped_global_dispatcher: true,
          reason_code: "active_weekly_review_local_runtime_null",
        },
        "error",
      );
      return await handleOperationRuntimeResponse({
        supabase,
        userId,
        channel,
        scope,
        userMessage,
        history,
        state,
        activeSkillState: null,
        operationRuntime: {
          content:
            "Je garde le point weekly, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "weekly_adaptive_review_v1",
            skill_id: "weekly_adaptive_review_v1",
            status: "blocked",
            reason_code: "active_weekly_review_local_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code: "active_weekly_review_local_runtime_null",
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        turnAgendaSummary: null,
        safetyPregateOutput,
        weeklyReviewStateForTurn: activeWeeklyReviewLocalState,
        dispatcherSignals: DEFAULT_SIGNALS,
        dispatcherV2Stats,
        dispatcherLatencyMs: 0,
        targetMode: "companion",
        riskScore: 0,
        loggedMessageId,
        requestId: meta?.requestId ?? null,
        messageMetadata: opts?.messageMetadata,
        logMessages,
        turnStartMs,
        trace,
      });
    }
  }
  if (activePostMorningNudgeState) {
    const postMorningHandler =
      activePostMorningNudgeState.flow_kind === "action"
        ? "post_morning_nudge.action_dispatcher"
        : activePostMorningNudgeState.flow_kind === "suppressed_action"
        ? "post_morning_nudge.suppressed_action_dispatcher"
        : "post_morning_nudge.emotional_presence_dispatcher";
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: postMorningHandler,
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: "active_post_morning_nudge_uses_local_dispatcher",
      }],
      direct_effects_to_run: [],
      reason_code: "active_post_morning_nudge_local_dispatcher",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    const localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyPregateOutput.risk_band,
        reason_codes: safetyPregateOutput.reason_codes ?? [],
        evidence: safetyPregateOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: conversationRiskHistoryForPersist,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
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
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    const operationRuntime = await runPostMorningNudgeLocalRuntime({
      tempMemory,
      userId,
      userMessage,
      history,
      requestId: meta?.requestId ?? null,
      nowIso: new Date().toISOString(),
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "post_morning_nudge_local_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        await updateUserState(supabase, userId, scope, {
          temp_memory: tempMemory,
        });
        await trace(
          "brain:active_post_morning_nudge_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            "post_morning_nudge.flow_kind":
              activePostMorningNudgeState.flow_kind,
            source_dispatcher_local: postMorningHandler,
            flow_action: (operationRuntime.toolSkillRun as any)?.flow_action ??
              null,
            "visible_task.kind":
              (operationRuntime.toolSkillRun as any)?.visible_task?.kind ??
                null,
            exit_to_global_dispatcher: true,
            "exit_memo.reason":
              (operationRuntime.toolSkillRun as any)?.exit_memo?.reason ??
                null,
            global_dispatcher_second_pass_after_local_exit: true,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
      } else {
        await trace(
          "brain:active_post_morning_nudge_local_dispatcher",
          "routing",
          {
            global_dispatcher_skipped_due_post_morning_nudge: true,
            skipped_global_dispatcher: true,
            "post_morning_nudge.flow_kind":
              activePostMorningNudgeState.flow_kind,
            source_dispatcher_local: postMorningHandler,
            flow_action: (operationRuntime.toolSkillRun as any)?.flow_action ??
              null,
            "visible_task.kind":
              (operationRuntime.toolSkillRun as any)?.visible_task?.kind ??
                null,
            reason_code: (operationRuntime.toolSkillRun as any)?.reason_code ??
              null,
          },
          "info",
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState,
          operationRuntime: operationRuntime as any,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          turnAgendaSummary: null,
          safetyPregateOutput,
          weeklyReviewStateForTurn: null,
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: 0,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
    } else {
      await trace(
        "brain:active_post_morning_nudge_local_runtime_null",
        "routing",
        {
          global_dispatcher_skipped_due_post_morning_nudge: true,
          skipped_global_dispatcher: true,
          "post_morning_nudge.flow_kind": activePostMorningNudgeState.flow_kind,
          source_dispatcher_local: postMorningHandler,
          reason_code: "active_post_morning_nudge_local_runtime_null",
        },
        "error",
      );
      return await handleOperationRuntimeResponse({
        supabase,
        userId,
        channel,
        scope,
        userMessage,
        history,
        state,
        activeSkillState,
        operationRuntime: {
          content:
            "Je garde le fil du message de ce matin, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: postMorningHandler,
            skill_id: "post_morning_nudge",
            flow_kind: activePostMorningNudgeState.flow_kind,
            status: "blocked",
            reason_code: "active_post_morning_nudge_local_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code: "active_post_morning_nudge_local_runtime_null",
            }],
            runtime_trace: [{
              component: postMorningHandler,
              event: "local_runtime_null",
              global_dispatcher_skipped_due_post_morning_nudge: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        turnAgendaSummary: null,
        safetyPregateOutput,
        weeklyReviewStateForTurn: null,
        dispatcherSignals: DEFAULT_SIGNALS,
        dispatcherV2Stats,
        dispatcherLatencyMs: 0,
        targetMode: "companion",
        riskScore: 0,
        loggedMessageId,
        requestId: meta?.requestId ?? null,
        messageMetadata: opts?.messageMetadata,
        logMessages,
        turnStartMs,
        trace,
      });
    }
  }
  if (hasActiveFlowOpportunityState(tempMemory)) {
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: "flow_opportunity_verification",
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code:
          "active_flow_opportunity_verification_uses_local_dispatcher",
      }],
      direct_effects_to_run: [],
      reason_code: "active_flow_opportunity_verification_local_dispatcher",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    const localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyPregateOutput.risk_band,
        reason_codes: safetyPregateOutput.reason_codes ?? [],
        evidence: safetyPregateOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: conversationRiskHistoryForPersist,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
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
      flow_opportunity: null,
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    const operationRuntime = await maybeRunFlowOpportunityVerificationRuntime({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      history,
      tempMemory,
      turnFrame: localTurnFrame,
      routeDecision: localRouteDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "flow_opportunity_verification_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        await updateUserState(supabase, userId, scope, {
          temp_memory: tempMemory,
        });
        await trace(
          "brain:flow_opportunity_verification.exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
      } else {
        await trace(
          "brain:flow_opportunity_verification.global_dispatcher_skipped_due_active_flow",
          "routing",
          {
            skipped_global_dispatcher: true,
            source_dispatcher_local: "flow_opportunity_verification",
            flow_action: (operationRuntime.toolSkillRun as any)?.flow_action ??
              null,
            "visible_task.kind":
              (operationRuntime.toolSkillRun as any)?.visible_task?.kind ??
                null,
            reason_code: (operationRuntime.toolSkillRun as any)?.reason_code ??
              null,
          },
          "info",
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState,
          operationRuntime,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          turnAgendaSummary: null,
          safetyPregateOutput,
          weeklyReviewStateForTurn: null,
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: 0,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
    }
  }
  if (activeLocalFlowOperationType === "adjust_plan_item") {
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "adjust_plan_item",
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: activeLocalFlowBlockedReasonCode,
      }],
      direct_effects_to_run: [],
      reason_code: activeLocalFlowReasonCode,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    const localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyPregateOutput.risk_band,
        reason_codes: safetyPregateOutput.reason_codes ?? [],
        evidence: safetyPregateOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: conversationRiskHistoryForPersist,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        confidence_band: "high",
        explicitness: "implied",
        user_intent: "adjust",
        ambiguity: "none",
      }],
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
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    let continueToGlobalAfterLocalExit = false;
    const operationRuntime = await maybeRunAdjustPlanItemOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      history,
      tempMemory,
      planItemSnapshot: planItemSnapshot ?? [],
      turnFrame: localTurnFrame,
      routeDecision: localRouteDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      forceFullAi: meta?.forceRealAi === true ||
        (opts?.messageMetadata as Record<string, unknown> | undefined)
            ?.force_full_ai === true,
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "adjust_plan_item_local_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        await updateUserState(supabase, userId, scope, {
          temp_memory: tempMemory,
        });
        await trace(
          "brain:active_adjust_plan_item_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
        continueToGlobalAfterLocalExit = true;
      } else {
        await trace(
          "brain:active_adjust_plan_item_local_dispatcher",
          "routing",
          {
            skipped_global_dispatcher: true,
            active_operation_type: activeLocalFlowOperationType,
            active_handler: activeLocalFlowHandler,
            active_state_source: "adjust_plan_handoff",
            tool_status: (operationRuntime.toolSkillRun as any)?.status ?? null,
            reason_code: (operationRuntime.toolSkillRun as any)?.reason_code ??
              null,
          },
          "info",
        );
        const localRiskScore = Number(
          (operationRuntime.toolSkillRun as any)?.risk_score ?? 0,
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState,
          operationRuntime: operationRuntime as any,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          turnAgendaSummary: null,
          safetyPregateOutput,
          weeklyReviewStateForTurn: null,
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: Number.isFinite(localRiskScore) ? localRiskScore : 0,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
    }
    if (!continueToGlobalAfterLocalExit) {
      await trace(
        "brain:active_adjust_plan_item_local_runtime_null",
        "routing",
        {
          skipped_global_dispatcher: true,
          active_operation_type: activeLocalFlowOperationType,
          active_state_source: "adjust_plan_handoff",
          reason_code: "active_adjust_plan_item_local_runtime_null",
          active_handler: activeLocalFlowHandler,
        },
        "error",
      );
      return await handleOperationRuntimeResponse({
        supabase,
        userId,
        channel,
        scope,
        userMessage,
        history,
        state,
        activeSkillState,
        operationRuntime: {
          content:
            "Je garde l'ajustement du plan en cours, mais je n'arrive pas a traiter correctement ce tour. Reessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            operation_type: "adjust_plan_item",
            mode: "platform_handoff",
            no_chat_mutation: true,
            executable_from_chat: false,
            status: "blocked",
            reason_code: "active_adjust_plan_item_local_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code: "active_adjust_plan_item_local_runtime_null",
            }],
            runtime_trace: [{
              component: "adjust_plan_item",
              event: "local_runtime_null",
              global_dispatcher_skipped: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        turnAgendaSummary: null,
        safetyPregateOutput,
        weeklyReviewStateForTurn: null,
        dispatcherSignals: DEFAULT_SIGNALS,
        dispatcherV2Stats,
        dispatcherLatencyMs: 0,
        targetMode: "companion",
        riskScore: 0,
        loggedMessageId,
        requestId: meta?.requestId ?? null,
        messageMetadata: opts?.messageMetadata,
        logMessages,
        turnStartMs,
        trace,
      });
    }
  }
  if (activeLocalFlowOperationType === "prepare_attack_card") {
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: activeLocalFlowBlockedReasonCode,
      }],
      direct_effects_to_run: [],
      reason_code: activeLocalFlowReasonCode,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    const localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyPregateOutput.risk_band,
        reason_codes: safetyPregateOutput.reason_codes ?? [],
        evidence: safetyPregateOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: conversationRiskHistoryForPersist,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
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
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    let continueToGlobalAfterLocalExit = false;
    const operationRuntime = await maybeRunPrepareAttackCardOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame: localTurnFrame,
      routeDecision: localRouteDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      history,
      planSnapshot: { items: planItemSnapshot ?? [] },
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "prepare_attack_card_local_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        await updateUserState(supabase, userId, scope, {
          temp_memory: tempMemory,
        });
        await trace(
          "brain:active_prepare_attack_card_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
        continueToGlobalAfterLocalExit = true;
      } else {
        await trace(
          "brain:active_prepare_attack_card_local_dispatcher",
          "routing",
          {
            skipped_global_dispatcher: true,
            active_operation_type: activeLocalFlowOperationType,
            active_handler: activeLocalFlowHandler,
            active_state_source: "attack_card_handoff",
            tool_status: (operationRuntime.toolSkillRun as any)?.status ?? null,
            reason_code: (operationRuntime.toolSkillRun as any)?.reason_code ??
              null,
          },
          "info",
        );
        const localRiskScore = Number(
          (operationRuntime.toolSkillRun as any)?.risk_assessment?.risk_score ??
            0,
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState,
          operationRuntime: operationRuntime as any,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          turnAgendaSummary: null,
          safetyPregateOutput,
          weeklyReviewStateForTurn: null,
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: Number.isFinite(localRiskScore) ? localRiskScore : 0,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
    }
    if (!continueToGlobalAfterLocalExit) {
      await trace(
        "brain:active_prepare_attack_card_local_runtime_null",
        "routing",
        {
          skipped_global_dispatcher: true,
          active_operation_type: activeLocalFlowOperationType,
          active_state_source: "attack_card_handoff",
          reason_code: "active_prepare_attack_card_local_runtime_null",
          active_handler: activeLocalFlowHandler,
        },
        "error",
      );
      return await handleOperationRuntimeResponse({
        supabase,
        userId,
        channel,
        scope,
        userMessage,
        history,
        state,
        activeSkillState,
        operationRuntime: {
          content:
            "Je garde la carte d'attaque en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            operation_type: "prepare_attack_card",
            mode: "platform_handoff",
            no_chat_mutation: true,
            executable_from_chat: false,
            status: "blocked",
            reason_code: "active_prepare_attack_card_local_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code: "active_prepare_attack_card_local_runtime_null",
            }],
            runtime_trace: [{
              component: "prepare_attack_card",
              event: "local_runtime_null",
              global_dispatcher_skipped: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        turnAgendaSummary: null,
        safetyPregateOutput,
        weeklyReviewStateForTurn: null,
        dispatcherSignals: DEFAULT_SIGNALS,
        dispatcherV2Stats,
        dispatcherLatencyMs: 0,
        targetMode: "companion",
        riskScore: 0,
        loggedMessageId,
        requestId: meta?.requestId ?? null,
        messageMetadata: opts?.messageMetadata,
        logMessages,
        turnStartMs,
        trace,
      });
    }
  }
  if (activeLocalFlowOperationType === "prepare_defense_card") {
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: activeLocalFlowBlockedReasonCode,
      }],
      direct_effects_to_run: [],
      reason_code: activeLocalFlowReasonCode,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    const localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyPregateOutput.risk_band,
        reason_codes: safetyPregateOutput.reason_codes ?? [],
        evidence: safetyPregateOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: conversationRiskHistoryForPersist,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
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
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    let continueToGlobalAfterLocalExit = false;
    const operationRuntime = await maybeRunPrepareDefenseCardOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame: localTurnFrame,
      routeDecision: localRouteDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      history,
      planSnapshot: { items: planItemSnapshot ?? [] },
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "prepare_defense_card_local_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        await updateUserState(supabase, userId, scope, {
          temp_memory: tempMemory,
        });
        await trace(
          "brain:active_prepare_defense_card_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
        continueToGlobalAfterLocalExit = true;
      } else {
        await trace(
          "brain:active_prepare_defense_card_local_dispatcher",
          "routing",
          {
            skipped_global_dispatcher: true,
            active_operation_type: activeLocalFlowOperationType,
            active_handler: activeLocalFlowHandler,
            active_state_source: "defense_card_handoff",
            tool_status: (operationRuntime.toolSkillRun as any)?.status ?? null,
            reason_code: (operationRuntime.toolSkillRun as any)?.reason_code ??
              null,
          },
          "info",
        );
        const localRiskScore = Number(
          (operationRuntime.toolSkillRun as any)?.risk_assessment?.risk_score ??
            0,
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState,
          operationRuntime: operationRuntime as any,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          turnAgendaSummary: null,
          safetyPregateOutput,
          weeklyReviewStateForTurn: null,
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: Number.isFinite(localRiskScore) ? localRiskScore : 0,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
    }
    if (!continueToGlobalAfterLocalExit) {
      await trace(
        "brain:active_prepare_defense_card_local_runtime_null",
        "routing",
        {
          skipped_global_dispatcher: true,
          active_operation_type: activeLocalFlowOperationType,
          active_state_source: "defense_card_handoff",
          reason_code: "active_prepare_defense_card_local_runtime_null",
          active_handler: activeLocalFlowHandler,
        },
        "error",
      );
      return await handleOperationRuntimeResponse({
        supabase,
        userId,
        channel,
        scope,
        userMessage,
        history,
        state,
        activeSkillState,
        operationRuntime: {
          content:
            "Je garde la carte de défense en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            operation_type: "prepare_defense_card",
            mode: "platform_handoff",
            no_chat_mutation: true,
            executable_from_chat: false,
            status: "blocked",
            reason_code: "active_prepare_defense_card_local_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code: "active_prepare_defense_card_local_runtime_null",
            }],
            runtime_trace: [{
              component: "prepare_defense_card",
              event: "local_runtime_null",
              global_dispatcher_skipped: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        turnAgendaSummary: null,
        safetyPregateOutput,
        weeklyReviewStateForTurn: null,
        dispatcherSignals: DEFAULT_SIGNALS,
        dispatcherV2Stats,
        dispatcherLatencyMs: 0,
        targetMode: "companion",
        riskScore: 0,
        loggedMessageId,
        requestId: meta?.requestId ?? null,
        messageMetadata: opts?.messageMetadata,
        logMessages,
        turnStartMs,
        trace,
      });
    }
  }
  if (activeLocalFlowOperationType === "select_state_potion") {
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: activeLocalFlowHandler,
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: activeLocalFlowBlockedReasonCode,
      }],
      direct_effects_to_run: [],
      reason_code: activeLocalFlowReasonCode,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    const localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyPregateOutput.risk_band,
        reason_codes: safetyPregateOutput.reason_codes ?? [],
        evidence: safetyPregateOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: conversationRiskHistoryForPersist,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
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
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    let continueToGlobalAfterLocalExit = false;
    const operationRuntime = await runSelectStatePotionHandoffSkill({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame: null,
      routeDecision: localRouteDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      history,
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "select_state_potion_local_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        await updateUserState(supabase, userId, scope, {
          temp_memory: tempMemory,
        });
        await trace(
          "brain:active_select_state_potion_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
        continueToGlobalAfterLocalExit = true;
      } else {
        await trace(
          activePotionSubskillName
            ? `brain:active_${activePotionSubskillName}_local_dispatcher`
            : "brain:active_select_state_potion_local_dispatcher",
          "routing",
          {
            skipped_global_dispatcher: true,
            active_operation_type: activeLocalFlowOperationType,
            active_handler: activeLocalFlowHandler,
            active_state_source: activeStatePotionHandoffForLocalFlow
              ? "state_potion_handoff"
              : "active_tool_skill_intake",
            tool_status: (operationRuntime.toolSkillRun as any)?.status ?? null,
            reason_code: (operationRuntime.toolSkillRun as any)?.reason_code ??
              null,
          },
          "info",
        );
        const localRiskScore = Number(
          (operationRuntime.toolSkillRun as any)?.risk_assessment?.risk_score ??
            0,
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState,
          operationRuntime: operationRuntime as any,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          turnAgendaSummary: null,
          safetyPregateOutput,
          weeklyReviewStateForTurn: null,
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: Number.isFinite(localRiskScore) ? localRiskScore : 0,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
    }
    if (!continueToGlobalAfterLocalExit) {
      await trace(
        "brain:active_select_state_potion_local_runtime_null",
        "routing",
        {
          skipped_global_dispatcher: true,
          active_operation_type: activeLocalFlowOperationType,
          active_state_source: activeStatePotionHandoffForLocalFlow
            ? "state_potion_handoff"
            : "active_tool_skill_intake",
          reason_code: "active_select_state_potion_local_runtime_null",
          active_handler: activeLocalFlowHandler,
        },
        "error",
      );
      return await handleOperationRuntimeResponse({
        supabase,
        userId,
        channel,
        scope,
        userMessage,
        history,
        state,
        activeSkillState,
        operationRuntime: {
          content:
            "Je garde le flow Potion de clarté en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: activeLocalFlowHandler,
            operation_type: "select_state_potion",
            mode: "platform_handoff",
            no_chat_mutation: true,
            executable_from_chat: false,
            status: "blocked",
            reason_code: "active_select_state_potion_local_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code: "active_select_state_potion_local_runtime_null",
            }],
            risk_assessment: {
              risk_score: 0,
              risk_band: "none",
              safety_preempt: false,
              reason_codes: [],
            },
            runtime_trace: [{
              component: activeLocalFlowHandler,
              event: "local_runtime_null",
              global_dispatcher_skipped: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        turnAgendaSummary: null,
        safetyPregateOutput,
        weeklyReviewStateForTurn: null,
        dispatcherSignals: DEFAULT_SIGNALS,
        dispatcherV2Stats,
        dispatcherLatencyMs: 0,
        targetMode: "companion",
        riskScore: 0,
        loggedMessageId,
        requestId: meta?.requestId ?? null,
        messageMetadata: opts?.messageMetadata,
        logMessages,
        turnStartMs,
        trace,
      });
    }
  }
  if (activeLocalFlowOperationType === "update_coach_preferences") {
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: activeLocalFlowBlockedReasonCode,
      }],
      direct_effects_to_run: [],
      reason_code: activeLocalFlowReasonCode,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    const localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyPregateOutput.risk_band,
        reason_codes: safetyPregateOutput.reason_codes ?? [],
        evidence: safetyPregateOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: conversationRiskHistoryForPersist,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
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
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    const operationRuntime = await maybeRunUpdateCoachPreferencesOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame: localTurnFrame,
      routeDecision: localRouteDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      history,
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "update_coach_preferences_local_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        await updateUserState(supabase, userId, scope, {
          temp_memory: tempMemory,
        });
        await trace(
          "brain:active_update_coach_preferences_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
      } else {
        await trace(
          "brain:active_update_coach_preferences_local_dispatcher",
          "routing",
          {
            skipped_global_dispatcher: true,
            active_operation_type: activeLocalFlowOperationType,
            active_handler: activeLocalFlowHandler,
            active_state_source: "coach_preference_local_flow",
            tool_status: (operationRuntime.toolSkillRun as any)?.status ?? null,
            reason_code: (operationRuntime.toolSkillRun as any)?.reason_code ??
              null,
          },
          "info",
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState,
          operationRuntime: operationRuntime as any,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          turnAgendaSummary: null,
          safetyPregateOutput,
          weeklyReviewStateForTurn: null,
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: 0,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
    }
    await trace(
      "brain:active_update_coach_preferences_local_runtime_null",
      "routing",
      {
        skipped_global_dispatcher: true,
        active_operation_type: activeLocalFlowOperationType,
        active_state_source: "coach_preference_local_flow",
        reason_code: "active_update_coach_preferences_local_runtime_null",
        active_handler: activeLocalFlowHandler,
      },
      "error",
    );
    return await handleOperationRuntimeResponse({
      supabase,
      userId,
      channel,
      scope,
      userMessage,
      history,
      state,
      activeSkillState,
      operationRuntime: {
        content:
          "Je garde le changement de préférence en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
        nextTempMemory: tempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          operation_type: "update_coach_preferences",
          mode: "local_write_flow",
          status: "blocked",
          reason_code: "active_update_coach_preferences_local_runtime_null",
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [{
            type: "local_flow_runtime",
            reason_code: "active_update_coach_preferences_local_runtime_null",
          }],
          runtime_trace: [{
            component: "update_coach_preferences",
            event: "local_runtime_null",
            global_dispatcher_skipped: true,
          }],
        },
      } as any,
      effectLedger,
      turnFrame: localTurnFrame,
      routeDecision: localRouteDecision,
      turnAgendaSummary: null,
      safetyPregateOutput,
      weeklyReviewStateForTurn: null,
      dispatcherSignals: DEFAULT_SIGNALS,
      dispatcherV2Stats,
      dispatcherLatencyMs: 0,
      targetMode: "companion",
      riskScore: 0,
      loggedMessageId,
      requestId: meta?.requestId ?? null,
      messageMetadata: opts?.messageMetadata,
      logMessages,
      turnStartMs,
      trace,
    });
  }
  const activeRuntimeContextForDispatcher = buildDispatcherActiveRuntimeContext(
    {
      tempMemory,
      activeSkillState,
      activeOperationIntake: activeOperationIntakeForDispatcher,
      pendingOperationConfirmation,
    },
  );
  const lastLocalFlowExitContextForDispatcher = buildLastLocalFlowExitContext(
    tempMemory,
  );
  if (lastLocalFlowExitContextForDispatcher) {
    tempMemory = clearLastLocalFlowExitContext(tempMemory);
    state = { ...(state ?? {}), temp_memory: tempMemory } as any;
    await updateUserState(supabase, userId, scope, { temp_memory: tempMemory });
  }
  const fullAiRequested = meta?.forceRealAi === true ||
    (opts?.messageMetadata as Record<string, unknown> | undefined)
        ?.force_full_ai === true;
  const dispatcherLlmRunner =
    opts?.messageMetadata?.test_endpoint === "test-send-message" &&
      !fullAiRequested
      ? undefined
      : buildDispatcherLlmRunner({ ...meta, forceRealAi: fullAiRequested });
  const turnFrameStartMs = Date.now();
  try {
    turnFrame = await runDispatcher({
      user_message: userMessage,
      recent_messages: recentMessagesForTurnFrame,
      user_id: userId,
      channel,
      active_skill_state: activeSkillState,
      active_tool_skill_intake: activeOperationIntakeForDispatcher,
      pending_tool_skill_confirmation:
        pendingOperationConfirmationForGlobalRouting,
      active_topic_state: (tempMemory as any)?.memory_v2_active_topic ?? null,
      flow_state_context: {
        channel,
        scope,
        user_time: userTime
          ? {
            user_timezone: userTime.user_timezone,
            user_local_date: userTime.user_local_date,
            user_local_datetime: userTime.user_local_datetime,
            user_local_human: userTime.user_local_human,
          }
          : null,
        whatsapp_mode: meta?.whatsappMode ?? null,
        forced_mode: opts?.forceMode ?? null,
        force_onboarding_flow: Boolean(opts?.forceOnboardingFlow),
        onboarding_active: meta?.whatsappMode === "onboarding" ||
          Boolean(opts?.forceOnboardingFlow),
        active_runtime_context: activeRuntimeContextForDispatcher,
        last_local_flow_exit: lastLocalFlowExitContextForDispatcher,
      },
      plan_snapshot: {
        items: (planItemSnapshot ?? []).map((item: any) => ({
          id: item?.id,
          title: item?.title,
          status: item?.status,
          kind: item?.item_type,
          dimension: item?.dimension,
          cadence_label: item?.cadence_label ?? null,
          target_reps: item?.target_reps ?? null,
          current_reps: item?.current_reps ?? null,
          item_nature: item?.item_nature ?? null,
          available_this_week: item?.available_this_week ?? false,
          availability_status: item?.availability_status ?? null,
          week_scope: item?.week_scope ?? null,
          source_kind: item?.source_kind ?? null,
          payload: item?.payload && typeof item.payload === "object"
            ? item.payload
            : null,
        })),
      },
      safety_pregate_output: safetyPregateOutput,
      conversation_risk_history: conversationRiskHistoryForPersist,
      source_message_id: loggedMessageId ?? undefined,
      turn_id: meta?.requestId ?? loggedMessageId ?? undefined,
      llm_runner: dispatcherLlmRunner,
      model_name: String(
        Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
          Deno.env.get("GEMINI_FALLBACK_MODEL") ??
          "gemini-2.5-flash",
      ).trim(),
      on_stats: (stats) => {
        dispatcherV2Stats.push(stats);
      },
    });
    dispatcherLatencyMs = Date.now() - turnStartMs;
    dispatcherSignals = dispatcherSignalsFromTurnFrame({
      turnFrame,
      userMessage,
    });
    const conversationRisk = turnFrame.conversation_risk;
    if (conversationRisk) {
      conversationRiskForPersist = conversationRisk;
      conversationRiskHistoryForPersist = [
        ...(conversationRisk.previous_scores ?? []),
        Number(conversationRisk.score ?? 0),
      ]
        .filter((value) => Number.isFinite(value))
        .slice(-5);
      tempMemory = {
        ...(tempMemory ?? {}),
        __conversation_risk_history: conversationRiskHistoryForPersist,
        __conversation_risk_last: {
          score: conversationRisk.score,
          threshold: conversationRisk.threshold,
          should_exit_flows: conversationRisk.should_exit_flows,
          reason_codes: conversationRisk.reason_codes,
          flow_exit_context: conversationRisk.flow_exit_context ?? null,
          at: new Date().toISOString(),
        },
      };
    }
    if (conversationRisk?.should_exit_flows) {
      const { tempMemory: cleared, clearedKeys } = clearMachineStateTempMemory({
        tempMemory,
      });
      tempMemory = {
        ...(cleared ?? {}),
        __conversation_risk_history: conversationRiskHistoryForPersist,
        __conversation_risk_last: {
          score: conversationRisk.score,
          threshold: conversationRisk.threshold,
          should_exit_flows: true,
          reason_codes: conversationRisk.reason_codes,
          flow_exit_context: conversationRisk.flow_exit_context ?? null,
          at: new Date().toISOString(),
        },
      };
      activeSkillState = null;
      activeOperationIntake = null;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      await updateUserState(supabase, userId, scope, {
        temp_memory: tempMemory,
      });
      await trace("brain:conversation_risk_flow_exit", "routing", {
        score: conversationRisk.score,
        threshold: conversationRisk.threshold,
        reason_codes: conversationRisk.reason_codes,
        previous_scores: conversationRisk.previous_scores,
        matrix: conversationRisk.matrix,
        flow_exit_context: conversationRisk.flow_exit_context ?? null,
        cleared_keys_count: clearedKeys.length,
        cleared_keys: clearedKeys.slice(0, 40),
      }, "warn");
    }
    routeDecision = runConversationRouters({
      turn_frame: turnFrame,
      active_skill_state: activeSkillState,
      active_tool_skill_intake: activeOperationIntake,
      pending_tool_skill_confirmation:
        pendingOperationConfirmationForGlobalRouting,
      safety_pregate_risk_band: safetyPregateOutput.risk_band,
    });
    const centralArbitration = arbitrateTurnIntent({
      userMessage,
      routeDecision,
      turnFrame,
      tempMemory,
      activeOperationIntake,
      pendingOperationConfirmation:
        pendingOperationConfirmationForGlobalRouting,
      safetyBlocksTools: blocksToolSkills(safetyPregateOutput.risk_band),
    });
    if (centralArbitration.changed) {
      routeDecision = centralArbitration.routeDecision;
      turnFrame = centralArbitration.turnFrame;
      tempMemory = centralArbitration.tempMemory;
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      if (centralArbitration.clearTargets.includes("active_tool")) {
        activeOperationIntake = null;
      }
      if (centralArbitration.clearTargets.includes("pending_tool")) {
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
      }
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      (activeOperationIntake as any)?.operation_type === "adjust_plan_item" &&
      routeDecision.response_owner === "product_help"
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "adjust_plan_item",
        reason_code: "active_adjust_plan_intake_kept_in_tool_skill",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "product_help",
            reason_code: "active_adjust_plan_intake_in_progress",
          },
        ],
      };
    }
    if (
      shouldKeepWeeklyAdaptiveReviewInConversation({
        activeSkillState,
        tempMemory,
        routeDecision,
        turnFrame,
        userMessage,
      })
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "conversation_handler",
        selected_handler: "weekly_adaptive_review_v1",
        reason_code: "active_weekly_review_kept_in_conversation",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill",
            reason_code: "active_weekly_review_requires_confirmation_flow",
          },
          {
            path: "product_help",
            reason_code: "active_weekly_review_requires_branch_decision",
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
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      hasExplicitOneShotReminderDirectEffectOverride({
        directEffectsToRun: routeDecision.direct_effects_to_run,
        directEffects: turnFrame?.direct_effects,
        pendingToolSkillConfirmation: pendingOperationConfirmation,
      })
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "explicit_direct_effect_supersedes_pending_confirmation",
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "pending_tool_skill_confirmation",
            reason_code:
              "explicit_direct_effect_supersedes_pending_confirmation",
          },
        ],
      };
    }
    if (
      !isSafetyRoute(routeDecision) &&
      Boolean(pendingOperationConfirmation || activeOperationIntake) &&
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      (
        routeDecision.direct_effects_to_run.includes(
          "create_one_shot_reminder",
        ) ||
        (turnFrame?.direct_effects ?? []).some((effect) =>
          effect.effect_type === "create_one_shot_reminder" &&
          effect.explicitness === "explicit" &&
          effect.target_status === "identified" &&
          effect.confidence_band !== "low"
        )
      )
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "explicit_one_shot_reminder_supersedes_tool_flow",
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill_flow",
            reason_code: "explicit_one_shot_reminder_supersedes_tool_flow",
          },
        ],
      };
    }
    const routeHasStructuredOperation = (turnFrame?.tool_skill_intents ?? [])
      .some((intent) =>
        intent.user_intent !== "explain_only" &&
        intent.confidence_band !== "low"
      );
    const statusOnlyNoMutationRoute =
      routeDecision.selected_handler === "status_only_no_mutation_check";
    const oneShotStatusToolFlowGuard = {
      blocked: !(
        routeDecision.response_owner === "product_help" ||
        isActiveCardDraftingOperation(activeOperationIntake) ||
        routeHasStructuredOperation
      ) && statusOnlyNoMutationRoute,
      reason_code: statusOnlyNoMutationRoute
        ? "status_only_request_blocks_tool_start"
        : "not_status_only",
    };
    if (
      !isSafetyRoute(routeDecision) &&
      !shouldBypassOrientationClarificationForExplicitToolRoute({
        routeDecision,
        turnFrame,
      }) &&
      oneShotStatusToolFlowGuard.blocked
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: oneShotStatusToolFlowGuard.reason_code,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill_flow",
            reason_code: "status_only_request_blocks_tool_start",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: [],
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    const oneShotDirectEffectBlock = {
      blocked: routeDecision.response_owner === "product_help" ||
        routeDecision.selected_handler === "product_help" ||
        routeDecision.selected_handler === "status_only_no_mutation_check",
      reason_code: routeDecision.response_owner === "product_help" ||
          routeDecision.selected_handler === "product_help"
        ? "product_help_blocks_one_shot_direct_effect"
        : "non_mutation_context_blocks_one_shot_direct_effect",
    };
    if (
      !isSafetyRoute(routeDecision) &&
      routeDecision.direct_effects_to_run.includes(
        "create_one_shot_reminder",
      ) &&
      oneShotDirectEffectBlock.blocked
    ) {
      const reasonCode = oneShotDirectEffectBlock.reason_code;
      routeDecision = {
        ...routeDecision,
        direct_effects_to_run: routeDecision.direct_effects_to_run.filter((
          effect,
        ) => effect !== "create_one_shot_reminder"),
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "direct_effects.create_one_shot_reminder",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        direct_effects: turnFrame.direct_effects.filter((effect) =>
          effect.effect_type !== "create_one_shot_reminder"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    const structuredCoachPreferenceIntent = (turnFrame.tool_skill_intents ?? [])
      .some((intent) =>
        intent.operation_type === "update_coach_preferences" &&
        intent.user_intent !== "explain_only" &&
        intent.confidence_band !== "low" &&
        intent.ambiguity === "none"
      );
    if (
      !isSafetyRoute(routeDecision) &&
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      !pendingOperationConfirmationForGlobalRouting &&
      structuredCoachPreferenceIntent &&
      routeDecision.selected_handler !== "update_coach_preferences"
    ) {
      tempMemory = clearConversationFlowForCoachPreference(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "update_coach_preferences",
        reason_code: "coach_preference_request_overrides_active_flow",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "conversation_flow",
            reason_code: "coach_preference_request_overrides_active_flow",
          },
          {
            path: "product_help",
            reason_code: "coach_preference_is_tool_skill",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type === "update_coach_preferences"
        ),
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
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    const structuredDefenseCardIntent = (turnFrame.tool_skill_intents ?? [])
      .some((intent) =>
        intent.operation_type === "prepare_defense_card" &&
        intent.explicitness === "explicit" &&
        intent.user_intent !== "explain_only" &&
        intent.confidence_band !== "low" &&
        (intent.ambiguity === "none" ||
          intent.ambiguity === "target_ambiguous")
      );
    if (
      !isSafetyRoute(routeDecision) &&
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      !pendingOperationConfirmationForGlobalRouting &&
      structuredDefenseCardIntent &&
      routeDecision.selected_handler !== "prepare_defense_card"
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "prepare_defense_card",
        reason_code:
          "explicit_prepare_defense_card_intent_uses_local_dispatcher",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "normal_reply",
            reason_code:
              "explicit_prepare_defense_card_intent_uses_local_dispatcher",
          },
        ],
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      !isSafetyRoute(routeDecision) &&
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      structuredCoachPreferenceIntent &&
      (
        routeDecision.selected_handler === "create_recurring_reminder" ||
        routeDecision.response_owner === "product_help" ||
        routeDecision.selected_handler === "product_help" ||
        pendingOperationType(pendingOperationConfirmation) ===
          "create_recurring_reminder" ||
        (activeOperationIntake as any)?.operation_type ===
          "create_recurring_reminder"
      )
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "update_coach_preferences",
        reason_code: "coach_preference_request_overrides_reminder_flow",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.create_recurring_reminder",
            reason_code: "coach_preference_request_overrides_reminder_flow",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "create_recurring_reminder"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      (
        routeDecision.response_owner === "product_help" ||
        routeDecision.selected_handler === "product_help"
      ) &&
      structuredCoachPreferenceIntent &&
      !blocksToolSkills(safetyPregateOutput.risk_band)
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "update_coach_preferences",
        reason_code: "coach_preference_request_overrides_product_help",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "product_help",
            reason_code: "coach_preference_is_tool_skill",
          },
        ],
      };
    } else if (
      (
        routeDecision.response_owner === "product_help" ||
        routeDecision.selected_handler === "product_help"
      ) &&
      turnFrame.skill_signals.exit?.product_help?.detected === true
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "product_help_exit_to_conversation",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "product_help",
            reason_code: "user_exited_product_help_or_requested_recap",
          },
        ],
      };
    }
    const activeHandoffBeforeOrientation = turnFrame && routeDecision
      ? extractActiveHandoffFromTempMemory(tempMemory ?? {})
      : null;
    const handoffArbitrationBeforeOrientation =
      activeHandoffBeforeOrientation && turnFrame
        ? arbitrateActiveHandoffFlow({
          user_message: userMessage,
          active_handoff: activeHandoffBeforeOrientation,
          turn_frame: turnFrame,
          route_decision: routeDecision,
          recent_messages: (history ?? [])
            .filter((message: any) =>
              message?.role === "user" || message?.role === "assistant"
            )
            .map((message: any) => ({
              role: message.role,
              content: String(message.content ?? ""),
            }))
            .slice(-8),
        })
        : null;
    if (
      routeDecision && turnFrame && !isSafetyRoute(routeDecision) &&
      !shouldBypassOrientationClarificationForActiveHandoff(
        handoffArbitrationBeforeOrientation,
      ) &&
      !shouldBypassOrientationClarificationForExplicitToolRoute({
        routeDecision,
        turnFrame,
      })
    ) {
      let clarificationArbitration = await maybeStartActiveSkillClarification({
        turnFrame,
        activeSkillState,
        userMessage,
        recentMessages: recentMessagesForTurnFrame,
        tempMemory,
        llmRunner: dispatcherLlmRunner,
        modelName: String(
          Deno.env.get("SOPHIA_CLARIFICATION_MODEL") ??
            Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
            Deno.env.get("GEMINI_FALLBACK_MODEL") ??
            "gemini-2.5-flash",
        ).trim(),
        requestId: meta?.requestId ?? loggedMessageId ?? null,
        userTurnSnapshot,
      });
      if (clarificationArbitration.status === "none") {
        clarificationArbitration = await maybeStartDispatcherClarification({
          turnFrame,
          userMessage,
          recentMessages: recentMessagesForTurnFrame,
          tempMemory,
          llmRunner: dispatcherLlmRunner,
          modelName: String(
            Deno.env.get("SOPHIA_CLARIFICATION_MODEL") ??
              Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
              Deno.env.get("GEMINI_FALLBACK_MODEL") ??
              "gemini-2.5-flash",
          ).trim(),
          requestId: meta?.requestId ?? loggedMessageId ?? null,
          userTurnSnapshot,
        });
      }
      if (clarificationArbitration.status === "ask") {
        turnFrame = clarificationArbitration.turnFrame;
        tempMemory = clarificationArbitration.tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        routeDecision = clarificationArbitration.routeDecision;
        orientationClarificationReply =
          clarificationArbitration.visibleQuestion;
        dispatcherSignals = dispatcherSignalsFromTurnFrame({
          turnFrame,
          userMessage,
        });
        await trace("brain:orientation_clarification_started", "routing", {
          status: clarificationArbitration.output.status,
          confidence: clarificationArbitration.output.confidence,
          selected_candidate_id:
            clarificationArbitration.output.selected_candidate_id ?? null,
          route_reason: routeDecision.reason_code,
        }, "info");
      } else if (clarificationArbitration.status !== "none") {
        turnFrame = clarificationArbitration.turnFrame;
        tempMemory = clarificationArbitration.tempMemory;
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        const resolvedCandidateId = String(
          clarificationArbitration.output.selected_candidate_id ?? "",
        ).trim();
        const resolvedOperationType = String(
          clarificationArbitration.selectedCandidate?.operation_type ??
            (resolvedCandidateId === "create_recurring_reminder"
              ? resolvedCandidateId
              : ""),
        ).trim();
        const resolvedToolSkillHandler =
          resolveOrientationClarificationToolSkillHandler({
            status: clarificationArbitration.status,
            selectedCandidateId: resolvedCandidateId,
            selectedCandidateOperationType: resolvedOperationType,
          });
        const selectedConversationSkillHandler =
          resolveOrientationClarificationConversationSkillHandler({
            status: clarificationArbitration.status,
            selectedCandidateId: resolvedCandidateId,
          });
        const structuredConversationOverride =
          currentTurnConversationSkillOverrideForOrientation({
            status: clarificationArbitration.status,
            turnFrame,
            resolvedToolSkillHandler,
            selectedCandidateOperationType: resolvedOperationType,
            selectedCandidateConfidence: clarificationArbitration.output
              .confidence,
          });
        const resolvedConversationSkillHandler =
          selectedConversationSkillHandler ?? structuredConversationOverride;
        routeDecision = resolvedConversationSkillHandler
          ? {
            ...routeDecision,
            response_owner: resolvedConversationSkillHandler === "safety_crisis"
              ? "safety"
              : resolvedConversationSkillHandler === "product_help"
              ? "product_help"
              : "conversation_handler",
            selected_handler: resolvedConversationSkillHandler,
            reason_code: selectedConversationSkillHandler
              ? "orientation_clarification_resolved_conversation_skill"
              : "orientation_clarification_structured_conversation_override",
            direct_effects_to_run: [],
            blocked_paths: [
              ...routeDecision.blocked_paths,
              {
                path: "tool_skill_router",
                reason_code: selectedConversationSkillHandler
                  ? "orientation_clarification_resolved_conversation_skill"
                  : "orientation_clarification_structured_conversation_override",
              },
              {
                path: "direct_effects",
                reason_code: selectedConversationSkillHandler
                  ? "orientation_clarification_resolved_conversation_skill"
                  : "orientation_clarification_structured_conversation_override",
              },
            ],
          }
          : resolvedToolSkillHandler
          ? {
            ...routeDecision,
            response_owner: "tool_skill",
            selected_handler: resolvedToolSkillHandler,
            reason_code: "orientation_clarification_resolved_tool_skill",
            direct_effects_to_run: [],
            blocked_paths: [
              ...routeDecision.blocked_paths,
              {
                path: "direct_effects",
                reason_code: "orientation_clarification_resolved_tool_skill",
              },
            ],
          }
          : {
            ...routeDecision,
            response_owner: "normal_reply",
            selected_handler: undefined,
            reason_code:
              `orientation_clarification_${clarificationArbitration.status}`,
            direct_effects_to_run: [],
            blocked_paths: [
              ...routeDecision.blocked_paths,
              {
                path: "tool_skill_router",
                reason_code:
                  `orientation_clarification_${clarificationArbitration.status}`,
              },
              {
                path: "direct_effects",
                reason_code:
                  `orientation_clarification_${clarificationArbitration.status}`,
              },
            ],
          };
        dispatcherSignals = dispatcherSignalsFromTurnFrame({
          turnFrame,
          userMessage,
        });
        await trace("brain:orientation_clarification_finished", "routing", {
          status: clarificationArbitration.output.status,
          confidence: clarificationArbitration.output.confidence,
          selected_candidate_id:
            clarificationArbitration.output.selected_candidate_id ?? null,
        }, "info");
      }
    }
    if (routeDecision.direct_effects_to_run.length > 0) {
      try {
        directEffectGateResult = await runEffectGateOrchestrator({
          turn_frame: turnFrame,
          direct_effects_to_run: routeDecision.direct_effects_to_run,
          pending_tool_skill_confirmation: pendingOperationConfirmation,
        });
        if (directEffectGateResult.additional_blocked_paths.length > 0) {
          routeDecision = {
            ...routeDecision,
            direct_effects_to_run: routeDecision.direct_effects_to_run.filter((
              effect,
            ) => directEffectGateResult?.allowed.includes(effect as any)),
            blocked_paths: [
              ...routeDecision.blocked_paths,
              ...directEffectGateResult.additional_blocked_paths,
            ],
          };
        }
      } catch (gateError) {
        console.warn(
          "[Router] direct effect gate orchestrator failed (non-blocking):",
          gateError,
        );
        await trace("brain:direct_effect_gate_failed", "routing", {
          error: gateError instanceof Error
            ? gateError.message
            : String(gateError),
        }, "warn");
      }
    }
    const safetySuppression = suppressToolSignalsForSafetyRoute({
      routeDecision,
      turnFrame,
    });
    if (safetySuppression.changed) {
      routeDecision = safetySuppression.routeDecision;
      turnFrame = safetySuppression.turnFrame;
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (turnFrame && routeDecision) {
      userTurnSnapshot = buildUserTurnSnapshot({
        turn_id: turnFrame.turn_id,
        user_id: userId,
        source_message_id: turnFrame.source_message_id,
        message: userMessage,
        channel,
        timezone: userTime?.user_timezone ?? "Europe/Paris",
        turn_frame: turnFrame,
        route_decision: routeDecision,
        temp_memory: tempMemory ?? {},
      });
      const activeHandoff = extractActiveHandoffFromTempMemory(
        tempMemory ?? {},
      );
      const handoffArbitration = arbitrateActiveHandoffFlow({
        user_message: userMessage,
        active_handoff: activeHandoff,
        turn_frame: turnFrame,
        route_decision: routeDecision,
        recent_messages: (history ?? [])
          .filter((message: any) =>
            message?.role === "user" || message?.role === "assistant"
          )
          .map((message: any) => ({
            role: message.role,
            content: String(message.content ?? ""),
          }))
          .slice(-8),
      });
      const oneShotInterruptsHandoff =
        handoffArbitration.action === "interrupt_for_explicit_intent" &&
        handoffArbitration.reason_code ===
          "create_one_shot_reminder_interrupts_active_handoff";
      const hasOneShotDirectEffect = (turnFrame.direct_effects ?? []).some((
        effect,
      ) =>
        effect.effect_type === "create_one_shot_reminder" &&
        effect.explicitness === "explicit" &&
        effect.confidence_band !== "low"
      );
      const handoffInterruptTarget = handoffArbitration.action ===
          "interrupt_for_explicit_intent"
        ? targetToolSkillFromHandoffInterrupt(handoffArbitration.reason_code)
        : null;
      if (
        activeHandoff &&
        handoffArbitration.action !== "ignore" &&
        (handoffArbitration.action !== "interrupt_for_explicit_intent" ||
          oneShotInterruptsHandoff ||
          Boolean(handoffInterruptTarget))
      ) {
        const blockedPath = {
          path: "active_handoff",
          reason_code: handoffArbitration.reason_code,
        };
        const activeHandoffArbitrationTrace = {
          decision: handoffArbitration.action,
          active_owner: "tool_skill",
          selected_owner: handoffArbitration.action ===
              "interrupt_for_explicit_intent"
            ? (handoffInterruptTarget ?? "normal_reply")
            : activeHandoff.operation_type,
          resume_policy: handoffArbitration.action === "continue_handoff"
            ? "active_handoff_continue"
            : "clear_or_interrupt",
          reason_code: handoffArbitration.reason_code,
          continuation_intent: handoffArbitration.continuation_intent ?? null,
        };
        if (oneShotInterruptsHandoff) {
          tempMemory = clearActiveToolFlow({ ...(tempMemory ?? {}) });
          activeOperationIntake = null;
          state = { ...(state ?? {}), temp_memory: tempMemory } as any;
          routeDecision = {
            ...routeDecision,
            response_owner: "normal_reply",
            selected_handler: undefined,
            reason_code: handoffArbitration.reason_code,
            direct_effects_to_run: ["create_one_shot_reminder"],
            active_flow_arbitration: activeHandoffArbitrationTrace,
            blocked_paths: [...routeDecision.blocked_paths, blockedPath],
          };
          turnFrame = {
            ...turnFrame,
            direct_effects: hasOneShotDirectEffect
              ? turnFrame.direct_effects
              : [
                ...turnFrame.direct_effects,
                {
                  effect_type: "create_one_shot_reminder",
                  explicitness: "explicit",
                  target_status: "identified",
                  confidence_band: "high",
                  payload_hint: { raw_text: userMessage },
                },
              ],
            tool_skill_intents: [],
          };
        } else if (handoffInterruptTarget) {
          const memoryBeforeInterrupt = handoffInterruptTarget ===
              "update_coach_preferences"
            ? suspendActivePlatformHandoff({ ...(tempMemory ?? {}) }, {
              interrupted_by: handoffInterruptTarget,
              reason_code: handoffArbitration.reason_code,
            })
            : { ...(tempMemory ?? {}) };
          tempMemory = clearActiveToolFlow(memoryBeforeInterrupt);
          if (handoffInterruptTarget !== "update_coach_preferences") {
            tempMemory = restoreSuspendedPlatformHandoffForOperation(
              tempMemory,
              handoffInterruptTarget,
            );
          }
          activeOperationIntake = null;
          state = { ...(state ?? {}), temp_memory: tempMemory } as any;
          routeDecision = {
            ...routeDecision,
            response_owner: "tool_skill",
            selected_handler: handoffInterruptTarget,
            reason_code: handoffArbitration.reason_code,
            direct_effects_to_run: [],
            active_flow_arbitration: activeHandoffArbitrationTrace,
            blocked_paths: [...routeDecision.blocked_paths, blockedPath],
          };
          const hasTargetIntent = turnFrame.tool_skill_intents.some((intent) =>
            intent.operation_type === handoffInterruptTarget
          );
          turnFrame = {
            ...turnFrame,
            direct_effects: [],
            tool_skill_intents: hasTargetIntent
              ? turnFrame.tool_skill_intents
              : [
                ...turnFrame.tool_skill_intents,
                {
                  operation_type: handoffInterruptTarget,
                  explicitness: "explicit",
                  target_hint: userMessage,
                  confidence_band: "high",
                  ambiguity: "none",
                  user_intent: handoffInterruptTarget ===
                      "update_coach_preferences"
                    ? "update"
                    : handoffInterruptTarget.startsWith("create_")
                    ? "create"
                    : "update",
                },
              ],
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
        } else if (handoffArbitration.action === "continue_handoff") {
          routeDecision = {
            ...routeDecision,
            response_owner: "tool_skill",
            selected_handler: activeHandoff.operation_type,
            reason_code: handoffArbitration.reason_code,
            direct_effects_to_run: [],
            active_flow_arbitration: activeHandoffArbitrationTrace,
            blocked_paths: [...routeDecision.blocked_paths, blockedPath],
          };
          turnFrame = {
            ...turnFrame,
            direct_effects: [],
          };
        } else if (handoffArbitration.action === "ask_clarification") {
          orientationClarificationReply =
            "Tu veux modifier la recommandation en cours, ou passer à une nouvelle demande ?";
          routeDecision = {
            ...routeDecision,
            response_owner: "orientation_clarification",
            selected_handler: "orientation_clarification",
            reason_code: handoffArbitration.reason_code,
            direct_effects_to_run: [],
            active_flow_arbitration: activeHandoffArbitrationTrace,
            blocked_paths: [...routeDecision.blocked_paths, blockedPath],
          };
          turnFrame = {
            ...turnFrame,
            direct_effects: [],
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
        } else if (
          handoffArbitration.action === "clear_handoff" &&
          handoffArbitration.continuation_intent === "cancel_handoff" &&
          activeHandoff.operation_type === "prepare_defense_card"
        ) {
          routeDecision = {
            ...routeDecision,
            response_owner: "tool_skill",
            selected_handler: "prepare_defense_card",
            reason_code: handoffArbitration.reason_code,
            direct_effects_to_run: [],
            active_flow_arbitration: activeHandoffArbitrationTrace,
            blocked_paths: [...routeDecision.blocked_paths, blockedPath],
          };
          turnFrame = {
            ...turnFrame,
            direct_effects: [],
            tool_skill_intents: [{
              operation_type: "prepare_defense_card",
              explicitness: "explicit",
              target_hint: userMessage,
              confidence_band: "high",
              ambiguity: "none",
              user_intent: "reject",
            } as any],
          };
        } else if (handoffArbitration.action === "clear_handoff") {
          tempMemory = clearActiveToolFlow({ ...(tempMemory ?? {}) });
          activeOperationIntake = null;
          state = { ...(state ?? {}), temp_memory: tempMemory } as any;
          routeDecision = {
            ...routeDecision,
            response_owner: "normal_reply",
            selected_handler: undefined,
            reason_code: handoffArbitration.reason_code,
            direct_effects_to_run: [],
            active_flow_arbitration: activeHandoffArbitrationTrace,
            blocked_paths: [...routeDecision.blocked_paths, blockedPath],
          };
          turnFrame = {
            ...turnFrame,
            direct_effects: [],
            tool_skill_intents: [],
          };
        }
        userTurnSnapshot = buildUserTurnSnapshot({
          turn_id: turnFrame.turn_id,
          user_id: userId,
          source_message_id: turnFrame.source_message_id,
          message: userMessage,
          channel,
          timezone: userTime?.user_timezone ?? "Europe/Paris",
          turn_frame: turnFrame,
          route_decision: routeDecision,
          temp_memory: tempMemory ?? {},
        });
      }
      turnAgenda = buildTurnAgenda(userTurnSnapshot);
      const agendaResolution = resolveFlowInterruptions({
        snapshot: userTurnSnapshot,
        agenda: turnAgenda,
      });
      turnAgenda = agendaResolution.agenda;
      const blockedAgendaOperations = new Set(
        turnAgenda.tasks
          .filter((task: AgendaTask) =>
            task.kind === "effect" && task.status === "blocked" &&
            task.operation_type
          )
          .map((task: AgendaTask) => String(task.operation_type)),
      );
      if (
        agendaResolution.reason_codes.length > 0 ||
        agendaResolution.clear_active_tool_flow ||
        agendaResolution.clear_pending_confirmation ||
        blockedAgendaOperations.size > 0
      ) {
        tempMemory = { ...(tempMemory ?? {}) };
        if (agendaResolution.clear_active_tool_flow) {
          tempMemory = clearActiveToolFlow(tempMemory);
          activeOperationIntake = null;
        }
        if (agendaResolution.clear_pending_confirmation) {
          tempMemory = clearPendingToolConfirmation(tempMemory);
          pendingOperationConfirmation = null;
          pendingOperationConfirmationForGlobalRouting = null;
        }
        if (
          agendaResolution.clear_active_tool_flow ||
          agendaResolution.clear_pending_confirmation
        ) {
          state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        }
        const selectedOperation = routeDecision.response_owner === "tool_skill"
          ? String(routeDecision.selected_handler ?? "").trim()
          : "";
        const selectedOperationBlocked = selectedOperation &&
          blockedAgendaOperations.has(selectedOperation);
        const blockedPathsFromAgenda = [
          ...new Set([
            ...agendaResolution.reason_codes,
            ...turnAgenda.tasks
              .filter((task: AgendaTask) => task.status === "blocked")
              .map((task: AgendaTask) => task.reason_code)
              .filter(Boolean)
              .map(String),
          ]),
        ].map((reasonCode) => ({
          path: "turn_agenda",
          reason_code: reasonCode,
        }));
        routeDecision = {
          ...routeDecision,
          response_owner: selectedOperationBlocked
            ? "normal_reply"
            : routeDecision.response_owner,
          selected_handler: selectedOperationBlocked
            ? undefined
            : routeDecision.selected_handler,
          reason_code: selectedOperationBlocked
            ? "turn_agenda_blocked_selected_effect"
            : routeDecision.reason_code,
          direct_effects_to_run: routeDecision.direct_effects_to_run.filter((
            effect,
          ) => !blockedAgendaOperations.has(String(effect))),
          blocked_paths: [
            ...routeDecision.blocked_paths,
            ...blockedPathsFromAgenda,
          ],
        };
        turnFrame = {
          ...turnFrame,
          direct_effects: turnFrame.direct_effects.filter((effect) =>
            !blockedAgendaOperations.has(String(effect.effect_type))
          ),
          tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
            !blockedAgendaOperations.has(String(intent.operation_type))
          ),
          tool_skill_opportunity: selectedOperationBlocked
            ? {
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
            }
            : turnFrame.tool_skill_opportunity,
        };
        dispatcherSignals = dispatcherSignalsFromTurnFrame({
          turnFrame,
          userMessage,
        });
      }
      recordAgendaEffectsInLedger({ ledger: effectLedger, agenda: turnAgenda });
      turnAgendaSummary = summarizeTurnAgenda(turnAgenda, userTurnSnapshot);
    }
    await trace("brain:turn_frame_routed", "routing", {
      turn_frame_dispatcher_ms: Date.now() - turnFrameStartMs,
      response_owner: routeDecision.response_owner,
      selected_handler: routeDecision.selected_handler ?? null,
      direct_effects_to_run: routeDecision.direct_effects_to_run,
      turn_agenda_summary: turnAgendaSummary,
      direct_effects_allowed: directEffectGateResult?.allowed ?? [],
      direct_effects_clarifications:
        directEffectGateResult?.clarifications.map((c) => ({
          effect_type: c.effect_type,
          reason_code: c.reason_code,
        })) ?? [],
      direct_effects_blocked:
        directEffectGateResult?.additional_blocked_paths ?? [],
      tool_skill_intents_count: turnFrame?.tool_skill_intents.length ?? 0,
      skill_entry_ids: Object.keys(turnFrame?.skill_signals.entry ?? {}),
      safety_risk_band: turnFrame?.safety.risk_band ?? null,
      conversation_risk_score: turnFrame?.conversation_risk?.score ?? null,
      conversation_risk_exit_flows:
        turnFrame?.conversation_risk?.should_exit_flows ?? false,
    }, "info");
  } catch (error) {
    console.warn(
      "[Router] TurnFrame route trace failed (non-blocking):",
      error,
    );
    await trace("brain:turn_frame_route_failed", "routing", {
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  await Promise.all([
    logMemoryObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "dispatcher.memory_plan_generated",
      payload: {
        user_message_preview: String(userMessage ?? "").slice(0, 320),
        memory_plan: turnFrame?.memory_plan ?? null,
      },
    }),
  ]);
  const riskScore = Number(dispatcherSignals.risk_score ?? 0);
  const needsResearchSignal = dispatcherSignals.needs_research;
  const researchRequested = needsResearchSignal?.value === true &&
    Number(needsResearchSignal?.confidence ?? 0) >= 0.55;
  const researchDomainHint = String(needsResearchSignal?.domain_hint ?? "")
    .trim().slice(0, 30);
  const researchQueryRaw = String(needsResearchSignal?.query ?? "").trim();
  const researchQuery = (
    researchQueryRaw.length > 0
      ? researchQueryRaw
      : String(userMessage ?? "").trim()
  ).slice(0, 180);
  let researchExecuted = false;
  let researchText = "";
  let researchSnippets: string[] = [];
  let researchSources: string[] = [];
  let researchError: string | null = null;

  // High-risk circuit breaker: clear machine/runtime states to avoid compounding loops
  // when user is in distress or conversation quality degrades sharply.
  const riskResetThreshold = Number(
    envInt("SOPHIA_RISK_RESET_THRESHOLD", 7),
  );
  const shouldResetForRisk = Number.isFinite(riskScore) &&
    riskScore >= riskResetThreshold;
  if (shouldResetForRisk) {
    const { tempMemory: clearedTemp, clearedKeys } =
      clearMachineStateTempMemory({
        tempMemory,
      });
    const invWasActive = Boolean((state as any)?.investigation_state);
    tempMemory = {
      ...(clearedTemp ?? {}),
      __risk_reset: {
        at: new Date().toISOString(),
        risk_score: riskScore,
        threshold: riskResetThreshold,
      },
    };
    await updateUserState(supabase, userId, scope, {
      investigation_state: null as any,
      temp_memory: tempMemory,
      risk_level: riskScore,
    });
    state = {
      ...(state ?? {}),
      investigation_state: null,
      temp_memory: tempMemory,
      risk_level: riskScore,
    } as any;
    await trace("brain:risk_circuit_breaker_reset", "routing", {
      risk_score: riskScore,
      threshold: riskResetThreshold,
      investigation_was_active: invWasActive,
      cleared_keys_count: clearedKeys.length,
      cleared_keys: clearedKeys.slice(0, 40),
    }, "warn");
  }

  // If a daily bilan/checkup is stale (>4h), decide implicitly:
  // - continue if message answers the current bilan thread
  // - abandon if user starts a new/unrelated topic
  // No explicit "do you want to continue?" question.
  const staleTimeoutMs = envInt(
    "SOPHIA_BILAN_STALE_TIMEOUT_MS",
    4 * 60 * 60 * 1000,
  );
  const checkupActiveNow = isCheckupActive(state);
  const startedMs = parseInvestigationStartedMs(state);
  const elapsedSinceStartMs = startedMs > 0 ? Date.now() - startedMs : 0;
  const staleCheckup = checkupActiveNow && startedMs > 0 &&
    elapsedSinceStartMs >= staleTimeoutMs;
  if (staleCheckup) {
    const wantsToContinueByDispatcher = false;
    const dontWantToContinueByDispatcher = false;
    const checkupIntentNow = detectCheckupIntent(dispatcherSignals);
    const staleDecision = await classifyStaleBilanResponse({
      userMessage,
      lastAssistantMessage,
      history,
      requestId: meta?.requestId,
    });
    const staleInvestigationMode = String(
      (state as any)?.investigation_state?.mode ?? "",
    );
    const explicitConsent = resolveBinaryConsentLite(userMessage);
    const shouldContinue = staleDecision === "resume_bilan" ||
      ((wantsToContinueByDispatcher && !dontWantToContinueByDispatcher) &&
        staleDecision !== "other_topic") ||
      checkupIntentNow;
    const shouldStopForToday = staleDecision === "stop_for_today";
    const shouldAbandonForTopic = staleDecision === "other_topic" &&
      (dontWantToContinueByDispatcher || !shouldContinue);
    if (shouldStopForToday || shouldAbandonForTopic) {
      let nextTempMemory = tempMemory;
      if (shouldStopForToday) {
        nextTempMemory = {
          ...(tempMemory ?? {}),
          __bilan_just_stopped: {
            stopped_at: new Date().toISOString(),
            reason: "stale_checkup_stop_for_today",
          },
        };
      }
      await updateUserState(supabase, userId, scope, {
        investigation_state: null as any,
        temp_memory: nextTempMemory,
      });
      state = {
        ...state,
        investigation_state: null,
        temp_memory: nextTempMemory,
      } as any;
      tempMemory = nextTempMemory;
      await trace("brain:stale_checkup_abandoned", "routing", {
        elapsed_ms: elapsedSinceStartMs,
        timeout_ms: staleTimeoutMs,
        reason: shouldStopForToday
          ? "stale_classifier_stop_for_today"
          : dontWantToContinueByDispatcher
          ? "dispatcher_dont_want_continue_bilan"
          : "message_not_checkup_related",
        stale_decision: staleDecision,
        wants_to_continue_bilan: wantsToContinueByDispatcher,
        dont_want_continue_bilan: dontWantToContinueByDispatcher,
        checkup_intent_now: checkupIntentNow,
        explicit_consent: explicitConsent,
      }, "info");
      if (shouldStopForToday) {
        const responseContent = staleInvestigationMode === "weekly_bilan"
          ? "Pas de souci, on laisse le bilan hebdo pour une autre fois."
          : "Pas de souci, on ne peut pas le reporter plus tard ce soir. On fera le bilan demain.";
        const nextMode: AgentMode = "companion";
        const nextMsgCount =
          Number((state as any)?.unprocessed_msg_count ?? 0) + 1;
        const nextLastInteraction = new Date().toISOString();
        await updateUserState(supabase, userId, scope, {
          current_mode: nextMode,
          unprocessed_msg_count: nextMsgCount,
          last_interaction_at: nextLastInteraction,
          temp_memory: tempMemory,
        });
        if (logMessages) {
          await logMessage(
            supabase,
            userId,
            scope,
            "assistant",
            responseContent,
            nextMode,
            {
              ...(opts?.messageMetadata ?? {}),
              channel,
              request_id: meta?.requestId ?? null,
              router_decision_v2: {
                target_mode: "companion",
                next_mode: nextMode,
                risk_score: riskScore,
                checkup_active: true,
                stop_checkup: true,
                safety_level: dispatcherSignals.safety.level,
                interrupt_kind: dispatcherSignals.interrupt.kind,
                stale_bilan_decision: staleDecision,
              },
            },
          );
        }
        return {
          content: responseContent,
          mode: nextMode,
          tool_execution: "none",
          executed_tools: [],
        };
      }
    } else {
      await trace("brain:stale_checkup_continues_implicitly", "routing", {
        elapsed_ms: elapsedSinceStartMs,
        timeout_ms: staleTimeoutMs,
        stale_decision: staleDecision,
        wants_to_continue_bilan: wantsToContinueByDispatcher,
        dont_want_continue_bilan: dontWantToContinueByDispatcher,
        checkup_intent_now: checkupIntentNow,
        explicit_consent: explicitConsent,
      }, "info");
    }
  }

  const { targetMode: routedMode, stopCheckup, checkupIntentDetected } =
    selectTargetMode({
      state,
      dispatcherSignals,
      onboardingActive: onboarding.onboardingActive,
    });

  let targetMode: AgentMode = routedMode;
  if (opts?.forceMode) {
    targetMode = opts.forceMode;
  }
  if (isSafetyRoute(routeDecision)) {
    targetMode = "companion";
  }
  if (turnFrame?.turn_id && effectLedger.turn_id !== turnFrame.turn_id) {
    effectLedger.turn_id = turnFrame.turn_id;
  }

  attachDynamicAddons({
    tempMemory,
    state,
    dispatcherSignals,
    checkupIntentDetected,
    userMessage,
    planItemSnapshot,
  });

  const coachingAttempt = await maybeAttachCoachingInterventionAddon({
    supabase,
    userId,
    userMessage,
    history,
    tempMemory,
    dispatcherSignals,
    planItemSnapshot,
    v2Runtime,
    targetMode,
    meta,
  });
  if (coachingAttempt) {
    const selectorOutput = coachingAttempt.selector.output;
    const gateDecision = coachingAttempt.selector.gateDecision;
    const historySnapshot = buildCoachingHistorySnapshot(
      coachingAttempt.input.technique_history,
    );
    const customizationContext = buildCoachingCustomizationContext(
      coachingAttempt.input,
      coachingAttempt.addon,
    );
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "coaching_trigger_detected",
      payload: {
        momentum_state: coachingAttempt.input.momentum_state ?? null,
        trigger_type: coachingAttempt.trigger.trigger_kind,
        blocker_type: coachingAttempt.trigger.blocker_hint ?? null,
        confidence: coachingAttempt.trigger.blocker_hint ? "medium" : "low",
        customization_context: customizationContext,
      },
    });
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "coaching_gate_evaluated",
      payload: {
        momentum_state: coachingAttempt.input.momentum_state ?? null,
        trigger_type: coachingAttempt.trigger.trigger_kind,
        eligible: gateDecision.eligible,
        skip_reason: gateDecision.eligible ? null : gateDecision.reason,
        gate: gateDecision.gate,
        confidence: selectorOutput.confidence,
        blocker_type: selectorOutput.blocker_type,
        blocker_kind: coachingAttempt.input.v2_momentum?.blocker_kind ?? null,
        dimension_detected: coachingDimensionForLog(
          coachingAttempt.input.target_plan_item?.dimension,
        ),
        item_kind: coachingAttempt.input.target_plan_item?.kind ?? null,
        target_plan_item_id: coachingAttempt.input.target_plan_item?.id ?? null,
        target_plan_item_title: coachingAttempt.input.target_plan_item?.title ??
          null,
        target_plan_item_dimension:
          coachingAttempt.input.target_plan_item?.dimension ?? null,
        plan_fit_level: coachingAttempt.input.v2_momentum?.plan_fit ?? null,
        load_balance_level: coachingAttempt.input.v2_momentum?.load_balance ??
          null,
        coaching_scope: selectorOutput.coaching_scope ?? null,
        simplify_instead: selectorOutput.simplify_instead ?? false,
        dimension_strategy: selectorOutput.dimension_strategy ?? null,
        customization_context: customizationContext,
      },
    });
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "coaching_selector",
      eventName: "coaching_selector_run",
      payload: {
        momentum_state: coachingAttempt.input.momentum_state ?? null,
        trigger_type: coachingAttempt.trigger.trigger_kind,
        blocker_type: selectorOutput.blocker_type,
        confidence: selectorOutput.confidence,
        eligible: selectorOutput.eligible,
        skip_reason: selectorOutput.decision === "skip"
          ? selectorOutput.reason
          : null,
        recommended_technique: selectorOutput.recommended_technique,
        candidate_techniques: selectorOutput.technique_candidates,
        follow_up_needed: selectorOutput.follow_up_needed,
        clarification_needed: selectorOutput.need_clarification,
        selector_source: coachingAttempt.selector.source,
        decision: selectorOutput.decision,
        blocker_kind: coachingAttempt.input.v2_momentum?.blocker_kind ?? null,
        dimension_detected: coachingDimensionForLog(
          coachingAttempt.input.target_plan_item?.dimension,
        ),
        item_kind: coachingAttempt.input.target_plan_item?.kind ?? null,
        target_plan_item_id: coachingAttempt.input.target_plan_item?.id ?? null,
        target_plan_item_title: coachingAttempt.input.target_plan_item?.title ??
          null,
        target_plan_item_dimension:
          coachingAttempt.input.target_plan_item?.dimension ?? null,
        plan_fit_level: coachingAttempt.input.v2_momentum?.plan_fit ?? null,
        load_balance_level: coachingAttempt.input.v2_momentum?.load_balance ??
          null,
        coaching_scope: selectorOutput.coaching_scope ?? null,
        simplify_instead: selectorOutput.simplify_instead ?? false,
        dimension_strategy: selectorOutput.dimension_strategy ?? null,
        customization_context: customizationContext,
        history_snapshot: historySnapshot,
      },
    });
    const deprioritizedTechniques = findCoachingDeprioritizedTechniques({
      blocker_type: selectorOutput.blocker_type,
      technique_history: coachingAttempt.input.technique_history,
      recommended_technique: selectorOutput.recommended_technique,
    });
    if (deprioritizedTechniques.length > 0) {
      await logCoachingObservabilityEvent({
        supabase,
        userId,
        requestId: meta?.requestId,
        turnId: loggedMessageId,
        channel,
        scope,
        sourceComponent: "coaching_selector",
        eventName: "coaching_technique_deprioritized",
        payload: {
          momentum_state: coachingAttempt.input.momentum_state ?? null,
          trigger_type: coachingAttempt.trigger.trigger_kind,
          blocker_type: selectorOutput.blocker_type,
          recommended_technique: selectorOutput.recommended_technique,
          candidate_techniques: selectorOutput.technique_candidates,
          history_snapshot: historySnapshot,
          deprioritized_techniques: deprioritizedTechniques,
        },
      });
    }
  }

  const surfaceStateBefore = readSurfaceState(tempMemory);
  const surfaceRuntime = buildSurfaceRuntimeDecision({
    tempMemory,
    memoryPlan: turnFrame?.memory_plan,
    surfacePlan: null,
    dispatcherSignals,
    userMessage,
    targetMode,
  });
  const surfaceAddon = surfaceRuntime.addon;
  if (surfaceAddon) {
    await trace("brain:surface_opportunity_selected", "routing", {
      surface_id: surfaceAddon.surface_id,
      level: surfaceAddon.level,
      cta_style: surfaceAddon.cta_style,
      content_need: surfaceAddon.content_need,
      confidence: surfaceAddon.confidence,
    }, "debug");
  }
  await logMemoryObservabilityEvent({
    supabase,
    userId,
    requestId: meta?.requestId,
    turnId: loggedMessageId,
    channel,
    scope,
    sourceComponent: "surface_state",
    eventName: "surface.state_transition",
    payload: {
      before: surfaceStateBefore,
      after: surfaceRuntime.state,
      addon: surfaceAddon ?? null,
      target_mode: targetMode,
      memory_plan_intent: turnFrame?.memory_plan?.response_intent ?? null,
      memory_plan_context_need: turnFrame?.memory_plan?.context_need ?? null,
    },
  });

  const [weeklyForgottenProgressRuntime] = await Promise
    .all([
      maybeLogWeeklyForgottenProgressParallel({
        supabase,
        userId,
        tempMemory,
        activeSkillState,
        v2Runtime,
        loggedMessageId,
        userMessage,
      }),
      maybeLogDefenseCardWinParallel({
        supabase,
        userId,
        dispatcherSignals,
        v2Runtime,
        tempMemory,
      }),
    ]);

  if (riskScore !== Number((state as any)?.risk_level ?? 0)) {
    await updateUserState(supabase, userId, scope, { risk_level: riskScore });
  }

  const flowOpportunityRuntime =
    await maybeRunFlowOpportunityVerificationRuntime({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      history,
      tempMemory,
      turnFrame,
      routeDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
    });
  if (flowOpportunityRuntime) {
    await trace(
      "brain:flow_opportunity_verification.global_opportunity_selected",
      "routing",
      {
        reason_code:
          (flowOpportunityRuntime.toolSkillRun as any)?.reason_code ?? null,
        flow_action:
          (flowOpportunityRuntime.toolSkillRun as any)?.flow_action ?? null,
        "visible_task.kind":
          (flowOpportunityRuntime.toolSkillRun as any)?.visible_task?.kind ??
            null,
      },
      "info",
    );
    return await handleOperationRuntimeResponse({
      supabase,
      userId,
      channel,
      scope,
      userMessage,
      history,
      state,
      activeSkillState,
      operationRuntime: flowOpportunityRuntime,
      effectLedger,
      turnFrame,
      routeDecision,
      turnAgendaSummary,
      safetyPregateOutput,
      weeklyReviewStateForTurn: null,
      dispatcherSignals,
      dispatcherV2Stats,
      dispatcherLatencyMs,
      targetMode,
      riskScore,
      loggedMessageId,
      requestId: meta?.requestId ?? null,
      messageMetadata: opts?.messageMetadata,
      logMessages,
      turnStartMs,
      trace,
    });
  }

  const operationRuntimePipeline = await runOperationRuntimePipeline({
    supabase,
    userId,
    userMessage,
    channel,
    userTimezone: userTime?.user_timezone ?? "Europe/Paris",
    history,
    tempMemory,
    state,
    planItemSnapshot,
    turnFrame,
    routeDecision,
    safetyPregateOutput,
    sourceMessageId: loggedMessageId,
    requestId: meta?.requestId ?? null,
    v2Runtime: v2Runtime ?? null,
    turnAgenda,
    activeSkillState,
    activeOperationIntake,
    pendingOperationConfirmation,
    trackProgressBlockedReasonCode: attackKeywordContextOverride
      ? "attack_keyword_trigger_is_not_completion"
      : null,
    fullAiRequested,
    clientNow: clientNow && Number.isFinite(clientNow.getTime())
      ? clientNow
      : null,
    enableAdjustPlanCoachGuidance: meta?.enableAdjustPlanCoachGuidance === true,
    runAdjustPlanItemOperation: maybeRunAdjustPlanItemOperation,
    guards: {
      isActiveCardDraftingOperation,
      writeAdjustPlanPendingDraftReview,
    },
  });
  routeDecision = operationRuntimePipeline.routeDecision;
  turnFrame = operationRuntimePipeline.turnFrame;
  tempMemory = operationRuntimePipeline.tempMemory;
  if (operationRuntimePipeline.statePatch) {
    state = { ...(state ?? {}), ...operationRuntimePipeline.statePatch } as any;
  }
  if (operationRuntimePipeline.routeOrFrameChanged && turnFrame) {
    dispatcherSignals = dispatcherSignalsFromTurnFrame({
      turnFrame,
      userMessage,
    });
  }
  const routeSafetyActive = operationRuntimePipeline.routeSafetyActive;
  const runtimeSafetyRiskBand = operationRuntimePipeline.runtimeSafetyRiskBand;
  const runtimeSafetyPregateOutput =
    operationRuntimePipeline.runtimeSafetyPregateOutput;
  const weeklyReviewStateForTurn =
    operationRuntimePipeline.weeklyReviewStateForTurn;
  const weeklyReviewBlocksToolSkillRuntime =
    operationRuntimePipeline.weeklyReviewBlocksToolSkillRuntime;
  const operationRuntime = operationRuntimePipeline.operationRuntime;
  if (operationRuntime) {
    return await handleOperationRuntimeResponse({
      supabase,
      userId,
      channel,
      scope,
      userMessage,
      history,
      state,
      activeSkillState,
      operationRuntime,
      effectLedger,
      turnFrame,
      routeDecision,
      turnAgendaSummary,
      safetyPregateOutput,
      weeklyReviewStateForTurn,
      dispatcherSignals,
      dispatcherV2Stats,
      dispatcherLatencyMs,
      targetMode,
      riskScore,
      loggedMessageId,
      requestId: meta?.requestId ?? null,
      messageMetadata: opts?.messageMetadata,
      logMessages,
      turnStartMs,
      trace,
    });
  }

  const onDemandTriggers: OnDemandTriggers = {
    plan_item_discussion_detected:
      dispatcherSignals.plan_item_discussion?.detected ?? false,
    plan_item_discussion_hint: dispatcherSignals.plan_item_discussion
      ?.item_hint,
    plan_feedback_detected: dispatcherSignals.plan_feedback?.detected ?? false,
  };

  let context = "";
  const recommendationRuntime = await prepareRecommendationRuntimeForTurn({
    userId,
    channel,
    userMessage,
    routeDecision,
    turnFrame,
    recentMessages: recentMessagesForTurnFrame,
    activeSkillState,
    planItemSnapshot,
    tempMemory,
    requestId: meta?.requestId ?? loggedMessageId ?? null,
    trace,
  });
  const recommendationSkillOutput =
    recommendationRuntime.recommendationSkillOutput;
  const recommendationToolRun = recommendationRuntime.recommendationToolRun;
  const recommendationToolStats = recommendationRuntime.recommendationToolStats;
  const recommendationToolAddon = recommendationRuntime.recommendationToolAddon;
  const recommendationSurfaceLabel =
    recommendationRuntime.recommendationSurfaceLabel;
  if (recommendationToolRun) {
    recordRecommendationEffectInLedger({
      ledger: effectLedger,
      recommendation: recommendationToolRun,
    });
  }
  const injectedContext = [
    opts?.contextOverride,
    buildActivePlanSnapshotAddon({
      planItemSnapshot,
      routeDecision,
      userMessage,
    }),
    summarizeWeeklyAdaptiveReviewForAddon(
      weeklyAdaptiveReviewStateForTurn({ activeSkillState, tempMemory }),
    ),
    buildWeeklyTurnSlotAddon({
      activeSkillState,
      tempMemory,
      userMessage,
    }),
    buildResolvedPlanTargetAddon(tempMemory),
    buildConversationRiskFlowExitAddon(conversationRiskForPersist),
    recommendationToolAddon,
    buildRecentConversationContinuityAddon({
      userMessage,
      history,
    }),
    attackKeywordContextOverride || null,
  ].filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0
  )
    .join("\n\n");
  const contextLoadResult = await loadContextForMode({
    supabase,
    userId,
    mode: targetMode,
    message: userMessage,
    history,
    state,
    scope,
    tempMemory,
    userTime,
    triggers: onDemandTriggers,
    injectedContext: injectedContext || undefined,
    memoryPlan: turnFrame?.memory_plan,
    v2Intent: "answer_user_now",
    v2Runtime,
    requestId: meta?.requestId,
    channel,
  });
  contextLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0);

  let memoryV2RuntimeTempMemory: Record<string, unknown> | null = null;
  let memoryV2ActiveContextBlock = "";
  try {
    const active = await runMemoryV2ActiveLoader({
      supabase,
      userId,
      scope,
      channel,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      userMessage,
      history,
      tempMemory,
      memoryPlan: turnFrame?.memory_plan ?? null,
      userTime: userTime as any,
    });
    if (active) {
      memoryV2RuntimeTempMemory = active.tempMemory;
      memoryV2ActiveContextBlock = active.context_block;
      contextLoadResult.context.eventMemories = undefined;
      contextLoadResult.context.globalMemories = undefined;
      contextLoadResult.context.topicMemories = undefined;
      contextLoadResult.context.memoryV2Payload = active.context_block;
      contextLoadResult.metrics.elements_loaded.push(
        "memory_v2_active_payload",
      );
      contextLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0);
      await trace("brain:memory_v2_active_loader", "context", {
        active_topic_id: active.active_topic_id,
        retrieval_mode: active.retrieval_mode,
        topic_decision: active.topic_decision,
        payload_item_count: active.payload_item_ids.length,
        metrics: active.metrics,
      }, "info");
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : JSON.stringify(error);
    await logMemoryObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "memory_v2_runtime_active",
      eventName: "memory.runtime.active.error",
      payload: {
        error: message,
      },
    });
    console.warn(
      "[Router] Memory V2 active loader failed; continuing without durable memory:",
      error,
    );
  }

  context = buildContextString(contextLoadResult.context);
  if (researchRequested && researchQuery.length > 0) {
    const researchStartMs = Date.now();
    try {
      await trace("brain:research_requested", "context", {
        query: researchQuery,
        domain_hint: researchDomainHint || null,
        confidence: Number(needsResearchSignal?.confidence ?? 0),
      }, "info");
      const queryWithHint = researchDomainHint
        ? `${researchQuery} [domaine: ${researchDomainHint}]`
        : researchQuery;
      const grounded = await searchWithGeminiGrounding(queryWithHint, {
        requestId: meta?.requestId,
      });
      researchExecuted = true;
      researchText = String(grounded?.text ?? "").trim();
      researchSnippets = Array.isArray(grounded?.snippets)
        ? grounded.snippets.map((s: unknown) => String(s ?? "").trim()).filter(
          Boolean,
        ).slice(0, 5)
        : [];
      researchSources = Array.isArray(grounded?.sources)
        ? grounded.sources.map((s: unknown) => String(s ?? "").trim()).filter(
          Boolean,
        ).slice(0, 5)
        : [];
      researchLatencyMs = Date.now() - researchStartMs;
      const researchAddonLines: string[] = [
        "=== RECHERCHE WEB (informations fraiches) ===",
        `Query: ${researchQuery}`,
      ];
      if (researchText) {
        researchAddonLines.push(`Synthese: ${researchText.slice(0, 900)}`);
      }
      if (researchSnippets.length > 0) {
        researchAddonLines.push("Snippets:");
        for (const snippet of researchSnippets) {
          researchAddonLines.push(`- ${snippet.slice(0, 240)}`);
        }
      }
      if (researchSources.length > 0) {
        researchAddonLines.push("Sources:");
        for (const src of researchSources) {
          researchAddonLines.push(`- ${src}`);
        }
      }
      if (
        researchText || researchSnippets.length > 0 ||
        researchSources.length > 0
      ) {
        context = `${context}\n\n${researchAddonLines.join("\n")}`;
      }
      await trace("brain:research_completed", "context", {
        query: researchQuery,
        duration_ms: researchLatencyMs,
        has_text: Boolean(researchText),
        snippets_count: researchSnippets.length,
        sources_count: researchSources.length,
      }, "info");
    } catch (e) {
      researchLatencyMs = Date.now() - researchStartMs;
      researchError = String((e as any)?.message ?? e ?? "").slice(0, 200) ||
        "research_failed";
      await trace("brain:research_failed", "context", {
        query: researchQuery,
        duration_ms: researchLatencyMs,
        error: researchError,
      }, "warn");
    }
  }

  let consumedBilanStopped = false;
  try {
    delete (tempMemory as any).__checkup_not_triggerable_addon;
  } catch {
    // best effort
  }
  if (targetMode === "companion" && (tempMemory as any)?.__bilan_just_stopped) {
    consumedBilanStopped = true;
    try {
      delete (tempMemory as any).__bilan_just_stopped;
    } catch {
      // best effort
    }
  }

  const checkupActive = isCheckupActive(state);
  const isPostCheckup = state?.investigation_state?.status === "post_checkup";
  const effectiveModeForModelSelection: AgentMode = targetMode;
  const agentModelSelection = resolveAgentChatModel({
    effectiveMode: effectiveModeForModelSelection,
    memoryPlan: turnFrame?.memory_plan,
    explicitModel: meta?.model,
  });
  await logMemoryObservabilityEvent({
    supabase,
    userId,
    requestId: meta?.requestId,
    turnId: loggedMessageId,
    channel,
    scope,
    sourceComponent: "router",
    eventName: "router.model_selected",
    payload: {
      effective_mode: effectiveModeForModelSelection,
      requested_target_mode: targetMode,
      model: agentModelSelection.model,
      source: agentModelSelection.source,
      tier: agentModelSelection.tier,
      explicit_model: meta?.model ?? null,
      memory_plan: turnFrame?.memory_plan ?? null,
    },
  });

  const safetySkillReply = directSafetyCrisisReplyOverrideRuntime({
    routeDecision,
    skillOutput: recommendationSkillOutput,
  });
  const conversationSkillReply = directConversationSkillReplyOverride({
    routeDecision,
    skillOutput: recommendationSkillOutput,
  });
  const directSkillReply = orientationClarificationReply ?? safetySkillReply ??
    conversationSkillReply;
  const coachPreferenceRuntimeContext = await loadCoachPreferenceRuntimeContext(
    {
      supabase,
      userId,
    },
  );
  if (coachPreferenceRuntimeContext) {
    context = `${context}\n\n${coachPreferenceRuntimeContext}`;
  }
  const agentOut = directSkillReply
    ? {
      responseContent: directSkillReply,
      nextMode: "companion" as AgentMode,
      tempMemory,
      toolExecution: "none" as const,
      executedTools: [],
      toolAck: buildToolAckContract({ status: "none", executedTools: [] }),
      outageFallback: false,
      outageFailedMode: null,
      outageErrorMessage: null,
    }
    : await runAgentAndVerify({
      supabase,
      userId,
      scope,
      channel,
      userMessage,
      history,
      state,
      context,
      targetMode,
      nCandidates: 1,
      checkupActive,
      stopCheckup,
      isPostCheckup,
      outageTemplate:
        "J'ai un petit souci technique, je reviens vers toi dès que c'est réglé!",
      sophiaChatModel: agentModelSelection.model,
      tempMemory,
      roadmapContext: opts?.roadmapContext ?? undefined,
      meta: {
        ...(meta ?? {}),
        blockSideEffects: blocksDirectEffects(runtimeSafetyRiskBand),
      },
    } as any);
  agentLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0) -
    (contextLatencyMs ?? 0);
  const agentToolExecution = String(agentOut.toolExecution ?? "none") as
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain";
  const agentExecutedTools = executedToolsForStatus(
    agentToolExecution,
    Array.isArray(agentOut.executedTools) ? agentOut.executedTools : [],
    [],
  );
  const directEffectToolRuntimes = [
    weeklyForgottenProgressRuntime,
  ].filter(Boolean);
  for (const runtime of directEffectToolRuntimes) {
    const toolSkillRun = (runtime as any)?.toolSkillRun;
    if (toolSkillRun) {
      recordToolSkillEffectsInLedger({
        ledger: effectLedger,
        toolSkillRun,
        toolExecution: String((runtime as any)?.toolExecution ?? "none"),
      });
    }
  }
  const directEffectExecutedTools = directEffectToolRuntimes.flatMap(
    (runtime) =>
      runtime.toolExecution === "success" &&
        Array.isArray((runtime as any).toolSkillRun?.committed_effects) &&
        (runtime as any).toolSkillRun.committed_effects.length > 0
        ? runtime.executedTools
        : [],
  );
  const combinedExecutedTools = [
    ...new Set([...agentExecutedTools, ...directEffectExecutedTools]),
  ];
  const combinedToolExecution = combinedExecutedTools.length > 0
    ? "success"
    : directEffectToolRuntimes.some((runtime) =>
        runtime.toolExecution === "failed"
      )
    ? "failed"
    : directEffectToolRuntimes.some((runtime) =>
        runtime.toolExecution === "blocked"
      )
    ? "blocked"
    : agentToolExecution;
  const normalConversationTurnTrace = turnFrame && routeDecision
    ? {
      turn_frame: turnFrame,
      route_decision: routeDecision,
      turn_agenda_summary: turnAgendaSummary,
      skill_run: routeDecision.response_owner === "conversation_handler" ||
          routeDecision.response_owner === "product_help" ||
          isSafetyRoute(routeDecision)
        ? {
          selected_skill_id: routeDecision.selected_handler ?? null,
          reason_code: routeDecision.reason_code,
          output: recommendationSkillOutput,
        }
        : undefined,
      recommendation_tool_run: recommendationToolRun
        ? {
          recommendation: recommendationToolRun,
          stats: recommendationToolStats,
        }
        : recommendationToolStats?.error
        ? { error: recommendationToolStats.error }
        : undefined,
      tool_skill_run: routeDecision.response_owner === "tool_skill" ||
          routeDecision.response_owner === "pending_confirmation"
        ? {
          selected_handler: routeDecision.selected_handler ?? null,
          reason_code: routeDecision.reason_code,
        }
        : undefined,
      effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
      response_owner: routeDecision.response_owner,
    }
    : null;

  if (turnFrame && routeDecision) {
    try {
      const dispatcherV2Stat = dispatcherV2Stats[0];
      await logConversationTurn({
        turn_id: turnFrame.turn_id,
        user_id: userId,
        source_message_id: turnFrame.source_message_id,
        ts: new Date().toISOString(),
        safety_pregate: safetyPregateOutput,
        dispatcher_run: {
          latency_ms: dispatcherV2Stat?.latency_ms ?? 0,
          tokens_in: dispatcherV2Stat?.tokens_in ?? 0,
          tokens_out: dispatcherV2Stat?.tokens_out ?? 0,
          prompt_version: dispatcherV2Stat?.prompt_version ??
            "dispatcher_v2_prompt_2026_05_s12",
          model_used: dispatcherV2Stats[0]?.model_name ?? null,
          memory_plan: turnFrame?.memory_plan ??
            DEFAULT_DISPATCHER_MEMORY_PLAN,
          turn_agenda_summary: turnAgendaSummary,
        },
        turn_frame: turnFrame,
        route_decision: routeDecision,
        direct_effects: combinedExecutedTools.map((
          toolId,
        ) => ({
          tool_id: toolId,
          outcome: combinedToolExecution,
        })),
        effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
        skill_run: routeDecision.response_owner === "conversation_handler" ||
            routeDecision.response_owner === "product_help" ||
            isSafetyRoute(routeDecision)
          ? {
            selected_skill_id: routeDecision.selected_handler ?? null,
            reason_code: routeDecision.reason_code,
            output: recommendationSkillOutput,
          }
          : undefined,
        recommendation_tool_run: recommendationToolRun
          ? {
            recommendation: recommendationToolRun,
            stats: recommendationToolStats,
          }
          : recommendationToolStats?.error
          ? { error: recommendationToolStats.error }
          : undefined,
        tool_skill_run: routeDecision.response_owner === "tool_skill" ||
            routeDecision.response_owner === "pending_confirmation"
          ? {
            selected_handler: routeDecision.selected_handler ?? null,
            reason_code: routeDecision.reason_code,
          }
          : undefined,
        confirmation_token_outcomes: [],
        memory_write_candidates_emitted: 0,
        response_owner: routeDecision.response_owner,
        total_latency_ms: Date.now() - turnStartMs,
      }, { supabase });
    } catch (error) {
      console.warn(
        "[Router] logConversationTurn failed (non-blocking):",
        error,
      );
      await trace("brain:conversation_turn_trace_failed", "routing", {
        error: error instanceof Error ? error.message : String(error),
      }, "warn");
    }
  }

  const responseStylePreferences = await loadCoachResponseStylePreferences({
    supabase,
    userId,
  });
  const finalResponse = runFinalResponsePipeline({
    baseResponseContent: String(agentOut.responseContent ?? "").trim(),
    userMessage,
    routeDecision,
    skillOutput: recommendationSkillOutput,
    recommendation: recommendationToolRun,
    recommendationSurfaceLabel,
    effectLedger,
    activeSkillState,
    tempMemory,
    history,
    memoryV2ActiveContextBlock,
    loggedMessageId,
    planItemSnapshot,
    stylePreferences: responseStylePreferences,
    deps: {
      directSafetyCrisisReplyOverride: directSafetyCrisisReplyOverrideRuntime,
      directConversationSkillReplyOverride,
      oneShotReminderManagementReply,
      enforceRecommendationToolVisibleReply: (input) =>
        enforceRecommendationToolVisibleReply({
          responseContent: input.responseContent,
          userMessage: input.userMessage,
          recommendation: input.recommendation as ProductRecommendation | null,
          surfaceLabel: input.surfaceLabel ?? null,
          tempMemory: input.tempMemory,
          planItemSnapshot:
            (input.planItemSnapshot as V2PlanItemSnapshotItem[] | null) ??
              null,
        }),
      stripHiddenHtmlComments,
      stripDeprecatedProductVocabulary,
      weeklyAdaptiveReviewStateForTurn,
      cleanWeeklyVisibleResponse,
      applyMemoryV2ResponseGroundingGuardrail,
      applyNonDurableMemoryPromiseGuard,
      applyWeeklyForgottenProgressAckGuard: (input) =>
        applyWeeklyForgottenProgressAckGuard({
          responseContent: input.responseContent,
          tempMemory: input.tempMemory,
          loggedMessageId: input.loggedMessageId ?? null,
        }),
      applyWeeklyRepeatedClarificationGuard,
      applyWeeklyConcreteOrganizationGuard,
      applyWeeklyConclusionGuard,
      applyCompactStartGuard,
      applyIncompleteRecapGuard,
      applyUnexecutedEffectClaimGuard,
      applyCoachResponseStylePreferences: (input) =>
        applyCoachResponseStylePreferences({
          userMessage: input.userMessage,
          responseContent: input.responseContent,
          preferences: input.preferences as any,
        }),
      userRequestsShortStyle,
      normalizeRouteText,
      ensureVisibleSophiaEmoji,
    },
  });
  let responseContent = finalResponse.responseContent;
  if (finalResponse.effectLedgerTrace && normalConversationTurnTrace) {
    (normalConversationTurnTrace as any).effect_ledger =
      finalResponse.effectLedgerTrace;
  }
  return await persistNormalReplyTurn({
    supabase,
    userId,
    scope,
    channel,
    userMessage,
    history,
    state,
    tempMemory,
    agentOut,
    responseContent,
    targetMode,
    riskScore,
    routeDecision,
    recommendationSkillOutput,
    recommendationToolRun,
    recommendationToolStats,
    recommendationSurfaceLabel,
    planItemSnapshot,
    activeSkillState,
    conversationRiskForPersist,
    conversationRiskHistoryForPersist,
    memoryV2RuntimeTempMemory,
    consumedBilanStopped,
    dispatcherSignals,
    v2Runtime,
    userTime,
    normalConversationTurnTrace,
    checkupActive,
    stopCheckup,
    isPostCheckup,
    checkupIntentDetected,
    effectiveModeForModelSelection,
    agentModelSelection,
    surfaceAddon,
    researchRequested,
    researchExecuted,
    researchQuery,
    researchSources,
    researchText,
    researchSnippets,
    researchError,
    researchDomainHint,
    researchLatencyMs,
    needsResearchSignal,
    turnStartMs,
    dispatcherLatencyMs,
    contextLoadResult,
    contextLatencyMs,
    agentLatencyMs,
    dispatcherV2Stats,
    combinedToolExecution,
    combinedExecutedTools,
    coachingAttempt,
    requestId: meta?.requestId ?? null,
    loggedMessageId,
    logMessages,
    messageMetadata: opts?.messageMetadata,
    trace,
  });
}
