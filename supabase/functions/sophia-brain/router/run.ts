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
import {
  RECENT_MESSAGE_LIMITS,
  recentChatMessagesFromHistory,
} from "../context/recent_messages_policy.ts";
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
  "status_recap",
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

export function shouldPreserveDirectStatusRecapRoute(args: {
  routeDecision: RouteDecision;
  turnFrame: TurnFrame;
}): boolean {
  if (args.routeDecision.selected_handler !== "status_recap") return false;
  if (args.routeDecision.response_owner === "product_help") return false;
  if (args.routeDecision.direct_effects_to_run.length > 0) return false;
  if (detectedSignalConfidence(args.turnFrame, "status_recap") < 2) {
    return false;
  }
  return !args.turnFrame.tool_skill_intents.some((intent) =>
    intent.user_intent !== "explain_only" &&
    confidenceRankForOrientation(intent.confidence_band) >= 2
  );
}

export function currentTurnSupportsOrientationToolResolution(args: {
  turnFrame: TurnFrame;
  operationType: string | null | undefined;
}): boolean {
  const operationType = String(args.operationType ?? "").trim();
  if (!operationType) return false;
  if (detectedSignalConfidence(args.turnFrame, operationType) >= 2) return true;
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

import { isActiveCardDraftingOperation } from "./active_operation_guards.ts";
import { logMemoryObservabilityEvent } from "../../_shared/memory-observability.ts";
import { runMemoryV2ActiveLoader } from "../../_shared/memory/runtime/active_loader.ts";
import {
  type DispatcherRunStats,
  runDispatcher,
} from "../dispatcher/dispatcher.v2.ts";
import { logConversationTurn } from "../observability/trace_logger.ts";
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
import {
  evaluateFlowOpportunityIntervention,
  type FlowInterventionContext,
} from "../routers/intervention_policy.ts";
import { runConversationRouters } from "../routers/routers.ts";
import { arbitrateTurnIntent } from "./turn_intent_arbitrator.ts";
import {
  initialSafetyContext,
  type SafetySignalContext,
} from "../safety/safety_context.ts";
import {
  blocksDirectEffects,
  blocksToolSkills,
  isAtLeast,
} from "../safety/safety_thresholds.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
  noteInformationForTrace,
  type NoteInformationTargetDispatcher,
} from "../contracts/note_information.v1.ts";
import {
  applySafetyCrisisExitStateIfNeeded,
  buildSafetyCrisisActivationNoteInformation,
  directSafetyCrisisReplyOverride as directSafetyCrisisReplyOverrideRuntime,
  isActiveSafetyCrisisSkillState,
  isSafetyRoute,
  runtimeSafetyContextForTurn,
  selectedConversationSkillForRoute,
  shouldSkipGlobalDispatcherForSafetyLocalTurn,
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
import {
  type CreateRecurringReminderRuntimeResult,
  maybeRunCreateRecurringReminderOperation,
} from "../tools/operations/create_recurring_reminder/router.ts";
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
import { maybeRunUpdateCoachPreferencesOperation } from "../tools/operations/update_coach_preferences/router.ts";
import { loadCoachPreferenceRuntimeContext } from "../tools/operations/update_coach_preferences/runtime_policy.ts";
import { createConfirmationToken } from "../confirmation/confirmation_token.ts";
import {
  buildWeeklyTurnSlotAddon,
  cleanWeeklyVisibleResponse,
  hasPendingOrActiveAdjustPlanOperation,
  isWeeklyAdaptiveReviewActive,
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
  readLocalToolFlowOperationType,
  resolveActiveLocalConversationFlowOwnership,
  resolveActiveLocalToolFlowOwnership,
} from "./active_flow_state.ts";
import {
  executedToolsForStatus,
  type OperationRuntimeResult,
  recordRecommendationEffectInLedger,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";
export { recordToolSkillEffectsInLedger as recordToolSkillEffectsInLedgerForTest } from "./effect_ledger_adapter.ts";
import { maybeRunStatusRecapRuntime } from "../skills/status_recap/runtime.ts";
import { hasActiveStatusRecapFlow } from "../skills/status_recap/local_flow.ts";
import {
  mergeDirectEffectRuntimeIntoVisibleRuntime,
  runDirectEffectLane,
  runOperationRuntimePipeline,
  turnFrameWithDirectEffectRuntime,
} from "./operation_runtime_pipeline.ts";
import { runFinalResponsePipeline } from "./final_response_pipeline.ts";
import { resolveAgentChatModel } from "./agent_model_selection.ts";
export { resolveAgentChatModel } from "./agent_model_selection.ts";
import { classifyStaleBilanResponse } from "./stale_bilan_runtime.ts";
export type { StaleBilanDecision } from "./stale_bilan_runtime.ts";
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
  isConversationSkillExitToGlobal,
  normalizeRecommendationText,
  prepareRecommendationRuntimeForTurn,
  runConversationSkillForRecommendation,
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
  persistConversationSkillRoute,
} from "./conversation_route_runtime_support.ts";
import {
  maybeStartActiveSkillClarification,
  maybeStartDispatcherClarification,
} from "./clarification_arbitrator.ts";
import { runClarificationVisibleAgent } from "../clarification/visible_agent.ts";
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

function runtimeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function runtimeString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function buildFlowInterventionContext(args: {
  lastLocalFlowExitContext?: unknown;
}): FlowInterventionContext | undefined {
  const lastExit = runtimeRecord(args.lastLocalFlowExitContext);
  const lastFlowTarget = runtimeString(lastExit.operation_type);
  if (!lastFlowTarget) return undefined;
  return {
    last_flow_target: lastFlowTarget,
    turns_since_last_flow_exit: 0,
  };
}

function localExitMemoKeyForSourceFlow(sourceFlowId: string): string | null {
  switch (sourceFlowId) {
    case "whatsapp_onboarding":
      return "__last_whatsapp_onboarding_exit_memo";
    case "adjust_plan_item":
      return "__last_adjust_plan_item_exit_memo";
    case "prepare_attack_card":
      return "__last_prepare_attack_card_exit_memo";
    case "prepare_defense_card":
      return "__last_prepare_defense_card_exit_memo";
    case "select_state_potion":
      return "__last_select_state_potion_exit_memo";
    case "update_coach_preferences":
      return "__last_update_coach_preferences_exit_memo";
    case "flow_opportunity_verification":
      return "__last_flow_opportunity_verification_exit_memo";
    case "weekly_adaptive_review_v1":
      return "__last_weekly_adaptive_review_exit_memo";
    case "daily_action_review_v1":
      return "__last_daily_action_review_exit_memo";
    case "status_recap":
      return "__last_status_recap_exit_memo";
    case "product_help":
      return "__last_product_help_exit_memo";
    case "emotional_repair":
      return "__last_emotional_repair_exit_memo";
    case "demotivation_repair":
      return "__last_demotivation_repair_exit_memo";
    default:
      return null;
  }
}

function localNoteInformationKeyForSourceFlow(
  sourceFlowId: string,
): string | null {
  switch (sourceFlowId) {
    case "post_morning_nudge":
      return "__last_post_morning_nudge_note_information";
    default:
      return null;
  }
}

function sourceFlowSummaryFromLocalExitMemo(
  memo: Record<string, unknown>,
  localRuntime: Record<string, unknown>,
): string {
  return runtimeString(memo.user_message_summary) ??
    runtimeString(memo.flow_summary) ??
    runtimeString(memo.user_intent_summary) ??
    runtimeString(memo.summary) ??
    runtimeString(localRuntime.reason_code) ??
    "Local flow explicitly exited to another dispatcher.";
}

function localExitUserWords(args: {
  userMessage?: string | null;
  memo: Record<string, unknown>;
  localRuntime: Record<string, unknown>;
}): string[] {
  const words: string[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) push(item);
      return;
    }
    const text = String(value ?? "").trim();
    if (!text || words.includes(text)) return;
    words.push(text);
  };
  push(runtimeRecord(args.memo).user_words);
  push(runtimeRecord(args.localRuntime).user_words);
  push(
    runtimeRecord(
      runtimeRecord(args.localRuntime.visible_task).conversation_context,
    ).user_words,
  );
  push(args.userMessage);
  return words.slice(0, 3);
}

function handoffReasonFromLocalExitMemo(
  memo: Record<string, unknown>,
  targetDispatcher: NoteInformationTargetDispatcher,
): "topic_change" | "safety" | "explicit_user_request" {
  if (targetDispatcher === "safety_crisis") return "safety";
  const reason = runtimeString(memo.reason);
  return reason === "explicit_tool_request" || reason === "preference_update" ||
      reason === "product_help" || reason === "status_question"
    ? "explicit_user_request"
    : "topic_change";
}

function runtimeTargetDispatcher(
  value: unknown,
  fallback: NoteInformationTargetDispatcher,
): NoteInformationTargetDispatcher {
  const text = runtimeString(value);
  switch (text) {
    case "global":
    case "safety_crisis":
    case "clarification":
    case "create_one_shot_reminder":
    case "create_recurring_reminder":
    case "prepare_attack_card":
    case "prepare_defense_card":
    case "adjust_plan_item":
    case "select_state_potion":
    case "track_progress_plan_item":
    case "update_coach_preferences":
    case "emotional_repair":
    case "demotivation_repair":
    case "product_help":
    case "status_recap":
    case "weekly_adaptive_review_v1":
    case "verification_opportunities":
    case "other_local":
      return text;
    default:
      return fallback;
  }
}

function transitionTagForTargetDispatcher(
  targetDispatcher: NoteInformationTargetDispatcher,
): string {
  if (targetDispatcher === "safety_crisis") return "local_to_safety_with_note";
  if (targetDispatcher === "global") return "local_to_global_with_note";
  return "local_to_local_with_note";
}

function attachNoteInformationToLocalExitMemo(args: {
  tempMemory: unknown;
  sourceFlowId: string;
  targetDispatcher?: NoteInformationTargetDispatcher;
  localRuntime: unknown;
  requestId?: string | null;
  userMessage?: string | null;
}): Record<string, unknown> {
  const key = localExitMemoKeyForSourceFlow(args.sourceFlowId);
  const noteKey = localNoteInformationKeyForSourceFlow(args.sourceFlowId);
  const next = { ...runtimeRecord(args.tempMemory) };
  const localRuntime = runtimeRecord(args.localRuntime);
  const localExitMemo = runtimeRecord(localRuntime.exit_memo);
  const localHandoffNote = runtimeRecord(localRuntime.local_handoff_note);
  const memo = {
    ...localExitMemo,
    ...localHandoffNote,
    ...runtimeRecord(key ? next[key] : null),
    ...runtimeRecord(noteKey ? next[noteKey] : null),
  };
  const localReasonCode = runtimeString(localRuntime.reason_code);
  const targetDispatcher = args.targetDispatcher ??
    (localReasonCode === "safety_preempt" ||
        localReasonCode?.endsWith("_safety_preempt")
      ? "safety_crisis"
      : "global");
  const localRuntimeNote = runtimeRecord(localRuntime.note_information);
  const existingNote = Object.keys(localRuntimeNote).length
    ? localRuntimeNote
    : runtimeRecord(memo.note_information);
  const userWords = localExitUserWords({
    userMessage: args.userMessage,
    memo,
    localRuntime,
  });
  const sourceFlowSummary = sourceFlowSummaryFromLocalExitMemo(
    memo,
    localRuntime,
  );
  const fallbackContext = {
    user_message_summary: userWords[0] ?? null,
    active_flow_summary: sourceFlowSummary,
    constraints: runtimeRecord(
      runtimeRecord(localRuntime.visible_task).conversation_context,
    ).do_not_say ?? [],
    unresolved_questions: [],
    recommended_next_focus: targetDispatcher,
    local_handoff_note: memo,
    local_runtime: {
      selected_handler: localRuntime.selected_handler ?? null,
      skill_id: localRuntime.skill_id ?? null,
      status: localRuntime.status ?? null,
      reason_code: localRuntime.reason_code ?? null,
      flow_action: localRuntime.flow_action ?? null,
      visible_task: localRuntime.visible_task ?? null,
    },
  };
  const note: NoteInformation = Object.keys(existingNote).length
    ? normalizeNoteInformation(existingNote, {
      source_flow_id: args.sourceFlowId,
      handoff_reason: handoffReasonFromLocalExitMemo(memo, targetDispatcher),
      target_dispatcher: targetDispatcher,
      handoff_context_for_next_dispatcher: JSON.stringify(fallbackContext),
      structured_context: fallbackContext,
      user_words: userWords,
      current_user_message: args.userMessage ?? undefined,
    })
    : createNoteInformation({
      source_flow_id: args.sourceFlowId,
      handoff_reason: handoffReasonFromLocalExitMemo(memo, targetDispatcher),
      target_dispatcher: targetDispatcher,
      handoff_context_for_next_dispatcher: JSON.stringify(fallbackContext),
      user_words: userWords,
      structured_context: fallbackContext,
    });
  const memoWithNote = {
    ...memo,
    note_information: note,
  };
  if (key) next[key] = memoWithNote;
  if (noteKey) next[noteKey] = memoWithNote;
  console.info("[Router] note_information_created", {
    ...noteInformationForTrace(note),
    request_id: args.requestId ?? null,
    transition_tag: transitionTagForTargetDispatcher(targetDispatcher),
  });
  return next;
}

function noteInformationFromLocalExitMemo(args: {
  tempMemory: unknown;
  sourceFlowId: string;
}): NoteInformation | null {
  const key = localExitMemoKeyForSourceFlow(args.sourceFlowId);
  const noteKey = localNoteInformationKeyForSourceFlow(args.sourceFlowId);
  if (!key && !noteKey) return null;
  const memory = runtimeRecord(args.tempMemory);
  const memo = runtimeRecord(
    noteKey ? memory[noteKey] : key ? memory[key] : null,
  );
  const note = runtimeRecord(memo.note_information);
  return Object.keys(note).length ? note as NoteInformation : null;
}

function localToolHandoffOperationInput(
  noteInformation: NoteInformation,
): Record<string, unknown> {
  return {
    source_flow_id: noteInformation.source_flow_id,
    source_flow_summary: String(
      (noteInformation.structured_context as any)?.active_flow_summary ??
        noteInformation.handoff_context_for_next_dispatcher,
    ).trim(),
    handoff_reason: noteInformation.handoff_reason,
    handoff_context_for_next_dispatcher:
      noteInformation.handoff_context_for_next_dispatcher,
    structured_context: noteInformation.structured_context,
    note_information: noteInformation,
  };
}

function buildLocalToolHandoffRouteDecision(args: {
  sourceFlowId: string;
  targetDispatcher: NoteInformationTargetDispatcher;
}): RouteDecision {
  const reasonCode = `${args.sourceFlowId}_handoff_to_${args.targetDispatcher}`;
  return {
    route_version: "v1",
    response_owner: "tool_skill",
    selected_handler: args.targetDispatcher,
    blocked_paths: [{
      path: "global_dispatcher",
      reason_code: `${reasonCode}_skips_global_dispatcher`,
    }],
    direct_effects_to_run: [],
    reason_code: reasonCode,
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
}

function buildLocalToolHandoffTurnFrame(args: {
  turnId: string;
  sourceMessageId: string;
  userId: string;
  channel: "web" | "whatsapp";
  safetyContextOutput: SafetySignalContext;
  conversationRiskHistory: number[];
  targetDispatcher: NoteInformationTargetDispatcher;
  noteInformation: NoteInformation;
}): TurnFrame {
  const operationInput = localToolHandoffOperationInput(args.noteInformation);
  return {
    turn_id: args.turnId,
    source_message_id: args.sourceMessageId,
    user_id: args.userId,
    channel: args.channel,
    safety: {
      risk_band: args.safetyContextOutput.risk_band,
      reason_codes: args.safetyContextOutput.reason_codes ?? [],
      evidence: args.safetyContextOutput.evidence ?? [],
    },
    conversation_risk: {
      score: 0,
      threshold: 8,
      should_exit_flows: false,
      reason_codes: [],
      previous_scores: args.conversationRiskHistory,
      matrix: [],
      context_summary: null,
    },
    direct_effects: [],
    tool_skill_intents: [{
      operation_type: args.targetDispatcher,
      explicitness: "explicit",
      operation_input: operationInput,
      payload_hint: {
        source_flow_id: args.noteInformation.source_flow_id,
        note_information: args.noteInformation,
      },
      confidence_band: "high",
      ambiguity: "target_ambiguous",
      user_intent: args.targetDispatcher === "select_state_potion"
        ? "select"
        : args.targetDispatcher === "adjust_plan_item" ||
            args.targetDispatcher === "update_coach_preferences" ||
            args.targetDispatcher === "track_progress_plan_item"
        ? "adjust"
        : "create",
    }],
    note_information: args.noteInformation,
    skill_signals: {
      entry: {
        [args.targetDispatcher]: {
          detected: true,
          confidence_band: "high",
          reason: `${args.noteInformation.source_flow_id}_handoff`,
        },
      },
    },
    memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
  };
}

export function buildSafetyLocalOwnershipFrame(args: {
  turnId: string;
  sourceMessageId: string;
  userId: string;
  channel: "web" | "whatsapp";
  activeSkillState: unknown;
  safetyContextOutput: SafetySignalContext;
  conversationRiskHistory: number[];
  userMessage: string;
  requestId?: string | null;
}): {
  turnFrame: TurnFrame;
  routeDecision: RouteDecision;
  noteInformationCreated: boolean;
} {
  const firstActivation = !isActiveSafetyCrisisSkillState(
    args.activeSkillState,
  );
  const noteInformation = firstActivation
    ? buildSafetyCrisisActivationNoteInformation({
      userMessage: args.userMessage,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      safetyContextOutput: args.safetyContextOutput,
    })
    : null;
  const turnFrame: TurnFrame = {
    turn_id: args.turnId,
    source_message_id: args.sourceMessageId,
    user_id: args.userId,
    channel: args.channel,
    safety: {
      risk_band: args.safetyContextOutput.risk_band,
      reason_codes: args.safetyContextOutput.reason_codes ?? [],
      evidence: args.safetyContextOutput.evidence ?? [],
    },
    conversation_risk: {
      score: 0,
      threshold: 8,
      should_exit_flows: false,
      reason_codes: [],
      previous_scores: args.conversationRiskHistory,
      matrix: [],
      context_summary: null,
    },
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    note_information: noteInformation,
    skill_signals: firstActivation
      ? {
        entry: {
          safety_crisis: {
            detected: true,
            confidence_band: "critical",
            reason: "safety_local_flow_owns_turn",
          },
        },
      }
      : {
        lifecycle: {
          safety_crisis: {
            detected: true,
            confidence_band: "critical",
            reason: "active_safety_flow_continue",
          },
        },
      },
    memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
  };
  return {
    turnFrame,
    routeDecision: {
      route_version: "v1",
      response_owner: "safety",
      selected_handler: "safety_crisis",
      blocked_paths: [
        {
          path: "global_dispatcher",
          reason_code: "safety_local_flow_owns_turn",
        },
        {
          path: "global_router",
          reason_code: "safety_local_flow_owns_turn",
        },
      ],
      direct_effects_to_run: [],
      reason_code: "safety_local_flow_owns_turn",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    noteInformationCreated: Boolean(noteInformation),
  };
}

export function activeConversationSkillId(
  activeSkillState: unknown,
): string | null {
  const skillId = String((activeSkillState as any)?.skill_id ?? "").trim();
  return skillId || null;
}

function activeLocalConversationSkillThatOwnsTurn(
  activeSkillState: unknown,
): "demotivation_repair" | "emotional_repair" | "product_help" | null {
  const skillId = resolveActiveLocalConversationFlowOwnership({
    activeSkillState,
  })?.skill_id ?? null;
  if (
    skillId === "demotivation_repair" ||
    skillId === "emotional_repair" ||
    skillId === "product_help"
  ) {
    return skillId;
  }
  return null;
}

function buildActiveConversationLocalOwnershipFrame(args: {
  skillId: "demotivation_repair" | "emotional_repair" | "product_help";
  turnId: string;
  sourceMessageId: string;
  userId: string;
  channel: "web" | "whatsapp";
  safetyContextOutput: SafetySignalContext;
  conversationRiskHistory: number[];
}): {
  turnFrame: TurnFrame;
  routeDecision: RouteDecision;
} {
  const responseOwner = args.skillId === "product_help"
    ? "product_help"
    : "conversation_handler";
  const reasonCode = `active_${args.skillId}_local_dispatcher`;
  return {
    turnFrame: {
      turn_id: args.turnId,
      source_message_id: args.sourceMessageId,
      user_id: args.userId,
      channel: args.channel,
      safety: {
        risk_band: args.safetyContextOutput.risk_band,
        reason_codes: args.safetyContextOutput.reason_codes ?? [],
        evidence: args.safetyContextOutput.evidence ?? [],
      },
      conversation_risk: {
        score: 0,
        threshold: 8,
        should_exit_flows: false,
        reason_codes: [],
        previous_scores: args.conversationRiskHistory,
        matrix: [],
        context_summary: null,
      },
      direct_effects: [],
      tool_skill_intents: [],
      flow_opportunity: null,
      skill_signals: {
        lifecycle: {
          [args.skillId]: {
            detected: true,
            confidence_band: "high",
            reason: "active_local_conversation_skill_owns_turn",
          },
        },
      },
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    },
    routeDecision: {
      route_version: "v1",
      response_owner: responseOwner,
      selected_handler: args.skillId,
      blocked_paths: [
        {
          path: "global_dispatcher",
          reason_code: "active_local_conversation_skill_owns_turn",
        },
        {
          path: "global_router",
          reason_code: "active_local_conversation_skill_owns_turn",
        },
      ],
      direct_effects_to_run: [],
      reason_code: reasonCode,
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
      active_flow_arbitration: {
        decision: "continue_active",
        active_owner: "conversation_skill",
        selected_owner: "conversation_skill",
        resume_policy: "none",
        reason_code: "active_local_conversation_skill_owns_turn",
      },
    },
  };
}

export function shouldDeferConversationRiskFlowExitToLocalDispatcher(args: {
  activeSkillState: unknown;
  conversationRisk: TurnFrame["conversation_risk"] | null | undefined;
}): boolean {
  return Boolean(
    args.conversationRisk?.should_exit_flows &&
      activeConversationSkillId(args.activeSkillState),
  );
}

function buildDispatcherLlmRunner(meta?: {
  requestId?: string;
  userId?: string | null;
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
          userId: meta?.userId ?? undefined,
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
        "[Router] dispatcher LLM failed; using neutral dispatcher frame",
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

function activeFlowDebugRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function summarizeActiveSkillForDebug(value: unknown): Record<string, unknown> {
  const record = activeFlowDebugRecord(value);
  if (!record) {
    return {
      present: false,
      value_type: value === null ? "null" : typeof value,
    };
  }
  const workingState = activeFlowDebugRecord(record.working_state);
  return {
    present: true,
    skill_id: String(record.skill_id ?? "").trim() || null,
    status: String(record.status ?? "").trim() || null,
    mode: String(record.mode ?? "").trim() || null,
    has_working_state: Boolean(workingState),
    state_keys: Object.keys(record).sort().slice(0, 30),
    working_state_keys: workingState
      ? Object.keys(workingState).sort().slice(0, 30)
      : [],
    updated_at: typeof record.updated_at === "string"
      ? record.updated_at
      : null,
  };
}

function summarizeTempMemoryActiveFlowForDebug(
  tempMemory: unknown,
): Record<string, unknown> {
  const temp = activeFlowDebugRecord(tempMemory);
  if (!temp) {
    return {
      temp_memory_type: tempMemory === null ? "null" : typeof tempMemory,
      has_temp_memory: false,
      flow_keys: [],
      raw_active_key: null,
      raw_active_skill: summarizeActiveSkillForDebug(null),
    };
  }
  const rawActiveKey = temp.__active_skill_state !== undefined
    ? "__active_skill_state"
    : temp.active_skill_state !== undefined
    ? "active_skill_state"
    : null;
  const rawActive = rawActiveKey ? temp[rawActiveKey] : null;
  return {
    temp_memory_type: "object",
    has_temp_memory: true,
    temp_memory_key_count: Object.keys(temp).length,
    flow_keys: Object.keys(temp).filter((key) =>
      key.includes("active") || key.includes("flow") ||
      key.includes("skill") || key.includes("conversation_risk")
    ).sort().slice(0, 60),
    raw_active_key: rawActiveKey,
    raw_active_skill: summarizeActiveSkillForDebug(rawActive),
    conversation_risk_last: activeFlowDebugRecord(temp.__conversation_risk_last)
      ? {
        should_exit_flows: Boolean(
          (temp.__conversation_risk_last as any).should_exit_flows,
        ),
        score: Number((temp.__conversation_risk_last as any).score ?? 0),
        reason_codes: Array.isArray(
            (temp.__conversation_risk_last as any).reason_codes,
          )
          ? (temp.__conversation_risk_last as any).reason_codes.slice(0, 12)
          : [],
      }
      : null,
  };
}

function pushActiveFlowDebugSnapshot(args: {
  snapshots: Record<string, unknown>[];
  phase: string;
  scope: string;
  tempMemory: unknown;
  activeSkillState?: unknown;
  activeOperationIntake?: unknown;
  pendingOperationConfirmation?: unknown;
  routeReasonCode?: string | null;
  routeActiveFlowReasonCode?: string | null;
}) {
  args.snapshots.push({
    phase: args.phase,
    scope: args.scope,
    temp_memory: summarizeTempMemoryActiveFlowForDebug(args.tempMemory),
    active_skill_state: summarizeActiveSkillForDebug(args.activeSkillState),
    active_tool_skill_id: String(
      (args.activeOperationIntake as any)?.operation_type ??
        (args.activeOperationIntake as any)?.skill_id ??
        "",
    ).trim() || null,
    pending_confirmation_id: String(
      (args.pendingOperationConfirmation as any)?.operation_type ??
        (args.pendingOperationConfirmation as any)?.skill_id ??
        "",
    ).trim() || null,
    route_reason_code: args.routeReasonCode ?? null,
    route_active_flow_reason_code: args.routeActiveFlowReasonCode ?? null,
  });
}

export function buildOnDemandTriggersFromDispatcherSignals(
  dispatcherSignals: DispatcherSignals,
): OnDemandTriggers {
  return {
    plan_item_discussion_detected:
      dispatcherSignals.plan_item_discussion?.detected ?? false,
    plan_item_discussion_hint: dispatcherSignals.plan_item_discussion
      ?.item_hint,
    plan_feedback_detected: dispatcherSignals.plan_feedback?.detected ?? false,
  };
}

function attachActiveFlowDebugToRouteDecision<T extends RouteDecision | null>(
  routeDecision: T,
  snapshots: Record<string, unknown>[],
): T {
  if (!routeDecision || snapshots.length === 0) return routeDecision;
  return {
    ...(routeDecision as any),
    active_flow_debug: {
      version: "active_flow_debug_v1",
      snapshots: snapshots.slice(-8),
    },
  } as T;
}

function localFlowExitContextRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function localFlowExitNoteInformation(
  localFlowExitContext: unknown,
): NoteInformation | null {
  const context = localFlowExitContextRecord(localFlowExitContext);
  const note = localFlowExitContextRecord(context?.note_information);
  return note ? note as NoteInformation : null;
}

function shouldPromoteLocalExitNote(args: {
  turnFrame: TurnFrame | null;
  noteInformation: NoteInformation | null;
}): boolean {
  if (!args.turnFrame || !args.noteInformation) return false;
  const existing = localFlowExitContextRecord(
    (args.turnFrame as any)
      .note_information,
  );
  const existingSource = String(existing?.source_flow_id ?? "").trim();
  return !existingSource || existingSource === "global_dispatcher";
}

function attachLocalFlowExitContextToSecondPass(args: {
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  localFlowExitContext: unknown;
}): { turnFrame: TurnFrame | null; routeDecision: RouteDecision | null } {
  if (!args.turnFrame || !args.routeDecision || !args.localFlowExitContext) {
    return { turnFrame: args.turnFrame, routeDecision: args.routeDecision };
  }
  const context = localFlowExitContextRecord(args.localFlowExitContext);
  if (!context) {
    return { turnFrame: args.turnFrame, routeDecision: args.routeDecision };
  }
  const noteInformation = localFlowExitNoteInformation(context);
  const sourceFlowId = String(
    noteInformation?.source_flow_id ?? context.operation_type ?? "",
  ).trim();
  if (!sourceFlowId) {
    return { turnFrame: args.turnFrame, routeDecision: args.routeDecision };
  }
  const handoffTrace = {
    source_flow_id: sourceFlowId,
    source_flow_summary: String(
      (noteInformation?.structured_context as any)?.active_flow_summary ??
        noteInformation?.handoff_context_for_next_dispatcher ??
        "",
    ).trim() ||
      (String(context.flow_summary ?? "").trim() || null),
    handoff_reason: noteInformation?.handoff_reason ??
      (String(context.reason ?? "").trim() || null),
    target_dispatcher: noteInformation?.target_dispatcher ?? "global",
    consumed_by: "global_dispatcher_second_pass",
    response_owner: args.routeDecision.response_owner,
    selected_handler: args.routeDecision.selected_handler ?? null,
    note_information: noteInformation,
  };
  const previousNoteInformation = (args.turnFrame as any).note_information ??
    null;
  const nextTurnFrame = {
    ...(args.turnFrame as any),
    ...(shouldPromoteLocalExitNote({
        turnFrame: args.turnFrame,
        noteInformation,
      })
      ? {
        note_information: noteInformation,
        global_dispatcher_note_information: previousNoteInformation,
      }
      : {}),
    local_flow_exit_handoff: handoffTrace,
  } as TurnFrame;
  const blockedPaths = [...args.routeDecision.blocked_paths];
  const localReplyPath = `${sourceFlowId}.local_visible_reply`;
  if (!blockedPaths.some((entry) => entry.path === localReplyPath)) {
    blockedPaths.push({
      path: localReplyPath,
      reason_code: "local_exit_to_global_dispatcher_blocks_local_reply",
    });
  }
  const nextRouteDecision = {
    ...(args.routeDecision as any),
    blocked_paths: blockedPaths,
    local_flow_exit_handoff: handoffTrace,
  } as RouteDecision;
  return { turnFrame: nextTurnFrame, routeDecision: nextRouteDecision };
}

function compactHandoffStructuredContext(
  value: unknown,
): Record<string, unknown> | null {
  const record = localFlowExitContextRecord(value);
  if (!record || Object.keys(record).length === 0) return null;
  const blockedKeys = new Set([
    "risk_score",
    "target_dispatcher",
  ]);
  const compact: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    if (blockedKeys.has(key)) continue;
    if (rawValue === null || rawValue === undefined) continue;
    compact[key] = rawValue;
  }
  return Object.keys(compact).length ? compact : null;
}

function noteForNormalReplyHandoffContext(
  turnFrame: TurnFrame | null,
): NoteInformation | null {
  if (!turnFrame) return null;
  const handoff = localFlowExitContextRecord(
    (turnFrame as any).local_flow_exit_handoff,
  );
  const handoffNote = localFlowExitContextRecord(handoff?.note_information);
  if (handoffNote) return handoffNote as NoteInformation;
  const note = localFlowExitContextRecord((turnFrame as any).note_information);
  if (note) return note as NoteInformation;
  const globalNote = localFlowExitContextRecord(
    (turnFrame as any).global_dispatcher_note_information,
  );
  return globalNote ? globalNote as NoteInformation : null;
}

function buildNormalReplyHandoffContextAddon(args: {
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
}): string | null {
  if (args.routeDecision?.response_owner !== "normal_reply") return null;
  const note = noteForNormalReplyHandoffContext(args.turnFrame);
  if (!note) return null;
  const handoffContext = String(
    note.handoff_context_for_next_dispatcher ?? "",
  ).trim();
  const structuredContext = compactHandoffStructuredContext(
    note.structured_context,
  );
  const userWords = Array.isArray(note.user_words) && note.user_words.length
    ? `Mots utilisateur utiles: ${note.user_words.slice(0, 3).join(" / ")}`
    : null;
  if (!handoffContext && !structuredContext) return null;
  return [
    "=== CONTEXTE DE REPRISE ===",
    "Ce contexte est prioritaire pour respecter la transition qui vient d'avoir lieu.",
    "Le dernier message utilisateur reste la source principale pour comprendre la limite conversationnelle du tour. Si ce message indique une cloture, une intention de faire seulement une chose, un arret apres un micro-geste, ou une demande de ne rien ajouter, la reponse visible doit clore sans nouvelle question ni relance.",
    userWords,
    handoffContext ? `Contexte: ${handoffContext.slice(0, 900)}` : null,
    structuredContext
      ? `Contexte structure utile: ${
        JSON.stringify(structuredContext).slice(0, 1200)
      }`
      : null,
    "Utilise ce contexte pour repondre naturellement en respectant les contraintes utilisateur, y compris celles que tu dois inferer du dernier message. Ne mentionne pas la note, le dispatcher, le routing, les champs JSON, ni les details techniques.",
    "=== FIN CONTEXTE DE REPRISE ===",
  ].filter(Boolean).join("\n");
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
    clientTimezone?: string | null;
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
        turnId: meta?.requestId ?? null,
        channel,
        scope,
        forceBrainTrace: (meta as any)?.forceBrainTrace,
      },
      event,
      phase,
      level,
      payload,
    });
  };
  const activeFlowDebugSnapshots: Record<string, unknown>[] = [];

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
          safety_context: {
            detected: false,
            evidence: [],
            risk_band: "none",
            reason_codes: [],
            allow_side_effects: true,
            layer_contributions: {
              lexical: false,
              active_flow_caution: false,
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
  pushActiveFlowDebugSnapshot({
    snapshots: activeFlowDebugSnapshots,
    phase: "user_state_loaded",
    scope,
    tempMemory,
  });
  await trace("brain:user_state_loaded", "context", {
    current_mode: (state as any)?.current_mode ?? null,
    has_temp_memory: Boolean(tempMemory && typeof tempMemory === "object"),
    has_investigation_state: Boolean((state as any)?.investigation_state),
  }, "debug");
  await trace(
    "brain:active_flow_temp_memory_loaded_from_user_state",
    "context",
    {
      scope,
      ...summarizeTempMemoryActiveFlowForDebug(tempMemory),
    },
    "debug",
  );

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
  pushActiveFlowDebugSnapshot({
    snapshots: activeFlowDebugSnapshots,
    phase: "after_onboarding_and_reconcile",
    scope,
    tempMemory,
  });
  await trace("brain:active_flow_temp_memory_after_preprocessors", "context", {
    scope,
    ...summarizeTempMemoryActiveFlowForDebug(tempMemory),
  }, "debug");
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
    timezoneOverride: meta?.clientTimezone ?? null,
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
  const safetyContextOutput = withActiveSafetyFlowCaution(
    initialSafetyContext({ channel }),
    tempMemory,
  );
  const recentMessagesForTurnFrame: Array<{
    role: "user" | "assistant";
    content: string;
  }> = [
    ...recentChatMessagesFromHistory(
      history,
      RECENT_MESSAGE_LIMITS.conversationRepair,
    ),
    ...(userMessage.trim()
      ? [{ role: "user" as const, content: userMessage.trim() }]
      : []),
  ];
  let turnFrame: TurnFrame | null = null;
  let routeDecision: RouteDecision | null = null;
  let orientationClarificationReply: string | null = null;
  let userTurnSnapshot: UserTurnSnapshot | null = null;
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
  const activeSkillIdAtTurnStart = activeConversationSkillId(activeSkillState);
  pushActiveFlowDebugSnapshot({
    snapshots: activeFlowDebugSnapshots,
    phase: "read_active_flow_state",
    scope,
    tempMemory,
    activeSkillState,
    activeOperationIntake,
    pendingOperationConfirmation:
      activeFlowStateForTurn.pendingToolSkillConfirmation,
  });
  await trace("brain:active_flow_state_loaded", "routing", {
    active_skill_id: activeSkillIdAtTurnStart,
    active_skill_status: String((activeSkillState as any)?.status ?? "") ||
      null,
    temp_memory_has_active_skill: Boolean(
      (tempMemory as any)?.__active_skill_state ??
        (tempMemory as any)?.active_skill_state,
    ),
    active_tool_skill_id: String(
      (activeOperationIntake as any)?.operation_type ??
        (activeOperationIntake as any)?.skill_id ??
        "",
    ) || null,
    temp_memory_flow_keys: Object.keys(tempMemory ?? {}).filter((key) =>
      key.includes("active") || key.includes("flow") ||
      key.includes("skill")
    ).slice(0, 30),
    active_flow_debug: activeFlowDebugSnapshots.slice(-3),
  }, "debug");
  if (
    (tempMemory as any)?.__active_skill_state &&
    !activeSkillIdAtTurnStart
  ) {
    await trace("brain:active_flow_state_loaded_mismatch", "routing", {
      reason_code: "raw_active_skill_present_but_read_active_skill_missing",
      scope,
      active_flow_debug: activeFlowDebugSnapshots.slice(-3),
    }, "warn");
  }
  const activeStatePotionHandoffForLocalFlow =
    loadStatePotionHandoffStateFromTempMemory(tempMemory);
  const resolvedActiveLocalToolFlowOwnership =
    resolveActiveLocalToolFlowOwnership({
      tempMemory,
      activeOperationIntake,
      pendingOperationConfirmation:
        activeFlowStateForTurn.pendingToolSkillConfirmation,
    });
  const canonicalActiveLocalToolOperationType = readLocalToolFlowOperationType(
    activeOperationIntake,
  );
  const activeLocalToolFlowOwnership = resolvedActiveLocalToolFlowOwnership ??
    (canonicalActiveLocalToolOperationType
      ? {
        owner: "tool_skill" as const,
        operation_type: canonicalActiveLocalToolOperationType,
        source: "readActiveFlowState.activeToolSkillIntake.canonical_fallback",
        active_state: activeOperationIntake,
      }
      : null);
  if (
    canonicalActiveLocalToolOperationType &&
    !resolvedActiveLocalToolFlowOwnership
  ) {
    await trace(
      "brain:active_local_tool_flow_ownership_restored_from_canonical_state",
      "routing",
      {
        operation_type: canonicalActiveLocalToolOperationType,
        source: "readActiveFlowState.activeToolSkillIntake",
        reason_code:
          "active_tool_flow_ownership_resolver_missed_canonical_state",
        active_flow_debug: activeFlowDebugSnapshots.slice(-3),
      },
      "warn",
    );
  }
  const activeLocalFlowOperationType =
    activeLocalToolFlowOwnership?.operation_type ?? "";
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
    : activeLocalFlowOperationType === "create_recurring_reminder"
    ? "active_create_recurring_reminder_local_dispatcher"
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
    : activeLocalFlowOperationType === "create_recurring_reminder"
    ? "active_create_recurring_reminder_uses_local_dispatcher"
    : activePotionSubskillName
    ? `active_${activePotionSubskillName}_uses_local_dispatcher`
    : "active_select_state_potion_uses_local_dispatcher";
  const activeLocalToolFlowOwnsTurn = Boolean(
    activeLocalToolFlowOwnership && !activeSkillIdAtTurnStart,
  );
  const activeLocalConversationFlowOwnership = activeLocalToolFlowOwnsTurn
    ? null
    : resolveActiveLocalConversationFlowOwnership({
      tempMemory,
      activeClarificationState: activeFlowStateForTurn.activeClarificationState,
      activeSkillState,
    });
  await trace(
    "brain:active_local_flow_ownership_resolved",
    "routing",
    {
      owner: activeLocalToolFlowOwnership?.owner ?? null,
      operation_type: activeLocalFlowOperationType || null,
      source: activeLocalToolFlowOwnership?.source ?? null,
      conversation_owner: activeLocalConversationFlowOwnership?.owner ?? null,
      conversation_skill_id: activeLocalConversationFlowOwnership?.skill_id ??
        null,
      conversation_source: activeLocalConversationFlowOwnership?.source ?? null,
      active_skill_id: activeSkillIdAtTurnStart || null,
      tool_flow_owns_turn: activeLocalToolFlowOwnsTurn,
      conversation_flow_owns_turn: Boolean(
        activeLocalConversationFlowOwnership,
      ),
      will_call_local_dispatcher: activeLocalToolFlowOwnsTurn &&
        Boolean(activeLocalFlowOperationType),
      reason_code: activeLocalToolFlowOwnsTurn
        ? "active_tool_flow_ownership_from_canonical_state"
        : activeLocalConversationFlowOwnership
        ? "active_conversation_flow_ownership_from_canonical_state"
        : activeLocalToolFlowOwnership
        ? "active_conversation_skill_takes_precedence"
        : "no_active_local_tool_flow",
    },
    activeLocalToolFlowOwnership || activeLocalConversationFlowOwnership
      ? "info"
      : "debug",
  );
  let activeOperationIntakeForDispatcher = activeOperationIntake;
  let pendingOperationConfirmation =
    readActiveFlowState(tempMemory).pendingToolSkillConfirmation;
  let pendingOperationConfirmationForGlobalRouting =
    pendingConfirmationOwnedByToolSkill(pendingOperationConfirmation)
      ? null
      : pendingOperationConfirmation;
  pushActiveFlowDebugSnapshot({
    snapshots: activeFlowDebugSnapshots,
    phase: "after_pending_confirmation_reload",
    scope,
    tempMemory,
    activeSkillState,
    activeOperationIntake,
    pendingOperationConfirmation,
  });
  const activePostMorningNudgeState = activeLocalToolFlowOwnsTurn
    ? null
    : readPostMorningNudgeActiveState(
      tempMemory,
    );
  const activeWeeklyReviewLocalState = activeLocalToolFlowOwnsTurn
    ? null
    : weeklyAdaptiveReviewStateForTurn({
      activeSkillState,
      tempMemory,
    });
  if (activeWeeklyReviewLocalState) {
    let localRouteDecision: RouteDecision = {
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
    let localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      const weeklyRuntimeRecord = runtimeRecord(weeklyRuntime.toolSkillRun);
      const weeklyTargetDispatcher = runtimeTargetDispatcher(
        weeklyRuntimeRecord.target_dispatcher ??
          runtimeRecord(weeklyRuntimeRecord.note_information)
            .target_dispatcher ??
          runtimeRecord(
            runtimeRecord(weeklyRuntimeRecord.exit_memo)
              .note_information,
          ).target_dispatcher,
        localRuntimeReason === "weekly_review_safety_preempt"
          ? "safety_crisis"
          : "global",
      );
      if (
        localRuntimeReason === "weekly_review_local_handoff_to_local_flow"
      ) {
        tempMemory = weeklyRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "weekly_adaptive_review_v1",
          targetDispatcher: weeklyTargetDispatcher,
          localRuntime: weeklyRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
        const handoffNote = noteInformationFromLocalExitMemo({
          tempMemory,
          sourceFlowId: "weekly_adaptive_review_v1",
        });
        const targetNote = handoffNote ??
          (Object.keys(runtimeRecord(weeklyRuntimeRecord.note_information))
              .length
            ? weeklyRuntimeRecord.note_information as NoteInformation
            : null);
        tempMemory = clearLastLocalFlowExitContext(tempMemory);
        state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        activeSkillState = null;
        activeOperationIntake = null;
        activeOperationIntakeForDispatcher = null;
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
        const targetRouteDecision = buildLocalToolHandoffRouteDecision({
          sourceFlowId: "weekly_adaptive_review_v1",
          targetDispatcher: weeklyTargetDispatcher,
        });
        const targetTurnFrame = targetNote
          ? buildLocalToolHandoffTurnFrame({
            turnId: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
            sourceMessageId: loggedMessageId ?? meta?.requestId ??
              crypto.randomUUID(),
            userId,
            channel,
            safetyContextOutput,
            conversationRiskHistory: conversationRiskHistoryForPersist,
            targetDispatcher: weeklyTargetDispatcher,
            noteInformation: targetNote,
          })
          : null;
        const targetRuntimeRouteDecision: RouteDecision =
          weeklyTargetDispatcher === "create_one_shot_reminder"
            ? {
              ...targetRouteDecision,
              response_owner: "tool_skill",
              selected_handler: "create_one_shot_reminder",
              direct_effects_to_run: ["create_one_shot_reminder"],
              reason_code: "weekly_review_handoff_to_create_one_shot_reminder",
            }
            : targetRouteDecision;
        const targetRuntimeTurnFrame: TurnFrame | null = targetTurnFrame &&
            weeklyTargetDispatcher === "create_one_shot_reminder"
          ? {
            ...targetTurnFrame,
            direct_effects: [
              ...targetTurnFrame.direct_effects.filter((effect) =>
                effect.effect_type !== "create_one_shot_reminder"
              ),
              {
                effect_type: "create_one_shot_reminder",
                explicitness: "explicit",
                target_status: "missing",
                confidence_band: "high",
                payload_hint: {
                  raw_text: userMessage,
                  note_information: targetNote,
                },
              },
            ],
          }
          : targetTurnFrame;
        const targetRuntime = targetRuntimeTurnFrame &&
            weeklyTargetDispatcher === "prepare_attack_card"
          ? await maybeRunPrepareAttackCardOperation({
            supabase,
            userId,
            userMessage,
            channel,
            userTimezone: userTime?.user_timezone ?? "Europe/Paris",
            tempMemory,
            turnFrame: targetRuntimeTurnFrame,
            routeDecision: targetRuntimeRouteDecision,
            safetyContextOutput,
            sourceMessageId: loggedMessageId,
            requestId: meta?.requestId ?? null,
            history,
            planSnapshot: { items: planItemSnapshot ?? [] },
          })
          : targetTurnFrame && weeklyTargetDispatcher === "prepare_defense_card"
          ? await maybeRunPrepareDefenseCardOperation({
            supabase,
            userId,
            userMessage,
            channel,
            userTimezone: userTime?.user_timezone ?? "Europe/Paris",
            tempMemory,
            turnFrame: targetRuntimeTurnFrame,
            routeDecision: targetRuntimeRouteDecision,
            safetyContextOutput,
            sourceMessageId: loggedMessageId,
            requestId: meta?.requestId ?? null,
            history,
            planSnapshot: { items: planItemSnapshot ?? [] },
          })
          : targetTurnFrame && weeklyTargetDispatcher === "adjust_plan_item"
          ? await maybeRunAdjustPlanItemOperation({
            supabase,
            userId,
            userMessage,
            channel,
            userTimezone: userTime?.user_timezone ?? "Europe/Paris",
            tempMemory,
            turnFrame: targetRuntimeTurnFrame,
            routeDecision: targetRuntimeRouteDecision,
            safetyContextOutput,
            sourceMessageId: loggedMessageId,
            requestId: meta?.requestId ?? null,
            history,
            planItemSnapshot: planItemSnapshot ?? [],
            forceFullAi: meta?.forceRealAi === true ||
              (opts?.messageMetadata as Record<string, unknown> | undefined)
                  ?.force_full_ai === true,
          })
          : targetTurnFrame &&
              weeklyTargetDispatcher === "create_recurring_reminder"
          ? await maybeRunCreateRecurringReminderOperation({
            supabase,
            userId,
            userMessage,
            channel,
            userTimezone: userTime?.user_timezone ?? "Europe/Paris",
            tempMemory,
            turnFrame: targetRuntimeTurnFrame,
            routeDecision: targetRuntimeRouteDecision,
            safetyContextOutput,
            sourceMessageId: loggedMessageId,
            requestId: meta?.requestId ?? null,
            history,
            planItemSnapshot: planItemSnapshot ?? [],
          })
          : targetTurnFrame && weeklyTargetDispatcher === "select_state_potion"
          ? await runSelectStatePotionHandoffSkill({
            supabase,
            userId,
            userMessage,
            channel,
            userTimezone: userTime?.user_timezone ?? "Europe/Paris",
            tempMemory,
            turnFrame: targetRuntimeTurnFrame,
            routeDecision: targetRuntimeRouteDecision,
            safetyContextOutput,
            sourceMessageId: loggedMessageId,
            requestId: meta?.requestId ?? null,
            history,
          })
          : targetRuntimeTurnFrame &&
              weeklyTargetDispatcher === "create_one_shot_reminder"
          ? await (async (): Promise<OperationRuntimeResult | null> => {
            const pipeline = await runOperationRuntimePipeline({
              supabase,
              userId,
              userMessage,
              channel,
              userTimezone: userTime?.user_timezone ?? "Europe/Paris",
              history,
              tempMemory,
              state,
              planItemSnapshot: planItemSnapshot ?? [],
              turnFrame: targetRuntimeTurnFrame,
              routeDecision: targetRuntimeRouteDecision,
              safetyContextOutput,
              sourceMessageId: loggedMessageId,
              requestId: meta?.requestId ?? null,
              v2Runtime: v2Runtime ?? null,
              activeSkillState: null,
              activeOperationIntake: null,
              pendingOperationConfirmation: null,
              fullAiRequested: meta?.forceRealAi === true ||
                (opts?.messageMetadata as Record<string, unknown> | undefined)
                    ?.force_full_ai === true,
              clientNow: clientNow && Number.isFinite(clientNow.getTime())
                ? clientNow
                : null,
              enableAdjustPlanCoachGuidance:
                meta?.enableAdjustPlanCoachGuidance === true,
              runAdjustPlanItemOperation: maybeRunAdjustPlanItemOperation,
              guards: { isActiveCardDraftingOperation },
            });
            if (pipeline.statePatch) {
              state = {
                ...(state ?? {}),
                ...pipeline.statePatch,
              } as any;
            }
            return pipeline.operationRuntime;
          })()
          : null;
        const operationRuntime = targetRuntime ?? {
          content:
            "Je garde le relais local, mais ce dispatcher cible n'est pas encore disponible sur ce tour.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked" as const,
          executedTools: [],
          toolSkillRun: {
            selected_handler: weeklyTargetDispatcher,
            source_dispatcher_local: "weekly_adaptive_review.local_dispatcher",
            status: "blocked",
            reason_code: "weekly_review_local_handoff_target_unavailable",
            target_dispatcher: weeklyTargetDispatcher,
            note_information: targetNote,
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "weekly_adaptive_review_v1",
              reason_code: targetNote
                ? "local_handoff_target_unavailable"
                : "note_information_required",
            }],
            runtime_trace: [{
              component: "weekly_adaptive_review.local_dispatcher",
              event: "handoff_to_local_flow_target_unavailable",
              target_dispatcher: weeklyTargetDispatcher,
              global_dispatcher_skipped: true,
              note_information_present: Boolean(targetNote),
            }],
          },
        } satisfies OperationRuntimeResult;
        await trace(
          "brain:active_weekly_review_handoff_to_local_flow",
          "routing",
          {
            skipped_global_dispatcher: true,
            source_dispatcher_local: "weekly_adaptive_review.local_dispatcher",
            target_dispatcher: weeklyTargetDispatcher,
            note_information_present: Boolean(targetNote),
            local_runtime: weeklyRuntime.toolSkillRun,
            target_runtime: operationRuntime.toolSkillRun,
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
          operationRuntime,
          effectLedger,
          turnFrame: targetRuntimeTurnFrame ?? localTurnFrame,
          routeDecision: targetRuntimeRouteDecision,
          safetyContextOutput,
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
      if (localRuntimeReason === "weekly_review_safety_preempt") {
        tempMemory = weeklyRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "weekly_adaptive_review_v1",
          targetDispatcher: "safety_crisis",
          localRuntime: weeklyRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
        const safetyNote = noteInformationFromLocalExitMemo({
          tempMemory,
          sourceFlowId: "weekly_adaptive_review_v1",
        });
        tempMemory = clearLastLocalFlowExitContext(tempMemory);
        const safetyRouteDecision: RouteDecision = {
          route_version: "v1",
          response_owner: "safety",
          selected_handler: "safety_crisis",
          blocked_paths: [{
            path: "global_dispatcher",
            reason_code: "weekly_review_safety_preempt_skips_global_dispatcher",
          }],
          direct_effects_to_run: [],
          reason_code: "weekly_review_safety_preempt",
          memory_used_for_route: false,
          memory_item_ids_used_for_route: [],
          memory_use_kind: "none",
        };
        const safetyTurnFrame: TurnFrame = {
          ...localTurnFrame,
          note_information: safetyNote,
          skill_signals: {
            entry: {
              safety_crisis: {
                detected: true,
                confidence_band: "high",
                reason: "weekly_review_safety_preempt",
              },
            },
          },
        };
        const safetyOutput = await runConversationSkillForRecommendation({
          skillId: "safety_crisis",
          userId,
          userMessage,
          turnFrame: safetyTurnFrame,
          recentMessages: recentMessagesForTurnFrame,
          activeSkillState: null,
          planItemSnapshot: [],
          productSurfaces: [],
          explicitConstraints: [],
          routeDecision: safetyRouteDecision,
        });
        const safetyNextTempMemory = persistConversationSkillRoute(
          tempMemory,
          safetyRouteDecision,
          safetyOutput,
        );
        const operationRuntime: OperationRuntimeResult = {
          content: String(safetyOutput?.reply ?? "").trim(),
          nextTempMemory: safetyNextTempMemory,
          toolExecution: "none",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "safety_crisis",
            skill_id: "safety_crisis",
            status: safetyOutput?.status ?? "continue",
            reason_code: "weekly_review_safety_preempt",
            source_dispatcher_local: "weekly_adaptive_review.local_dispatcher",
            note_information: safetyNote,
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [],
            runtime_trace: [{
              component: "weekly_adaptive_review.local_dispatcher",
              event: "safety_preempt_handoff",
              target_dispatcher: "safety_crisis",
              global_dispatcher_skipped: true,
            }],
          },
        };
        await trace(
          "brain:active_weekly_review_safety_preempt",
          "routing",
          {
            skipped_global_dispatcher: true,
            source_dispatcher_local: "weekly_adaptive_review.local_dispatcher",
            target_dispatcher: "safety_crisis",
            note_information_present: Boolean(safetyNote),
          },
          "warn",
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state: { ...(state ?? {}), temp_memory: tempMemory } as any,
          activeSkillState: null,
          operationRuntime,
          effectLedger,
          turnFrame: safetyTurnFrame,
          routeDecision: safetyRouteDecision,
          safetyContextOutput,
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
      if (
        localRuntimeReason ===
          "weekly_review_local_exit_to_global_dispatcher"
      ) {
        tempMemory = weeklyRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "weekly_adaptive_review_v1",
          targetDispatcher: "global",
          localRuntime: weeklyRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
          safetyContextOutput,
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
        safetyContextOutput,
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
    let localRouteDecision: RouteDecision = {
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
    let localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      if (localRuntimeReason === "post_morning_nudge_safety_preempt") {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "post_morning_nudge",
          targetDispatcher: "safety_crisis",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
        const safetyNote = noteInformationFromLocalExitMemo({
          tempMemory,
          sourceFlowId: "post_morning_nudge",
        });
        tempMemory = clearLastLocalFlowExitContext(tempMemory);
        const safetyRouteDecision: RouteDecision = {
          route_version: "v1",
          response_owner: "safety",
          selected_handler: "safety_crisis",
          blocked_paths: [{
            path: "global_dispatcher",
            reason_code:
              "post_morning_nudge_safety_preempt_skips_global_dispatcher",
          }],
          direct_effects_to_run: [],
          reason_code: "post_morning_nudge_safety_preempt",
          memory_used_for_route: false,
          memory_item_ids_used_for_route: [],
          memory_use_kind: "none",
        };
        const safetyTurnFrame: TurnFrame = {
          ...localTurnFrame,
          note_information: safetyNote,
          skill_signals: {
            entry: {
              safety_crisis: {
                detected: true,
                confidence_band: "high",
                reason: "post_morning_nudge_safety_preempt",
              },
            },
          },
        };
        const safetyOutput = await runConversationSkillForRecommendation({
          skillId: "safety_crisis",
          userId,
          userMessage,
          turnFrame: safetyTurnFrame,
          recentMessages: recentMessagesForTurnFrame,
          activeSkillState: null,
          planItemSnapshot: [],
          productSurfaces: [],
          explicitConstraints: [],
          routeDecision: safetyRouteDecision,
        });
        const safetyNextTempMemory = persistConversationSkillRoute(
          tempMemory,
          safetyRouteDecision,
          safetyOutput,
        );
        const safetyOperationRuntime: OperationRuntimeResult = {
          content: String(safetyOutput?.reply ?? "").trim(),
          nextTempMemory: safetyNextTempMemory,
          toolExecution: "none",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "safety_crisis",
            skill_id: "safety_crisis",
            status: safetyOutput?.status ?? "continue",
            reason_code: "post_morning_nudge_safety_preempt",
            source_dispatcher_local: postMorningHandler,
            note_information: safetyNote,
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [],
            runtime_trace: [{
              component: postMorningHandler,
              event: "safety_preempt_handoff",
              target_dispatcher: "safety_crisis",
              global_dispatcher_skipped: true,
            }],
          },
        };
        await trace(
          "brain:active_post_morning_nudge_safety_preempt",
          "routing",
          {
            skipped_global_dispatcher: true,
            source_dispatcher_local: postMorningHandler,
            target_dispatcher: "safety_crisis",
            note_information_present: Boolean(safetyNote),
          },
          "warn",
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state: { ...(state ?? {}), temp_memory: tempMemory } as any,
          activeSkillState: null,
          operationRuntime: safetyOperationRuntime,
          effectLedger,
          turnFrame: safetyTurnFrame,
          routeDecision: safetyRouteDecision,
          safetyContextOutput,
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
      if (
        localRuntimeReason ===
          "post_morning_nudge_local_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "post_morning_nudge",
          targetDispatcher:
            (operationRuntime.toolSkillRun as any)?.flow_action ===
                "safety_preempt"
              ? "safety_crisis"
              : "global",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
            handoff_reason:
              (operationRuntime.toolSkillRun as any)?.local_handoff_note
                ?.reason ?? null,
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
          safetyContextOutput,
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
        safetyContextOutput,
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
  if (!activeLocalToolFlowOwnsTurn && hasActiveStatusRecapFlow(tempMemory)) {
    let localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: "status_recap",
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: "active_status_recap_uses_local_dispatcher",
      }],
      direct_effects_to_run: [],
      reason_code: "active_status_recap_local_dispatcher",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    let localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      skill_signals: {
        lifecycle: {
          status_recap: {
            detected: true,
            confidence_band: "high",
            reason: "active_status_recap_continue",
          },
        },
      },
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    const operationRuntime = await maybeRunStatusRecapRuntime({
      supabase,
      userId,
      userMessage,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame: localTurnFrame,
      routeDecision: localRouteDecision,
      activeOperationIntake: null,
      planItemSnapshot,
      history,
      requestId: meta?.requestId ?? null,
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "status_recap_local_exit_to_global_dispatcher" ||
        localRuntimeReason === "status_recap_safety_preempt"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "status_recap",
          targetDispatcher: localRuntimeReason === "status_recap_safety_preempt"
            ? "safety_crisis"
            : "global",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
          "brain:active_status_recap_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit: true,
            source_dispatcher_local: "status_recap.local_dispatcher",
            flow_action: (operationRuntime.toolSkillRun as any)?.flow_action ??
              null,
            "visible_task.kind":
              (operationRuntime.toolSkillRun as any)?.visible_task ?? null,
            exit_to_global_dispatcher: true,
            note_information_created: true,
            global_dispatcher_second_pass_after_local_exit: true,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
      } else {
        await trace(
          "brain:active_status_recap_local_dispatcher",
          "routing",
          {
            global_dispatcher_skipped_due_status_recap: true,
            skipped_global_dispatcher: true,
            source_dispatcher_local: "status_recap.local_dispatcher",
            flow_action: (operationRuntime.toolSkillRun as any)?.flow_action ??
              null,
            "visible_task.kind":
              (operationRuntime.toolSkillRun as any)?.visible_task ?? null,
            reason_code: (operationRuntime.toolSkillRun as any)?.reason_code ??
              null,
            toolExecution: operationRuntime.toolExecution,
            executedTools: operationRuntime.executedTools,
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
          operationRuntime,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          safetyContextOutput,
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
        "brain:active_status_recap_local_runtime_null",
        "routing",
        {
          global_dispatcher_skipped_due_status_recap: true,
          skipped_global_dispatcher: true,
          source_dispatcher_local: "status_recap.local_dispatcher",
          reason_code: "active_status_recap_local_runtime_null",
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
            "Je garde le point d'état en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "status_recap",
            skill_id: "status_recap",
            status: "blocked",
            reason_code: "active_status_recap_local_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code: "active_status_recap_local_runtime_null",
            }],
            runtime_trace: [{
              component: "status_recap",
              event: "local_runtime_null",
              global_dispatcher_skipped: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        safetyContextOutput,
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
  if (
    !activeLocalToolFlowOwnsTurn &&
    String((activeSkillState as any)?.skill_id ?? "").trim() ===
      "emotional_repair"
  ) {
    let localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: "emotional_repair",
      blocked_paths: [{
        path: "global_dispatcher",
        reason_code: "active_emotional_repair_uses_local_dispatcher",
      }],
      direct_effects_to_run: [],
      reason_code: "active_emotional_repair_local_dispatcher",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    };
    let localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      flow_opportunity: null,
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    const skillOutput = await runConversationSkillForRecommendation({
      skillId: "emotional_repair",
      userId,
      userMessage,
      turnFrame: localTurnFrame,
      recentMessages: recentMessagesForTurnFrame,
      activeSkillState,
      planItemSnapshot: planItemSnapshot ?? [],
      productSurfaces: [],
      explicitConstraints: [],
    });
    if (skillOutput?.status === "exit") {
      tempMemory = persistConversationSkillRoute(
        tempMemory,
        localRouteDecision,
        skillOutput,
      );
      tempMemory = attachNoteInformationToLocalExitMemo({
        tempMemory,
        sourceFlowId: "emotional_repair",
        targetDispatcher: "global",
        localRuntime: {
          skill_id: "emotional_repair",
          status: skillOutput.status,
          reason_code: (skillOutput.diagnosis as any)?.reason_code ??
            "emotional_repair_exit_to_global_dispatcher",
          flow_action: (skillOutput.diagnosis as any)?.flow_action ??
            "exit_to_global_dispatcher",
          exit_memo: (skillOutput.state_patch as any)
            ?.emotional_repair_exit_memo ?? null,
        },
        requestId: meta?.requestId ?? null,
        userMessage,
      });
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
        "brain:active_emotional_repair_local_exit_to_global_dispatcher",
        "routing",
        {
          skipped_global_dispatcher_before_local: true,
          same_user_message_rerouted_to_global_after_local_exit: true,
          source_dispatcher_local: "emotional_repair.local_dispatcher",
          flow_action: (skillOutput.diagnosis as any)?.flow_action ?? null,
          "visible_task.kind": (skillOutput.diagnosis as any)?.visible_task ??
            null,
          exit_to_global_dispatcher: true,
          local_runtime: skillOutput.diagnosis ?? {},
        },
        "info",
      );
    } else {
      const nextTempMemory = persistConversationSkillRoute(
        tempMemory,
        localRouteDecision,
        skillOutput,
      );
      const safetyHandoff =
        (skillOutput?.state_patch as any)?.emotional_repair_safety_handoff ??
          null;
      if (safetyHandoff) {
        const safetyRouteDecision: RouteDecision = {
          route_version: "v1",
          response_owner: "safety",
          selected_handler: "safety_crisis",
          blocked_paths: [{
            path: "emotional_repair",
            reason_code: "emotional_repair_safety_preempt",
          }],
          direct_effects_to_run: [],
          reason_code: "emotional_repair_safety_preempt",
          memory_used_for_route: false,
          memory_item_ids_used_for_route: [],
          memory_use_kind: "none",
        };
        const safetyOutput = await runConversationSkillForRecommendation({
          skillId: "safety_crisis",
          userId,
          userMessage,
          turnFrame: localTurnFrame,
          recentMessages: recentMessagesForTurnFrame,
          activeSkillState: (nextTempMemory as any).__active_skill_state ??
            null,
          planItemSnapshot: [],
          productSurfaces: [],
          explicitConstraints: [],
        });
        const safetyNextTempMemory = persistConversationSkillRoute(
          nextTempMemory,
          safetyRouteDecision,
          safetyOutput,
        );
        const safetyOperationRuntime: OperationRuntimeResult = {
          content: String(safetyOutput?.reply ?? "").trim() ||
            "",
          nextTempMemory: safetyNextTempMemory,
          toolExecution: "none",
          executedTools: [],
          toolSkillRun: {
            skill_id: "safety_crisis",
            mode: "local_safety_flow",
            status: safetyOutput?.status ?? "continue",
            response_intent: safetyOutput?.response_intent ?? null,
            reason_code: "emotional_repair_safety_preempt",
            source_dispatcher_local: "safety_crisis.local_dispatcher",
            note_information:
              (safetyHandoff as Record<string, unknown>).note_information ??
                null,
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: skillOutput?.effects?.blocked ?? [],
            runtime_trace: [{
              component: "emotional_repair",
              event: "safety_preempt_handoff",
              target_dispatcher: "safety_crisis",
              global_dispatcher_skipped: true,
            }],
          },
        };
        await trace(
          "brain:active_emotional_repair_safety_preempt",
          "routing",
          {
            skipped_global_dispatcher: true,
            source_dispatcher_local: "emotional_repair.local_dispatcher",
            target_dispatcher: "safety_crisis",
            note_information_present: Boolean(
              (safetyHandoff as Record<string, unknown>).note_information,
            ),
          },
          "warn",
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState: (nextTempMemory as any).__active_skill_state ??
            null,
          operationRuntime: safetyOperationRuntime,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: safetyRouteDecision,
          safetyContextOutput,
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
      const content = String(skillOutput?.reply ?? "").trim();
      const emotionalRepairDiagnosis =
        (skillOutput?.diagnosis as Record<string, unknown> | null) ?? {};
      const operationRuntime: OperationRuntimeResult = {
        content,
        nextTempMemory,
        toolExecution: safetyHandoff ? "blocked" : "none",
        executedTools: [],
        toolSkillRun: {
          skill_id: "emotional_repair",
          mode: "conversation_skill_local_flow",
          status: skillOutput?.status ?? "blocked",
          response_intent: skillOutput?.response_intent ?? null,
          flow_action: (skillOutput?.diagnosis as any)?.flow_action ?? null,
          visible_task: (skillOutput?.diagnosis as any)?.visible_task ?? null,
          potion_bridge_direct_handoff:
            emotionalRepairDiagnosis.potion_bridge_direct_handoff ?? null,
          potion_bridge_selected_potion:
            emotionalRepairDiagnosis.potion_bridge_selected_potion ?? null,
          potion_bridge_durable_need_kind:
            emotionalRepairDiagnosis.potion_bridge_durable_need_kind ?? null,
          potion_bridge_candidate_potions:
            emotionalRepairDiagnosis.potion_bridge_candidate_potions ?? [],
          repair_emotional_dominance:
            emotionalRepairDiagnosis.repair_emotional_dominance ?? null,
          repair_stabilized_enough_for_tool:
            emotionalRepairDiagnosis.repair_stabilized_enough_for_tool ?? null,
          state_mutation_audit: emotionalRepairDiagnosis.state_mutation_audit ??
            null,
          reason_code: (skillOutput?.diagnosis as any)?.reason_code ??
            (safetyHandoff
              ? "emotional_repair_safety_preempt"
              : "active_emotional_repair_local_dispatcher"),
          global_dispatcher_skipped: true,
          source_dispatcher_local: "emotional_repair.local_dispatcher",
          requested_effects: skillOutput?.effects?.requested ?? [],
          allowed_effects: skillOutput?.effects?.allowed ?? [],
          committed_effects: skillOutput?.effects?.committed ?? [],
          blocked_effects: skillOutput?.effects?.blocked ?? [],
          runtime_trace: [{
            component: "emotional_repair",
            event: "local_dispatcher_turn",
            global_dispatcher_skipped: true,
            safety_handoff: Boolean(safetyHandoff),
          }],
        },
      };
      await trace(
        "brain:active_emotional_repair_local_dispatcher",
        "routing",
        {
          skipped_global_dispatcher: true,
          source_dispatcher_local: "emotional_repair.local_dispatcher",
          flow_action: (skillOutput?.diagnosis as any)?.flow_action ?? null,
          "visible_task.kind": (skillOutput?.diagnosis as any)?.visible_task ??
            null,
          reason_code: (skillOutput?.diagnosis as any)?.reason_code ??
            operationRuntime.toolSkillRun.reason_code,
          safety_handoff: Boolean(safetyHandoff),
        },
        safetyHandoff ? "warn" : "info",
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
        safetyContextOutput,
        weeklyReviewStateForTurn: null,
        dispatcherSignals: DEFAULT_SIGNALS,
        dispatcherV2Stats,
        dispatcherLatencyMs: 0,
        targetMode: "companion",
        riskScore: Number((skillOutput?.diagnosis as any)?.risk_score ?? 0) ||
          0,
        loggedMessageId,
        requestId: meta?.requestId ?? null,
        messageMetadata: opts?.messageMetadata,
        logMessages,
        turnStartMs,
        trace,
      });
    }
  }
  if (
    !activeLocalToolFlowOwnsTurn && hasActiveFlowOpportunityState(tempMemory)
  ) {
    let localRouteDecision: RouteDecision = {
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
    let localTurnFrame: TurnFrame = {
      turn_id: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
      source_message_id: loggedMessageId ?? meta?.requestId ??
        crypto.randomUUID(),
      user_id: userId,
      channel,
      safety: {
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      flow_opportunity: null,
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    const localDirectEffectLane = await runDirectEffectLane({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      history,
      tempMemory,
      state,
      planItemSnapshot,
      turnFrame: localTurnFrame,
      routeDecision: localRouteDecision,
      safetyContextOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      v2Runtime: v2Runtime ?? null,
      activeSkillState,
      activeOperationIntake,
      pendingOperationConfirmation,
      trackProgressBlockedReasonCode: attackKeywordContextOverride
        ? "attack_keyword_trigger_is_not_completion"
        : null,
      fullAiRequested: meta?.forceRealAi === true ||
        (opts?.messageMetadata as Record<string, unknown> | undefined)
            ?.force_full_ai === true,
      clientNow: clientNow && Number.isFinite(clientNow.getTime())
        ? clientNow
        : null,
      enableAdjustPlanCoachGuidance:
        meta?.enableAdjustPlanCoachGuidance === true,
      runAdjustPlanItemOperation: maybeRunAdjustPlanItemOperation,
      guards: {
        isActiveCardDraftingOperation,
      },
      allowMessageIntakeFallback: true,
    });
    localRouteDecision = (localDirectEffectLane.routeDecision ??
      localRouteDecision) as RouteDecision;
    localTurnFrame = turnFrameWithDirectEffectRuntime(
      localDirectEffectLane.turnFrame ?? localTurnFrame,
      localDirectEffectLane.operationRuntime,
    ) as TurnFrame;
    if (localDirectEffectLane.operationRuntime) {
      await trace(
        "brain:direct_effect_lane.before_active_flow_opportunity",
        "routing",
        {
          selected_handler: localDirectEffectLane.operationRuntime.toolSkillRun
            .selected_handler ?? null,
          tool_execution: localDirectEffectLane.operationRuntime.toolExecution,
          executed_tools: localDirectEffectLane.operationRuntime.executedTools,
          committed_effects: Array.isArray(
              localDirectEffectLane.operationRuntime.toolSkillRun
                .committed_effects,
            )
            ? (localDirectEffectLane.operationRuntime.toolSkillRun
              .committed_effects as unknown[]).length
            : 0,
          blocked_effects: Array.isArray(
              localDirectEffectLane.operationRuntime.toolSkillRun
                .blocked_effects,
            )
            ? (localDirectEffectLane.operationRuntime.toolSkillRun
              .blocked_effects as unknown[]).length
            : 0,
        },
        "info",
      );
    }
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
      safetyContextOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
    });
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason === "flow_opportunity_verification_safety_preempt"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "flow_opportunity_verification",
          targetDispatcher: "safety_crisis",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
        const safetyNote = noteInformationFromLocalExitMemo({
          tempMemory,
          sourceFlowId: "flow_opportunity_verification",
        });
        tempMemory = clearLastLocalFlowExitContext(tempMemory);
        const safetyRouteDecision: RouteDecision = {
          route_version: "v1",
          response_owner: "safety",
          selected_handler: "safety_crisis",
          blocked_paths: [{
            path: "global_dispatcher",
            reason_code:
              "flow_opportunity_verification_safety_preempt_skips_global_dispatcher",
          }],
          direct_effects_to_run: [],
          reason_code: "flow_opportunity_verification_safety_preempt",
          memory_used_for_route: false,
          memory_item_ids_used_for_route: [],
          memory_use_kind: "none",
        };
        const safetyTurnFrame: TurnFrame = {
          ...localTurnFrame,
          note_information: safetyNote,
          skill_signals: {
            entry: {
              safety_crisis: {
                detected: true,
                confidence_band: "high",
                reason: "flow_opportunity_verification_safety_preempt",
              },
            },
          },
        };
        const safetyOutput = await runConversationSkillForRecommendation({
          skillId: "safety_crisis",
          userId,
          userMessage,
          turnFrame: safetyTurnFrame,
          recentMessages: recentMessagesForTurnFrame,
          activeSkillState: null,
          planItemSnapshot: [],
          productSurfaces: [],
          explicitConstraints: [],
          routeDecision: safetyRouteDecision,
        });
        const safetyNextTempMemory = persistConversationSkillRoute(
          tempMemory,
          safetyRouteDecision,
          safetyOutput,
        );
        const safetyOperationRuntime: OperationRuntimeResult = {
          content: String(safetyOutput?.reply ?? "").trim(),
          nextTempMemory: safetyNextTempMemory,
          toolExecution: "none",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "safety_crisis",
            skill_id: "safety_crisis",
            status: safetyOutput?.status ?? "continue",
            reason_code: "flow_opportunity_verification_safety_preempt",
            source_dispatcher_local:
              "flow_opportunity_verification.local_dispatcher",
            note_information: safetyNote,
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [],
            runtime_trace: [{
              component: "flow_opportunity_verification.local_dispatcher",
              event: "safety_preempt_handoff",
              target_dispatcher: "safety_crisis",
              global_dispatcher_skipped: true,
            }],
          },
        };
        await trace(
          "brain:flow_opportunity_verification.safety_preempt",
          "routing",
          {
            skipped_global_dispatcher: true,
            source_dispatcher_local:
              "flow_opportunity_verification.local_dispatcher",
            target_dispatcher: "safety_crisis",
            note_information_present: Boolean(safetyNote),
          },
          "warn",
        );
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state: { ...(state ?? {}), temp_memory: tempMemory } as any,
          activeSkillState: null,
          operationRuntime: mergeDirectEffectRuntimeIntoVisibleRuntime({
            directRuntime: localDirectEffectLane.operationRuntime,
            visibleRuntime: safetyOperationRuntime,
          })!,
          effectLedger,
          turnFrame: safetyTurnFrame,
          routeDecision: safetyRouteDecision,
          safetyContextOutput,
          weeklyReviewStateForTurn: null,
          dispatcherSignals: DEFAULT_SIGNALS,
          dispatcherV2Stats,
          dispatcherLatencyMs: 0,
          targetMode: "companion",
          riskScore: 10,
          loggedMessageId,
          requestId: meta?.requestId ?? null,
          messageMetadata: opts?.messageMetadata,
          logMessages,
          turnStartMs,
          trace,
        });
      }
      if (
        localRuntimeReason ===
          "flow_opportunity_verification_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "flow_opportunity_verification",
          targetDispatcher: "global",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
            target_dispatcher: "global",
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
          operationRuntime: mergeDirectEffectRuntimeIntoVisibleRuntime({
            directRuntime: localDirectEffectLane.operationRuntime,
            visibleRuntime: operationRuntime,
          })!,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          safetyContextOutput,
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
    } else if (localDirectEffectLane.operationRuntime) {
      await trace(
        "brain:flow_opportunity_verification.local_runtime_null_direct_effect_returned",
        "routing",
        {
          global_dispatcher_skipped_due_flow_opportunity_verification: true,
          direct_effect_lane_returned: true,
          selected_handler: localDirectEffectLane.operationRuntime.toolSkillRun
            .selected_handler ?? null,
        },
        "warn",
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
        operationRuntime: localDirectEffectLane.operationRuntime,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        safetyContextOutput,
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
    } else {
      await trace(
        "brain:flow_opportunity_verification.local_runtime_null",
        "routing",
        {
          global_dispatcher_skipped_due_flow_opportunity_verification: true,
          skipped_global_dispatcher: true,
          source_dispatcher_local: "flow_opportunity_verification",
          reason_code: "active_flow_opportunity_verification_runtime_null",
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
            "Je garde la vérification en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "flow_opportunity_verification",
            skill_id: "flow_opportunity_verification",
            status: "blocked",
            reason_code: "active_flow_opportunity_verification_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code: "active_flow_opportunity_verification_runtime_null",
            }],
            runtime_trace: [{
              component: "flow_opportunity_verification",
              event: "local_runtime_null",
              global_dispatcher_skipped: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        safetyContextOutput,
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
  if (
    activeLocalToolFlowOwnsTurn &&
    activeLocalFlowOperationType === "create_recurring_reminder"
  ) {
    const localRouteDecision: RouteDecision = {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "create_recurring_reminder",
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
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
        operation_type: "create_recurring_reminder",
        confidence_band: "high",
        explicitness: "implied",
        user_intent: "create",
        ambiguity: "none",
      }],
      skill_signals: {},
      memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
    };
    let continueToGlobalAfterLocalExit = false;
    let operationRuntime: CreateRecurringReminderRuntimeResult | null = null;
    try {
      operationRuntime = await maybeRunCreateRecurringReminderOperation({
        supabase,
        userId,
        userMessage,
        channel,
        userTimezone: userTime?.user_timezone ?? "Europe/Paris",
        tempMemory,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        safetyContextOutput,
        sourceMessageId: loggedMessageId,
        requestId: meta?.requestId ?? null,
        history,
        v2Runtime: v2Runtime ?? null,
        planItemSnapshot: planItemSnapshot ?? null,
      });
    } catch (error) {
      const errorInfo = {
        name: String((error as any)?.name ?? "Error"),
        message: String((error as any)?.message ?? error ?? "unknown"),
        stack: String((error as any)?.stack ?? "").slice(0, 1800) || null,
      };
      await trace(
        "brain:active_create_recurring_reminder_local_runtime_exception",
        "routing",
        {
          skipped_global_dispatcher: true,
          active_operation_type: activeLocalFlowOperationType,
          active_handler: activeLocalFlowHandler,
          reason_code:
            "active_create_recurring_reminder_local_runtime_exception",
          error: errorInfo,
        },
        "error",
      );
      operationRuntime = {
        content:
          "Je garde le rappel récurrent en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
        nextTempMemory: tempMemory,
        toolExecution: "blocked",
        executedTools: [],
        committedEffects: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          operation_type: "create_recurring_reminder",
          mode: "local_write_flow",
          status: "blocked",
          reason_code:
            "active_create_recurring_reminder_local_runtime_exception",
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [{
            type: "local_flow_runtime",
            reason_code:
              "active_create_recurring_reminder_local_runtime_exception",
            diagnostic: errorInfo,
          }],
          runtime_trace: [{
            component: "create_recurring_reminder",
            event: "local_runtime_exception",
            global_dispatcher_skipped: true,
            error: errorInfo,
          }],
        },
      } as any;
    }
    if (operationRuntime) {
      const localRuntimeReason = String(
        (operationRuntime.toolSkillRun as any)?.reason_code ?? "",
      );
      if (
        localRuntimeReason ===
          "create_recurring_reminder_exit_to_global_dispatcher"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "create_recurring_reminder",
          targetDispatcher: "global",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
          "brain:active_create_recurring_reminder_local_exit_to_global_dispatcher",
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
          "brain:active_create_recurring_reminder_local_dispatcher",
          "routing",
          {
            skipped_global_dispatcher: true,
            active_operation_type: activeLocalFlowOperationType,
            active_handler: activeLocalFlowHandler,
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
          operationRuntime,
          effectLedger,
          turnFrame: localTurnFrame,
          routeDecision: localRouteDecision,
          safetyContextOutput,
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
    } else {
      await trace(
        "brain:active_create_recurring_reminder_local_runtime_null",
        "routing",
        {
          global_dispatcher_skipped: true,
          skipped_global_dispatcher: true,
          active_operation_type: activeLocalFlowOperationType,
          active_handler: activeLocalFlowHandler,
          reason_code: "active_create_recurring_reminder_local_runtime_null",
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
            "Je garde le rappel récurrent en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "create_recurring_reminder",
            operation_type: "create_recurring_reminder",
            mode: "local_write_flow",
            status: "blocked",
            reason_code: "active_create_recurring_reminder_local_runtime_null",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code:
                "active_create_recurring_reminder_local_runtime_null",
            }],
            runtime_trace: [{
              component: "create_recurring_reminder",
              event: "local_runtime_null",
              global_dispatcher_skipped: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        safetyContextOutput,
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
    if (!continueToGlobalAfterLocalExit) {
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
            "Je garde le rappel récurrent en cours, mais je n'arrive pas à produire la suite locale correctement. Réessaie dans un instant.",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "create_recurring_reminder",
            operation_type: "create_recurring_reminder",
            mode: "local_write_flow",
            status: "blocked",
            reason_code:
              "active_create_recurring_reminder_local_runtime_incomplete",
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [{
              type: "local_flow_runtime",
              reason_code:
                "active_create_recurring_reminder_local_runtime_incomplete",
            }],
            runtime_trace: [{
              component: "create_recurring_reminder",
              event: "local_runtime_incomplete",
              global_dispatcher_skipped: true,
            }],
          },
        } as any,
        effectLedger,
        turnFrame: localTurnFrame,
        routeDecision: localRouteDecision,
        safetyContextOutput,
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
  if (
    activeLocalToolFlowOwnsTurn &&
    activeLocalFlowOperationType === "adjust_plan_item"
  ) {
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
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      safetyContextOutput,
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
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "adjust_plan_item",
          targetDispatcher: "global",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
          safetyContextOutput,
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
        safetyContextOutput,
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
  if (
    activeLocalToolFlowOwnsTurn &&
    activeLocalFlowOperationType === "prepare_attack_card"
  ) {
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
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      safetyContextOutput,
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
          "prepare_attack_card_local_exit_to_global_dispatcher" ||
        localRuntimeReason === "prepare_attack_card_local_safety_preempt" ||
        localRuntimeReason === "prepare_attack_card_handoff_to_local_flow"
      ) {
        const localNote = (operationRuntime.toolSkillRun as any)
          ?.note_information ??
          (operationRuntime.toolSkillRun as any)?.exit_memo?.note_information ??
          null;
        const targetDispatcher: NoteInformationTargetDispatcher =
          localRuntimeReason === "prepare_attack_card_local_safety_preempt"
            ? "safety_crisis"
            : runtimeTargetDispatcher(localNote?.target_dispatcher, "global");
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "prepare_attack_card",
          targetDispatcher: targetDispatcher as any,
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
          localRuntimeReason === "prepare_attack_card_local_safety_preempt"
            ? "brain:active_prepare_attack_card_local_safety_preempt"
            : localRuntimeReason === "prepare_attack_card_handoff_to_local_flow"
            ? "brain:active_prepare_attack_card_handoff_to_local_flow"
            : "brain:active_prepare_attack_card_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit:
              targetDispatcher === "global",
            target_dispatcher: targetDispatcher,
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
        if (targetDispatcher === "global") {
          continueToGlobalAfterLocalExit = true;
        } else {
          const targetNote = noteInformationFromLocalExitMemo({
            tempMemory,
            sourceFlowId: "prepare_attack_card",
          }) ??
            (Object.keys(runtimeRecord(localNote)).length
              ? localNote as NoteInformation
              : null);
          tempMemory = clearLastLocalFlowExitContext(tempMemory);
          state = { ...(state ?? {}), temp_memory: tempMemory } as any;
          const targetRouteDecision: RouteDecision =
            targetDispatcher === "safety_crisis"
              ? {
                route_version: "v1",
                response_owner: "safety",
                selected_handler: "safety_crisis",
                blocked_paths: [{
                  path: "global_dispatcher",
                  reason_code:
                    "prepare_attack_card_safety_preempt_skips_global_dispatcher",
                }],
                direct_effects_to_run: [],
                reason_code: "prepare_attack_card_safety_preempt",
                memory_used_for_route: false,
                memory_item_ids_used_for_route: [],
                memory_use_kind: "none",
              }
              : targetDispatcher === "product_help"
              ? {
                route_version: "v1",
                response_owner: "product_help",
                selected_handler: "product_help",
                blocked_paths: [{
                  path: "global_dispatcher",
                  reason_code:
                    "prepare_attack_card_handoff_to_product_help_skips_global_dispatcher",
                }],
                direct_effects_to_run: [],
                reason_code: "prepare_attack_card_handoff_to_product_help",
                memory_used_for_route: false,
                memory_item_ids_used_for_route: [],
                memory_use_kind: "none",
              }
              : targetDispatcher === "status_recap"
              ? {
                route_version: "v1",
                response_owner: "conversation_handler",
                selected_handler: "status_recap",
                blocked_paths: [{
                  path: "global_dispatcher",
                  reason_code:
                    "prepare_attack_card_handoff_to_status_recap_skips_global_dispatcher",
                }],
                direct_effects_to_run: [],
                reason_code: "prepare_attack_card_handoff_to_status_recap",
                memory_used_for_route: false,
                memory_item_ids_used_for_route: [],
                memory_use_kind: "none",
              }
              : buildLocalToolHandoffRouteDecision({
                sourceFlowId: "prepare_attack_card",
                targetDispatcher,
              });
          const targetTurnFrame = targetNote
            ? buildLocalToolHandoffTurnFrame({
              turnId: meta?.requestId ?? loggedMessageId ??
                crypto.randomUUID(),
              sourceMessageId: loggedMessageId ?? meta?.requestId ??
                crypto.randomUUID(),
              userId,
              channel,
              safetyContextOutput,
              conversationRiskHistory: conversationRiskHistoryForPersist,
              targetDispatcher,
              noteInformation: targetNote,
            })
            : {
              ...localTurnFrame,
              note_information: null,
            };
          const targetRuntime = targetDispatcher === "safety_crisis"
            ? await (async (): Promise<OperationRuntimeResult> => {
              const safetyOutput = await runConversationSkillForRecommendation({
                skillId: "safety_crisis",
                userId,
                userMessage,
                turnFrame: targetTurnFrame,
                recentMessages: recentMessagesForTurnFrame,
                activeSkillState: null,
                planItemSnapshot: [],
                productSurfaces: [],
                explicitConstraints: [],
                routeDecision: targetRouteDecision,
              });
              const safetyNextTempMemory = persistConversationSkillRoute(
                tempMemory,
                targetRouteDecision,
                safetyOutput,
              );
              return {
                content: String(safetyOutput?.reply ?? "").trim(),
                nextTempMemory: safetyNextTempMemory,
                toolExecution: "none",
                executedTools: [],
                toolSkillRun: {
                  selected_handler: "safety_crisis",
                  skill_id: "safety_crisis",
                  status: safetyOutput?.status ?? "continue",
                  reason_code: "prepare_attack_card_safety_preempt",
                  source_dispatcher_local:
                    "prepare_attack_card.local_dispatcher",
                  note_information: targetNote,
                  requested_effects: [],
                  allowed_effects: [],
                  committed_effects: [],
                  blocked_effects: [],
                  runtime_trace: [{
                    component: "prepare_attack_card.local_dispatcher",
                    event: "safety_preempt_handoff",
                    target_dispatcher: "safety_crisis",
                    global_dispatcher_skipped: true,
                    note_information_present: Boolean(targetNote),
                  }],
                },
              };
            })()
            : targetDispatcher === "prepare_defense_card"
            ? await maybeRunPrepareDefenseCardOperation({
              supabase,
              userId,
              userMessage,
              channel,
              userTimezone: userTime?.user_timezone ?? "Europe/Paris",
              tempMemory,
              turnFrame: targetTurnFrame,
              routeDecision: targetRouteDecision,
              safetyContextOutput,
              sourceMessageId: loggedMessageId,
              requestId: meta?.requestId ?? null,
              history,
              planSnapshot: { items: planItemSnapshot ?? [] },
            })
            : targetDispatcher === "status_recap"
            ? await maybeRunStatusRecapRuntime({
              supabase,
              userId,
              userMessage,
              userTimezone: userTime?.user_timezone ?? "Europe/Paris",
              tempMemory,
              turnFrame: targetTurnFrame,
              routeDecision: targetRouteDecision,
              activeOperationIntake: null,
              planItemSnapshot,
              history,
              requestId: meta?.requestId ?? null,
            })
            : targetDispatcher === "product_help"
            ? await (async (): Promise<OperationRuntimeResult> => {
              const productOutput = await runConversationSkillForRecommendation(
                {
                  skillId: "product_help",
                  userId,
                  userMessage,
                  turnFrame: targetTurnFrame,
                  recentMessages: recentMessagesForTurnFrame,
                  activeSkillState: null,
                  planItemSnapshot: planItemSnapshot ?? [],
                  productSurfaces: [],
                  explicitConstraints: [],
                  routeDecision: targetRouteDecision,
                },
              );
              const productNextTempMemory = persistConversationSkillRoute(
                tempMemory,
                targetRouteDecision,
                productOutput,
              );
              return {
                content: String(productOutput?.reply ?? "").trim(),
                nextTempMemory: productNextTempMemory,
                toolExecution: "none",
                executedTools: [],
                toolSkillRun: {
                  selected_handler: "product_help",
                  skill_id: "product_help",
                  status: productOutput?.status ?? "continue",
                  reason_code: "prepare_attack_card_handoff_to_product_help",
                  source_dispatcher_local:
                    "prepare_attack_card.local_dispatcher",
                  note_information: targetNote,
                  requested_effects: [],
                  allowed_effects: [],
                  committed_effects: [],
                  blocked_effects: [],
                  runtime_trace: [{
                    component: "prepare_attack_card.local_dispatcher",
                    event: "handoff_to_product_help",
                    target_dispatcher: "product_help",
                    global_dispatcher_skipped: true,
                    note_information_present: Boolean(targetNote),
                  }],
                },
              };
            })()
            : targetDispatcher === "select_state_potion"
            ? await runSelectStatePotionHandoffSkill({
              supabase,
              userId,
              userMessage,
              channel,
              userTimezone: userTime?.user_timezone ?? "Europe/Paris",
              tempMemory,
              turnFrame: targetTurnFrame,
              routeDecision: targetRouteDecision,
              safetyContextOutput,
              sourceMessageId: loggedMessageId,
              requestId: meta?.requestId ?? null,
              history,
            })
            : null;
          const operationRuntimeForTarget = targetRuntime ?? {
            content: "",
            nextTempMemory: tempMemory,
            toolExecution: "blocked" as const,
            executedTools: [],
            toolSkillRun: {
              selected_handler: targetDispatcher,
              source_dispatcher_local: "prepare_attack_card.local_dispatcher",
              status: "blocked",
              reason_code:
                "prepare_attack_card_local_handoff_target_unavailable",
              target_dispatcher: targetDispatcher,
              note_information: targetNote,
              requested_effects: [],
              allowed_effects: [],
              committed_effects: [],
              blocked_effects: [{
                type: "prepare_attack_card",
                reason_code: targetNote
                  ? "local_handoff_target_unavailable"
                  : "note_information_required",
              }],
              runtime_trace: [{
                component: "prepare_attack_card.local_dispatcher",
                event: "handoff_to_local_flow_target_unavailable",
                target_dispatcher: targetDispatcher,
                global_dispatcher_skipped: true,
                note_information_present: Boolean(targetNote),
              }],
            },
          } satisfies OperationRuntimeResult;
          await trace(
            targetDispatcher === "safety_crisis"
              ? "brain:active_prepare_attack_card_safety_preempt_handoff"
              : "brain:active_prepare_attack_card_handoff_to_local_flow_target",
            "routing",
            {
              skipped_global_dispatcher: true,
              source_dispatcher_local: "prepare_attack_card.local_dispatcher",
              target_dispatcher: targetDispatcher,
              note_information_present: Boolean(targetNote),
              target_runtime: operationRuntimeForTarget.toolSkillRun,
            },
            targetDispatcher === "safety_crisis" ? "warn" : "info",
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
            operationRuntime: operationRuntimeForTarget as any,
            effectLedger,
            turnFrame: targetTurnFrame,
            routeDecision: targetRouteDecision,
            safetyContextOutput,
            weeklyReviewStateForTurn: null,
            dispatcherSignals: DEFAULT_SIGNALS,
            dispatcherV2Stats,
            dispatcherLatencyMs: 0,
            targetMode: "companion",
            riskScore: targetDispatcher === "safety_crisis" ? 10 : 0,
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
          safetyContextOutput,
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
        safetyContextOutput,
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
  if (
    activeLocalToolFlowOwnsTurn &&
    activeLocalFlowOperationType === "prepare_defense_card"
  ) {
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
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      safetyContextOutput,
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
          "prepare_defense_card_local_exit_to_global_dispatcher" ||
        localRuntimeReason === "prepare_defense_card_local_safety_preempt"
      ) {
        tempMemory = operationRuntime.nextTempMemory ?? tempMemory;
        const targetDispatcher =
          localRuntimeReason === "prepare_defense_card_local_safety_preempt"
            ? "safety_crisis"
            : "global";
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "prepare_defense_card",
          targetDispatcher,
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
          targetDispatcher === "safety_crisis"
            ? "brain:active_prepare_defense_card_local_safety_preempt"
            : "brain:active_prepare_defense_card_local_exit_to_global_dispatcher",
          "routing",
          {
            skipped_global_dispatcher_before_local: true,
            same_user_message_rerouted_to_global_after_local_exit:
              targetDispatcher === "global",
            same_user_message_handoff_to_local_dispatcher: false,
            same_user_message_handoff_to_safety:
              targetDispatcher === "safety_crisis",
            local_runtime: operationRuntime.toolSkillRun,
          },
          "info",
        );
        if (targetDispatcher === "safety_crisis") {
          const safetyNote = noteInformationFromLocalExitMemo({
            tempMemory,
            sourceFlowId: "prepare_defense_card",
          }) ??
            ((operationRuntime.toolSkillRun as any)?.note_information ??
              (operationRuntime.toolSkillRun as any)?.exit_memo
                ?.note_information ??
              null);
          tempMemory = clearLastLocalFlowExitContext(tempMemory);
          state = { ...(state ?? {}), temp_memory: tempMemory } as any;
          const safetyRouteDecision: RouteDecision = {
            route_version: "v1",
            response_owner: "safety",
            selected_handler: "safety_crisis",
            blocked_paths: [{
              path: "global_dispatcher",
              reason_code:
                "prepare_defense_card_safety_preempt_skips_global_dispatcher",
            }],
            direct_effects_to_run: [],
            reason_code: "prepare_defense_card_safety_preempt",
            memory_used_for_route: false,
            memory_item_ids_used_for_route: [],
            memory_use_kind: "none",
          };
          const safetyTurnFrame = safetyNote
            ? buildLocalToolHandoffTurnFrame({
              turnId: meta?.requestId ?? loggedMessageId ??
                crypto.randomUUID(),
              sourceMessageId: loggedMessageId ?? meta?.requestId ??
                crypto.randomUUID(),
              userId,
              channel,
              safetyContextOutput,
              conversationRiskHistory: conversationRiskHistoryForPersist,
              targetDispatcher: "safety_crisis",
              noteInformation: safetyNote as NoteInformation,
            })
            : localTurnFrame;
          const safetyOutput = await runConversationSkillForRecommendation({
            skillId: "safety_crisis",
            userId,
            userMessage,
            turnFrame: safetyTurnFrame,
            recentMessages: recentMessagesForTurnFrame,
            activeSkillState: null,
            planItemSnapshot: [],
            productSurfaces: [],
            explicitConstraints: [],
            routeDecision: safetyRouteDecision,
          });
          const safetyNextTempMemory = persistConversationSkillRoute(
            tempMemory,
            safetyRouteDecision,
            safetyOutput,
          );
          const safetyOperationRuntime: OperationRuntimeResult = {
            content: String(safetyOutput?.reply ?? "").trim(),
            nextTempMemory: safetyNextTempMemory,
            toolExecution: "none",
            executedTools: [],
            toolSkillRun: {
              selected_handler: "safety_crisis",
              skill_id: "safety_crisis",
              status: safetyOutput?.status ?? "continue",
              reason_code: "prepare_defense_card_safety_preempt",
              source_dispatcher_local: "prepare_defense_card.local_dispatcher",
              note_information: safetyNote,
              requested_effects: [],
              allowed_effects: [],
              committed_effects: [],
              blocked_effects: [],
              runtime_trace: [{
                component: "prepare_defense_card.local_dispatcher",
                event: "safety_preempt_handoff",
                target_dispatcher: "safety_crisis",
                global_dispatcher_skipped: true,
                note_information_present: Boolean(safetyNote),
              }],
            },
          };
          await trace(
            "brain:active_prepare_defense_card_safety_preempt_handoff",
            "routing",
            {
              skipped_global_dispatcher: true,
              source_dispatcher_local: "prepare_defense_card.local_dispatcher",
              target_dispatcher: "safety_crisis",
              note_information_present: Boolean(safetyNote),
              target_runtime: safetyOperationRuntime.toolSkillRun,
            },
            "warn",
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
            operationRuntime: safetyOperationRuntime,
            effectLedger,
            turnFrame: safetyTurnFrame,
            routeDecision: safetyRouteDecision,
            safetyContextOutput,
            weeklyReviewStateForTurn: null,
            dispatcherSignals: DEFAULT_SIGNALS,
            dispatcherV2Stats,
            dispatcherLatencyMs: 0,
            targetMode: "companion",
            riskScore: 10,
            loggedMessageId,
            requestId: meta?.requestId ?? null,
            messageMetadata: opts?.messageMetadata,
            logMessages,
            turnStartMs,
            trace,
          });
        }
        continueToGlobalAfterLocalExit = targetDispatcher === "global";
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
          safetyContextOutput,
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
          content: "",
          nextTempMemory: tempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            operation_type: "prepare_defense_card",
            mode: "platform_handoff",
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
        safetyContextOutput,
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
  if (
    activeLocalToolFlowOwnsTurn &&
    activeLocalFlowOperationType === "select_state_potion"
  ) {
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
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      safetyContextOutput,
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
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "select_state_potion",
          targetDispatcher: "global",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
          safetyContextOutput,
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
        safetyContextOutput,
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
  if (
    activeLocalToolFlowOwnsTurn &&
    activeLocalFlowOperationType === "update_coach_preferences"
  ) {
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
        risk_band: safetyContextOutput.risk_band,
        reason_codes: safetyContextOutput.reason_codes ?? [],
        evidence: safetyContextOutput.evidence ?? [],
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
      safetyContextOutput,
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
        tempMemory = attachNoteInformationToLocalExitMemo({
          tempMemory,
          sourceFlowId: "update_coach_preferences",
          targetDispatcher: "global",
          localRuntime: operationRuntime.toolSkillRun,
          requestId: meta?.requestId ?? null,
          userMessage,
        });
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
          safetyContextOutput,
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
      safetyContextOutput,
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
  const flowInterventionContext = buildFlowInterventionContext({
    lastLocalFlowExitContext: lastLocalFlowExitContextForDispatcher,
  });
  if (lastLocalFlowExitContextForDispatcher) {
    const lastLocalFlowExitNote = lastLocalFlowExitContextForDispatcher
      .note_information as NoteInformation | null | undefined;
    console.info("[Router] note_information_consumed", {
      ...noteInformationForTrace(
        lastLocalFlowExitNote,
      ),
      request_id: meta?.requestId ?? null,
      transition_tag:
        lastLocalFlowExitNote?.target_dispatcher === "safety_crisis"
          ? "local_to_safety_with_note"
          : "local_to_global_with_note",
    });
    tempMemory = clearLastLocalFlowExitContext(tempMemory);
    state = { ...(state ?? {}), temp_memory: tempMemory } as any;
    await updateUserState(supabase, userId, scope, { temp_memory: tempMemory });
  }
  const fullAiRequested = meta?.forceRealAi === true ||
    (opts?.messageMetadata as Record<string, unknown> | undefined)
        ?.force_full_ai === true;
  const safetyLocalFlowOwnsTurn = shouldSkipGlobalDispatcherForSafetyLocalTurn({
    activeSkillState,
    safetyContextOutput,
  });
  const activeLocalConversationSkillOwnsTurn = safetyLocalFlowOwnsTurn
    ? null
    : activeLocalConversationSkillThatOwnsTurn(activeSkillState);
  if (safetyLocalFlowOwnsTurn) {
    await trace("brain:safety_crisis.global_dispatcher_skipped", "routing", {
      active_safety_flow: isActiveSafetyCrisisSkillState(activeSkillState),
      safety_risk_band: safetyContextOutput.risk_band,
      safety_reason_codes: safetyContextOutput.reason_codes ?? [],
      reason_code: "safety_local_flow_owns_turn",
      global_dispatcher_skipped: true,
      global_router_skipped: true,
      note_information_created: !isActiveSafetyCrisisSkillState(
        activeSkillState,
      ),
    }, "info");
  } else if (activeLocalConversationSkillOwnsTurn) {
    await trace(
      `brain:${activeLocalConversationSkillOwnsTurn}.global_dispatcher_skipped`,
      "routing",
      {
        active_skill_id: activeLocalConversationSkillOwnsTurn,
        reason_code: "active_local_conversation_skill_owns_turn",
        global_dispatcher_skipped: true,
        global_router_skipped: true,
      },
      "info",
    );
  }
  const dispatcherLlmRunner = safetyLocalFlowOwnsTurn
    ? undefined
    : opts?.messageMetadata?.test_endpoint === "test-send-message" &&
        !fullAiRequested
    ? undefined
    : buildDispatcherLlmRunner({
      ...meta,
      userId,
      forceRealAi: fullAiRequested,
    });
  const turnFrameStartMs = Date.now();
  try {
    if (safetyLocalFlowOwnsTurn) {
      const safetyLocalOwnership = buildSafetyLocalOwnershipFrame({
        turnId: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
        sourceMessageId: loggedMessageId ?? meta?.requestId ??
          crypto.randomUUID(),
        userId,
        channel,
        activeSkillState,
        safetyContextOutput,
        conversationRiskHistory: conversationRiskHistoryForPersist,
        userMessage,
        requestId: meta?.requestId ?? null,
      });
      turnFrame = safetyLocalOwnership.turnFrame;
      routeDecision = safetyLocalOwnership.routeDecision;
      dispatcherLatencyMs = 0;
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
      if (safetyLocalOwnership.noteInformationCreated) {
        await trace("brain:safety_crisis.note_information_created", "routing", {
          ...noteInformationForTrace(turnFrame.note_information),
          transition_tag: "global_to_safety_with_note",
          first_activation: true,
          global_dispatcher_skipped: true,
          global_router_skipped: true,
        }, "info");
      }
    } else if (activeLocalConversationSkillOwnsTurn) {
      const localOwnership = buildActiveConversationLocalOwnershipFrame({
        skillId: activeLocalConversationSkillOwnsTurn,
        turnId: meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
        sourceMessageId: loggedMessageId ?? meta?.requestId ??
          crypto.randomUUID(),
        userId,
        channel,
        safetyContextOutput,
        conversationRiskHistory: conversationRiskHistoryForPersist,
      });
      turnFrame = localOwnership.turnFrame;
      routeDecision = localOwnership.routeDecision;
      dispatcherLatencyMs = 0;
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
      pushActiveFlowDebugSnapshot({
        snapshots: activeFlowDebugSnapshots,
        phase: "active_local_conversation_skill_owns_turn",
        scope,
        tempMemory,
        activeSkillState,
        activeOperationIntake,
        pendingOperationConfirmation:
          pendingOperationConfirmationForGlobalRouting,
        routeReasonCode: routeDecision.reason_code,
        routeActiveFlowReasonCode:
          routeDecision.active_flow_arbitration?.reason_code ?? null,
      });
    } else {
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
        safety_context_output: safetyContextOutput,
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
      if (
        conversationRisk &&
        shouldDeferConversationRiskFlowExitToLocalDispatcher({
          activeSkillState,
          conversationRisk,
        })
      ) {
        await trace(
          "brain:conversation_risk_flow_exit_deferred_to_local",
          "routing",
          {
            score: conversationRisk.score,
            threshold: conversationRisk.threshold,
            reason_codes: conversationRisk.reason_codes,
            flow_exit_context: conversationRisk.flow_exit_context ?? null,
            active_skill_id: activeConversationSkillId(activeSkillState),
            source_dispatcher_local: activeConversationSkillId(activeSkillState)
              ? `${
                activeConversationSkillId(activeSkillState)
              }.local_dispatcher`
              : null,
          },
          "info",
        );
      } else if (conversationRisk?.should_exit_flows) {
        pushActiveFlowDebugSnapshot({
          snapshots: activeFlowDebugSnapshots,
          phase: "before_conversation_risk_flow_exit_clear",
          scope,
          tempMemory,
          activeSkillState,
          activeOperationIntake,
          pendingOperationConfirmation:
            pendingOperationConfirmationForGlobalRouting,
        });
        const { tempMemory: cleared, clearedKeys } =
          clearMachineStateTempMemory({
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
          active_flow_debug: activeFlowDebugSnapshots.slice(-8),
        }, "warn");
      }
      pushActiveFlowDebugSnapshot({
        snapshots: activeFlowDebugSnapshots,
        phase: "before_run_conversation_routers",
        scope,
        tempMemory,
        activeSkillState,
        activeOperationIntake,
        pendingOperationConfirmation:
          pendingOperationConfirmationForGlobalRouting,
      });
      await trace("brain:active_flow_state_before_global_router", "routing", {
        scope,
        active_flow_debug: activeFlowDebugSnapshots.slice(-6),
      }, activeConversationSkillId(activeSkillState) ? "debug" : "warn");
      routeDecision = runConversationRouters({
        turn_frame: turnFrame,
        active_skill_state: activeSkillState,
        active_tool_skill_intake: activeOperationIntake,
        pending_tool_skill_confirmation:
          pendingOperationConfirmationForGlobalRouting,
        flow_intervention_context: flowInterventionContext,
        safety_context_risk_band: safetyContextOutput.risk_band,
      });
      pushActiveFlowDebugSnapshot({
        snapshots: activeFlowDebugSnapshots,
        phase: "after_run_conversation_routers",
        scope,
        tempMemory,
        activeSkillState,
        activeOperationIntake,
        pendingOperationConfirmation:
          pendingOperationConfirmationForGlobalRouting,
        routeReasonCode: routeDecision.reason_code,
        routeActiveFlowReasonCode:
          routeDecision.active_flow_arbitration?.reason_code ?? null,
      });
      routeDecision = attachActiveFlowDebugToRouteDecision(
        routeDecision,
        activeFlowDebugSnapshots,
      );
      if (
        routeDecision.active_flow_arbitration?.reason_code ===
          "no_active_flow" &&
        ((tempMemory as any)?.__active_skill_state ||
          (tempMemory as any)?.active_skill_state)
      ) {
        await trace(
          "brain:active_flow_no_active_flow_despite_temp_memory",
          "routing",
          {
            scope,
            active_flow_debug: activeFlowDebugSnapshots.slice(-8),
          },
          "error",
        );
      }
    }
    const centralArbitration = safetyLocalFlowOwnsTurn ||
        activeLocalConversationSkillOwnsTurn
      ? null
      : arbitrateTurnIntent({
        userMessage,
        routeDecision,
        turnFrame,
        tempMemory,
        activeOperationIntake,
        pendingOperationConfirmation:
          pendingOperationConfirmationForGlobalRouting,
        safetyBlocksTools: blocksToolSkills(safetyContextOutput.risk_band),
      });
    if (centralArbitration?.changed) {
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
      !blocksToolSkills(safetyContextOutput.risk_band) &&
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
    const statusRecapRoute = routeDecision.selected_handler === "status_recap";
    const preserveDirectStatusRecapRoute = shouldPreserveDirectStatusRecapRoute(
      {
        routeDecision,
        turnFrame,
      },
    );
    const oneShotStatusToolFlowGuard = {
      blocked: !preserveDirectStatusRecapRoute && !(
        routeDecision.response_owner === "product_help" ||
        isActiveCardDraftingOperation(activeOperationIntake) ||
        routeHasStructuredOperation
      ) && statusRecapRoute,
      reason_code: statusRecapRoute
        ? "status_recap_request_blocks_tool_start"
        : "not_status_recap",
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
            reason_code: "status_recap_request_blocks_tool_start",
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
        routeDecision.selected_handler === "status_recap",
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
      !blocksToolSkills(safetyContextOutput.risk_band) &&
      !pendingOperationConfirmationForGlobalRouting &&
      structuredCoachPreferenceIntent &&
      routeDecision.selected_handler !== "update_coach_preferences"
    ) {
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
      !blocksToolSkills(safetyContextOutput.risk_band) &&
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
      !blocksToolSkills(safetyContextOutput.risk_band) &&
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
      !blocksToolSkills(safetyContextOutput.risk_band)
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
        visibleAgent: runClarificationVisibleAgent,
        modelName: String(
          Deno.env.get("SOPHIA_CLARIFICATION_MODEL") ??
            Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
            Deno.env.get("GEMINI_FALLBACK_MODEL") ??
            "gemini-2.5-flash",
        ).trim(),
        requestId: meta?.requestId ?? loggedMessageId ?? null,
        userTurnSnapshot,
        supabase,
        userTimezone: userTime?.user_timezone ?? "Europe/Paris",
        history,
        routeDecision,
      });
      if (clarificationArbitration.status === "none") {
        clarificationArbitration = await maybeStartDispatcherClarification({
          turnFrame,
          userMessage,
          recentMessages: recentMessagesForTurnFrame,
          tempMemory,
          llmRunner: dispatcherLlmRunner,
          visibleAgent: runClarificationVisibleAgent,
          modelName: String(
            Deno.env.get("SOPHIA_CLARIFICATION_MODEL") ??
              Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
              Deno.env.get("GEMINI_FALLBACK_MODEL") ??
              "gemini-2.5-flash",
          ).trim(),
          requestId: meta?.requestId ?? loggedMessageId ?? null,
          userTurnSnapshot,
          supabase,
          userTimezone: userTime?.user_timezone ?? "Europe/Paris",
          history,
          routeDecision,
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
          inline_info_run: clarificationArbitration.inlineInfoRun ?? null,
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
        if (clarificationArbitration.noteInformation) {
          routeDecision = {
            ...(routeDecision as any),
            note_information: clarificationArbitration.noteInformation,
            orientation_clarification_note_information:
              clarificationArbitration.noteInformation,
          } as RouteDecision;
          tempMemory = {
            ...(tempMemory ?? {}),
            __last_clarification_note_information:
              clarificationArbitration.noteInformation,
          };
          state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        }
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
    if (
      routeDecision && turnFrame &&
      isSafetyRoute(routeDecision) &&
      !isActiveSafetyCrisisSkillState(activeSkillState) &&
      !runtimeRecord((turnFrame as any).note_information).target_dispatcher
    ) {
      const noteInformation = buildSafetyCrisisActivationNoteInformation({
        userMessage,
        sourceMessageId: loggedMessageId ?? null,
        requestId: meta?.requestId ?? null,
        safetyContextOutput,
      });
      turnFrame = {
        ...turnFrame,
        note_information: noteInformation,
      };
      routeDecision = {
        ...(routeDecision as any),
        note_information: noteInformation,
      } as RouteDecision;
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
      await trace("brain:safety_crisis.note_information_created", "routing", {
        ...noteInformationForTrace(noteInformation),
        transition_tag: "global_to_safety_with_note",
        first_activation: true,
        global_dispatcher_skipped: safetyLocalFlowOwnsTurn,
      }, "info");
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
      if (
        activeHandoff &&
        handoffArbitration.action !== "ignore" &&
        handoffArbitration.action !== "interrupt_for_explicit_intent"
      ) {
        const blockedPath = {
          path: "active_handoff",
          reason_code: handoffArbitration.reason_code,
        };
        const activeHandoffArbitrationTrace = {
          decision: handoffArbitration.action,
          active_owner: "tool_skill",
          selected_owner: activeHandoff.operation_type,
          resume_policy: handoffArbitration.action === "continue_handoff"
            ? "active_handoff_continue"
            : "active_handoff_clarify",
          reason_code: handoffArbitration.reason_code,
          continuation_intent: handoffArbitration.continuation_intent ?? null,
        };
        if (handoffArbitration.action === "continue_handoff") {
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
    }
    await trace("brain:turn_frame_routed", "routing", {
      turn_frame_dispatcher_ms: Date.now() - turnFrameStartMs,
      response_owner: routeDecision.response_owner,
      selected_handler: routeDecision.selected_handler ?? null,
      direct_effects_to_run: routeDecision.direct_effects_to_run,
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
      userId,
    });
    const staleInvestigationMode = String(
      (state as any)?.investigation_state?.mode ?? "",
    );
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

  await maybeLogDefenseCardWinParallel({
    supabase,
    userId,
    dispatcherSignals,
    v2Runtime,
    tempMemory,
  });

  if (riskScore !== Number((state as any)?.risk_level ?? 0)) {
    await updateUserState(supabase, userId, scope, { risk_level: riskScore });
  }

  const flowOpportunityIntervention = evaluateFlowOpportunityIntervention({
    turn_frame: turnFrame,
    flow_intervention_context: flowInterventionContext,
  });
  if (flowOpportunityIntervention.block_flow_opportunity && routeDecision) {
    routeDecision = {
      ...routeDecision,
      blocked_paths: [
        ...(routeDecision.blocked_paths ?? []),
        ...flowOpportunityIntervention.blocked_paths,
      ],
    };
    await trace(
      "brain:flow_opportunity_verification.blocked_by_intervention_policy",
      "routing",
      {
        blocked_paths: flowOpportunityIntervention.blocked_paths,
        normal_reply_fit_score: turnFrame?.normal_reply_fit_score ?? null,
        flow_opportunity: turnFrame?.flow_opportunity ?? null,
      },
      "info",
    );
  }

  const preFlowDirectEffectLane = await runDirectEffectLane({
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
    safetyContextOutput,
    sourceMessageId: loggedMessageId,
    requestId: meta?.requestId ?? null,
    v2Runtime: v2Runtime ?? null,
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
    },
  });
  routeDecision = preFlowDirectEffectLane.routeDecision;
  turnFrame = turnFrameWithDirectEffectRuntime(
    preFlowDirectEffectLane.turnFrame,
    preFlowDirectEffectLane.operationRuntime,
  );
  if (preFlowDirectEffectLane.routeOrFrameChanged && turnFrame) {
    dispatcherSignals = dispatcherSignalsFromTurnFrame({
      turnFrame,
      userMessage,
    });
  }
  if (preFlowDirectEffectLane.operationRuntime) {
    await trace("brain:direct_effect_lane.before_flow_opportunity", "routing", {
      selected_handler: preFlowDirectEffectLane.operationRuntime.toolSkillRun
        .selected_handler ?? null,
      tool_execution: preFlowDirectEffectLane.operationRuntime.toolExecution,
      executed_tools: preFlowDirectEffectLane.operationRuntime.executedTools,
      committed_effects: Array.isArray(
          preFlowDirectEffectLane.operationRuntime.toolSkillRun
            .committed_effects,
        )
        ? (preFlowDirectEffectLane.operationRuntime.toolSkillRun
          .committed_effects as unknown[]).length
        : 0,
      blocked_effects: Array.isArray(
          preFlowDirectEffectLane.operationRuntime.toolSkillRun.blocked_effects,
        )
        ? (preFlowDirectEffectLane.operationRuntime.toolSkillRun
          .blocked_effects as unknown[]).length
        : 0,
    }, "info");
  }

  const flowOpportunityRuntime = flowOpportunityIntervention
      .block_flow_opportunity
    ? null
    : await maybeRunFlowOpportunityVerificationRuntime({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      history,
      tempMemory,
      turnFrame,
      routeDecision,
      safetyContextOutput,
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
      operationRuntime: mergeDirectEffectRuntimeIntoVisibleRuntime({
        directRuntime: preFlowDirectEffectLane.operationRuntime,
        visibleRuntime: flowOpportunityRuntime,
      })!,
      effectLedger,
      turnFrame,
      routeDecision,
      safetyContextOutput,
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
  if (preFlowDirectEffectLane.operationRuntime) {
    return await handleOperationRuntimeResponse({
      supabase,
      userId,
      channel,
      scope,
      userMessage,
      history,
      state,
      activeSkillState,
      operationRuntime: preFlowDirectEffectLane.operationRuntime,
      effectLedger,
      turnFrame,
      routeDecision,
      safetyContextOutput,
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
    safetyContextOutput,
    sourceMessageId: loggedMessageId,
    requestId: meta?.requestId ?? null,
    v2Runtime: v2Runtime ?? null,
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
  let routeSafetyActive = operationRuntimePipeline.routeSafetyActive;
  let runtimeSafetyRiskBand = operationRuntimePipeline.runtimeSafetyRiskBand;
  let runtimeSafetySignalContext =
    operationRuntimePipeline.runtimeSafetySignalContext;
  let weeklyReviewStateForTurn =
    operationRuntimePipeline.weeklyReviewStateForTurn;
  let weeklyReviewBlocksToolSkillRuntime =
    operationRuntimePipeline.weeklyReviewBlocksToolSkillRuntime;
  let operationRuntime = operationRuntimePipeline.operationRuntime;
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
      safetyContextOutput,
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

  let onDemandTriggers: OnDemandTriggers =
    buildOnDemandTriggersFromDispatcherSignals(dispatcherSignals);

  if (lastLocalFlowExitContextForDispatcher && turnFrame && routeDecision) {
    const annotated = attachLocalFlowExitContextToSecondPass({
      turnFrame,
      routeDecision,
      localFlowExitContext: lastLocalFlowExitContextForDispatcher,
    });
    turnFrame = annotated.turnFrame;
    routeDecision = attachActiveFlowDebugToRouteDecision(
      annotated.routeDecision,
      activeFlowDebugSnapshots,
    );
  }

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
  let recommendationSkillOutput =
    recommendationRuntime.recommendationSkillOutput;
  let recommendationToolRun = recommendationRuntime.recommendationToolRun;
  let recommendationToolStats = recommendationRuntime.recommendationToolStats;
  let recommendationToolAddon = recommendationRuntime.recommendationToolAddon;
  let recommendationSurfaceLabel =
    recommendationRuntime.recommendationSurfaceLabel;
  const safetyDirectEffectRequest = runtimeRecord(
    runtimeRecord(
      runtimeRecord(recommendationSkillOutput?.diagnosis)
        .local_dispatcher_output,
    ).direct_effect_request,
  );
  const safetyRequestsOneShotReminder =
    recommendationSkillOutput?.skill_id === "safety_crisis" &&
    safetyDirectEffectRequest.requested === true &&
    safetyDirectEffectRequest.effect_type === "create_one_shot_reminder" &&
    turnFrame &&
    routeDecision;
  if (safetyRequestsOneShotReminder && turnFrame && routeDecision) {
    const oneShotTurnFrame: TurnFrame = {
      ...turnFrame,
      direct_effects: [
        ...turnFrame.direct_effects.filter((effect) =>
          effect.effect_type !== "create_one_shot_reminder"
        ),
        {
          effect_type: "create_one_shot_reminder",
          explicitness: safetyDirectEffectRequest.explicitness === "explicit"
            ? "explicit"
            : safetyDirectEffectRequest.explicitness === "implied"
            ? "implied"
            : "weak",
          target_status:
            safetyDirectEffectRequest.target_status === "identified" ||
              safetyDirectEffectRequest.target_status === "ambiguous" ||
              safetyDirectEffectRequest.target_status === "missing"
              ? safetyDirectEffectRequest.target_status
              : "missing",
          confidence_band:
            safetyDirectEffectRequest.confidence_band === "high" ||
              safetyDirectEffectRequest.confidence_band === "medium" ||
              safetyDirectEffectRequest.confidence_band === "low"
              ? safetyDirectEffectRequest.confidence_band
              : "medium",
          payload_hint: {
            raw_text: String(
              runtimeRecord(safetyDirectEffectRequest.payload_hint).raw_text ??
                userMessage,
            ).trim() || userMessage,
          },
        },
      ],
    };
    const oneShotRouteDecision: RouteDecision = {
      ...routeDecision,
      direct_effects_to_run: [
        ...new Set([
          ...routeDecision.direct_effects_to_run,
          "create_one_shot_reminder",
        ]),
      ],
      reason_code: "safety_crisis_create_one_shot_reminder_direct_effect",
      blocked_paths: [
        ...routeDecision.blocked_paths,
        {
          path: "safety_crisis.visible_reply",
          reason_code:
            "create_one_shot_reminder_direct_effect_uses_standard_runtime",
        },
      ],
    };
    const oneShotGate = await runEffectGateOrchestrator({
      turn_frame: oneShotTurnFrame,
      direct_effects_to_run: oneShotRouteDecision.direct_effects_to_run,
      pending_tool_skill_confirmation: pendingOperationConfirmation,
    });
    const gatedRouteDecision: RouteDecision = {
      ...oneShotRouteDecision,
      direct_effects_to_run: oneShotRouteDecision.direct_effects_to_run.filter(
        (effect) => oneShotGate.allowed.includes(effect as any),
      ),
      blocked_paths: [
        ...oneShotRouteDecision.blocked_paths,
        ...oneShotGate.additional_blocked_paths,
      ],
    };
    if (gatedRouteDecision.direct_effects_to_run.length > 0) {
      await trace(
        "brain:safety_crisis.one_shot_reminder_direct_effect",
        "routing",
        {
          source_dispatcher_local: "safety_crisis.local_dispatcher",
          global_dispatcher_skipped: true,
          effect_type: "create_one_shot_reminder",
          gate_allowed: oneShotGate.allowed,
        },
        "info",
      );
      const safetyOneShotRuntime = await runOperationRuntimePipeline({
        supabase,
        userId,
        userMessage,
        channel,
        userTimezone: userTime?.user_timezone ?? "Europe/Paris",
        history,
        tempMemory,
        state,
        planItemSnapshot,
        turnFrame: oneShotTurnFrame,
        routeDecision: gatedRouteDecision,
        safetyContextOutput,
        sourceMessageId: loggedMessageId,
        requestId: meta?.requestId ?? null,
        v2Runtime: v2Runtime ?? null,
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
        enableAdjustPlanCoachGuidance:
          meta?.enableAdjustPlanCoachGuidance === true,
        runAdjustPlanItemOperation: maybeRunAdjustPlanItemOperation,
        guards: {
          isActiveCardDraftingOperation,
        },
      });
      if (safetyOneShotRuntime.operationRuntime) {
        tempMemory = safetyOneShotRuntime.tempMemory;
        if (safetyOneShotRuntime.statePatch) {
          state = {
            ...(state ?? {}),
            ...safetyOneShotRuntime.statePatch,
          } as any;
        }
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState,
          operationRuntime: safetyOneShotRuntime.operationRuntime,
          effectLedger,
          turnFrame: safetyOneShotRuntime.turnFrame,
          routeDecision: safetyOneShotRuntime.routeDecision,
          safetyContextOutput,
          weeklyReviewStateForTurn:
            safetyOneShotRuntime.weeklyReviewStateForTurn,
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
    }
  }
  const productHelpLocalHandoffDiagnosis = runtimeRecord(
    recommendationSkillOutput?.diagnosis,
  );
  const productHelpLocalHandoffRequest = runtimeRecord(
    (recommendationSkillOutput as any)?.handoff_request,
  );
  const productHelpLocalHandoffNote = runtimeRecord(
    productHelpLocalHandoffDiagnosis.note_information,
  );
  const productHelpLocalHandoffTarget = String(
    productHelpLocalHandoffRequest.target_skill_id ??
      productHelpLocalHandoffNote.target_dispatcher ?? "",
  ).trim();
  const productHelpLocalHandoffTargets = new Set([
    "prepare_attack_card",
    "prepare_defense_card",
    "select_state_potion",
    "create_recurring_reminder",
    "adjust_plan_item",
    "update_coach_preferences",
  ]);
  if (
    recommendationSkillOutput?.skill_id === "product_help" &&
    recommendationSkillOutput.status === "handoff" &&
    productHelpLocalHandoffDiagnosis.flow_action ===
      "handoff_to_local_dispatcher" &&
    productHelpLocalHandoffDiagnosis.handoff_to_local_dispatcher === true &&
    productHelpLocalHandoffTargets.has(productHelpLocalHandoffTarget) &&
    Object.keys(productHelpLocalHandoffNote).length > 0 &&
    productHelpLocalHandoffNote.target_dispatcher ===
      productHelpLocalHandoffTarget &&
    turnFrame &&
    routeDecision &&
    !isSafetyRoute(routeDecision)
  ) {
    tempMemory = persistConversationSkillRoute(
      tempMemory,
      routeDecision,
      recommendationSkillOutput,
    );
    state = { ...(state ?? {}), temp_memory: tempMemory } as any;
    activeSkillState = null;
    activeOperationIntake = null;
    activeOperationIntakeForDispatcher = null;
    pendingOperationConfirmation = null;
    pendingOperationConfirmationForGlobalRouting = null;
    await updateUserState(supabase, userId, scope, {
      temp_memory: tempMemory,
    });
    const handoffNote = Object.keys(productHelpLocalHandoffNote).length
      ? productHelpLocalHandoffNote
      : null;
    const handoffTurnFrame = {
      ...turnFrame,
      note_information: handoffNote,
      tool_skill_intents: (turnFrame.tool_skill_intents ?? []).filter((
        intent,
      ) => intent.operation_type === productHelpLocalHandoffTarget),
    } as TurnFrame;
    const handoffRouteDecision: RouteDecision = {
      ...routeDecision,
      response_owner: "tool_skill",
      selected_handler: productHelpLocalHandoffTarget,
      reason_code: "product_help_handoff_to_local_dispatcher",
      direct_effects_to_run: [],
      blocked_paths: [
        ...routeDecision.blocked_paths,
        {
          path: "product_help.visible_reply",
          reason_code:
            "product_help_handoff_visible_reply_owned_by_target_dispatcher",
        },
        {
          path: "global_dispatcher",
          reason_code: "product_help_handoff_to_local_dispatcher_skips_global",
        },
      ],
      note_information: handoffNote,
      product_help_handoff: {
        target_dispatcher: productHelpLocalHandoffTarget,
        source_flow_id: "product_help",
        note_information: handoffNote,
      },
    } as RouteDecision;
    await trace("brain:product_help_handoff_to_local_dispatcher", "routing", {
      skipped_global_dispatcher_before_local: true,
      same_user_message_handoff_to_local_dispatcher: true,
      source_dispatcher_local: "product_help.local_dispatcher",
      target_dispatcher: productHelpLocalHandoffTarget,
      note_information_present: Boolean(handoffNote),
      local_runtime: {
        skill_id: "product_help",
        status: recommendationSkillOutput.status,
        response_intent: recommendationSkillOutput.response_intent,
        reason_code: productHelpLocalHandoffDiagnosis.reason_code ?? null,
        flow_action: productHelpLocalHandoffDiagnosis.flow_action ?? null,
      },
    }, "info");
    const productHelpHandoffRuntime = await runOperationRuntimePipeline({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      history,
      tempMemory,
      state,
      planItemSnapshot,
      turnFrame: handoffTurnFrame,
      routeDecision: handoffRouteDecision,
      safetyContextOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      v2Runtime: v2Runtime ?? null,
      activeSkillState: null,
      activeOperationIntake: null,
      pendingOperationConfirmation: null,
      trackProgressBlockedReasonCode: attackKeywordContextOverride
        ? "attack_keyword_trigger_is_not_completion"
        : null,
      fullAiRequested,
      clientNow: clientNow && Number.isFinite(clientNow.getTime())
        ? clientNow
        : null,
      enableAdjustPlanCoachGuidance:
        meta?.enableAdjustPlanCoachGuidance === true,
      runAdjustPlanItemOperation: maybeRunAdjustPlanItemOperation,
      guards: {
        isActiveCardDraftingOperation,
      },
    });
    if (productHelpHandoffRuntime.operationRuntime) {
      tempMemory = productHelpHandoffRuntime.tempMemory;
      if (productHelpHandoffRuntime.statePatch) {
        state = {
          ...(state ?? {}),
          ...productHelpHandoffRuntime.statePatch,
        } as any;
      }
      return await handleOperationRuntimeResponse({
        supabase,
        userId,
        channel,
        scope,
        userMessage,
        history,
        state,
        activeSkillState: null,
        operationRuntime: productHelpHandoffRuntime.operationRuntime,
        effectLedger,
        turnFrame: productHelpHandoffRuntime.turnFrame,
        routeDecision: productHelpHandoffRuntime.routeDecision,
        safetyContextOutput,
        weeklyReviewStateForTurn:
          productHelpHandoffRuntime.weeklyReviewStateForTurn,
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
    routeDecision = productHelpHandoffRuntime.routeDecision ??
      handoffRouteDecision;
    turnFrame = productHelpHandoffRuntime.turnFrame ?? handoffTurnFrame;
    tempMemory = productHelpHandoffRuntime.tempMemory;
    if (productHelpHandoffRuntime.statePatch) {
      state = {
        ...(state ?? {}),
        ...productHelpHandoffRuntime.statePatch,
      } as any;
    }
  }
  if (isConversationSkillExitToGlobal(recommendationSkillOutput)) {
    const exitedSkillId = String(recommendationSkillOutput?.skill_id ?? "")
      .trim();
    const diagnosis = runtimeRecord(recommendationSkillOutput?.diagnosis);
    const statePatch = runtimeRecord(recommendationSkillOutput?.state_patch);
    const exitMemo = runtimeRecord(
      diagnosis.exit_memo ??
        statePatch[`${exitedSkillId}_exit_memo`] ??
        null,
    );
    const noteInformation = runtimeRecord(
      diagnosis.note_information ?? exitMemo.note_information ?? null,
    );
    tempMemory = persistConversationSkillRoute(
      tempMemory,
      routeDecision,
      recommendationSkillOutput,
    );
    tempMemory = attachNoteInformationToLocalExitMemo({
      tempMemory,
      sourceFlowId: exitedSkillId,
      targetDispatcher: "global",
      localRuntime: {
        selected_handler: exitedSkillId,
        skill_id: exitedSkillId,
        status: recommendationSkillOutput?.status ?? null,
        response_intent: recommendationSkillOutput?.response_intent ?? null,
        reason_code: diagnosis.reason_code ??
          `${exitedSkillId}_exit_to_global_dispatcher`,
        flow_action: diagnosis.flow_action ?? "exit_to_global_dispatcher",
        visible_task: diagnosis.visible_task ?? null,
        exit_memo: Object.keys(exitMemo).length ? exitMemo : null,
        note_information: Object.keys(noteInformation).length
          ? noteInformation
          : null,
        risk_score: diagnosis.risk_score ?? 0,
      },
      requestId: meta?.requestId ?? null,
      userMessage,
    });
    const localExitContextForSecondPass = buildLastLocalFlowExitContext(
      tempMemory,
    );
    tempMemory = clearLastLocalFlowExitContext(tempMemory);
    state = { ...(state ?? {}), temp_memory: tempMemory } as any;
    activeSkillState = null;
    activeOperationIntake = null;
    activeOperationIntakeForDispatcher = null;
    pendingOperationConfirmation = null;
    pendingOperationConfirmationForGlobalRouting = null;
    await updateUserState(supabase, userId, scope, {
      temp_memory: tempMemory,
    });
    await trace("brain:generic_local_exit_to_global_dispatcher", "routing", {
      skipped_global_dispatcher_before_local: true,
      same_user_message_rerouted_to_global_after_local_exit: true,
      source_dispatcher_local: `${exitedSkillId}.local_dispatcher`,
      flow_action: diagnosis.flow_action ?? "exit_to_global_dispatcher",
      exit_to_global_dispatcher: true,
      global_dispatcher_second_pass_after_local_exit: true,
      note_information_present: Boolean(
        localExitContextForSecondPass?.note_information,
      ),
      local_runtime: {
        skill_id: exitedSkillId,
        status: recommendationSkillOutput?.status ?? null,
        response_intent: recommendationSkillOutput?.response_intent ?? null,
        reason_code: diagnosis.reason_code ?? null,
      },
    }, "info");
    const secondPassStartMs = Date.now();
    turnFrame = await runDispatcher({
      user_message: userMessage,
      recent_messages: recentMessagesForTurnFrame,
      user_id: userId,
      channel,
      active_skill_state: null,
      active_tool_skill_intake: null,
      pending_tool_skill_confirmation: null,
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
        active_runtime_context: buildDispatcherActiveRuntimeContext({
          tempMemory,
          activeSkillState: null,
          activeOperationIntake: null,
          pendingOperationConfirmation: null,
        }),
        last_local_flow_exit: localExitContextForSecondPass,
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
      safety_context_output: safetyContextOutput,
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
    dispatcherLatencyMs = (dispatcherLatencyMs ?? 0) +
      (Date.now() - secondPassStartMs);
    dispatcherSignals = dispatcherSignalsFromTurnFrame({
      turnFrame,
      userMessage,
    });
    routeDecision = runConversationRouters({
      turn_frame: turnFrame,
      active_skill_state: null,
      active_tool_skill_intake: null,
      pending_tool_skill_confirmation: null,
      flow_intervention_context: buildFlowInterventionContext({
        lastLocalFlowExitContext: localExitContextForSecondPass,
      }),
      safety_context_risk_band: safetyContextOutput.risk_band,
    });
    const annotatedSecondPass = attachLocalFlowExitContextToSecondPass({
      turnFrame,
      routeDecision,
      localFlowExitContext: localExitContextForSecondPass,
    });
    turnFrame = annotatedSecondPass.turnFrame;
    routeDecision = attachActiveFlowDebugToRouteDecision(
      annotatedSecondPass.routeDecision,
      activeFlowDebugSnapshots,
    );
    recommendationSkillOutput = null;
    recommendationToolRun = null;
    recommendationToolStats = null;
    recommendationToolAddon = null;
    recommendationSurfaceLabel = null;
    if (turnFrame && routeDecision) {
      await trace(
        "brain:global_second_pass_operation_runtime_pipeline",
        "routing",
        {
          source_dispatcher_local: `${exitedSkillId}.local_dispatcher`,
          selected_handler: routeDecision.selected_handler ?? null,
          response_owner: routeDecision.response_owner ?? null,
          direct_effects_to_run: routeDecision.direct_effects_to_run ?? [],
          same_downstream_pipeline_as_initial_global_dispatcher: true,
        },
        "info",
      );
      const secondPassOperationRuntimePipeline =
        await runOperationRuntimePipeline({
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
          safetyContextOutput,
          sourceMessageId: loggedMessageId,
          requestId: meta?.requestId ?? null,
          v2Runtime: v2Runtime ?? null,
          activeSkillState: null,
          activeOperationIntake: null,
          pendingOperationConfirmation: null,
          trackProgressBlockedReasonCode: attackKeywordContextOverride
            ? "attack_keyword_trigger_is_not_completion"
            : null,
          fullAiRequested,
          clientNow: clientNow && Number.isFinite(clientNow.getTime())
            ? clientNow
            : null,
          enableAdjustPlanCoachGuidance:
            meta?.enableAdjustPlanCoachGuidance === true,
          runAdjustPlanItemOperation: maybeRunAdjustPlanItemOperation,
          guards: {
            isActiveCardDraftingOperation,
          },
        });
      routeDecision = secondPassOperationRuntimePipeline.routeDecision;
      turnFrame = secondPassOperationRuntimePipeline.turnFrame;
      tempMemory = secondPassOperationRuntimePipeline.tempMemory;
      if (secondPassOperationRuntimePipeline.statePatch) {
        state = {
          ...(state ?? {}),
          ...secondPassOperationRuntimePipeline.statePatch,
        } as any;
      }
      if (secondPassOperationRuntimePipeline.routeOrFrameChanged && turnFrame) {
        dispatcherSignals = dispatcherSignalsFromTurnFrame({
          turnFrame,
          userMessage,
        });
      }
      onDemandTriggers = buildOnDemandTriggersFromDispatcherSignals(
        dispatcherSignals,
      );
      routeSafetyActive = secondPassOperationRuntimePipeline.routeSafetyActive;
      runtimeSafetyRiskBand =
        secondPassOperationRuntimePipeline.runtimeSafetyRiskBand;
      runtimeSafetySignalContext =
        secondPassOperationRuntimePipeline.runtimeSafetySignalContext;
      weeklyReviewStateForTurn =
        secondPassOperationRuntimePipeline.weeklyReviewStateForTurn;
      weeklyReviewBlocksToolSkillRuntime =
        secondPassOperationRuntimePipeline.weeklyReviewBlocksToolSkillRuntime;
      operationRuntime = secondPassOperationRuntimePipeline.operationRuntime;
      if (operationRuntime) {
        return await handleOperationRuntimeResponse({
          supabase,
          userId,
          channel,
          scope,
          userMessage,
          history,
          state,
          activeSkillState: null,
          operationRuntime,
          effectLedger,
          turnFrame,
          routeDecision,
          safetyContextOutput,
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
    }
  }
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
    buildNormalReplyHandoffContextAddon({ turnFrame, routeDecision }),
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
    turnId: turnFrame?.turn_id,
    channel,
  });
  contextLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0);

  let memoryV2RuntimeTempMemory: Record<string, unknown> | null = null;
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
  const combinedExecutedTools = agentExecutedTools;
  const combinedToolExecution = agentToolExecution;
  routeDecision = attachActiveFlowDebugToRouteDecision(
    routeDecision,
    activeFlowDebugSnapshots,
  );
  const normalConversationTurnTrace = turnFrame && routeDecision
    ? {
      turn_frame: turnFrame,
      route_decision: routeDecision,
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
        safety_context: safetyContextOutput,
        dispatcher_run: {
          latency_ms: dispatcherV2Stat?.latency_ms ?? 0,
          tokens_in: dispatcherV2Stat?.tokens_in ?? 0,
          tokens_out: dispatcherV2Stat?.tokens_out ?? 0,
          prompt_version: dispatcherV2Stat?.prompt_version ??
            "dispatcher_v2_prompt_2026_05_s12",
          model_used: dispatcherV2Stats[0]?.model_name ?? null,
          memory_plan: turnFrame?.memory_plan ??
            DEFAULT_DISPATCHER_MEMORY_PLAN,
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
    planItemSnapshot,
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
      ensureVisibleSophiaEmoji,
    },
  });
  let responseContent = finalResponse.responseContent;
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
