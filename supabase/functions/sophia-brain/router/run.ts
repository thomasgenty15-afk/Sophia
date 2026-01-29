/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import {
  AgentMode,
  getCoreIdentity,
  getDashboardContext,
  getUserState,
  logMessage,
  normalizeScope,
  updateUserState,
} from "../state-manager.ts"
import { runCompanion, retrieveContext } from "../agents/companion.ts"
import { runWatcher } from "../agents/watcher.ts"
import { normalizeChatText } from "../chat_text.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"
import { getUserTimeContext } from "../../_shared/user_time_context.ts"
import { getEffectiveTierForUser } from "../../_shared/billing-tier.ts"
import { logBrainTrace, type BrainTracePhase } from "../../_shared/brain-trace.ts"
import {
  formatUserProfileFactsForPrompt,
  getUserProfileFacts,
} from "../profile_facts.ts"
import {
  countNoPlanBlockerMentions,
  isExplicitStopCheckup,
  lastAssistantAskedForStepConfirmation,
  lastAssistantAskedForMotivation,
  looksLikeActionProgress,
  looksLikeAttrapeRevesActivation,
  looksLikeDailyBilanAnswer,
  looksLikeExplicitCheckupIntent,
  looksLikeExplicitResumeCheckupIntent,
  looksLikeHowToExerciseQuestion,
  looksLikeMotivationScoreAnswer,
  looksLikeUserConfirmsStep,
  looksLikeUserClaimsPlanIsDone,
  looksLikeWorkPressureVenting,
  shouldBypassCheckupLockForDeepWork,
} from "./classifiers.ts"
import { 
  analyzeSignals,
  analyzeSignalsV2,
  looksLikeAcuteDistress, 
  detectMachineTypeFromSignals,
  generateDeferredSignalSummary,
  isSafetySignal,
  shouldInterruptForSafety,
  type DispatcherSignals,
  type DispatcherInputV2,
  type DispatcherOutputV2,
  type SignalHistoryEntry,
  type NewSignalEntry,
  type SignalEnrichment,
  type FlowContext,
  type DeferredMachineType,
} from "./dispatcher.ts"
import {
  appendDeferredTopicToState,
  extractDeferredTopicFromUserMessage,
  userExplicitlyDefersTopic,
  getDeepReasonsDeferredTopic,
  hasDeepReasonsDeferredTopic,
  removeDeepReasonsDeferredTopic,
} from "./deferred_topics.ts"
import { debounceAndBurstMerge } from "./debounce.ts"
import { runAgentAndVerify } from "./agent_exec.ts"
import { maybeInjectGlobalDeferredNudge, pruneGlobalDeferredTopics, shouldStoreGlobalDeferredFromUserMessage, storeGlobalDeferredTopic } from "./global_deferred.ts"
import {
  closeTopicSession,
  closeTopicExploration,  // deprecated alias
  enqueueSupervisorIntent,
  getActiveSupervisorSession,
  getActiveTopicSession,
  getSupervisorRuntime,
  pruneStaleArchitectToolFlow,
  pruneStaleSupervisorState,
  pruneStaleUserProfileConfirm,
  setArchitectToolFlowInTempMemory,
  syncLegacyArchitectToolFlowSession,
  upsertTopicSerious,
  upsertTopicLight,
  upsertTopicExploration,  // deprecated alias
  incrementTopicTurnCount,
  updateTopicEngagement,
  setTopicLibrarianEscalation,
  shouldConvergeTopic,
  shouldEscalateToLibrarian,
  computeNextTopicPhase,
  upsertDeepReasonsExploration,
  closeDeepReasonsExploration,
  getActiveDeepReasonsExploration,
  pauseDeepReasonsExploration,
  resumeDeepReasonsExplorationSession,
  getPausedDeepReasonsExploration,
  // Create Action Flow v2
  getActiveCreateActionFlow,
  upsertCreateActionFlow,
  closeCreateActionFlow,
  getActionCandidateFromFlow,
  isCreateActionFlowStale,
  // Update Action Flow v2
  getActiveUpdateActionFlow,
  upsertUpdateActionFlow,
  closeUpdateActionFlow,
  getUpdateCandidateFromFlow,
  isUpdateActionFlowStale,
  // Breakdown Action Flow v2
  getActiveBreakdownActionFlow,
  upsertBreakdownActionFlow,
  closeBreakdownActionFlow,
  getBreakdownCandidateFromFlow,
  isBreakdownActionFlowStale,
  writeSupervisorRuntime,
  // Machine pause/resume for safety parenthesis
  getPausedMachine,
  pauseMachineForSafety,
  resumePausedMachine,
  hasPausedMachine,
  clearPausedMachine,
  getAnyActiveToolFlow,
  getAnyActiveMachine,
  hasActiveToolFlow,
  hasAnyActiveMachine,
  getActiveToolFlowActionTarget,
  type TopicEngagementLevel,
  type PausedMachineStateV2,
} from "../supervisor.ts"
import {
  // Deferred Topics V2
  deferSignal,
  getDeferredTopicsV2,
  getNextDeferredToProcess,
  removeDeferredTopicV2,
  pruneExpiredDeferredTopics,
  pauseAllDeferredTopics,
  isDeferredPaused,
  clearDeferredPause,
  hasPendingDeferredTopics,
  findMatchingDeferred,
  isToolMachine,
  machineTypeToSessionType,
  type DeferredTopicV2,
} from "./deferred_topics_v2.ts"
import {
  generateAcknowledgmentPrefix,
  generateSubtleUpdateAck,
  generatePostParenthesisQuestion,
  generateDeclineResumeMessage,
  generateResumeMessage,
  generateAutoRelaunchIntro,
  looksLikeWantsToResume,
  looksLikeWantsToRest,
  lastAssistantAskedResumeQuestion,
} from "./deferred_messages.ts"
import {
  runDeepReasonsExploration,
  resumeDeepReasonsFromDeferred,
  detectDeepReasonsPattern,
} from "../agents/architect/deep_reasons.ts"
import type { DeepReasonsState } from "../agents/architect/deep_reasons_types.ts"
import { createActionCandidate } from "../agents/architect/action_candidate_types.ts"
import { createUpdateCandidate } from "../agents/architect/update_action_candidate_types.ts"
import { createBreakdownCandidate } from "../agents/architect/breakdown_candidate_types.ts"

const SOPHIA_CHAT_MODEL =
  (
    ((globalThis as any)?.Deno?.env?.get?.("GEMINI_SOPHIA_CHAT_MODEL") ?? "") as string
  ).trim() || "gpt-5-mini";

// Premium model for critical modes (sentry, firefighter high-risk, architect)
const SOPHIA_CHAT_MODEL_PRO =
  (
    ((globalThis as any)?.Deno?.env?.get?.("GEMINI_SOPHIA_CHAT_MODEL_PRO") ?? "") as string
  ).trim() || "gpt-5.2";

// Model routing: use pro model for critical situations
function selectChatModel(targetMode: AgentMode, riskScore: number): string {
  // Sentry = always pro (safety critical)
  if (targetMode === "sentry") return SOPHIA_CHAT_MODEL_PRO;
  // Firefighter with high risk (8+) = pro
  if (targetMode === "firefighter" && riskScore >= 8) return SOPHIA_CHAT_MODEL_PRO;
  // Architect = pro (complex reasoning for plan/values)
  if (targetMode === "architect") return SOPHIA_CHAT_MODEL_PRO;
  // Default = flash
  return SOPHIA_CHAT_MODEL;
}

const ENABLE_SUPERVISOR_PENDING_NUDGES_V1 =
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_SUPERVISOR_PENDING_NUDGES_V1") ?? "") as string).trim() === "1"

const ENABLE_SUPERVISOR_RESUME_NUDGES_V1 =
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_SUPERVISOR_RESUME_NUDGES_V1") ?? "") as string).trim() === "1"

// Daily message soft cap (to protect margins on power users)
const DAILY_MESSAGE_SOFT_CAP = Number(
  ((globalThis as any)?.Deno?.env?.get?.("SOPHIA_DAILY_MESSAGE_SOFT_CAP") ?? "100").trim()
) || 100;

const SOFT_CAP_ENABLED = 
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_SOFT_CAP_ENABLED") ?? "1") as string).trim() === "1";

const SOFT_CAP_RESPONSE_TEMPLATE = `Hey 😊 On a atteint les 100 messages du jour — c'est la limite de ton forfait actuel.

J'adore qu'on échange autant, ça montre qu'on avance bien ensemble !

Avec le **forfait Architect**, tu aurais un accès **illimité** à nos conversations, plus des outils avancés pour construire ton plan de vie.

👉 Découvre le forfait Architect : https://sophia-coach.ai/upgrade

Est-ce que ça t'intéresse ? Réponds **oui** ou **non**.

On se retrouve demain matin, reposé·e ! 💜`;

// Dispatcher v2 is now the only dispatcher (v1 legacy removed)

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL HISTORY V1: Storage and management in temp_memory
// ═══════════════════════════════════════════════════════════════════════════════

const SIGNAL_HISTORY_KEY = "signal_history_v1"
const MAX_SIGNAL_HISTORY_TURNS = 5  // Keep signals from last 5 turns
const MIN_SIGNAL_HISTORY_TURN_INDEX = -(MAX_SIGNAL_HISTORY_TURNS - 1)

interface SignalHistoryState {
  entries: SignalHistoryEntry[]
  last_turn_index: number
}

/**
 * Get signal history from temp_memory.
 */
function getSignalHistory(tempMemory: any): SignalHistoryEntry[] {
  const state = (tempMemory as any)?.[SIGNAL_HISTORY_KEY] as SignalHistoryState | undefined
  return state?.entries ?? []
}

/**
 * Update signal history with new signals and enrichments.
 * Ages existing entries and prunes old ones.
 */
function updateSignalHistory(opts: {
  tempMemory: any
  newSignals: NewSignalEntry[]
  enrichments: SignalEnrichment[]
  activeMachine: string | null
}): { tempMemory: any; prunedCount: number } {
  const state = (opts.tempMemory as any)?.[SIGNAL_HISTORY_KEY] as SignalHistoryState | undefined
  const current = state?.entries ?? []
  const turnIndex = (state?.last_turn_index ?? 0) + 1
  
  // Age existing entries (decrement turn_index)
  let entries = current.map(e => ({ ...e, turn_index: e.turn_index - 1 }))
  
  // Prune old entries (keep last N turns)
  const beforeCount = entries.length
  entries = entries.filter(e => e.turn_index >= MIN_SIGNAL_HISTORY_TURN_INDEX)
  const prunedCount = beforeCount - entries.length
  
  // Apply enrichments to existing entries
  for (const enrich of opts.enrichments) {
    const existing = entries.find(e => e.signal_type === enrich.existing_signal_type)
    if (existing) {
      existing.brief = enrich.updated_brief.slice(0, 100)
    }
  }
  
  // Add new signals at turn_index = 0
  for (const sig of opts.newSignals) {
    // Don't add duplicates
    const alreadyExists = entries.some(e => 
      e.signal_type === sig.signal_type && 
      (e.action_target === sig.action_target || (!e.action_target && !sig.action_target))
    )
    if (!alreadyExists) {
      entries.push({
        signal_type: sig.signal_type,
        turn_index: 0,
        brief: sig.brief.slice(0, 100),
        status: opts.activeMachine ? "deferred" : "pending",
        action_target: sig.action_target,
        detected_at: new Date().toISOString(),
      })
    }
  }
  
  // Update status for signals that match the active machine
  if (opts.activeMachine) {
    for (const e of entries) {
      if (machineMatchesSignalType(opts.activeMachine, e.signal_type)) {
        e.status = "in_machine"
      }
    }
  }
  
  return {
    tempMemory: {
      ...opts.tempMemory,
      [SIGNAL_HISTORY_KEY]: { entries, last_turn_index: turnIndex }
    },
    prunedCount,
  }
}

/**
 * Mark a signal as resolved (when its machine completes).
 */
function resolveSignalInHistory(opts: {
  tempMemory: any
  signalType: string
  actionTarget?: string
}): { tempMemory: any } {
  const state = (opts.tempMemory as any)?.[SIGNAL_HISTORY_KEY] as SignalHistoryState | undefined
  if (!state?.entries) return { tempMemory: opts.tempMemory }
  
  const entries = state.entries.map(e => {
    if (e.signal_type === opts.signalType && 
        (e.action_target === opts.actionTarget || (!e.action_target && !opts.actionTarget))) {
      return { ...e, status: "resolved" as const }
    }
    return e
  })
  
  return {
    tempMemory: {
      ...opts.tempMemory,
      [SIGNAL_HISTORY_KEY]: { ...state, entries }
    }
  }
}

/**
 * Check if a machine type matches a signal type.
 * Used to update signal status when entering a machine.
 */
function machineMatchesSignalType(machineType: string | null, signalType: string): boolean {
  if (!machineType || !signalType) return false
  const mappings: Record<string, string[]> = {
    "create_action_flow": ["create_action_intent", "create_action"],
    "update_action_flow": ["update_action_intent", "update_action"],
    "breakdown_action_flow": ["breakdown_action_intent", "breakdown_action", "breakdown_intent"],
    "topic_serious": ["topic_exploration_intent", "topic_serious"],
    "topic_light": ["topic_exploration_intent", "topic_light"],
    "deep_reasons_exploration": ["deep_reasons_intent", "deep_reasons"],
    "user_profile_confirmation": ["profile_info_detected", "profile_confirmation"],
  }
  return mappings[machineType]?.includes(signalType) ?? false
}

/**
 * Get the currently active machine type from temp_memory.
 */
function getActiveMachineType(tempMemory: any): string | null {
  // Check tool flows first
  if ((tempMemory as any)?.create_action_flow) return "create_action_flow"
  if ((tempMemory as any)?.update_action_flow) return "update_action_flow"
  if ((tempMemory as any)?.breakdown_action_flow) return "breakdown_action_flow"
  
  // Check topic sessions
  const topicSession = getActiveTopicSession(tempMemory)
  if (topicSession?.type === "topic_serious") return "topic_serious"
  if (topicSession?.type === "topic_light") return "topic_light"
  
  // Check deep reasons
  if ((tempMemory as any)?.deep_reasons_state) return "deep_reasons_exploration"
  
  // Check profile confirmation
  if ((tempMemory as any)?.user_profile_confirm?.pending) return "user_profile_confirmation"
  
  return null
}

/**
 * Build the flow context for the active machine.
 * This enriches the dispatcher prompt with details about what's happening in the flow.
 */
function buildFlowContext(tempMemory: any, state?: any): FlowContext | undefined {
  const tm = tempMemory as any
  
  // Bilan (investigation) active - highest priority
  const invState = state?.investigation_state
  if (invState && invState.status !== "post_checkup") {
    const currentIndex = invState.current_item_index ?? 0
    const currentItem = invState.pending_items?.[currentIndex]
    const pendingOffer = invState.temp_memory?.bilan_defer_offer
    
    // Get missed streak from pending offer or legacy breakdown state if available
    const missedStreak =
      pendingOffer?.streak_days ??
      invState.temp_memory?.breakdown?.streak_days ??
      0
    
    return {
      isBilan: true,
      currentItemTitle: pendingOffer?.action_title ?? currentItem?.title,
      currentItemId: pendingOffer?.action_id ?? currentItem?.id,
      missedStreak,
    }
  }
  
  // Create action flow
  if (tm?.create_action_flow) {
    const candidate = tm.create_action_flow.candidate
    if (candidate) {
      return {
        actionLabel: candidate.label,
        actionType: candidate.type,
        actionStatus: candidate.status,
      }
    }
  }
  
  // Update action flow
  if (tm?.update_action_flow) {
    const candidate = tm.update_action_flow.candidate
    if (candidate) {
      const changes: string[] = []
      if (candidate.proposed_changes?.new_reps) changes.push(`freq: ${candidate.proposed_changes.new_reps}x`)
      if (candidate.proposed_changes?.new_days) changes.push(`jours: ${candidate.proposed_changes.new_days.join(", ")}`)
      if (candidate.proposed_changes?.new_time_of_day) changes.push(`moment: ${candidate.proposed_changes.new_time_of_day}`)
      if (candidate.proposed_changes?.new_title) changes.push(`titre: ${candidate.proposed_changes.new_title}`)
      return {
        targetActionTitle: candidate.target_action?.title,
        proposedChanges: changes.length > 0 ? changes.join(", ") : undefined,
      }
    }
  }
  
  // Breakdown action flow
  if (tm?.breakdown_action_flow) {
    const candidate = tm.breakdown_action_flow.candidate
    if (candidate) {
      return {
        breakdownTarget: candidate.target_action?.title,
        blocker: candidate.blocker,
        proposedStep: candidate.proposed_step?.title,
      }
    }
  }
  
  // Topic exploration
  const topicSession = getActiveTopicSession(tempMemory)
  if (topicSession) {
    return {
      topicLabel: topicSession.topic,
      topicPhase: topicSession.phase,
    }
  }
  
  // Deep reasons exploration
  if (tm?.deep_reasons_state) {
    return {
      deepReasonsTopic: tm.deep_reasons_state.topic,
      deepReasonsPhase: tm.deep_reasons_state.phase,
    }
  }
  
  // Profile confirmation
  if (tm?.user_profile_confirm?.pending) {
    const pending = tm.user_profile_confirm.pending
    return {
      profileFactKey: pending.key,
      profileFactValue: pending.proposed_value,
    }
  }
  
  return undefined
}

// Feature flag for contextual dispatcher
const ENABLE_CONTEXTUAL_DISPATCHER_V1 =
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_CONTEXTUAL_DISPATCHER_V1") ?? "") as string).trim() === "1"

export async function processMessage(
  supabase: SupabaseClient, 
  userId: string, 
  userMessage: string,
  history: any[],
  meta?: {
    requestId?: string
    forceRealAi?: boolean
    channel?: "web" | "whatsapp"
    model?: string
    scope?: string
    // WhatsApp-only: used to isolate onboarding behavior from normal WhatsApp conversations.
    whatsappMode?: "onboarding" | "normal"
    // Eval-only: run-evals populates this to enable structured tracing + bundling.
    evalRunId?: string | null
    // Debug escape hatch: enable brain tracing outside evals when needed.
    forceBrainTrace?: boolean
  },
  opts?: { 
    logMessages?: boolean;
    forceMode?: AgentMode;
    contextOverride?: string;
    messageMetadata?: Record<string, unknown>;
    // Eval-only: disable router-enforced mode overrides (preference/pending confirm/forceMode).
    disableForcedRouting?: boolean;
  }
) {
  const TRACE_VERBOSE =
    (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_BRAIN_TRACE_VERBOSE") ?? "") as string).trim() === "1"

  const trace = async (
    event: string,
    phase: BrainTracePhase,
    payload: Record<string, unknown> = {},
    level: "debug" | "info" | "warn" | "error" = "info",
  ) => {
    await logBrainTrace({
      supabase,
      userId,
      meta: { requestId: meta?.requestId, evalRunId: meta?.evalRunId ?? null, forceBrainTrace: meta?.forceBrainTrace },
      event,
      phase,
      level,
      payload,
    })
  }

  const traceV = async (
    event: string,
    phase: BrainTracePhase,
    payload: Record<string, unknown> = {},
    level: "debug" | "info" | "warn" | "error" = "debug",
  ) => {
    if (!TRACE_VERBOSE) return
    await trace(event, phase, payload, level)
  }

  // Start-of-request trace (awaited so staging/evals reliably persist it)
  await trace("brain:request_start", "io", {
    channel: meta?.channel ?? null,
    scope: meta?.scope ?? null,
    whatsappMode: meta?.whatsappMode ?? null,
    user_message_len: String(userMessage ?? "").length,
    history_len: Array.isArray(history) ? history.length : null,
  })

  function normalizeLoose(s: string): string {
    return String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s?]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  function pickToolflowSummary(tm: any): { active: boolean; kind?: string; stage?: string } {
    const flow = (tm as any)?.architect_tool_flow
    if (!flow || typeof flow !== "object") return { active: false }
    const kind = typeof (flow as any).kind === "string" ? String((flow as any).kind) : undefined
    const stage = typeof (flow as any).stage === "string" ? String((flow as any).stage) : undefined
    return { active: true, kind, stage }
  }

  function pickSupervisorSummary(tm: any): {
    stack_top_type?: string
    stack_top_owner?: string
    stack_top_status?: string
    topic_exploration?: { topic?: string; phase?: string; focus_mode?: string; handoff_to?: string }
    queue_size?: number
    queue_reasons_tail?: string[]
    queue_pending_reasons?: string[]
  } {
    const sess = getActiveSupervisorSession(tm)
    const rt = (tm as any)?.global_machine ?? (tm as any)?.supervisor
    const q = Array.isArray((rt as any)?.queue) ? (rt as any).queue : []
    const queueSize = q.length || undefined
    const reasons = q.map((x: any) => String(x?.reason ?? "")).filter((x: string) => x.trim())
    const tail = reasons.slice(-5)
    const pending = tail.filter((r: string) => r.startsWith("pending:"))
    const out: any = {
      stack_top_type: sess?.type ? String(sess.type) : undefined,
      stack_top_owner: sess?.owner_mode ? String(sess.owner_mode) : undefined,
      stack_top_status: sess?.status ? String(sess.status) : undefined,
      queue_size: queueSize,
      queue_reasons_tail: tail.length ? tail : undefined,
      queue_pending_reasons: pending.length ? pending : undefined,
    }
    if (sess?.type === "topic_exploration") {
      out.topic_exploration = {
        topic: sess.topic ? String(sess.topic).slice(0, 160) : undefined,
        phase: sess.phase ? String(sess.phase) : undefined,
        focus_mode: sess.focus_mode ? String(sess.focus_mode) : undefined,
        handoff_to: sess.handoff_to ? String(sess.handoff_to) : undefined,
      }
    }
    return out
  }

  function pickDeferredSummary(tm: any): { has_items: boolean; last_topic?: string } {
    const st = (tm as any)?.global_deferred_topics
    const items = Array.isArray((st as any)?.items) ? (st as any).items : []
    const last = items.length ? items[items.length - 1] : null
    const topic = last && typeof last === "object" ? String((last as any).topic ?? "").trim() : ""
    return { has_items: items.length > 0, last_topic: topic ? topic.slice(0, 160) : undefined }
  }

  function pickProfileConfirmSummary(tm: any): { pending: boolean; key?: string } {
    const pending = (tm as any)?.user_profile_confirm?.pending ?? null
    if (!pending || typeof pending !== "object") return { pending: false }
    const key = typeof (pending as any).key === "string" ? String((pending as any).key).slice(0, 80) : undefined
    return { pending: true, key }
  }

  function buildRouterDecisionV1(args: {
    requestId?: string
    scope: string
    channel: string
    dispatcher_target_mode: string
    target_mode_initial: string
    target_mode_final: string
    final_mode: string
    risk_score: number
    checkup_active: boolean
    stop_checkup: boolean
    is_post_checkup: boolean
    forced_preference_mode: boolean
    forced_pending_confirm: boolean
    toolflow_active_global: boolean
    toolflow_cancelled_on_stop: boolean
    pending_nudge_kind: string | null
    resume_action_v1: string | null
    stale_cleaned: string[]
    topic_exploration_closed: boolean
    topic_exploration_handoff: boolean
    safety_preempted_flow: boolean
    dispatcher_signals: DispatcherSignals | null
    temp_memory_before: any
    temp_memory_after: any
  }): { router_decision_v1: Record<string, unknown>; reason_codes: string[] } {
    const reasonCodes: string[] = []
    if (args.target_mode_final === "sentry") reasonCodes.push("SAFETY_SENTRY_OVERRIDE")
    else if (args.target_mode_final === "firefighter") reasonCodes.push("SAFETY_FIREFIGHTER_OVERRIDE")
    if (args.checkup_active && !args.is_post_checkup && !args.stop_checkup) reasonCodes.push("BILAN_HARD_GUARD_ACTIVE")
    if (args.is_post_checkup) reasonCodes.push("POST_CHECKUP_ACTIVE")
    if (args.toolflow_active_global && args.target_mode_final === "architect") reasonCodes.push("TOOLFLOW_ACTIVE_FOREGROUND")
    if (args.toolflow_cancelled_on_stop) reasonCodes.push("TOOLFLOW_CANCELLED_ON_STOP")
    if (args.forced_pending_confirm) reasonCodes.push("PROFILE_CONFIRM_HARD_GUARD_ACTIVE")
    if (args.forced_preference_mode) reasonCodes.push("PREFERENCE_FORCE_COMPANION")
    if (args.pending_nudge_kind === "global_deferred") reasonCodes.push("GLOBAL_DEFERRED_NUDGE")
    if (args.pending_nudge_kind === "post_checkup") reasonCodes.push("POST_CHECKUP_PENDING_NUDGE")
    if (args.pending_nudge_kind === "profile_confirm") reasonCodes.push("PROFILE_CONFIRM_PENDING_NUDGE")
    if (args.resume_action_v1 === "prompted") reasonCodes.push("RESUME_NUDGE_SHOWN")
    if (args.resume_action_v1 === "accepted") reasonCodes.push("RESUME_PREVIOUS_FLOW")
    if (args.resume_action_v1 === "declined") reasonCodes.push("RESUME_DECLINED")
    if (args.safety_preempted_flow) reasonCodes.push("SAFETY_PREEMPTED_FLOW")
    if (args.stale_cleaned.length > 0) reasonCodes.push("STALE_CLEANUP")
    if (args.topic_exploration_closed) reasonCodes.push("TOPIC_EXPLORATION_CLOSED")
    if (args.topic_exploration_handoff) reasonCodes.push("TOPIC_EXPLORATION_HANDOFF")

    const snapshotBefore = {
      toolflow: pickToolflowSummary(args.temp_memory_before),
      profile_confirm: pickProfileConfirmSummary(args.temp_memory_before),
      global_deferred: pickDeferredSummary(args.temp_memory_before),
      supervisor: pickSupervisorSummary(args.temp_memory_before),
    }
    const snapshotAfter = {
      toolflow: pickToolflowSummary(args.temp_memory_after),
      profile_confirm: pickProfileConfirmSummary(args.temp_memory_after),
      global_deferred: pickDeferredSummary(args.temp_memory_after),
      supervisor: pickSupervisorSummary(args.temp_memory_after),
    }

    return {
      router_decision_v1: {
        request_id: args.requestId ?? null,
        scope: args.scope,
        channel: args.channel,
        risk_score: args.risk_score,
        modes: {
          dispatcher_target: args.dispatcher_target_mode,
          target_initial: args.target_mode_initial,
          target_final: args.target_mode_final,
          final_mode: args.final_mode,
        },
        state_flags: {
          checkup_active: args.checkup_active,
          stop_checkup: args.stop_checkup,
          is_post_checkup: args.is_post_checkup,
          forced_preference_mode: args.forced_preference_mode,
          forced_pending_confirm: args.forced_pending_confirm,
          toolflow_active_global: args.toolflow_active_global,
          toolflow_cancelled_on_stop: args.toolflow_cancelled_on_stop,
        },
        pending_nudge_kind: args.pending_nudge_kind,
        resume_action_v1: args.resume_action_v1,
        stale_cleaned: args.stale_cleaned.length > 0 ? args.stale_cleaned : null,
        topic_exploration_closed: args.topic_exploration_closed || null,
        topic_exploration_handoff: args.topic_exploration_handoff || null,
        safety_preempted_flow: args.safety_preempted_flow || null,
        dispatcher_signals: args.dispatcher_signals ? {
          safety: args.dispatcher_signals.safety,
          intent: args.dispatcher_signals.user_intent_primary,
          intent_conf: args.dispatcher_signals.user_intent_confidence,
          interrupt: args.dispatcher_signals.interrupt,
          flow_resolution: args.dispatcher_signals.flow_resolution,
        } : null,
        reason_codes: reasonCodes,
        snapshot_before: snapshotBefore,
        snapshot_after: snapshotAfter,
        ts: new Date().toISOString(),
      },
      reason_codes: reasonCodes,
    }
  }

  function ensureSupervisorQueueIntent(opts: {
    tempMemory: any
    requestedMode: AgentMode
    reason: string
    messageExcerpt?: string
  }): { tempMemory: any; changed: boolean } {
    const reason = String(opts.reason ?? "").trim().slice(0, 160)
    if (!reason) return { tempMemory: opts.tempMemory, changed: false }
    const rt = getSupervisorRuntime(opts.tempMemory)
    const exists = Array.isArray(rt.queue) && rt.queue.some((q: any) => String(q?.reason ?? "") === reason)
    if (exists) return { tempMemory: opts.tempMemory, changed: false }
    return enqueueSupervisorIntent({
      tempMemory: opts.tempMemory,
      requestedMode: opts.requestedMode,
      reason,
      messageExcerpt: opts.messageExcerpt,
    })
  }

  function pruneSupervisorQueueManagedIntents(opts: {
    tempMemory: any
    keepReasons: Record<string, boolean>
  }): { tempMemory: any; changed: boolean } {
    const rt0 = getSupervisorRuntime(opts.tempMemory)
    const q0 = Array.isArray(rt0.queue) ? rt0.queue : []
    const keep = opts.keepReasons ?? {}
    const q1 = q0.filter((q: any) => {
      const r = String(q?.reason ?? "")
      // Only manage the explicit "pending:*" reasons we own; keep everything else untouched.
      if (r.startsWith("pending:")) {
        return Boolean(keep[r])
      }
      return true
    })
    if (q1.length === q0.length) return { tempMemory: opts.tempMemory, changed: false }
    const rt1 = { ...rt0, queue: q1, updated_at: new Date().toISOString() }
    return { tempMemory: writeSupervisorRuntime(opts.tempMemory, rt1 as any), changed: true }
  }

  function lowStakesTurn(m: string): boolean {
    const s = normalizeLoose(m)
    if (!s) return false
    if (s.length > 24) return false
    return /\b(ok|ok\s+merci|merci|super|top|daccord|dac|cool|yes|oui)\b/i.test(s)
  }

  function pickPendingFromSupervisorQueue(tm: any): { kind: "post_checkup" | "profile_confirm" | "global_deferred"; excerpt?: string } | null {
    const rt = getSupervisorRuntime(tm)
    const reasons = Array.isArray(rt.queue) ? rt.queue.map((q: any) => String(q?.reason ?? "")).filter(Boolean) : []
    const has = (r: string) => reasons.includes(r)
    // Priority order
    if (has("pending:post_checkup_parking_lot")) return { kind: "post_checkup" }
    if (has("pending:user_profile_confirm")) {
      // Attempt to find excerpt from the queued intent
      const q = (rt.queue ?? []).find((x: any) => String(x?.reason ?? "") === "pending:user_profile_confirm")
      const ex = q ? String((q as any)?.message_excerpt ?? "").trim().slice(0, 80) : ""
      return { kind: "profile_confirm", excerpt: ex || undefined }
    }
    if (has("pending:global_deferred_nudge")) return { kind: "global_deferred" }
    return null
  }

  function removeSupervisorQueueByReasonPrefix(opts: { tempMemory: any; prefix: string }): { tempMemory: any; changed: boolean } {
    const prefix = String(opts.prefix ?? "")
    if (!prefix) return { tempMemory: opts.tempMemory, changed: false }
    const rt0 = getSupervisorRuntime(opts.tempMemory)
    const q0 = Array.isArray(rt0.queue) ? rt0.queue : []
    const q1 = q0.filter((q: any) => !String(q?.reason ?? "").startsWith(prefix))
    if (q1.length === q0.length) return { tempMemory: opts.tempMemory, changed: false }
    const rt1 = { ...rt0, queue: q1, updated_at: new Date().toISOString() }
    return { tempMemory: writeSupervisorRuntime(opts.tempMemory, rt1 as any), changed: true }
  }

  function looksLikeLongFormExplanationRequest(m: string): boolean {
    const s = normalizeLoose(m)
    if (!s) return false
    // Strong explicit requests for detail / explanation / mechanisms.
    if (/\b(explique|explique moi|detail|details|detaille|developpe|developper|precise|precision|mecanisme|comment ca marche|comment ca fonctionne|guide|pas a pas|step by step|cours)\b/i.test(s)) {
      return true
    }
    // Also treat "tu peux me faire un truc long" / "réponse longue" type requests.
    if (/\b(reponse\s+longue|longue\s+explication|explication\s+longue)\b/i.test(s)) return true
    return false
  }

  function looksLikeSentryCandidate(m: string): boolean {
    const s = normalizeLoose(m)
    if (!s) return false
    // Suicide / self-harm cues (candidate only; confirmed by LLM).
    if (/\b(suicide|me\s+suicider|me\s+tuer|me\s+faire\s+du\s+mal|m['’]automutiler|automutilation)\b/i.test(s)) return true

    // Acute medical red flags (candidate only; confirmed by LLM).
    if (/\b(j['’]?arrive\s+pas\s+a\s+respirer|j['’]?ai\s+du\s+mal\s+a\s+respirer|je\s+suffoque|essouffl|oppression|douleur\s+poitrine|douleur\s+thorac|malaise|je\s+tourne\s+de\s+l['’]oeil|syncope|perte\s+de\s+connaissance|l[eè]vres\s+bleues?)\b/i
      .test(s)) return true
    if (/\b(allergie|choc\s+anaphylactique|gonfl[eé]\s+(?:visage|l[eè]vres|langue)|urticaire)\b/i.test(s)) return true
    if (/\b(avc|paralysie|visage\s+qui\s+tombe|difficult[eé]\s+a\s+parler|troubles\s+de\s+la\s+parole)\b/i.test(s)) return true

    return false
  }

  async function confirmRouteToSentry(opts: {
    userMessage: string
    lastAssistantMessage: string
    requestId?: string
    forceRealAi?: boolean
  }): Promise<{ route: boolean; category: string; confidence: number }> {
    // Deterministic mode: keep it conservative.
    const mega =
      (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string).trim() === "1" &&
      !opts.forceRealAi
    if (mega) {
      const s = normalizeLoose(opts.userMessage)
      if (/\b(jarrive pas a respirer|du mal a respirer|douleur poitrine|me suicider|suicide)\b/i.test(s)) {
        return { route: true, category: "mega_candidate", confidence: 0.9 }
      }
      return { route: false, category: "mega_none", confidence: 0.0 }
    }

    const systemPrompt = `
Tu es un "Safety Router" pour Sophia.
Ta mission: décider si le message utilisateur décrit une URGENCE qui doit être routée vers SENTRY.

IMPORTANT:
- Ne réagis pas juste à des mots. Distingue: citation / blague / hypothèse / métaphore VS situation réelle.
- Si c'est ambigu, préfère NE PAS router vers sentry (route=false).

Route vers SENTRY (route=true) si et seulement si:
- risque d'automutilation/suicide imminent OU demande d'aide urgente pour ça
- OU symptôme médical potentiellement grave (ex: difficulté à respirer, douleur thoracique, malaise, lèvres bleues, anaphylaxie)

Sinon:
- route=false

SORTIE JSON STRICTE:
{
  "route": true/false,
  "category": "self_harm|breathing|chest_pain|anaphylaxis|stroke|other|none",
  "confidence": 0.0-1.0
}
    `.trim()

    try {
      const raw = await generateWithGemini(systemPrompt, `User: ${opts.userMessage}\n\nLastAssistant: ${opts.lastAssistantMessage}`, 0.0, true, [], "auto", {
        requestId: opts.requestId,
        model: "gemini-2.5-flash",
        source: "sophia-brain:safety_router",
        forceRealAi: opts.forceRealAi,
      })
      const obj = JSON.parse(String(raw ?? "{}"))
      return {
        route: Boolean(obj?.route),
        category: String(obj?.category ?? "none"),
        confidence: Math.max(0, Math.min(1, Number(obj?.confidence ?? 0) || 0)),
      }
    } catch {
      return { route: false, category: "parse_failed", confidence: 0 }
    }
  }

  async function sentrySentRecently(args: { withinMs: number }): Promise<boolean> {
    try {
      const sinceIso = new Date(Date.now() - args.withinMs).toISOString()
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("scope", scope)
        .eq("role", "assistant")
        .eq("agent_used", "sentry")
        .gte("created_at", sinceIso)
      return (Number(count ?? 0) || 0) > 0
    } catch {
      return false
    }
  }

  function extractLastQuestionFingerprint(text: string): string | null {
    const t = String(text ?? "").trim()
    if (!t) return null
    // Grab last sentence containing a "?" as the question.
    const parts = t.split("\n").join(" ").split("?")
    if (parts.length < 2) return null
    const before = parts[parts.length - 2] ?? ""
    const q = (before.split(/[.!]/).pop() ?? before).trim() + "?"
    const fp = normalizeLoose(q).slice(0, 120)
    return fp || null
  }

  function inferPlanFocusFromUser(m: string): boolean | null {
    const s = normalizeLoose(m)
    if (!s) return null
    // If the user is venting / emotional, default away from plan-focus.
    // NOTE: keep this conservative: only clear "down-regulation / overwhelmed" language.
    // Otherwise we may wrongly disable plan-focus for normal planning conversations.
    if (
      looksLikeWorkPressureVenting(m) ||
      looksLikeAcuteDistress(m) ||
      /\b(submerg[ée]?\b|d[ée]bord[ée]?\b|micro[-\s]?pause\b|pause\s+ensemble\b|j(?:e|')\s+veux\s+juste\s+respirer\b|j(?:e|')\s+veux\s+juste\s+que\s+[çc]a\s+s['’]arr[êe]te\b|redescendre\b|pas\s+de\s+(?:plan|tableau\s+de\s+bord|dashboard|objectifs?)\b)\b/i
        .test(s)
    ) return false
    // Plan / actions / dashboard intent
    if (/\b(plan|phase|objectif|objectifs|action|actions|exercice|exercices|dashboard|plateforme|activer|activation|debloquer|deblocage)\b/i.test(m)) return true
    // "Et après ?" usually means "next step"; treat as plan-focus but NOT "goals-focus".
    if (/\b(et\s+apres|la\s+suite|on\s+fait\s+quoi\s+maintenant|next)\b/i.test(s)) return true
    return null
  }

  function looksLikeUserBoredOrWantsToStop(m: string): boolean {
    const s = normalizeLoose(m)
    if (!s) return false
    if (/\b(stop|arrete|arr[êe]te|laisse\s+tomber|on\s+arrete|on\s+change|passe\s+a\s+autre\s+chose|bref|on\s+a\s+fait\s+le\s+tour|on\s+a\s+fini|c['']est\s+bon\s+pour\s+moi)\b/i.test(s)) return true
    // Very short "ok." / "..." / "bon." replies are often fatigue signals.
    if (s.length <= 4 && /\b(ok|ok\?|bon)\b/i.test(s)) return true
    return false
  }

  // Detect breakdown/micro-step intent: user is blocked and wants to split an action into smaller steps.
  // This should route to architect (break_down_action tool), NOT firefighter.
  function looksLikeBreakdownIntent(m: string): boolean {
    const s = (m ?? "").toString().toLowerCase()
    if (!s.trim()) return false
    return /\b(micro[-\s]?etape|d[ée]compos|d[ée]coup|d[ée]taill|petit\s+pas|[ée]tape\s+minuscule|je\s+bloqu|j['']y\s+arrive\s+pas|trop\s+dur|insurmontable|plus\s+simple|simplifi|version\s+light|version\s+facile)\b/i
      .test(s)
  }

  function guessTopicLabel(m: string): string {
    const s = normalizeLoose(m)
    if (!s) return "conversation"
    if (/^(salut|coucou|hello|hey|bonjour|bonsoir)\b/i.test(s)) return "conversation"
    
    // Avoid generic acknowledgments as topic labels
    const raw = String(m ?? "").trim()
    const isGeneric = /^(ok|oui|non|merci|super|top|cool|daccord|c'?est bon|parfait|d'?accord|bien recu|je vois|ah|oh|hmm|ça va)/i.test(normalizeLoose(raw))
    if (isGeneric || raw.length < 12) return "conversation"
    
    // Try to extract a more specific topic by looking for key nouns/phrases
    // Boss/work related - extract the specific entity
    const bossMatch = s.match(/\b(boss|chef|manager|sup[eé]rieur|patron|directeur)\b/i)
    if (bossMatch) return `problème avec ${bossMatch[1]}`
    
    const workMatch = s.match(/\b(travail|boulot|taff|job|bureau|boite|entreprise)\b/i)
    if (workMatch) return `situation au ${workMatch[1]}`
    
    // Emotional states - keep more specific  
    if (/\b(stress|stressé|anxieux|anxiété)\b/i.test(s)) return "stress / anxiété"
    if (/\b(angoisse|angoissé|panique|peur)\b/i.test(s)) return "angoisse / panique"
    if (/\b(triste|tristesse|déprim|cafard)\b/i.test(s)) return "humeur basse"
    
    // Specific activities
    if (/\b(bilan|checkup|check)\b/i.test(s)) return "bilan/checkup"
    if (/\b(plan|dashboard|phase|action|actions|exercice|exercices)\b/i.test(s)) return "plan / exécution"
    if (/\b(sport|bouger|course|gym|marche)\b/i.test(s)) return "activité physique"
    if (/\b(lecture|lire|livre|scroll|tel|téléphone)\b/i.test(s)) return "habitudes (lecture/écrans)"
    if (/\b(sommeil|dormir|insomnie|fatigue)\b/i.test(s)) return "sommeil / fatigue"
    if (/\b(famille|parents|enfants|conjoint|couple)\b/i.test(s)) return "relations familiales"
    if (/\b(ami|amis|copain|pote|social)\b/i.test(s)) return "vie sociale"
    
    // Default: use first meaningful part of the message (skip greeting words)
    const meaningful = raw.replace(/^(en fait|bon|alors|euh|hm+|ah|oh|oui|non|bref|enfin)\s*/gi, "").trim()
    if (meaningful.length > 10 && meaningful.length <= 80) return meaningful.slice(0, 80)
    if (meaningful.length > 80) return meaningful.slice(0, 77) + "..."
    
    return "conversation"
  }

  function extractObjective(m: string): string | null {
    const raw = String(m ?? "").trim()
    if (!raw) return null
    // Common French patterns: "mon objectif c'est ...", "objectif: ..."
    const m1 = raw.match(/mon\s+objectif\s+(?:c['’]est|cest|=|:)?\s*(.+)$/i)
    if (m1?.[1]) return String(m1[1]).trim().slice(0, 220) || null
    const m2 = raw.match(/\bobjectif\s*(?:=|:)\s*(.+)$/i)
    if (m2?.[1]) return String(m2[1]).trim().slice(0, 220) || null
    return null
  }

  function looksLikeDigressionRequest(m: string): boolean {
    const s = String(m ?? "").toLowerCase()
    if (!s.trim()) return false
    return (
      /\b(on\s+peut|j['’]ai\s+besoin\s+de|je\s+veux|j['’]ai\s+envie\s+de)\s+(?:te\s+)?parler\b/i.test(s) ||
      /\bparler\s+(?:de|du|des|d['’])\b/i.test(s) ||
      /\ben\s+parler\b/i.test(s) ||
      /\bau\s+fait\b/i.test(s) ||
      /\bd['’]?ailleurs\b/i.test(s)
    )
  }

  function extractTopicFromUserDigression(m: string): string {
    const raw = String(m ?? "").trim()
    if (!raw) return ""
    
    // PRIORITY: Extract work/stress-related subjects first (often buried in filler text)
    const bossMatch = raw.match(/\b(?:mon\s+)?(?:boss|chef|manager|sup[eé]rieur|patron|directeur)(?:\s+qui\s+[^,.!?]+)?/i)
    if (bossMatch?.[0]) return String(bossMatch[0]).trim().slice(0, 160)
    
    const workMatch = raw.match(/\b(?:mon\s+)?(?:travail|boulot|taff|job)(?:\s+qui\s+[^,.!?]+)?/i)
    if (workMatch?.[0]) return String(workMatch[0]).trim().slice(0, 160)
    
    const stressMatch = raw.match(/\b(?:le\s+|mon\s+)?stress(?:\s+(?:au|du|avec)\s+[^,.!?]+)?/i)
    if (stressMatch?.[0]) return String(stressMatch[0]).trim().slice(0, 160)
    
    // Standard patterns
    const m1 = raw.match(/\b(?:parler|discuter|revenir)\s+(?:de|du|des|d[''])\s+([^?.!]+)/i)
    if (m1?.[1]) {
      return String(m1[1]).trim().replace(/^[:\s-]+/, "").slice(0, 160)
    }
    return extractDeferredTopicFromUserMessage(raw)
  }

  function detectPreferenceHint(m: string): { key: string; uncertain: boolean } | null {
    const s = normalizeLoose(m)
    if (!s) return null
    const uncertain = /\b(pas\s+s[ûu]r|pas\s+sure|je\s+sais\s+pas|je\s+ne\s+sais\s+pas|peut[-\s]?être|je\s+crois|bof|j['’]h[ée]site|je\s+suis\s+pas\s+s[ûu]r)\b/i.test(s)
    if (/\b(emoji|emojis|smiley|smileys)\b/i.test(s)) return { key: "conversation.use_emojis", uncertain }
    if (/\b(plus\s+direct|plut[oô]t\s+direct|sois\s+direct|ton\s+direct|plus\s+doux|plut[oô]t\s+doux)\b/i.test(s)) {
      return { key: "conversation.tone", uncertain }
    }
    if (/\b(r[ée]ponses?\s+(?:plus\s+)?courtes?|r[ée]ponses?\s+br[èe]ves?|plus\s+concis|plus\s+succinct|moins\s+long|moins\s+d[ée]tail)\b/i.test(s)) {
      return { key: "conversation.verbosity", uncertain }
    }
    if (/\b(ne\s+me\s+ram[eè]ne\s+pas|arr[êe]te\s+de\s+me\s+ramener|[ée]vite\s+de\s+me\s+ramener)\b[\s\S]{0,40}\b(plan|objectifs?|actions?)\b/i.test(s)) {
      return { key: "coaching.plan_push_allowed", uncertain }
    }
    return null
  }

  function buildArchitectLoopGuard(args: {
    planFocus: boolean
    currentObjective: string | null
    loopCount: number
  }): string {
    const obj = (args.currentObjective ?? "").trim()
    const strictness = Math.min(3, Math.max(0, args.loopCount))
    return (
      `=== ARCHITECT_LOOP_GUARD ===\n` +
      `plan_focus=${args.planFocus ? "true" : "false"}\n` +
      `current_objective=${obj ? JSON.stringify(obj) : "null"}\n` +
      `loop_count=${args.loopCount}\n\n` +
      `RÈGLES (priorité absolue):\n` +
      `- Interdiction de reposer une question déjà posée (même reformulée).\n` +
      `- Interdiction de repartir sur "objectifs / pourquoi / vision" si ce n'est pas explicitement demandé par l'utilisateur.\n` +
      `- Interdiction d'introduire un 2e objectif si un objectif existe déjà.\n` +
      `- Si plan_focus=false: ne parle pas du plan, avance sur le problème concret + émotion du moment.\n` +
      `- Si plan_focus=true: reste sur UNE piste et passe en exécution.\n` +
      `- Anti-boucle utilisateur (obligatoire si répétition 2+ fois): fais un meta-turn ("On tourne en rond" ou équivalent),\n` +
      `  puis CONVERGE: 1 micro-action concrète à faire maintenant + termine par UNE question oui/non.\n` +
      `  IMPORTANT: ne répète pas la même question oui/non mot pour mot sur 2 tours d'affilée.\n` +
      `  Exemples de questions oui/non (à alterner):\n` +
      `  - "Tu peux le faire maintenant ? (oui/non)"\n` +
      `  - "Tu veux que je te guide pas à pas, là, tout de suite ? (oui/non)"\n` +
      `  - "Tu veux qu’on fixe un moment précis (ce soir/demain) ? (oui/non)"\n` +
      (strictness >= 1
        ? `- Anti-boucle: limite à 2 étapes max. Résume ce qui est décidé, puis donne 1 prochaine étape concrète.\n`
        : "") +
      (strictness >= 2
        ? `- Interdiction de proposer A/B. Converge: "voici ce qu'on fait" + 1 question oui/non.\n`
        : "") +
      (strictness >= 3
        ? `- Zéro diagnostic. Zéro nouveaux objectifs. Donne la prochaine action, point.\n`
        : "") +
      ``
    ).trim()
  }

  const isEvalParkingLotTest =
    Boolean(opts?.contextOverride && String(opts.contextOverride).includes("MODE TEST PARKING LOT")) ||
    Boolean(opts?.contextOverride && String(opts.contextOverride).includes("CONSIGNE TEST PARKING LOT"));
  const disableForcedRouting = Boolean(opts?.disableForcedRouting)
  const channel = meta?.channel ?? "web"
  const scope = normalizeScope(meta?.scope, channel === "whatsapp" ? "whatsapp" : "web")
  const nowIso = new Date().toISOString()
  const userTime = await getUserTimeContext({ supabase, userId }).catch(() => null as any)

  const logMessages = opts?.logMessages !== false
  // 1. Log le message user
  let loggedMessageId: string | null = null
  if (logMessages) {
    const { data: inserted } = await supabase.from('chat_messages').insert({
      user_id: userId,
      scope,
      role: 'user',
      content: userMessage,
      metadata: opts?.messageMetadata ?? {}
    }).select('id').single()
    loggedMessageId = inserted?.id
  }

  // --- DEBOUNCE / ANTI-RACE CONDITION (Option 2) ---
  if (loggedMessageId) {
    const debounced = await debounceAndBurstMerge({
      supabase,
      userId,
      scope,
      loggedMessageId,
      userMessage,
    })
    // Important: when aborted, do not emit an assistant message (prevents double-assistant / empty assistant entries).
    if (debounced.aborted) {
      await traceV("brain:debounce_aborted", "io", { reason: "debounceAndBurstMerge" }, "debug")
      return { content: "", mode: "companion", aborted: true }
    }
    userMessage = debounced.userMessage
  }

  // 2. Récupérer l'état actuel (Mémoire)
  let state = await getUserState(supabase, userId, scope)
  // Global parking-lot lives in user_chat_states.temp_memory (independent from investigation_state).
  let tempMemory = (state as any)?.temp_memory ?? {}

  // --- SOFT CAP: Daily message limit to protect margins on power users ---
  // Skip for evals and for Architect tier (unlimited messages)
  const userTier = SOFT_CAP_ENABLED ? await getEffectiveTierForUser(supabase, userId).catch(() => "none" as const) : "none"
  const isArchitect = userTier === "architecte"
  
  if (SOFT_CAP_ENABLED && !isArchitect && !meta?.requestId?.includes(":eval") && !meta?.requestId?.includes(":tools:")) {
    // Use user's local date (from their timezone), fallback to UTC if not available
    const today = userTime?.user_local_date ?? new Date().toISOString().slice(0, 10) // YYYY-MM-DD in user's timezone
    const softCapState = (tempMemory as any)?.soft_cap ?? {}
    const lastCountDate = softCapState.date ?? ""
    const messageCount = lastCountDate === today ? (softCapState.count ?? 0) : 0
    const wasOverCap = softCapState.over_cap === true && lastCountDate === today
    const hasAnsweredUpgrade = softCapState.upgrade_answered === true && lastCountDate === today

    // Check if user is responding to the upgrade question
    const userMsgLower = normalizeLoose(userMessage)
    const isUpgradeYes = wasOverCap && !hasAnsweredUpgrade && /^(oui|yes|ouais|ok|yep|yeah|je veux|interesse)/.test(userMsgLower)
    const isUpgradeNo = wasOverCap && !hasAnsweredUpgrade && /^(non|no|nan|pas vraiment|pas pour l instant)/.test(userMsgLower)

    if (isUpgradeYes || isUpgradeNo) {
      // Store upgrade interest (for Architect plan)
      try {
        await supabase.from("upgrade_interest").upsert({
          user_id: userId,
          interested: isUpgradeYes,
          source: "soft_cap_architect_prompt",
          created_at: new Date().toISOString(),
        }, { onConflict: "user_id" })
        console.log(`[SoftCap] User ${userId} responded to Architect upgrade: ${isUpgradeYes ? "YES" : "NO"}`)
      } catch (e) {
        console.warn("[SoftCap] Failed to store upgrade interest:", e)
      }

      // Update state
      tempMemory = {
        ...tempMemory,
        soft_cap: { ...softCapState, date: today, upgrade_answered: true },
      }
      await updateUserState(supabase, userId, scope, { temp_memory: tempMemory })

      // Respond
      const responseContent = isUpgradeYes
        ? "Super ! 💜 Je note ton intérêt pour le forfait Architect. Tu recevras bientôt plus d'infos pour découvrir tout ce qu'il peut t'apporter. À demain !"
        : "Pas de souci, je comprends ! 😊 Le forfait actuel te convient peut-être très bien. On se retrouve demain pour continuer. Prends soin de toi d'ici là !"

      if (logMessages) {
        await supabase.from("chat_messages").insert({
          user_id: userId,
          scope,
          role: "assistant",
          content: responseContent,
          metadata: { agent: "soft_cap", soft_cap_response: true },
        })
      }

      await traceV("brain:soft_cap_response", "soft_cap", { kind: "answer_recorded", interested: isUpgradeYes }, "info")
      return { content: responseContent, mode: "companion" as AgentMode }
    }

    // If over cap (whether answered or not), keep blocking
    if (wasOverCap) {
      const blockResponse = hasAnsweredUpgrade 
        ? "On a atteint les 100 messages du jour 😊 On se retrouve demain matin !"
        : "On a atteint les 100 messages du jour. Tu peux répondre **oui** ou **non** à ma question sur le forfait Architect, sinon on se retrouve demain ! 💜"
      if (logMessages) {
        await supabase.from("chat_messages").insert({
          user_id: userId,
          scope,
          role: "assistant",
          content: blockResponse,
          metadata: { agent: "soft_cap", soft_cap_blocked: true },
        })
      }
      await traceV("brain:soft_cap_response", "soft_cap", { kind: "blocked", hasAnsweredUpgrade }, "info")
      return { content: blockResponse, mode: "companion" as AgentMode }
    }

    // Check if we hit the cap NOW
    if (messageCount >= DAILY_MESSAGE_SOFT_CAP && !wasOverCap) {
      console.log(`[SoftCap] User ${userId} hit daily cap (${messageCount}/${DAILY_MESSAGE_SOFT_CAP})`)
      
      // Mark as over cap
      tempMemory = {
        ...tempMemory,
        soft_cap: { date: today, count: messageCount, over_cap: true, upgrade_answered: false },
      }
      await updateUserState(supabase, userId, scope, { temp_memory: tempMemory })

      // Send soft cap template
      if (logMessages) {
        await supabase.from("chat_messages").insert({
          user_id: userId,
          scope,
          role: "assistant",
          content: SOFT_CAP_RESPONSE_TEMPLATE,
          metadata: { agent: "soft_cap", soft_cap_triggered: true },
        })
      }

      await traceV("brain:soft_cap_response", "soft_cap", { kind: "prompted" }, "info")
      return { content: SOFT_CAP_RESPONSE_TEMPLATE, mode: "companion" as AgentMode }
    }

    // Increment counter
    tempMemory = {
      ...tempMemory,
      soft_cap: { date: today, count: messageCount + 1, over_cap: false },
    }
    // Note: state will be saved later in the normal flow
  }

  // NOTE: router should never infer/parse preferences from keywords.
  // - Watcher proposes candidates (LLM), stored in temp_memory.user_profile_candidates
  // - Companion asks confirmation and writes user_profile_facts via tools
  // Prune (TTL + cap) opportunistically.
  const pruned = pruneGlobalDeferredTopics(tempMemory)
  if (pruned.changed) tempMemory = pruned.tempMemory

  // --- TTL / STALE CLEANUP (uniform across all machines) ---
  // Run early so that stale state doesn't affect routing decisions.
  const staleCleaned: string[] = []
  {
    const c1 = pruneStaleArchitectToolFlow({ tempMemory })
    if (c1.changed) { tempMemory = c1.tempMemory; staleCleaned.push("architect_tool_flow") }

    const c2 = pruneStaleUserProfileConfirm({ tempMemory })
    if (c2.changed) { tempMemory = c2.tempMemory; staleCleaned.push("user_profile_confirm") }

    const c3 = pruneStaleSupervisorState({ tempMemory })
    if (c3.changed) { tempMemory = c3.tempMemory; staleCleaned.push(...c3.cleaned) }
  }

  // --- SUPERVISOR (global runtime: stack/queue) ---
  // Keep supervisor runtime in sync with legacy multi-turn flows.
  // (Today we sync the Architect tool flow; other sessions can be added progressively.)
  const syncedSupervisor = syncLegacyArchitectToolFlowSession({ tempMemory })
  if (syncedSupervisor.changed) tempMemory = syncedSupervisor.tempMemory
  // Capture explicit user deferrals outside bilan too.
  if (shouldStoreGlobalDeferredFromUserMessage(userMessage)) {
    const extracted = extractDeferredTopicFromUserMessage(userMessage)
    const topic = extracted || String(userMessage ?? "").trim().slice(0, 240) || ""
    const stored = storeGlobalDeferredTopic({ tempMemory, topic })
    if (stored.changed) tempMemory = stored.tempMemory
  }

  // --- PR3: Index pending obligations into supervisor.queue (no duplication of state) ---
  // We keep these conservative and deduped; they serve as a "what's pending?" index for the scheduler.
  const managedPendingReasons: Record<string, boolean> = {
    "pending:user_profile_confirm": false,
    "pending:global_deferred_nudge": false,
    "pending:post_checkup_parking_lot": false,
  }

  // Global deferred nudge (opportunistic): only queue when there are items and the user turn looks low-stakes.
  // (We keep this simple and conservative; the actual injection stays in maybeInjectGlobalDeferredNudge.)
  {
    const st = (tempMemory as any)?.global_deferred_topics
    const items = Array.isArray((st as any)?.items) ? (st as any).items : []
    const hasItems = items.length > 0
    const s = normalizeLoose(userMessage)
    const lowStakes =
      s.length > 0 &&
      s.length <= 24 &&
      /\b(ok|ok\s+merci|merci|super|top|daccord|dac|cool|yes|oui)\b/i.test(s)
    if (hasItems && lowStakes) {
      managedPendingReasons["pending:global_deferred_nudge"] = true
      const last = items[items.length - 1]
      const topic = last && typeof last === "object" ? String((last as any)?.topic ?? "").trim().slice(0, 160) : ""
      const queued = ensureSupervisorQueueIntent({
        tempMemory,
        requestedMode: "companion",
        reason: "pending:global_deferred_nudge",
        messageExcerpt: topic || undefined,
      })
      if (queued.changed) tempMemory = queued.tempMemory
    }
  }

  // If the user explicitly says "later", inject a hard preference so the next agent doesn't override it.
  // NOTE: context is built later; we store the addendum now and prepend it once `context` exists.
  let deferredUserPrefContext = ""
  if (userExplicitlyDefersTopic(userMessage)) {
    const extracted = extractDeferredTopicFromUserMessage(userMessage)
    const topic = extracted || ""
    if (topic) {
      deferredUserPrefContext =
        `=== SUJET À TRAITER PLUS TARD (PRÉFÉRENCE UTILISATEUR) ===\n` +
        `L'utilisateur a explicitement demandé d'en reparler plus tard: "${topic}".\n` +
        `RÈGLE: ne force pas ce sujet maintenant; demande seulement si on le fait maintenant OU on le garde pour plus tard.\n`
    }
  }
  // Context string injected into agent prompts (must be declared before any post-checkup logic uses it).
  let context = ""
  // NOTE: We do NOT persist user_profile_facts automatically from the router.
  // Facts are only written after an explicit confirmation turn (low-stakes prompt).
  // Candidate extraction is owned by Watcher and stored in user_chat_states.temp_memory.
  
  const outageTemplate =
    "Je te réponds dès que je peux, je dois gérer une urgence pour le moment."


  // --- LOGIC VEILLEUR (Watcher) ---
  let msgCount = (state.unprocessed_msg_count || 0) + 1
  let lastProcessed = state.last_processed_at || new Date().toISOString()

  if (msgCount >= 15 && !isEvalParkingLotTest) {
    // Trigger watcher analysis (best effort).
    // IMPORTANT: do NOT block the user response on watcher work (it can add significant wall-clock time).
    runWatcher(supabase, userId, scope, lastProcessed, meta).catch((e) => {
      console.error("[Router] watcher failed (non-blocking):", e)
    })
    msgCount = 0
    lastProcessed = new Date().toISOString()
  }
  // ---------------------------------

  // 3. Analyse du Chef de Gare (Dispatcher)
  // On récupère le dernier message de l'assistant pour le contexte
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const lastAssistantAgentRaw = history.filter((m: any) => m.role === 'assistant').pop()?.agent_used || null;
  const normalizeAgentUsed = (raw: unknown): string | null => {
    const s = String(raw ?? "").trim()
    if (!s) return null
    // DB often stores "sophia.architect" / "sophia.companion" etc.
    const m = s.match(/\b(sentry|firefighter|investigator|architect|companion|librarian)\b/i)
    return m ? m[1]!.toLowerCase() : s.toLowerCase()
  }
  const lastAssistantAgent = normalizeAgentUsed(lastAssistantAgentRaw)
  
  // --- DISPATCHER: Signal-based routing ---
  // Structured signals → deterministic policies instead of LLM choosing the mode directly.
  let riskScore = 0
  let dispatcherTargetMode: AgentMode = "companion"
  let targetMode: AgentMode = "companion"

  // Build state snapshot for dispatcher
  const topicSession = getActiveTopicSession(tempMemory)
  const stateSnapshot = {
    current_mode: state?.current_mode,
    investigation_active: Boolean(state?.investigation_state),
    investigation_status: state?.investigation_state?.status,
    toolflow_active: Boolean((tempMemory as any)?.architect_tool_flow),
    toolflow_kind: (tempMemory as any)?.architect_tool_flow?.kind,
    profile_confirm_pending: Boolean((tempMemory as any)?.user_profile_confirm?.pending),
    plan_confirm_pending: Boolean((tempMemory as any)?.__wa_plan_confirm_pending),
    topic_exploration_phase: topicSession ? topicSession.phase : undefined,
    topic_exploration_type: topicSession?.type,  // "topic_serious" or "topic_light"
    risk_level: state?.risk_level,
  }

  // --- CONTEXTUAL DISPATCHER V2 (with signal history) ---
  let dispatcherSignals: DispatcherSignals
  let newSignalsDetected: NewSignalEntry[] = []
  let signalEnrichments: SignalEnrichment[] = []
  
  if (ENABLE_CONTEXTUAL_DISPATCHER_V1) {
    // Get signal history and active machine
    const signalHistory = getSignalHistory(tempMemory)
    const activeMachine = getActiveMachineType(tempMemory)
    
    // Build last 10 messages (5 turns) for context
    // A turn = 1 user message + 1 assistant message = 2 messages
    const last5TurnsMessages = (history ?? []).slice(-10).map((m: any) => ({
      role: String(m?.role ?? "user"),
      content: String(m?.content ?? "").slice(0, 300),
    }))
    
    // Build flow context for enriching machine-specific prompts
    const flowContext = buildFlowContext(tempMemory, state)
    
    // Build V2 input
    const dispatcherInputV2: DispatcherInputV2 = {
      userMessage,
      lastAssistantMessage,
      last5Messages: last5TurnsMessages,
      signalHistory,
      activeMachine,
      stateSnapshot,
      flowContext,
    }
    
    // Call contextual dispatcher
    const dispatcherResult = await analyzeSignalsV2(dispatcherInputV2, meta)
    dispatcherSignals = dispatcherResult.signals
    newSignalsDetected = dispatcherResult.new_signals
    signalEnrichments = dispatcherResult.enrichments
    
    // Update signal history with new signals and enrichments
    const historyUpdate = updateSignalHistory({
      tempMemory,
      newSignals: newSignalsDetected,
      enrichments: signalEnrichments,
      activeMachine,
    })
    tempMemory = historyUpdate.tempMemory
    
    // Trace dispatcher context
    await traceV("brain:dispatcher_contextual", "dispatcher", {
      active_machine: activeMachine,
      signal_history_count: signalHistory.length,
      new_signals_count: newSignalsDetected.length,
      enrichments_count: signalEnrichments.length,
      pruned_count: historyUpdate.prunedCount,
    })
    
    // Trace new signals detected
    if (newSignalsDetected.length > 0) {
      await trace("brain:new_signals_detected", "dispatcher", {
        signals: newSignalsDetected.map(s => ({
          type: s.signal_type,
          brief: s.brief.slice(0, 50),
          action_target: s.action_target,
        })),
      })
    }
    
    // Trace enrichments
    if (signalEnrichments.length > 0) {
      await traceV("brain:signal_briefs_enriched", "dispatcher", {
        enrichments: signalEnrichments.map(e => ({
          signal: e.existing_signal_type,
          brief: e.updated_brief.slice(0, 50),
        })),
      })
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BILAN SIGNAL DEFERRAL: Store tool signals during bilan for post-bilan processing
    // ═══════════════════════════════════════════════════════════════════════════
    const bilanActive = flowContext?.isBilan && stateSnapshot.investigation_active
    const machineSignals = dispatcherResult.machine_signals
    
    if (bilanActive && machineSignals?.user_consents_defer) {
      // User consented to defer something during bilan - store in deferred_topics_v2
      const currentItemTitle = flowContext?.currentItemTitle ?? undefined
      
      // Determine which machine type to defer based on detected signals
      let machineType: DeferredMachineType | null = null
      let summary = ""
      let actionTarget: string | undefined = currentItemTitle
      
      if (machineSignals.breakdown_recommended) {
        machineType = "breakdown_action"
        summary = currentItemTitle 
          ? `Micro-etape pour ${currentItemTitle}` 
          : "Creer une micro-etape"
      } else if (machineSignals.deep_reasons_opportunity) {
        machineType = "deep_reasons"
        summary = currentItemTitle 
          ? `Explorer blocage sur ${currentItemTitle}` 
          : "Explorer blocage motivationnel"
      } else if (machineSignals.create_action_intent) {
        machineType = "create_action"
        actionTarget = undefined
        summary = "Creer une nouvelle action"
      } else if (machineSignals.update_action_intent) {
        machineType = "update_action"
        summary = currentItemTitle 
          ? `Modifier ${currentItemTitle}` 
          : "Modifier une action"
      }
      
      if (machineType) {
        const deferResult = deferSignal({
          tempMemory,
          machine_type: machineType,
          action_target: actionTarget,
          summary: summary.slice(0, 100),
        })
        tempMemory = deferResult.tempMemory
        
        await trace("brain:bilan_signal_deferred", "investigator", {
          machine_type: machineType,
          action_target: currentItemTitle,
          summary: summary.slice(0, 50),
          trigger_count: deferResult.topic.trigger_count,
        })
        
        console.log(`[Router] Bilan: deferred ${machineType} signal for "${currentItemTitle}" (consent obtained)`)
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PROFILE FACTS DETECTION: Handle direct detection of 10 profile fact types
    // ═══════════════════════════════════════════════════════════════════════════
    const profileFacts = dispatcherResult.machine_signals?.profile_facts_detected
    const pendingConfirm = (tempMemory as any)?.user_profile_confirm?.pending ?? null
    
    // Only process if facts detected, no pending confirmation, and not in safety mode
    if (profileFacts && !pendingConfirm && !bilanActive) {
      // Find the highest confidence fact to confirm first
      const factEntries = Object.entries(profileFacts) as [string, { value: string; confidence: number }][]
      const highConfFact = factEntries
        .filter(([_, f]) => f && f.confidence >= 0.7)
        .sort((a, b) => b[1].confidence - a[1].confidence)[0]
      
      if (highConfFact) {
        const [factType, factData] = highConfFact
        const now = new Date().toISOString()
        const prev = (tempMemory as any)?.user_profile_confirm ?? {}
        
        // Map dispatcher type to database key
        const dbKeyMapping: Record<string, string> = {
          "tone_preference": "conversation.tone",
          "verbosity": "conversation.verbosity",
          "emoji_preference": "conversation.use_emojis",
          "work_schedule": "schedule.work_hours",
          "energy_peaks": "schedule.energy_peaks",
          "wake_time": "schedule.wake_time",
          "sleep_time": "schedule.sleep_time",
          "job": "personal.job",
          "hobbies": "personal.hobbies",
          "family": "personal.family",
        }
        const dbKey = dbKeyMapping[factType]
        
        if (dbKey) {
          tempMemory = {
            ...(tempMemory ?? {}),
            user_profile_confirm: {
              ...(prev ?? {}),
              pending: {
                candidate_id: null,
                key: dbKey,
                proposed_value: factData.value,
                scope: "current",
                asked_at: now,
                reason: "dispatcher_detection",
                confidence: factData.confidence,
              },
              last_asked_at: now,
            },
          }
          
          await trace("brain:profile_fact_detected", "dispatcher", {
            fact_type: factType,
            db_key: dbKey,
            value: factData.value.slice(0, 50),
            confidence: factData.confidence,
          })
          
          console.log(`[Router] Profile fact detected: ${factType} = "${factData.value}" (conf: ${factData.confidence})`)
        }
      }
    }
  } else {
    // Fallback to legacy dispatcher (V2 without signal history)
    dispatcherSignals = await analyzeSignals(userMessage, stateSnapshot, lastAssistantMessage, meta)
  }
  
  riskScore = dispatcherSignals.risk_score

  // Tracing flags for topic exploration (reported in RouterDecisionV1)
  let topicSessionClosedThisTurn = false
  let topicSessionHandoffThisTurn = false

  // --- TOPIC MACHINES (global_machine) ---
  // Two distinct machines: topic_serious (architect) and topic_light (companion)
  // Uses topic_depth signal to determine:
  // - NEED_SUPPORT → firefighter (handled in policy section below)
  // - SERIOUS → topic_serious with owner=architect
  // - LIGHT → topic_light with owner=companion
  // - NONE → no topic exploration triggered
  try {
    const tm0 = (tempMemory ?? {}) as any
    const existing = getActiveTopicSession(tm0)
    const hasExistingTopic = existing?.type === "topic_serious" || existing?.type === "topic_light"
    const interrupt = dispatcherSignals?.interrupt
    const topicDepth = dispatcherSignals?.topic_depth?.value ?? "NONE"
    const topicDepthConf = dispatcherSignals?.topic_depth?.confidence ?? 0

    // Should trigger topic machine: SERIOUS or LIGHT topic + interruption (or continuing existing)
    const shouldTrigger =
      (topicDepth === "SERIOUS" || topicDepth === "LIGHT") &&
      topicDepthConf >= 0.6 &&
      (interrupt?.kind === "DIGRESSION" || interrupt?.kind === "SWITCH_TOPIC") &&
      (Number(interrupt?.confidence ?? 0) >= 0.6)

    const bored = looksLikeUserBoredOrWantsToStop(userMessage)

    // PREEMPTION RULE: topic_serious preempts topic_light
    // If a SERIOUS topic is detected and there's an active topic_light, close the light topic
    if (
      topicDepth === "SERIOUS" && 
      topicDepthConf >= 0.6 && 
      existing?.type === "topic_light"
    ) {
      const closed = closeTopicSession({ tempMemory: tm0 })
      if (closed.changed) {
        tempMemory = closed.tempMemory
        topicSessionClosedThisTurn = true
        // Track the preemption for potential resume
        ;(tempMemory as any).__topic_light_preempted = {
          topic: existing.topic,
          phase: existing.phase,
          turn_count: existing.turn_count,
        }
      }
    }

    // Compute next phase using the new logic
    const nextPhase = computeNextTopicPhase(existing, {
      topic_satisfaction: dispatcherSignals?.topic_satisfaction,
      user_engagement: dispatcherSignals?.user_engagement,
      interrupt: dispatcherSignals?.interrupt ? {
        kind: dispatcherSignals.interrupt.kind,
        confidence: dispatcherSignals.interrupt.confidence,
      } : undefined,
    })

    // Auto-close: if topic was in "closing" phase and next phase is also closing, close it
    if (hasExistingTopic && existing?.phase === "closing" && nextPhase === "closing") {
      const closed = closeTopicSession({ tempMemory: tm0 })
      if (closed.changed) {
        tempMemory = closed.tempMemory
        topicSessionClosedThisTurn = true
      }
    }
    // Also close if user explicitly wants to stop
    else if (hasExistingTopic && bored && existing?.phase !== "opening") {
      const closed = closeTopicSession({ tempMemory: tm0 })
      if (closed.changed) {
        tempMemory = closed.tempMemory
        topicSessionClosedThisTurn = true
      }
    }
    // Update or create topic session
    else if (hasExistingTopic || shouldTrigger) {
      const topicFromDispatcher = interrupt?.deferred_topic_formalized ?? null
      const topic = (typeof topicFromDispatcher === "string" && topicFromDispatcher.trim())
        ? topicFromDispatcher.trim().slice(0, 160)
        : (existing?.topic ? String(existing.topic) : guessTopicLabel(userMessage))

      // Map engagement level from dispatcher signal
      const engagementMap: Record<string, TopicEngagementLevel> = {
        "HIGH": "high",
        "MEDIUM": "medium", 
        "LOW": "low",
        "DISENGAGED": "disengaged",
      }
      const engagement = engagementMap[dispatcherSignals?.user_engagement?.level ?? "MEDIUM"] ?? "medium"
      const satisfaction = dispatcherSignals?.topic_satisfaction?.detected && 
        (dispatcherSignals?.topic_satisfaction?.confidence ?? 0) >= 0.6

      // Compute phase: use existing phase progression or start at opening
      const phase: "opening" | "exploring" | "converging" | "closing" =
        nextPhase ?? (existing?.phase === "opening" ? "exploring" : "exploring")

      // Increment turn count for existing sessions
      const turnCount = (existing?.turn_count ?? 0) + (hasExistingTopic ? 1 : 0)

      // Route to appropriate machine based on topic_depth
      if (topicDepth === "SERIOUS" || (hasExistingTopic && existing?.type === "topic_serious")) {
        const updated = upsertTopicSerious({
        tempMemory: tm0,
        topic,
        phase,
          turnCount,
          engagement,
          satisfaction,
          escalateToLibrarian: shouldEscalateToLibrarian(existing, {
            needs_explanation: dispatcherSignals?.needs_explanation,
          }),
        })
        if (updated.changed) tempMemory = updated.tempMemory
      } else if (topicDepth === "LIGHT" || (hasExistingTopic && existing?.type === "topic_light")) {
        const updated = upsertTopicLight({
          tempMemory: tm0,
          topic,
          phase,
          turnCount,
          engagement,
          satisfaction,
          escalateToLibrarian: shouldEscalateToLibrarian(existing, {
            needs_explanation: dispatcherSignals?.needs_explanation,
          }),
      })
      if (updated.changed) tempMemory = updated.tempMemory
      }
    }
  } catch {
    // best-effort
  }

  // --- DEEP REASONS EXPLORATION ---
  // Two entry points:
  // 1. DEFERRED: Investigator created a deep_reasons deferred topic during bilan → resume after bilan
  // 2. DIRECT: Dispatcher detects motivational blocker outside bilan → Architect can launch directly
  let deepReasonsActiveSession = getActiveDeepReasonsExploration(tempMemory)
  let deepReasonsStateFromTm = (tempMemory as any)?.deep_reasons_state as DeepReasonsState | undefined
  
  try {
    const checkupActive = Boolean(state?.investigation_state && state.investigation_state.status !== "post_checkup")
    const hasDeepReasonsDeferred = hasDeepReasonsDeferredTopic(tempMemory)
    const deepReasonsOpportunity = dispatcherSignals?.deep_reasons?.opportunity ?? false
    const deepReasonsConf = dispatcherSignals?.deep_reasons?.confidence ?? 0
    const inBilanContext = dispatcherSignals?.deep_reasons?.in_bilan_context ?? checkupActive
    
    // Enrich dispatcherSignals with deferred_ready (computed from state)
    if (dispatcherSignals?.deep_reasons) {
      dispatcherSignals.deep_reasons.deferred_ready = hasDeepReasonsDeferred && !checkupActive
    }
    
    // Entry Point 1: Resume deferred deep_reasons topic AFTER bilan ends
    if (hasDeepReasonsDeferred && !checkupActive && !deepReasonsActiveSession && !deepReasonsStateFromTm) {
      const deferredTopic = getDeepReasonsDeferredTopic(tempMemory)
      if (deferredTopic) {
        // Create the deep_reasons state from deferred topic
        const state0 = resumeDeepReasonsFromDeferred(deferredTopic)
        // Store in temp_memory
        ;(tempMemory as any).deep_reasons_state = state0
        deepReasonsStateFromTm = state0
        
        // Create supervisor session
        const sessionCreated = upsertDeepReasonsExploration({
          tempMemory,
          topic: deferredTopic.topic,
          phase: state0.phase,
          pattern: state0.detected_pattern,
          actionTitle: deferredTopic.context?.action_title,
          source: "deferred",
        })
        if (sessionCreated.changed) tempMemory = sessionCreated.tempMemory
        deepReasonsActiveSession = getActiveDeepReasonsExploration(tempMemory)
        
        // Remove the deferred topic (it's now active)
        const removed = removeDeepReasonsDeferredTopic({ temp_memory: tempMemory })
        if (removed?.temp_memory) tempMemory = removed.temp_memory
        
        console.log(`[Router] Deep reasons exploration resumed from deferred topic: ${deferredTopic.topic}`)
      }
    }
    
    // Entry Point 2: Direct opportunity detected by dispatcher (outside bilan)
    // The Architect will handle proposing and potentially launching via start_deep_exploration tool
    // We just need to ensure routing goes to Architect when opportunity is detected
    if (deepReasonsOpportunity && !inBilanContext && deepReasonsConf >= 0.65 && !deepReasonsActiveSession && !checkupActive) {
      // Add a routing hint for Architect
      ;(tempMemory as any).__deep_reasons_opportunity = {
        detected: true,
        pattern: detectDeepReasonsPattern(userMessage) ?? "unknown",
        user_words: String(userMessage ?? "").slice(0, 200),
      }
      console.log(`[Router] Deep reasons opportunity detected (confidence: ${deepReasonsConf.toFixed(2)}), will route to Architect`)
    }
  } catch (e) {
    console.error("[Router] Deep reasons handling error:", e)
  }

  // --- INTERCONNECTION: topic_serious ↔ deep_reasons ---
  // 1. topic_serious → deep_reasons: if during topic_serious, user mentions blocker on specific action
  // 2. deep_reasons → topic_serious: if during deep_reasons, user wants to explore broader topic
  try {
    const activeTopicForInterconnect = getActiveTopicSession(tempMemory)
    const deepReasonsForInterconnect = getActiveDeepReasonsExploration(tempMemory)
    const pausedDeepReasons = getPausedDeepReasonsExploration(tempMemory)
    const deepReasonsOpportunity = dispatcherSignals?.deep_reasons?.opportunity ?? false
    const deepReasonsActionMentioned = dispatcherSignals?.deep_reasons?.action_mentioned ?? false
    const deepReasonsActionHint = dispatcherSignals?.deep_reasons?.action_hint
    const topicDepth = dispatcherSignals?.topic_depth?.value ?? "NONE"
    const topicDepthConf = dispatcherSignals?.topic_depth?.confidence ?? 0

    // Case 1: topic_serious active + blocker on specific action detected → transition to deep_reasons
    if (
      activeTopicForInterconnect?.type === "topic_serious" &&
      deepReasonsOpportunity &&
      deepReasonsActionMentioned &&
      (dispatcherSignals?.deep_reasons?.confidence ?? 0) >= 0.65
    ) {
      // Close topic_serious and mark for deep_reasons transition
      const closed = closeTopicSession({ tempMemory })
      if (closed.changed) {
        tempMemory = closed.tempMemory
        // Store the transition info for the architect to launch deep_reasons
        ;(tempMemory as any).__deep_reasons_from_topic = {
          from_topic: activeTopicForInterconnect.topic,
          action_hint: deepReasonsActionHint,
          pattern: detectDeepReasonsPattern(userMessage) ?? "unknown",
          user_words: String(userMessage ?? "").slice(0, 200),
        }
        // Also set the opportunity flag
        ;(tempMemory as any).__deep_reasons_opportunity = {
          detected: true,
          from_topic_serious: true,
          action_hint: deepReasonsActionHint,
          pattern: detectDeepReasonsPattern(userMessage) ?? "unknown",
          user_words: String(userMessage ?? "").slice(0, 200),
        }
        console.log(`[Router] Transition: topic_serious → deep_reasons (action: ${deepReasonsActionHint})`)
      }
    }

    // Case 2: deep_reasons active + user wants to explore broader topic → pause deep_reasons for topic_serious
    if (
      deepReasonsForInterconnect &&
      deepReasonsForInterconnect.status === "active" &&
      topicDepth === "SERIOUS" &&
      topicDepthConf >= 0.65 &&
      !deepReasonsActionMentioned  // Must be about a broader topic, not another action
    ) {
      // Pause deep_reasons
      const paused = pauseDeepReasonsExploration({ tempMemory })
      if (paused.changed) {
        tempMemory = paused.tempMemory
        // Track the pause for potential resume
        ;(tempMemory as any).__deep_reasons_paused_for_topic = {
          paused_at: new Date().toISOString(),
          resume_brief: paused.pausedSession?.resume_brief,
        }
        console.log(`[Router] Paused deep_reasons for broader topic_serious exploration`)
      }
    }

    // Case 3: topic_serious closes normally + there's a paused deep_reasons → offer to resume
    if (
      !activeTopicForInterconnect &&
      pausedDeepReasons &&
      !deepReasonsForInterconnect  // No active deep_reasons
    ) {
      // Set a flag for the architect to offer resume
      ;(tempMemory as any).__deep_reasons_resume_available = {
        topic: pausedDeepReasons.topic,
        resume_brief: pausedDeepReasons.resume_brief,
        phase: pausedDeepReasons.phase,
      }
    }
  } catch (e) {
    console.error("[Router] Topic/DeepReasons interconnection error:", e)
  }

  // --- DETERMINISTIC POLICY: Signal → targetMode ---
  // Priority order:
  // 1. Safety (sentry, firefighter) - preempts everything
  // 2. Active bilan (investigator) - preempts topic machines
  // 3. deep_reasons_exploration (architect) - structured intervention, preempts topics
  // 4. topic_serious (architect) - preempts topic_light
  // 5. topic_light (companion)
  // 6. Plan focus (architect tools) - can coexist
  // 7. Default (companion)

  // Track preemption for resume handling
  let topicPreemptedBySafety = false
  let machinePreemptedBySafety = false
  const activeTopicForPreemption = getActiveTopicSession(tempMemory)
  const activeMachineForPreemption = getAnyActiveMachine(tempMemory)

  // 1. Safety override (threshold: confidence >= 0.75)
  // IMPORTANT: Safety signals can PAUSE active machines (parenthesis pattern)
  if (dispatcherSignals.safety.level === "SENTRY" && dispatcherSignals.safety.confidence >= 0.75) {
    targetMode = "sentry"
    
    // PAUSE any active machine (tool flow, topic, deep_reasons)
    if (activeMachineForPreemption && !hasPausedMachine(tempMemory)) {
      const candidate = activeMachineForPreemption.meta?.candidate
      const pauseResult = pauseMachineForSafety({
        tempMemory,
        session: activeMachineForPreemption,
        candidate,
        reason: "sentry",
      })
      tempMemory = pauseResult.tempMemory
      machinePreemptedBySafety = true
      
      await trace("brain:machine_paused", "routing", {
        machine_type: activeMachineForPreemption.type,
        action_target: pauseResult.pausedState.action_target,
        reason: "sentry",
      })
    }
    
    // Track if a topic session was preempted (legacy)
    if (activeTopicForPreemption) {
      topicPreemptedBySafety = true
      ;(tempMemory as any).__topic_preempted_by_safety = {
        topic_type: activeTopicForPreemption.type,
        topic: activeTopicForPreemption.topic,
        phase: activeTopicForPreemption.phase,
        turn_count: activeTopicForPreemption.turn_count,
      }
    }
  } else if (dispatcherSignals.safety.level === "FIREFIGHTER" && dispatcherSignals.safety.confidence >= 0.75) {
    targetMode = "firefighter"
    
    // PAUSE any active machine (tool flow, topic, deep_reasons)
    if (activeMachineForPreemption && !hasPausedMachine(tempMemory)) {
      const candidate = activeMachineForPreemption.meta?.candidate
      const pauseResult = pauseMachineForSafety({
        tempMemory,
        session: activeMachineForPreemption,
        candidate,
        reason: "firefighter",
      })
      tempMemory = pauseResult.tempMemory
      machinePreemptedBySafety = true
      
      await trace("brain:machine_paused", "routing", {
        machine_type: activeMachineForPreemption.type,
        action_target: pauseResult.pausedState.action_target,
        reason: "firefighter",
      })
    }
    
    // Track if a topic session was preempted (legacy)
    if (activeTopicForPreemption) {
      topicPreemptedBySafety = true
      ;(tempMemory as any).__topic_preempted_by_safety = {
        topic_type: activeTopicForPreemption.type,
        topic: activeTopicForPreemption.topic,
        phase: activeTopicForPreemption.phase,
        turn_count: activeTopicForPreemption.turn_count,
      }
    }
  }
  // 2. Active bilan hard guard (unless explicit stop)
  else if (
    state?.investigation_state &&
    state?.investigation_state?.status !== "post_checkup" &&
    dispatcherSignals.interrupt.kind !== "EXPLICIT_STOP"
  ) {
    targetMode = "investigator"
  }
  // 3. Intent-based routing
  else {
    const intent = dispatcherSignals.user_intent_primary
    const intentConf = dispatcherSignals.user_intent_confidence

    if (intent === "CHECKUP" && intentConf >= 0.6) {
      targetMode = "investigator"
    } else if (intent === "PLAN" && intentConf >= 0.6) {
      targetMode = "architect"
    } else if (intent === "BREAKDOWN" && intentConf >= 0.6) {
      targetMode = "architect"
    } else if (intent === "PREFERENCE" && intentConf >= 0.6) {
      targetMode = "companion"
    } else if (intent === "EMOTIONAL_SUPPORT") {
      // EMOTIONAL_SUPPORT + topic_depth.NEED_SUPPORT → firefighter
      // Otherwise, companion handles mild emotional talk
      const topicDepth = dispatcherSignals.topic_depth?.value ?? "NONE"
      const topicDepthConf = dispatcherSignals.topic_depth?.confidence ?? 0
      if (topicDepth === "NEED_SUPPORT" && topicDepthConf >= 0.6) {
        targetMode = "firefighter"
      } else if (dispatcherSignals.safety.level === "FIREFIGHTER" && dispatcherSignals.safety.confidence >= 0.5) {
        targetMode = "firefighter"
      } else {
        targetMode = "companion"
      }
    } else if (dispatcherSignals.topic_depth?.value === "NEED_SUPPORT" && dispatcherSignals.topic_depth?.confidence >= 0.6) {
      // Catch-all: if NEED_SUPPORT is detected regardless of intent, route to firefighter
      targetMode = "firefighter"
    } else {
      // Default: companion
      targetMode = "companion"
    }
  }

  // 4. Force mode override (module conversation, etc.)
  if (!disableForcedRouting && opts?.forceMode && targetMode !== "sentry" && targetMode !== "firefighter") {
    await traceV("brain:forced_routing_override", "routing", {
      from: targetMode,
      to: opts.forceMode,
      reason: "opts.forceMode",
      disableForcedRouting,
    })
    targetMode = opts.forceMode
  }

  // 5. Deep Reasons Exploration routing
  // If there's an active deep_reasons session or opportunity, route to Architect
  if (
    !state?.investigation_state &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Active deep_reasons session takes priority
    if (deepReasonsActiveSession || deepReasonsStateFromTm) {
      targetMode = "architect"
      await traceV("brain:deep_reasons_routing", "routing", {
        reason: "active_deep_reasons_session",
        phase: deepReasonsStateFromTm?.phase ?? deepReasonsActiveSession?.phase,
      })
    }
    // Deep reasons opportunity (dispatcher detected motivational blocker outside bilan)
    else if ((tempMemory as any)?.__deep_reasons_opportunity?.detected) {
      targetMode = "architect"
      await traceV("brain:deep_reasons_routing", "routing", {
        reason: "deep_reasons_opportunity",
        pattern: (tempMemory as any)?.__deep_reasons_opportunity?.pattern,
      })
    }
  }

  // 5.5. Create Action Flow v2 routing
  // If there's an active create_action_flow session, route to Architect
  const activeCreateActionSession = getActiveCreateActionFlow(tempMemory)
  if (
    activeCreateActionSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    targetMode = "architect"
    await traceV("brain:create_action_flow_routing", "routing", {
      reason: "active_create_action_flow",
      candidate_status: (activeCreateActionSession.meta as any)?.candidate_status,
    })
  }
  
  // Prune stale create_action_flow sessions
  if (isCreateActionFlowStale(tempMemory)) {
    const pruned = closeCreateActionFlow({ tempMemory, outcome: "abandoned" })
    if (pruned.changed) {
      tempMemory = pruned.tempMemory
      console.log("[Router] Pruned stale create_action_flow session")
    }
  }

  // Handle create_action signals from dispatcher (start new flow if explicit intent)
  const createActionSignal = dispatcherSignals?.create_action
  if (
    createActionSignal &&
    createActionSignal.intent_strength !== "none" &&
    createActionSignal.confidence >= 0.6 &&
    !activeCreateActionSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Route to architect when create_action intent is detected
    if (createActionSignal.intent_strength === "explicit" || createActionSignal.intent_strength === "implicit") {
      targetMode = "architect"
      // Store the signal info for architect to use
      ;(tempMemory as any).__create_action_signal = {
        intent_strength: createActionSignal.intent_strength,
        sophia_suggested: createActionSignal.sophia_suggested,
        user_response: createActionSignal.user_response,
        action_type_hint: createActionSignal.action_type_hint,
        action_label_hint: createActionSignal.action_label_hint,
      }
      await traceV("brain:create_action_signal_routing", "routing", {
        reason: "create_action_signal",
        intent_strength: createActionSignal.intent_strength,
        sophia_suggested: createActionSignal.sophia_suggested,
      })
    }
  }

  // 5.6. Update Action Flow v2 routing
  // If there's an active update_action_flow session, route to Architect
  const activeUpdateActionSession = getActiveUpdateActionFlow(tempMemory)
  if (
    activeUpdateActionSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    targetMode = "architect"
    await traceV("brain:update_action_flow_routing", "routing", {
      reason: "active_update_action_flow",
      candidate_status: (activeUpdateActionSession.meta as any)?.candidate_status,
    })
  }
  
  // Prune stale update_action_flow sessions
  if (isUpdateActionFlowStale(tempMemory)) {
    const pruned = closeUpdateActionFlow({ tempMemory, outcome: "abandoned" })
    if (pruned.changed) {
      tempMemory = pruned.tempMemory
      console.log("[Router] Pruned stale update_action_flow session")
    }
  }

  // Handle update_action signals from dispatcher
  const updateActionSignal = dispatcherSignals?.update_action
  if (
    updateActionSignal &&
    updateActionSignal.detected &&
    updateActionSignal.confidence >= 0.6 &&
    !activeUpdateActionSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Route to architect when update_action intent is detected
    targetMode = "architect"
    // Store the signal info for architect to use
    ;(tempMemory as any).__update_action_signal = {
      detected: updateActionSignal.detected,
      target_hint: updateActionSignal.target_hint,
      change_type: updateActionSignal.change_type,
      new_value_hint: updateActionSignal.new_value_hint,
      user_response: updateActionSignal.user_response,
    }
    await traceV("brain:update_action_signal_routing", "routing", {
      reason: "update_action_signal",
      target_hint: updateActionSignal.target_hint,
      change_type: updateActionSignal.change_type,
    })
  }

  // 5.7. Breakdown Action Flow v2 routing
  // If there's an active breakdown_action_flow session, route to Architect
  const activeBreakdownActionSession = getActiveBreakdownActionFlow(tempMemory)
  if (
    activeBreakdownActionSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    targetMode = "architect"
    await traceV("brain:breakdown_action_flow_routing", "routing", {
      reason: "active_breakdown_action_flow",
      candidate_status: (activeBreakdownActionSession.meta as any)?.candidate_status,
    })
  }
  
  // Prune stale breakdown_action_flow sessions
  if (isBreakdownActionFlowStale(tempMemory)) {
    const pruned = closeBreakdownActionFlow({ tempMemory, outcome: "abandoned" })
    if (pruned.changed) {
      tempMemory = pruned.tempMemory
      console.log("[Router] Pruned stale breakdown_action_flow session")
    }
  }

  // Handle breakdown_action signals from dispatcher
  const breakdownActionSignal = dispatcherSignals?.breakdown_action
  if (
    breakdownActionSignal &&
    breakdownActionSignal.detected &&
    breakdownActionSignal.confidence >= 0.6 &&
    !activeBreakdownActionSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Route to architect when breakdown_action intent is detected
    targetMode = "architect"
    // Store the signal info for architect to use
    ;(tempMemory as any).__breakdown_action_signal = {
      detected: breakdownActionSignal.detected,
      target_hint: breakdownActionSignal.target_hint,
      blocker_hint: breakdownActionSignal.blocker_hint,
      sophia_suggested: breakdownActionSignal.sophia_suggested,
      user_response: breakdownActionSignal.user_response,
    }
    await traceV("brain:breakdown_action_signal_routing", "routing", {
      reason: "breakdown_action_signal",
      target_hint: breakdownActionSignal.target_hint,
      blocker_hint: breakdownActionSignal.blocker_hint,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5.8. SIGNAL DEFERRAL DURING ACTIVE MACHINE
  // Only SENTRY/FIREFIGHTER can interrupt; other signals are deferred
  // ═══════════════════════════════════════════════════════════════════════════════
  
  let deferredAckPrefix = ""  // Will be prepended to agent response if signal was deferred
  
  // Prune expired deferred topics first
  {
    const pruneResult = pruneExpiredDeferredTopics({ tempMemory })
    if (pruneResult.pruned.length > 0) {
      tempMemory = pruneResult.tempMemory
      for (const expired of pruneResult.pruned) {
        await trace("brain:deferred_expired", "cleanup", {
          topic_id: expired.id,
          machine_type: expired.machine_type,
          action_target: expired.action_target,
          age_hours: Math.round((Date.now() - new Date(expired.created_at).getTime()) / (60 * 60 * 1000)),
        })
      }
    }
  }
  
  // Check if any state machine is currently active
  const anyActiveMachine = getAnyActiveMachine(tempMemory)
  const anyActiveToolFlow = getAnyActiveToolFlow(tempMemory)
  const activeToolFlowTarget = anyActiveToolFlow ? getActiveToolFlowActionTarget(tempMemory) : null
  
  // Detect if dispatcher signals would trigger a NEW machine
  const newMachineSignal = detectMachineTypeFromSignals(dispatcherSignals)
  
  // SIGNAL DEFERRAL LOGIC
  if (anyActiveMachine && newMachineSignal) {
    // Check if it's the SAME machine type and SAME action (not a deferral case)
    const isSameMachineType = (() => {
      const activeType = anyActiveMachine.type
      // Map session types to deferred machine types for comparison
      const activeAsMachineType = 
        activeType === "create_action_flow" ? "create_action" :
        activeType === "update_action_flow" ? "update_action" :
        activeType === "breakdown_action_flow" ? "breakdown_action" :
        activeType === "deep_reasons_exploration" ? "deep_reasons" :
        activeType
      return activeAsMachineType === newMachineSignal.machine_type
    })()
    
    const isSameAction = (() => {
      if (!isSameMachineType) return false
      // For non-tool machines (topics, deep_reasons), same machine type is enough
      if (!isToolMachine(newMachineSignal.machine_type)) return true
      // For tool machines, require matching action targets
      return Boolean(
        activeToolFlowTarget &&
        newMachineSignal.action_target &&
        activeToolFlowTarget.toLowerCase().includes(newMachineSignal.action_target.toLowerCase())
      )
    })()
    
    // If it's NOT sentry/firefighter AND (different machine OR different action), DEFER
    if (!shouldInterruptForSafety(dispatcherSignals) && (!isSameMachineType || !isSameAction)) {
      // Generate summary for the deferred signal
      const summary = generateDeferredSignalSummary({
        signals: dispatcherSignals,
        userMessage,
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target,
      })
      
      // Check if matching deferred exists (for UPDATE logic)
      const existingDeferred = findMatchingDeferred({
        tempMemory,
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target,
      })
      
      // Defer the signal
      const deferResult = deferSignal({
        tempMemory,
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target,
        summary,
      })
      tempMemory = deferResult.tempMemory
      
      // Generate acknowledgment prefix
      if (deferResult.action === "created") {
        deferredAckPrefix = generateAcknowledgmentPrefix({
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target,
          isUpdate: false,
        })
      } else {
        // UPDATE case - subtle or silent acknowledgment
        const subtleAck = generateSubtleUpdateAck({
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target,
          triggerCount: deferResult.topic.trigger_count,
        })
        deferredAckPrefix = subtleAck
      }
      
      // Log the deferral with specific event type
      if (deferResult.action === "created") {
        await trace("brain:deferred_created", "routing", {
          topic_id: deferResult.topic.id,
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target,
          summary,
          active_machine: anyActiveMachine.type,
          active_machine_target: activeToolFlowTarget,
        })
      } else {
        await trace("brain:deferred_updated", "routing", {
          topic_id: deferResult.topic.id,
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target,
          trigger_count: deferResult.topic.trigger_count,
          new_summary: summary,
        })
      }
      
      // Also log the generic signal_deferred event
      await trace("brain:signal_deferred", "routing", {
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target,
        deferred_action: deferResult.action,
        summary,
        active_machine: anyActiveMachine.type,
        active_machine_target: activeToolFlowTarget,
      })
      
      // Log if cancelled an old topic due to limit
      if (deferResult.cancelled) {
        await trace("brain:deferred_cancelled_limit", "routing", {
          cancelled_id: deferResult.cancelled.id,
          cancelled_type: deferResult.cancelled.machine_type,
          cancelled_target: deferResult.cancelled.action_target,
        })
      }
      
      // Clear any signals that would have triggered the new machine
      // (so the current machine continues uninterrupted)
      if (newMachineSignal.machine_type === "breakdown_action") {
        delete (tempMemory as any).__breakdown_action_signal
      } else if (newMachineSignal.machine_type === "create_action") {
        delete (tempMemory as any).__create_action_signal
      } else if (newMachineSignal.machine_type === "update_action") {
        delete (tempMemory as any).__update_action_signal
      } else if (newMachineSignal.machine_type === "deep_reasons") {
        delete (tempMemory as any).__deep_reasons_opportunity
      }
    }
  }
  
  // Store the deferred ack prefix for agent to prepend
  if (deferredAckPrefix) {
    ;(tempMemory as any).__deferred_ack_prefix = deferredAckPrefix
  }
  
  // 6. Topic Machine routing (topic_serious / topic_light)
  // If there's an active topic session, route based on owner_mode with librarian escalation
  const activeTopicSession = getActiveTopicSession(tempMemory)
  if (
    activeTopicSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    const isSerious = activeTopicSession.type === "topic_serious"
    const isLight = activeTopicSession.type === "topic_light"
    
    // Check for librarian escalation
    if (activeTopicSession.escalate_to_librarian) {
      // Check if librarian just responded (so we should return to owner)
      const lastAgent = String(state?.current_mode ?? "").toLowerCase()
      if (lastAgent === "librarian") {
        // Librarian has responded, clear escalation and return to owner
        const cleared = setTopicLibrarianEscalation({ tempMemory, escalate: false })
        if (cleared.changed) tempMemory = cleared.tempMemory
        
        targetMode = isSerious ? "architect" : "companion"
        topicSessionHandoffThisTurn = true
        await traceV("brain:topic_librarian_return", "routing", {
          topic_type: activeTopicSession.type,
          returning_to: targetMode,
        })
      } else {
        // Escalation requested, route to librarian
        targetMode = "librarian"
        await traceV("brain:topic_librarian_escalation", "routing", {
          topic_type: activeTopicSession.type,
          reason: "needs_explanation",
        })
      }
    }
    // New escalation detected this turn
    else if (
      dispatcherSignals.needs_explanation?.value &&
      (dispatcherSignals.needs_explanation.confidence ?? 0) >= 0.7
    ) {
      // Set escalation flag and route to librarian
      const updated = setTopicLibrarianEscalation({ tempMemory, escalate: true })
      if (updated.changed) tempMemory = updated.tempMemory
      
      targetMode = "librarian"
      await traceV("brain:topic_librarian_escalation", "routing", {
        topic_type: activeTopicSession.type,
        reason: dispatcherSignals.needs_explanation.reason ?? "needs_explanation",
      })
    }
    // Normal routing based on topic type
    else if (isSerious) {
      targetMode = "architect"
      await traceV("brain:topic_serious_routing", "routing", {
        phase: activeTopicSession.phase,
        turn_count: activeTopicSession.turn_count,
      })
    } else if (isLight) {
      targetMode = "companion"
      await traceV("brain:topic_light_routing", "routing", {
        phase: activeTopicSession.phase,
        turn_count: activeTopicSession.turn_count,
      })
    }
  }

  dispatcherTargetMode = targetMode
  const nCandidates = 1 // Multi-candidate generation disabled (was only used for complex messages in legacy v1)
  console.log(`[Dispatcher] Signals: safety=${dispatcherSignals.safety.level}(${dispatcherSignals.safety.confidence.toFixed(2)}), intent=${dispatcherSignals.user_intent_primary}(${dispatcherSignals.user_intent_confidence.toFixed(2)}), interrupt=${dispatcherSignals.interrupt.kind}, topic_depth=${dispatcherSignals.topic_depth.value}(${dispatcherSignals.topic_depth.confidence.toFixed(2)}) → targetMode=${targetMode}`)
  await trace("brain:dispatcher_result", "dispatcher", {
    risk_score: riskScore,
    target_mode: targetMode,
    target_mode_reason: (() => {
      // Coarse reason, to reconstruct deterministic path without parsing code.
      if (dispatcherSignals.safety.level === "SENTRY" && dispatcherSignals.safety.confidence >= 0.75) return "safety:SENTRY";
      if (dispatcherSignals.safety.level === "FIREFIGHTER" && dispatcherSignals.safety.confidence >= 0.75) return "safety:FIREFIGHTER";
      if (
        state?.investigation_state &&
        state?.investigation_state?.status !== "post_checkup" &&
        dispatcherSignals.interrupt.kind !== "EXPLICIT_STOP"
      ) return "hard_guard:active_bilan";
      return `intent:${dispatcherSignals.user_intent_primary}`;
    })(),
    safety: dispatcherSignals.safety,
    intent: {
      primary: dispatcherSignals.user_intent_primary,
      confidence: dispatcherSignals.user_intent_confidence,
    },
    interrupt: dispatcherSignals.interrupt,
    last_assistant_agent: lastAssistantAgent ?? null,
    state_snapshot: stateSnapshot,
  }, "info")

  const targetModeInitial = targetMode
  let toolFlowActiveGlobal = Boolean((tempMemory as any)?.architect_tool_flow)
  const stopCheckup = isExplicitStopCheckup(userMessage);
  // Signal-based interrupt detection
  const boredOrStopFromSignals = (
    (dispatcherSignals.interrupt.kind === "EXPLICIT_STOP" && dispatcherSignals.interrupt.confidence >= 0.65) ||
    (dispatcherSignals.interrupt.kind === "BORED" && dispatcherSignals.interrupt.confidence >= 0.65)
  )
  const boredOrStop = boredOrStopFromSignals || looksLikeUserBoredOrWantsToStop(userMessage) || stopCheckup
  await traceV("brain:interrupt_detection", "routing", {
    stopCheckup,
    boredOrStopFromSignals,
    interrupt: dispatcherSignals.interrupt,
    boredOrStop,
  })
  let toolflowCancelledOnStop = false
  let resumeActionV1: "prompted" | "accepted" | "declined" | null = null

  // --- Scheduler v1 (minimal): explicit stop/boredom cancels any active Architect toolflow.
  // Toolflows are transactional; they should not block handoffs (topic_exploration) nor hijack emotional/safety turns.
  if (boredOrStop && toolFlowActiveGlobal) {
    const cleared = setArchitectToolFlowInTempMemory({ tempMemory, nextFlow: null })
    if (cleared.changed) {
      tempMemory = cleared.tempMemory
      toolFlowActiveGlobal = Boolean((tempMemory as any)?.architect_tool_flow)
      toolflowCancelledOnStop = true
      await trace("brain:toolflow_cancelled", "routing", {
        reason: boredOrStopFromSignals ? "dispatcher_interrupt" : "heuristic_stop",
        interrupt: dispatcherSignals.interrupt,
      })
    }
  }

  // --- PR5: deterministic resume acceptance/decline for a queued toolflow resume prompt ---
  // If we previously prompted and the user answers "oui/non", act deterministically.
  {
    const marker = (tempMemory as any)?.__router_resume_prompt_v1 ?? null
    const kind = String(marker?.kind ?? "")
    const askedAt = Date.parse(String(marker?.asked_at ?? ""))
    const expired = Number.isFinite(askedAt) ? (Date.now() - askedAt) > 30 * 60 * 1000 : true
    const s = normalizeLoose(userMessage)
    const yes = /\b(oui|ok|daccord|vas\s*y|go)\b/i.test(s) && s.length <= 24
    const no = /\b(non|pas\s+maintenant|laisse|laisse\s+tomber|on\s+s'en\s+fout|plus\s+tard)\b/i.test(s) && s.length <= 40
    if (kind === "architect_toolflow" && !expired && (yes || no)) {
      // Clear marker either way
      try { delete (tempMemory as any).__router_resume_prompt_v1 } catch {}
      if (yes) {
        resumeActionV1 = "accepted"
        // Route to Architect (unless safety/investigator overrides later).
        if (targetMode !== "sentry" && targetMode !== "firefighter" && targetMode !== "investigator") {
          targetMode = "architect"
        }
      } else {
        resumeActionV1 = "declined"
      }
      await traceV("brain:resume_prompt_answer", "routing", {
        kind,
        answer: yes ? "yes" : "no",
        action: resumeActionV1,
        routed_to: yes ? targetMode : null,
      }, "info")
      // Remove the queued resume intent so we don't nag again.
      const removed = removeSupervisorQueueByReasonPrefix({ tempMemory, prefix: "queued_due_to_irrelevant_active_session:architect_tool_flow" })
      if (removed.changed) tempMemory = removed.tempMemory
    } else if (kind === "architect_toolflow" && expired) {
      // Stale marker: clear silently.
      try { delete (tempMemory as any).__router_resume_prompt_v1 } catch {}
      await traceV("brain:resume_prompt_expired", "routing", { kind }, "debug")
    }
  }

  // --- Preference change requests should always be handled by Companion ---
  // We DO NOT rely on dispatcher LLM for this because it may incorrectly route to architect
  // when the user mentions "suite"/"plan"/"style". This breaks the user_profile_confirm state machine.
  if (!disableForcedRouting) {
    const s = normalizeLoose(userMessage)
    const looksLikePreference =
      /\b(plus\s+direct|plutot\s+direct|sois\s+direct|ton\s+direct|plus\s+doux|plutot\s+doux)\b/i.test(s) ||
      /\b(reponses?\s+(?:plus\s+)?courtes?|reponses?\s+br[eè]ves?|plus\s+concis|plus\s+succinct|moins\s+long|moins\s+detail)\b/i.test(s) ||
      /\b(emoji|emojis|smiley|smileys)\b/i.test(s) ||
      /\b(on\s+confirme|je\s+valide|je\s+veux\s+valider)\b/i.test(s);
    ;(tempMemory as any).__router_forced_preference_mode = looksLikePreference ? "companion" : null
    if (
      looksLikePreference &&
      targetMode !== "sentry" &&
      targetMode !== "firefighter" &&
      targetMode !== "investigator"
    ) {
      targetMode = "companion"
    }
  }

  // --- User Profile Confirmation (Companion) hard guard ---
  // If a confirmation is pending, we must route to Companion so it can interpret the answer and call apply_profile_fact.
  // Otherwise the state machine can get stuck (e.g. user mentions "plan" and dispatcher routes to architect).
  if (!disableForcedRouting) {
    const pending = (tempMemory as any)?.user_profile_confirm?.pending ?? null
    ;(tempMemory as any).__router_forced_pending_confirm = pending ? true : false
    if (
      pending &&
      targetMode !== "sentry" &&
      targetMode !== "firefighter" &&
      targetMode !== "investigator"
    ) {
      targetMode = "companion"
    }

    // PR3: index pending confirmation into supervisor.queue (so scheduler can see it even if preempted).
    if (pending) {
      managedPendingReasons["pending:user_profile_confirm"] = true
      const key = typeof (pending as any)?.key === "string" ? String((pending as any).key).slice(0, 80) : ""
      const queued = ensureSupervisorQueueIntent({
        tempMemory,
        requestedMode: "companion",
        reason: "pending:user_profile_confirm",
        messageExcerpt: key || undefined,
      })
      if (queued.changed) tempMemory = queued.tempMemory
    }
  }

  // Supervisor continuity: if there's an active session, keep its owner mode
  // (unless safety modes or investigator lock later override).
  const activeSession = getActiveSupervisorSession(tempMemory)
  const activeOwner = activeSession?.owner_mode ?? null
  const forcedPref = !disableForcedRouting && Boolean((tempMemory as any)?.__router_forced_preference_mode)
  const forcedPendingConfirm = !disableForcedRouting && Boolean((tempMemory as any)?.__router_forced_pending_confirm)
  // Local heuristics: only continue architect tool flows when the user message *actually* continues the flow.
  const userLooksLikeToolFlowContinuation = (() => {
    const s = normalizeLoose(userMessage)
    // If the user explicitly talks about plan/actions tooling, assume it's relevant.
    if (/\b(plan|action|actions|activer|active|ajoute|ajouter|cr[ée]e|cr[ée]er|modifier|mettre\s+a\s+jour|supprime|retire)\b/i.test(s)) return true
    // If the last assistant (architect) asked for consent/clarification, short "oui/ok" is a continuation.
    if (lastAssistantAgent === "architect" && /\b(tu\s+veux|ok\s+pour|on\s+le\s+fait|j['’]ajoute|j['’]active|confirme|d'accord)\b/i.test(normalizeLoose(lastAssistantMessage ?? ""))) {
      if (/\b(oui|ok|daccord|vas\s*y|go)\b/i.test(s) && s.length <= 30) return true
    }
    return false
  })()
  if (
    activeOwner &&
    !state?.investigation_state &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // IMPORTANT: Use toolFlowActiveGlobal (checks temp_memory.architect_tool_flow directly)
    // because topic_exploration is always pushed after architect_tool_flow in the stack,
    // so getActiveSupervisorSession would return topic_exploration, not architect_tool_flow.
    const hasActiveArchitectToolFlow = toolFlowActiveGlobal && !toolflowCancelledOnStop
    // If this is a preference-confirmation moment, do NOT let active sessions hijack.
    if (forcedPref || forcedPendingConfirm) {
      // Keep targetMode as-is (already forced to companion above).
    } else if (hasActiveArchitectToolFlow && !userLooksLikeToolFlowContinuation) {
      // User is off-topic relative to toolflow: let them talk, and keep the toolflow "waiting".
      // (We enqueue the architect continuation as non-urgent follow-up instead of hijacking.)
      const queued = enqueueSupervisorIntent({
        tempMemory,
        requestedMode: "architect",
        reason: `queued_due_to_irrelevant_active_session:architect_tool_flow`,
        messageExcerpt: String(userMessage ?? "").slice(0, 180),
      })
      if (queued.changed) tempMemory = queued.tempMemory
      // Keep targetMode (dispatcher-selected), do NOT force to architect.
    } else {
      // Default supervisor behavior: keep owner mode, and queue the dispatcher choice for later.
    if (targetMode !== activeOwner) {
      const queued = enqueueSupervisorIntent({
        tempMemory,
        requestedMode: targetMode,
        reason: `queued_due_to_active_session:${String(activeSession?.type ?? "")}`,
        messageExcerpt: String(userMessage ?? "").slice(0, 180),
      })
      if (queued.changed) tempMemory = queued.tempMemory
    }
    targetMode = activeOwner
    }
  }

  // Hard guard for Architect multi-turn tool flows:
  // If Architect just asked "which day to remove", ALWAYS keep Architect for the next user reply,
  // regardless of what the dispatcher says (tool tests rely on this continuity).
  const archFlow = (tempMemory as any)?.architect_tool_flow ?? null
  const archFlowAwaitingRemoveDay =
    archFlow &&
    String((archFlow as any)?.kind ?? "") === "update_action_structure" &&
    String((archFlow as any)?.stage ?? "") === "awaiting_remove_day"
  const lastAskedWhichDay =
    lastAssistantAgent === "architect" &&
    /\bquel(le)?\s+jour\b/i.test(lastAssistantMessage ?? "")
  if (!state?.investigation_state && (archFlowAwaitingRemoveDay || lastAskedWhichDay)) {
    targetMode = "architect"
  }

  // If an Architect tool flow is active (create/update action), keep routing on Architect to avoid fragmentation
  // (except safety modes).
  if (
    toolFlowActiveGlobal &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Do NOT force Architect if the user is currently doing preference confirmations or off-topic chit-chat.
    const s = normalizeLoose(userMessage)
    const looksLikeChitChat = s.length <= 80 && /\b(met[eé]o|soleil|temps|journ[ée]e|salut|hello|[çc]a\s+va)\b/i.test(s)
    if (!forcedPref && !forcedPendingConfirm && (userLooksLikeToolFlowContinuation || !looksLikeChitChat)) {
    targetMode = "architect"
    }
  }

  // Safety escalation (candidate -> LLM confirmation) to avoid keyword false positives.
  // We do this BEFORE other routing heuristics, but still allow safety/active-checkup rules below.
  if (targetMode !== "sentry" && looksLikeSentryCandidate(userMessage)) {
    const conf = await confirmRouteToSentry({
      userMessage,
      lastAssistantMessage,
      requestId: meta?.requestId,
      forceRealAi: meta?.forceRealAi,
    })
    if (conf.route && conf.confidence >= 0.55) {
      // Anti-loop: if we already sent a sentry message recently, don't repeat it.
      const recently = await sentrySentRecently({ withinMs: 10 * 60 * 1000 })
      targetMode = recently ? "firefighter" : "sentry"
    }
  }

  // Long-form explainer routing:
  // If the user explicitly asks for a detailed explanation, route to Librarian.
  // Keep safety + active checkup priority.
  if (
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    !state?.investigation_state &&
    targetMode === "companion" &&
    looksLikeLongFormExplanationRequest(userMessage)
  ) {
    // If the user asks for a "reformulation" right after Architect just configured something,
    // keep Architect so it can clarify its own parameters (avoid librarian contradictions).
    const looksConfused =
      /\b(je\s+suis\s+un\s+peu\s+perdu|je\s+suis\s+perdu|tu\s+peux\s+reformuler|reformule|j['’]ai\s+pas\s+compris)\b/i
        .test(userMessage ?? "")
    // Never route to Librarian for "je suis perdu / reformule" (that needs plan-context, not a generic explainer).
    if (looksConfused) {
      targetMode = (lastAssistantAgent === "architect" || Boolean((tempMemory as any)?.architect_tool_flow)) ? "architect" : "companion"
    } else if (lastAssistantAgent === "architect" || Boolean((tempMemory as any)?.architect_tool_flow)) {
      targetMode = "architect"
    } else {
      targetMode = "librarian"
    }
  }

  // Hard guard: if the user references a specific plan item by quoted title, keep Architect.
  // Librarian doesn't have plan context; plan-item questions need Architect.
  if (
    !state?.investigation_state &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    (targetMode === "companion" || targetMode === "librarian")
  ) {
    // Accept quotes with ", “ ”, « », and also simple apostrophes '...'
    const hasQuoted = /["“«']\s*[^"”»']{2,80}\s*["”»']/.test(userMessage ?? "")
    const mentionsPlanOrNext =
      /\b(mon\s+plan|dans\s+mon\s+plan|phase|action|actions|et\s+apr[eè]s|la\s+suite|prochaine\s+[ée]tape|prochaine\s+chose|la\s+prochaine|pour\s+avancer|on\s+fait\s+quoi|je\s+dois\s+faire\s+quoi|qu['’]est[-\s]?ce\s+que\s+je\s+dois\s+faire|c['’]est\s+quoi\s+(exactement|concr[eè]tement)|c['’]est\s+quoi)\b/i
        .test(userMessage ?? "")
    if (hasQuoted && mentionsPlanOrNext) {
      targetMode = "architect"
    }
  }

  // Force Architect for explicit plan/action updates (frequency/days/rename), to ensure tools fire reliably.
  // This also prevents Companion from answering "update" intents with generic encouragement.
  if (
    !state?.investigation_state &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    /\b(mets|met|passe|change|renomme|ajuste|modifie|fr[ée]quence|fois\s+par\s+semaine|x\s*par\s+semaine|jours?\s+fixes?|jours?\s+pr[ée]cis|lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?)\b/i
      .test(userMessage ?? "")
  ) {
    // Narrow it a bit: only if it's plausibly about an action/habit (avoid hijacking unrelated chatter).
    if (/\b(action|habitude|plan|lecture|dashboard|tableau\s+de\s+bord)\b/i.test(userMessage ?? "") || /\bfois\s+par\s+semaine\b/i.test(userMessage ?? "")) {
      targetMode = "architect"
    }
  }

  // Activation / "what's next in my plan" should NOT go to Librarian:
  // Librarian is for long-form generic explanations; plan item questions need plan context + tools (Architect).
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    /\b(mon\s+plan|dans\s+mon\s+plan|phase|action|actions|et\s+apr[eè]s|la\s+suite|qu['’]?est[-\s]?ce\s+qui\s+vient\s+apr[eè]s|prochaine\s+[ée]tape)\b/i.test(userMessage ?? "")
  ) {
    targetMode = "architect"
  }

  // Plan-building continuity: avoid "ping-pong" Companion <-> Architect while an action/habit is being defined.
  // If the user message clearly relates to plan parameters (frequency/days/dashboard/add), keep Architect.
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    (lastAssistantAgent === "architect" || (state?.current_mode ?? "companion") === "architect" || Boolean((tempMemory as any)?.architect_tool_flow)) &&
    /\b(fois\s+par\s+semaine|x\s*par\s+semaine|\/\s*semaine|ajust(e|er)|modifi(e|er)|enl[eè]ve|retire|supprime|ajout(e|er)|ajoute|mon\s+plan|plan|habitude|action|dashboard|tableau\s+de\s+bord|jours?\s+fixes?|jours?\s+planifi[ée]s?|planifi[ée]s?|lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?|lun|mar|mer|jeu|ven|sam|dim|mon|tue|wed|thu|fri|sat|sun|au\s+feeling|libre)\b/i
      .test(userMessage ?? "")
  ) {
    targetMode = "architect"
  }

  // Specific guard: if Architect just asked which day to remove, keep Architect for the user's removal choice.
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    lastAssistantAgent === "architect" &&
    /\bquel(le)?\s+jour\b/i.test(lastAssistantMessage ?? "") &&
    /\b(enl[eè]ve|retire|supprime)\b/i.test(userMessage ?? "")
  ) {
    targetMode = "architect"
  }

  // Habit friction points ("book", "where is it", "start tonight") should also stay with Architect.
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    (lastAssistantAgent === "architect" || (state?.current_mode ?? "companion") === "architect" || Boolean((tempMemory as any)?.architect_tool_flow)) &&
    /\b(livre|lecture|roman|oreiller|table\s+de\s+chevet|canap[ée])\b/i.test(userMessage ?? "")
  ) {
    targetMode = "architect"
  }

  // WhatsApp routing guardrails:
  // When Architect is running an onboarding "micro-sequence" (motivation score -> first concrete step),
  // do not let the dispatcher fall back to Companion on short numeric replies.
  if ((meta?.channel ?? "web") === "whatsapp" && meta?.whatsappMode === "onboarding") {
    if (
      looksLikeMotivationScoreAnswer(userMessage) &&
      lastAssistantAskedForMotivation(lastAssistantMessage) &&
      lastAssistantAgent === "architect"
    ) {
      targetMode = "architect";
    }
  }

  // WhatsApp plan execution guardrail:
  // If Architect just asked for a step confirmation ("C'est fait ?") and the user confirms,
  // keep Architect to close the loop cleanly (avoid Companion "vibes" + re-introducing the same action).
  if ((meta?.channel ?? "web") === "whatsapp") {
    if (lastAssistantAgent === "architect" && lastAssistantAskedForStepConfirmation(lastAssistantMessage) && looksLikeUserConfirmsStep(userMessage)) {
      targetMode = "architect"
    }
  }

  // WhatsApp (general) routing heuristics (not onboarding-specific).
  if ((meta?.channel ?? "web") === "whatsapp") {
    if (looksLikeHowToExerciseQuestion(userMessage)) {
      // Prefer Architect for "how-to" instructions about concrete exercises/actions.
      targetMode = "architect";
    }
    // WhatsApp stress venting:
    // Previously we often downgraded Firefighter → Investigator (structured assessment).
    // But this frequently felt cold / "bilan-y" for users who are simply overwhelmed.
    // New rule: keep Firefighter only when risk is meaningfully elevated; otherwise use Companion.
    if (targetMode === "firefighter" && looksLikeWorkPressureVenting(userMessage) && !looksLikeAcuteDistress(userMessage)) {
      targetMode = riskScore >= 6 ? "firefighter" : "companion";
    }
  }

  // Architect -> Companion handoff (anti-stuck / anti-"always plan" mode):
  // The dispatcher has a stability rule that often keeps "architect" once entered. That's useful,
  // but it can make the architect overstay when the user is no longer in plan/objectives mode.
  // We correct that here with a conservative heuristic.
  if (targetMode === "architect" && (state?.current_mode ?? "companion") === "architect") {
    const inferredPlanFocus = inferPlanFocusFromUser(userMessage)
    const memPlanFocus = Boolean((tempMemory as any)?.architect?.plan_focus ?? false)
    const planFocus = inferredPlanFocus == null ? memPlanFocus : inferredPlanFocus

    const s = normalizeLoose(userMessage)
    const looksLikeShortAck =
      s.length <= 24 && /\b(ok|oui|merci|daccord|ça marche|cest bon|ok merci|parfait|top)\b/i.test(userMessage ?? "")

    const explicitlyAsksForPlanOrSteps =
      /\b(plan|action|actions|phase|objectif|objectifs|et\s+apres|la\s+suite|on\s+fait\s+quoi|par\s+quoi|comment)\b/i
        .test(userMessage ?? "")

    const toolFlowActive = Boolean((tempMemory as any)?.architect_tool_flow)
    const userConfused =
      /\b(je\s+suis\s+un\s+peu\s+perdu|je\s+suis\s+perdu|tu\s+peux\s+reformuler|reformule|j['’]ai\s+pas\s+compris)\b/i
        .test(userMessage ?? "")

    // If the user doesn't want plan-focus, and isn't explicitly asking for structured plan help,
    // hand off to Companion to avoid over-architecting / looping on "why/how".
    // Do NOT hand off away from Architect when we're in a confirmation micro-step.
    const confirmationMicroStep =
      (meta?.channel ?? "web") === "whatsapp" &&
      lastAssistantAgent === "architect" &&
      lastAssistantAskedForStepConfirmation(lastAssistantMessage) &&
      looksLikeUserConfirmsStep(userMessage)

    // Also do NOT hand off away from Architect when it just asked "which day to remove"
    // and the user is replying with the removal choice (common in tool eval flows).
    const removeDayMicroStep =
      lastAssistantAgent === "architect" &&
      /\bquel(le)?\s+jour\b/i.test(lastAssistantMessage ?? "") &&
      /\b(enl[eè]ve|retire|supprime)\b/i.test(userMessage ?? "")
    
    // If the user is explicitly editing habit structure (frequency/days), never hand off away from Architect.
    const explicitHabitStructureEdit =
      /\b(fois\s+par\s+semaine|x\s*par\s+semaine|\/\s*semaine|fr[ée]quence|jours?\s+planifi[ée]s?|lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?|mon|tue|wed|thu|fri|sat|sun)\b/i
        .test(userMessage ?? "")

    // Also: if a tool flow is in progress (create/update action), keep Architect stable even if the user digresses/confused.
    if (confirmationMicroStep || removeDayMicroStep || explicitHabitStructureEdit || toolFlowActive || userConfused) {
      targetMode = "architect"
    } else if (planFocus === false && !explicitlyAsksForPlanOrSteps) {
      targetMode = "companion"
    } else if (looksLikeShortAck && !explicitlyAsksForPlanOrSteps) {
      // Short acknowledgements should not keep the architect "locked" unless the user asks to continue.
      targetMode = "companion"
    }
  }

  // Guardrail: during an active checkup, do NOT route to firefighter for "stress" talk unless
  // risk is elevated or the message clearly signals acute distress.
  // This prevents breaking the checkup flow for normal "stress/organisation" topics.
  const checkupActive = Boolean(state?.investigation_state);
  const isPostCheckup = state?.investigation_state?.status === "post_checkup"

  // If the user digresses during an active bilan (even without saying "later"),
  // capture the topic so it can be revisited after the checkup.
  if (checkupActive && !isPostCheckup && !stopCheckup) {
    const digressionSignal =
      (dispatcherSignals.interrupt.kind === "DIGRESSION" || dispatcherSignals.interrupt.kind === "SWITCH_TOPIC") &&
      dispatcherSignals.interrupt.confidence >= 0.6
    const shouldCaptureDigression = digressionSignal || looksLikeDigressionRequest(userMessage)
    if (shouldCaptureDigression) {
      try {
        const latest = await getUserState(supabase, userId, scope)
        if (latest?.investigation_state) {
          // USE DISPATCHER'S FORMALIZED TOPIC (no extra AI call!)
          const formalizedFromDispatcher = dispatcherSignals.interrupt.deferred_topic_formalized
          const fallbackExtracted = extractTopicFromUserDigression(userMessage) || String(userMessage ?? "").trim().slice(0, 160)
          const topicToStore = formalizedFromDispatcher || fallbackExtracted
          
          if (topicToStore && topicToStore.length >= 3) {
            const updatedInv = appendDeferredTopicToState(latest.investigation_state, topicToStore)
            await updateUserState(supabase, userId, scope, { investigation_state: updatedInv })
            state = { ...(state ?? {}), investigation_state: updatedInv }
            console.log(`[Router] Digression captured: "${topicToStore}" (from=${formalizedFromDispatcher ? "dispatcher" : "fallback"})`)
          } else {
            console.log(`[Router] Digression rejected - no valid topic extracted`)
          }
        }
      } catch (e) {
        console.error("[Router] digression deferred topic store failed (non-blocking):", e)
      }
    }
  }

  // If the user hints at a preference during an active checkup, capture it for later confirmation.
  if (checkupActive && !isPostCheckup && !stopCheckup) {
    const prefHint = detectPreferenceHint(userMessage)
    const pending = (tempMemory as any)?.user_profile_confirm?.pending ?? null
    if (prefHint?.key && prefHint.uncertain && !pending) {
      const now = new Date().toISOString()
      const prev = (tempMemory as any)?.user_profile_confirm ?? {}
      tempMemory = {
        ...(tempMemory ?? {}),
        user_profile_confirm: {
          ...(prev ?? {}),
          pending: { candidate_id: null, key: prefHint.key, scope: "current", asked_at: now, reason: "hint_in_checkup" },
          last_asked_at: now,
        },
      }
      managedPendingReasons["pending:user_profile_confirm"] = true
    }
  }

  // Firefighter continuity:
  // If the last assistant message was in Firefighter mode (panic grounding / safety check),
  // do NOT bounce back to investigator immediately just because the user mentions a checkup item.
  // Keep firefighter for at least one more turn to close the loop and hand off cleanly.
  const firefighterJustSpoke = lastAssistantAgent === "firefighter" || (state?.current_mode ?? "") === "firefighter";
  if (firefighterJustSpoke && !stopCheckup) {
    const lastFF = (lastAssistantMessage ?? "").toString().toLowerCase();
    const u = (userMessage ?? "").toString().toLowerCase();
    const userChoseAB =
      (/\bA\)\b/.test(lastAssistantMessage ?? "") && /\bB\)\b/.test(lastAssistantMessage ?? "")) &&
      /\b(a|b)\b/i.test((userMessage ?? "").toString().trim());
    const userAnsweringFFPrompt =
      /\b(comment tu te sens|tu te sens comment|es-tu en s[eé]curit[eé]|tu es en s[eé]curit[eé]|es-tu seul|tu es seul|on va faire|inspire|expire|respire|4\s*secondes|7\s*secondes|8\s*secondes)\b/i
        .test(lastAssistantMessage ?? "");
    const userStillPhysicallyActivated =
      /\b(j['’]arrive\s+pas\s+[àa]\s+respirer|respir(er|e)\s+mal|coeur|c[œoe]ur|palpit|oppress|panique|angoiss|trembl|vertige)\b/i
        .test(userMessage ?? "");
    const userReportsPartialRelief =
      /\b([çc]a\s+va\s+(un\s+peu\s+)?mieux|un\s+peu\s+mieux|[çc]a\s+aide|merci)\b/i.test(userMessage ?? "");
    const userStillEmotionallyOverwhelmed =
      /\b(j['’]ai\s+l['’]impression\s+de\s+(?:craquer|exploser)|[àa]\s+bout|pas\s+à\s+la\s+hauteur|n['’]y\s+arrive\s+plus|je\s+suis\s+(?:vid[ée]e?|epuis[ée]e?)|[ée]puis[ée]e|trop\s+dur)\b/i
        .test(userMessage ?? "");

    // If the user is still in the firefighter "thread" (answering the prompt, still activated, or just recovering),
    // keep firefighter for this turn. Firefighter can then explicitly hand off back to the bilan.
    if (userChoseAB || userAnsweringFFPrompt || userStillPhysicallyActivated || userReportsPartialRelief || userStillEmotionallyOverwhelmed) {
      targetMode = "firefighter";
    }
  }

  if (checkupActive && !stopCheckup && targetMode === "firefighter" && riskScore <= 1 && !looksLikeAcuteDistress(userMessage)) {
    targetMode = "investigator";
  }

  // HARD GUARD: If the user asks for a micro-step breakdown and there is no acute distress,
  // do not route to firefighter just because the message sounds emotional.
  // "je bloque", "j'y arrive pas", "c'est trop dur" → architect (break_down_action), NOT firefighter.
  if (!looksLikeAcuteDistress(userMessage) && looksLikeBreakdownIntent(userMessage) && targetMode === "firefighter") {
    targetMode = "architect"
  }

  // Manual checkup resumption:
  // If the user explicitly asks to finish/resume the bilan while we are in post-bilan,
  // exit post-bilan state and route to investigator so the checkup can be restarted cleanly.
  if (
    looksLikeExplicitResumeCheckupIntent(userMessage) &&
    (state?.investigation_state?.status === "post_checkup" || state?.investigation_state?.status === "post_checkup_done")
  ) {
    try {
      await updateUserState(supabase, userId, scope, { investigation_state: null })
      state = { ...(state ?? {}), investigation_state: null }
    } catch (e) {
      console.error("[Router] failed to exit post-checkup for resume request (non-blocking):", e)
    }
    targetMode = "investigator"
  }

  // Deterministic routing for specific exercise activations (important on WhatsApp).
  // This avoids the message being treated as small-talk and ensures the framework can be created.
  if (targetMode !== "sentry" && targetMode !== "firefighter" && looksLikeAttrapeRevesActivation(userMessage)) {
    targetMode = "architect"
  }

  // Start checkup/investigator only when it makes sense:
  // - If a checkup is already active, the hard guard below keeps investigator stable.
  // - Otherwise, require explicit intent ("bilan/check") OR a clear progress signal tied to an action/plan.
  // This prevents accidental "bilan mode" launches from noisy classifier outputs.
  // (moved earlier) const checkupActive / stopCheckup
  const dailyBilanReply = looksLikeDailyBilanAnswer(userMessage, lastAssistantMessage)
  if (!checkupActive && !stopCheckup && dailyBilanReply) {
    targetMode = 'investigator'
  }
  // Investigator should ONLY start when the user explicitly asks for it (bilan/check),
  // or when responding to a checkup/bilan prompt (dailyBilanReply).
  // Progress reporting ("j'ai fait / pas fait") should be handled by Architect/Companion, not Investigator.
  const shouldStartInvestigator =
    looksLikeExplicitCheckupIntent(userMessage) ||
    dailyBilanReply
  if (!checkupActive && targetMode === 'investigator' && !shouldStartInvestigator) {
    targetMode = 'companion'
  }

  // Deferred-topic helpers are implemented in `router/deferred_topics.ts` (imported).

  // PR3: index post-checkup parking lot into supervisor.queue (pointer only; state remains in investigation_state).
  if (isPostCheckup) {
    managedPendingReasons["pending:post_checkup_parking_lot"] = true
    const queued = ensureSupervisorQueueIntent({
      tempMemory,
      requestedMode: "companion",
      reason: "pending:post_checkup_parking_lot",
    })
    if (queued.changed) tempMemory = queued.tempMemory
  }

  // Prune managed pending intents that are no longer relevant (keeps supervisor.queue from drifting forever).
  {
    const pruned = pruneSupervisorQueueManagedIntents({ tempMemory, keepReasons: managedPendingReasons })
    if (pruned.changed) tempMemory = pruned.tempMemory
  }

  // HARD GUARD: during an active checkup/bilan, only investigator may answer (unless explicit stop).
  // We still allow safety escalation (sentry/firefighter) to override.
  if (
    checkupActive &&
    !isPostCheckup &&
    !stopCheckup &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter"
  ) {
    targetMode = "investigator";
  }

  // If the user explicitly says "we'll talk about X later/after", capture that topic immediately.
  // This ensures the end-of-bilan transition can reliably enter post-checkup mode.
  if (checkupActive && !isPostCheckup && !stopCheckup && userExplicitlyDefersTopic(userMessage)) {
    try {
      const latest = await getUserState(supabase, userId, scope)
      if (latest?.investigation_state) {
        // USE DISPATCHER'S FORMALIZED TOPIC if available (no extra AI call!)
        const formalizedFromDispatcher = dispatcherSignals.interrupt.deferred_topic_formalized
        const fallbackExtracted = extractDeferredTopicFromUserMessage(userMessage) || String(userMessage ?? "").trim().slice(0, 240)
        const topicToStore = formalizedFromDispatcher || fallbackExtracted
        
        if (topicToStore && topicToStore.length >= 3) {
          const updatedInv = appendDeferredTopicToState(latest.investigation_state, topicToStore)
          await updateUserState(supabase, userId, scope, { investigation_state: updatedInv })
          // Keep local in-memory state in sync so later "preserve deferred_topics" merges don't drop it.
          // (The Investigator branch below uses `state` as a baseline when it writes invResult.newState.)
          state = { ...(state ?? {}), investigation_state: updatedInv }
          console.log(`[Router] User explicit defer captured: "${topicToStore}" (from=${formalizedFromDispatcher ? "dispatcher" : "fallback"})`)
        } else {
          console.log(`[Router] User explicit defer rejected - no valid topic`)
        }
      }
    } catch (e) {
      console.error("[Router] user deferred topic store failed (non-blocking):", e)
    }
  }

  // --- POST-CHECKUP PARKING LOT (router-owned state machine) ---
  // State shape stored in user_chat_states.investigation_state:
  // { status: "post_checkup", temp_memory: { deferred_topics: string[], current_topic_index: number } }
  function userSignalsTopicDone(m: string): boolean {
    const s = (m ?? "").toString().trim().toLowerCase()
    if (!s) return false
    // Include "oui" because users commonly answer "Oui, merci" to the closing question.
    return /\b(oui|c['’]est\s+bon|ok|merci|suivant|passons|on\s+avance|continue|on\s+continue|ça\s+va|c['’]est\s+clair)\b/i.test(s)
  }

  if (isPostCheckup && targetMode !== "sentry") {
    const deferredTopics = state?.investigation_state?.temp_memory?.deferred_topics ?? []
    const idx = Number(state?.investigation_state?.temp_memory?.current_topic_index ?? 0) || 0
    let closedThisTurn = false

    // If the user explicitly stops during post-bilan, close the parking lot immediately.
    if (stopCheckup) {
      if (isEvalParkingLotTest) {
        await updateUserState(supabase, userId, scope, {
          investigation_state: {
            status: "post_checkup_done",
            temp_memory: { deferred_topics: deferredTopics, current_topic_index: idx, finished_at: new Date().toISOString(), stopped_by_user: true },
          },
        })
      } else {
        await updateUserState(supabase, userId, scope, { investigation_state: null })
      }
      targetMode = "companion"
      closedThisTurn = true
    }

    // If user confirms "ok/next" -> advance to next topic immediately (no agent call for this turn).
    if (!closedThisTurn && userSignalsTopicDone(userMessage)) {
      const nextIdx = idx + 1
      if (nextIdx >= deferredTopics.length) {
        if (isEvalParkingLotTest) {
          await updateUserState(supabase, userId, scope, {
            investigation_state: {
              status: "post_checkup_done",
              temp_memory: { deferred_topics: deferredTopics, current_topic_index: nextIdx, finished_at: new Date().toISOString() },
            },
          })
        } else {
          await updateUserState(supabase, userId, scope, { investigation_state: null })
        }
        targetMode = "companion"
        closedThisTurn = true
      } else {
        await updateUserState(supabase, userId, scope, {
          investigation_state: {
            ...state.investigation_state,
            temp_memory: { ...state.investigation_state.temp_memory, current_topic_index: nextIdx },
          },
        })
        targetMode = "companion"
      }
    }

    // If still in post-checkup after the potential advance, route to handle current topic.
    // IMPORTANT: if we just closed post-checkup (e.g. user said "merci/ok"), do NOT proceed to topic-selection.
    // Otherwise we may overwrite the just-written post_checkup_done marker (current_topic_index) in the "Nothing to do -> close" branch.
    if (!closedThisTurn) {
      const state2 = await getUserState(supabase, userId, scope)
      const deferred2 = state2?.investigation_state?.temp_memory?.deferred_topics ?? []
      const idx2 = Number(state2?.investigation_state?.temp_memory?.current_topic_index ?? 0) || 0
      const topic = deferred2[idx2]

      if (topic) {
        // Choose agent
        if (/\b(planning|agenda|organisation|programme|plan)\b/i.test(topic)) targetMode = "architect"
        else if (/\b(panique|crise|je\s+craque|d[ée]tresse|urgence)\b/i.test(topic)) targetMode = "firefighter"
        else if (/\b(stress|angoisse|tension)\b/i.test(topic)) targetMode = "companion"
        else targetMode = "companion"

        const topicContext =
          `=== MODE POST-BILAN (SUJET REPORTÉ ${idx2 + 1}/${deferred2.length}) ===\n` +
          `SUJET À TRAITER MAINTENANT : "${topic}"\n` +
          `CONSIGNE : C'est le moment d'en parler. Traite ce point.\n` +
          `RÈGLES CRITIQUES :\n` +
          `- Le bilan est DÉJÀ TERMINÉ.\n` +
          `- Interdiction de dire "après le bilan" ou de proposer de continuer/reprendre le bilan.\n` +
          `- Ne pose pas de questions de bilan sur d'autres actions/vitals.\n` +
          `- Ne pousse pas "le plan" / des actions/frameworks non activés. Sois compagnon: si l'utilisateur n'en parle pas, n'insiste pas.\n` +
        `VALIDATION : Termine par "C'est bon pour ce point ?" UNIQUEMENT quand tu as donné ton conseil principal et que tu veux valider/avancer.\n` +
        `NE LE RÉPÈTE PAS à chaque message si la discussion continue.`;
        context = `${topicContext}\n\n${context}`.trim()
      } else {
        // Nothing to do -> close
        if (isEvalParkingLotTest) {
          await traceV("brain:state_update", "state", {
            kind: "investigation_state",
            action: "set_post_checkup_done",
            deferred_topics_count: Array.isArray(deferredTopics) ? deferredTopics.length : null,
            current_topic_index: idx,
          }, "info")
          await updateUserState(supabase, userId, scope, {
            investigation_state: {
              status: "post_checkup_done",
              temp_memory: { deferred_topics: deferredTopics, current_topic_index: idx, finished_at: new Date().toISOString() },
            },
          })
        } else {
          await traceV("brain:state_update", "state", { kind: "investigation_state", action: "clear" }, "info")
          await updateUserState(supabase, userId, scope, { investigation_state: null })
        }
        targetMode = "companion"
      }
    }
  }

  // 4. Mise à jour du risque si nécessaire
  if (riskScore !== state.risk_level) {
    await traceV("brain:state_update", "state", {
      kind: "risk_level",
      from: state.risk_level ?? null,
      to: riskScore,
    }, "debug")
    await updateUserState(supabase, userId, scope, { risk_level: riskScore })
  }

  // 4.5 RAG Retrieval (Forge Memory)
  // Build a shared context string used by agent prompts.
  // We always inject temporal context (timezone-aware), and we add heavy RAG context only for selected modes.
  const injectedContext = context
  context = ""

  // Minimal temporal context: always include (except for sentry, which should be short and deterministic).
  const timeBlock =
    targetMode !== "sentry" && userTime?.prompt_block
      ? `=== REPÈRES TEMPORELS ===\n${userTime.prompt_block}\n(Adapte tes salutations/conseils à ce moment de la journée)\n\n`
      : ""
  if (timeBlock) context += timeBlock

  // Modes that need context loading (investigator gets minimal context for efficiency)
  const needsFullContext = ['architect', 'companion', 'firefighter'].includes(targetMode)
  const needsDashboardOnly = targetMode === 'investigator'

  if (needsFullContext || needsDashboardOnly) {
    const __ctxStart = Date.now()
    // C. Dashboard Context (Live Data) - loaded for ALL context-aware modes including investigator
    const dashboardContext = await getDashboardContext(supabase, userId);

    // Heavy context only for full-context modes (not investigator - keep it lightweight)
    let vectorContext = ""
    let identityContext = ""
    let recentTurns = ""
    let shortTerm = ""

    if (needsFullContext) {
    // Recent transcript (raw turns) to complement the Watcher short-term summary ("fil rouge").
    // We keep it bounded to avoid huge prompts.
      recentTurns = (history ?? []).slice(-15).map((m: any) => {
      const role = String(m?.role ?? "").trim() || "unknown"
      const content = String(m?.content ?? "").trim().slice(0, 420)
      const ts = String((m as any)?.created_at ?? "").trim()
      return ts ? `[${ts}] ${role}: ${content}` : `${role}: ${content}`
    }).join("\n")

    // Short-term "fil rouge" maintained by Watcher (when available).
      shortTerm = (state?.short_term_context ?? "").toString().trim()
    // A. Vector Memory
      vectorContext = await retrieveContext(supabase, userId, userMessage);
    
    // B. Core Identity (Temple)
      identityContext = await getCoreIdentity(supabase, userId);
    }

    // D. User model (structured facts) - only for full context modes
    let factsContext = ""
    if (needsFullContext) {
    try {
      const factRows = await getUserProfileFacts({ supabase, userId, scopes: ["global", scope] })
      factsContext = formatUserProfileFactsForPrompt(factRows, scope)
    } catch (e) {
      console.warn("[Context] failed to load user_profile_facts (non-blocking):", e)
      }
    }

    // F. User model confirmation state (for Companion only; no inference in router)
    let prefConfirmContext = ""
    if (targetMode === "companion") {
      try {
        // Candidates are stored in DB (user_profile_fact_candidates) and only injected here.
        const { data: candRows, error: candErr } = await supabase
          .from("user_profile_fact_candidates")
          .select("id, key, scope, proposed_value, confidence, hits, reason, evidence, last_seen_at, last_asked_at, asked_count, status")
          .eq("user_id", userId)
          .in("scope", ["global", scope])
          .in("status", ["pending", "asked"])
          .limit(30)
        if (candErr) throw candErr

        function scoreCandidate(r: any): number {
          const conf = Math.max(0, Math.min(1, Number(r?.confidence ?? 0)))
          const hits = Math.max(1, Number(r?.hits ?? 1))
          const askedCount = Math.max(0, Number(r?.asked_count ?? 0))
          const lastSeen = Date.parse(String(r?.last_seen_at ?? ""))
          const lastAsked = Date.parse(String(r?.last_asked_at ?? ""))
          const ageDays = Number.isFinite(lastSeen) ? (Date.now() - lastSeen) / (24 * 60 * 60 * 1000) : 999
          const recency = Math.exp(-ageDays / 7) // half-life-ish
          const hitFactor = Math.min(2.0, 1 + Math.log1p(hits) / Math.log(6))
          // Anti-spam: if asked in last 24h, heavily penalize.
          const askedRecently = Number.isFinite(lastAsked) && (Date.now() - lastAsked) < 24 * 60 * 60 * 1000
          const askPenalty = askedRecently ? 0.15 : 1.0
          const fatiguePenalty = Math.max(0.3, 1.0 - 0.15 * askedCount)
          return conf * recency * hitFactor * askPenalty * fatiguePenalty
        }

        const candSorted = (candRows ?? [])
          .map((r: any) => ({ ...r, _score: scoreCandidate(r) }))
          .sort((a: any, b: any) => Number(b?._score ?? 0) - Number(a?._score ?? 0))
          .slice(0, 6)

        const pending = (tempMemory as any)?.user_profile_confirm?.pending ?? null
        if (pending || (Array.isArray(candRows) && candRows.length > 0)) {
          const safeCandidates = candSorted
          prefConfirmContext =
            `=== USER MODEL (CANDIDATES / CONFIRMATION) ===\n` +
            `RÈGLE: ne JAMAIS écrire de facts sans confirmation explicite.\n` +
            `PENDING_CONFIRMATION: ${pending ? JSON.stringify(pending) : "null"}\n` +
            `CANDIDATES: ${safeCandidates.length > 0 ? JSON.stringify(safeCandidates) : "[]"}\n`
        }
      } catch (e) {
        console.warn("[Context] failed to build user model candidates context (non-blocking):", e)
      }
    }

    context = ""
    if (deferredUserPrefContext) context += `${deferredUserPrefContext}\n\n`
    if (injectedContext) context += `${injectedContext}\n\n`
    if (timeBlock) context += timeBlock
    if (factsContext) context += `${factsContext}\n\n`
    if (prefConfirmContext) context += `${prefConfirmContext}\n\n`
    if (shortTerm) context += `=== FIL ROUGE (CONTEXTE COURT TERME) ===\n${shortTerm}\n\n`
    if (recentTurns) context += `=== HISTORIQUE RÉCENT (15 DERNIERS MESSAGES) ===\n${recentTurns}\n\n`
    if (dashboardContext) context += `${dashboardContext}\n\n`; 
    if (identityContext) context += `=== PILIERS DE L'IDENTITÉ (TEMPLE) ===\n${identityContext}\n\n`;
    if (vectorContext) context += `=== SOUVENIRS / CONTEXTE (FORGE) ===\n${vectorContext}`;
    
    if (context) {
      const loadedParts = needsFullContext 
        ? "Dashboard + Identity + Vectors" 
        : "Dashboard only (investigator)"
      console.log(`[Context] Loaded ${loadedParts}`);
      await trace("brain:context_loaded", "context", {
        target_mode: targetMode,
        needs_full_context: needsFullContext,
        needs_dashboard_only: needsDashboardOnly,
        loaded_parts: loadedParts,
        load_ms: Date.now() - __ctxStart,
        // lengths only (avoid duplicating sensitive content)
        len: {
          dashboard: String(dashboardContext ?? "").length,
          identity: String(identityContext ?? "").length,
          vectors: String(vectorContext ?? "").length,
          facts: String(factsContext ?? "").length,
          short_term: String(shortTerm ?? "").length,
          recent_turns: String(recentTurns ?? "").length,
          pref_candidates: String(prefConfirmContext ?? "").length,
          total_context: String(context ?? "").length,
        },
      }, "info")
    }
  }
  if (opts?.contextOverride) {
    context = `=== CONTEXTE MODULE (UI) ===\n${opts.contextOverride}\n\n${context}`.trim()
  }

  // --- Architect anti-loop / plan-focus state (lightweight state machine) ---
  // Goal: prevent the Architect from looping on objectives, asking the same question twice, or expanding into multiple objectives.
  // NOTE: plan_focus should reflect user intent even if we temporarily route to firefighter/companion.
  // Otherwise it can get "stuck" (ex: user asks for a micro-pause -> routed to firefighter, but plan_focus stays true).
  {
    const inferred = inferPlanFocusFromUser(userMessage)
    if (inferred != null) {
      await traceV("brain:plan_focus_updated", "routing", { plan_focus: inferred }, "info")
      const tm = (tempMemory ?? {}) as any
      const arch0 = (tm.architect ?? {}) as any
      tempMemory = {
        ...(tm ?? {}),
        architect: {
          ...arch0,
          plan_focus: inferred,
          last_updated_at: new Date().toISOString(),
        },
      }
    }
  }

  if (targetMode === "architect") {
    const tm = (tempMemory ?? {}) as any
    const arch = (tm.architect ?? {}) as any

    const inferred = inferPlanFocusFromUser(userMessage)
    const planFocus = inferred == null ? Boolean(arch.plan_focus ?? false) : inferred
    const objective = extractObjective(userMessage)
    const currentObjective = objective ? objective : (typeof arch.current_objective === "string" ? arch.current_objective : "")

    const lastQfps = Array.isArray(arch.last_q_fps) ? arch.last_q_fps : []
    // Detect repeated questions in the recent Architect turns (same fingerprint appears twice).
    const recentAssistant = history.filter((m: any) => m?.role === "assistant").slice(-6)
    const recentQfps = recentAssistant
      .map((m: any) => extractLastQuestionFingerprint(String(m?.content ?? "")))
      .filter(Boolean) as string[]
    const dup = (() => {
      const seen = new Set<string>()
      for (const fp of recentQfps) {
        if (seen.has(fp)) return true
        seen.add(fp)
      }
      return false
    })()
    const objectiveTalk = recentAssistant
      .map((m: any) => String(m?.content ?? ""))
      .join("\n")
    const objectiveOverTalk = /\b(objectif|pourquoi|prioritaire|vision|identit[eé]|deep\s*why)\b/i.test(objectiveTalk) &&
      recentQfps.length >= 2

    // Also detect repeated user intents (common failure mode: the user repeats the same sentence and the assistant keeps proposing variants).
    const userMsgs = [...history.filter((m: any) => m?.role === "user").map((m: any) => String(m?.content ?? "")), String(userMessage ?? "")]
      .slice(-3)
      .map(normalizeLoose)
      .filter(Boolean)
    const looksLikeReadingLoop = (() => {
      // Heuristic for the common loop: "lecture 10 min, 3 fois/semaine, peur que ça pèse / échec"
      if (userMsgs.length < 2) return false
      const hits = userMsgs.map((s) =>
        /\blecture\b/i.test(s) &&
        /\b10\b/.test(s) &&
        (/\b3\b/.test(s) || /\btrois\b/i.test(s)) &&
        /\b(semaine|fois)\b/i.test(s) &&
        /\b(peur|angoiss|corv[ée]e|pression|[ée]chec)\b/i.test(s),
      )
      return hits.filter(Boolean).length >= 2
    })()
    const userRepeats =
      userMsgs.length >= 2 &&
      (userMsgs[userMsgs.length - 1] === userMsgs[userMsgs.length - 2] ||
        (userMsgs.length >= 3 && userMsgs[userMsgs.length - 1] === userMsgs[userMsgs.length - 3]))

    // User can explicitly flag we're looping even if the wording changes.
    const userSignalsLoop = /\b(tourne en rond|on tourne en rond|tu\s+me\s+reposes?\s+pas|tu\s+me\s+reposes?\s+la\s+meme\s+question|la\s+meme\s+question|tu\s+me\s+redemandes?)\b/i
      .test(normalizeLoose(userMessage))

    const loopHit = dup || objectiveOverTalk || userRepeats || looksLikeReadingLoop || userSignalsLoop
    const prevLoopCount = Number(arch.loop_count ?? 0) || 0
    const loopCount = loopHit ? Math.min(5, prevLoopCount + 1) : Math.max(0, prevLoopCount - 1)

    // Update memory
    const nextArch = {
      ...arch,
      plan_focus: planFocus,
      current_objective: currentObjective || null,
      last_q_fps: Array.from(new Set([...lastQfps, ...recentQfps])).slice(-8),
      loop_count: loopCount,
      last_updated_at: new Date().toISOString(),
    }
    tempMemory = { ...(tm ?? {}), architect: nextArch }

    // Inject a guardrail when we detect a loop OR when plan_focus is false (to prevent plan-obsession bleeding into emotional chats).
    if (loopHit || planFocus === false) {
      await traceV("brain:anti_loop_guardrail", "routing", {
        loopHit,
        reasons: {
          dup,
          objectiveOverTalk,
          userRepeats,
          looksLikeReadingLoop,
          userSignalsLoop,
        },
        loopCount,
        planFocus,
        currentObjective: currentObjective || null,
      }, "info")
      const guard = buildArchitectLoopGuard({
        planFocus,
        currentObjective: currentObjective || null,
        loopCount,
      })
      context = `${guard}\n\n${context}`.trim()
    }
  }

  // 5. Exécution de l'Agent Choisi
  let responseContent = ""
  let nextMode = targetMode

  console.log(`[Router] User: "${userMessage}" -> Dispatch: ${targetMode} (Risk: ${riskScore})`)
  const targetModeFinalBeforeExec = targetMode

  // Anti-loop (plan non détecté): on évite le "computer says no".
  // Si le contexte indique qu'il n'y a AUCUN plan actif et que l'utilisateur insiste (C'est bon / j'ai validé / bug),
  // et qu'on a déjà répondu au moins une fois récemment "je ne vois pas ton plan", on escalade vers support.
  let noPlanEscalatedRecently = false
  if ((meta?.channel ?? "web") === "whatsapp" && meta?.whatsappMode === "onboarding") {
    try {
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("scope", scope)
        .eq("role", "assistant")
        .gte("created_at", sinceIso)
        .filter("metadata->>reason", "eq", "no_plan_loop_escalation")
      noPlanEscalatedRecently = (Number(count ?? 0) || 0) > 0
    } catch {
      noPlanEscalatedRecently = false
    }
  }

  if (
    (meta?.channel ?? "web") === "whatsapp" &&
    meta?.whatsappMode === "onboarding" &&
    !noPlanEscalatedRecently &&
    targetMode === "architect" &&
    looksLikeUserClaimsPlanIsDone(userMessage) &&
    countNoPlanBlockerMentions(history) >= 1
  ) {
    responseContent =
      "Ok, je te crois — là ça ressemble à un souci de synchro ou un bug côté site.\n\n" +
      "Pour ne pas tourner en rond: écris à sophia@sophia-coach.ai avec:\n" +
      "- l’email de ton compte\n" +
      "- une capture de ton dashboard (même vide)\n" +
      "- ton téléphone + navigateur (ex: iPhone/Safari, Android/Chrome)\n\n" +
      "En attendant: dis-moi en 1 phrase ton objectif #1 du moment et je te propose un premier pas simple à faire aujourd’hui (sans attendre que le dashboard se remplisse).";
    nextMode = "architect";
    try {
      await updateUserState(supabase, userId, scope, {
        current_mode: nextMode,
        unprocessed_msg_count: msgCount,
        last_processed_at: lastProcessed,
        temp_memory: tempMemory,
      })
    } catch {}
    // Best-effort: log the assistant message (don't block the reply if DB write fails).
    try {
      const dec = buildRouterDecisionV1({
        requestId: meta?.requestId,
        scope,
        channel,
        dispatcher_target_mode: String(dispatcherTargetMode),
        target_mode_initial: String(targetModeInitial),
        target_mode_final: String(targetModeFinalBeforeExec),
        final_mode: String(nextMode),
        risk_score: Number(riskScore ?? 0) || 0,
        checkup_active: Boolean(checkupActive),
        stop_checkup: Boolean(stopCheckup),
        is_post_checkup: Boolean(isPostCheckup),
        forced_preference_mode: forcedPref,
        forced_pending_confirm: forcedPendingConfirm,
        toolflow_active_global: Boolean(toolFlowActiveGlobal),
        toolflow_cancelled_on_stop: Boolean(toolflowCancelledOnStop),
        pending_nudge_kind: null,
        resume_action_v1: resumeActionV1,
        stale_cleaned: staleCleaned,
        topic_exploration_closed: topicSessionClosedThisTurn,
        topic_exploration_handoff: topicSessionHandoffThisTurn,
        safety_preempted_flow: Boolean((tempMemory as any)?.__router_safety_preempted_v1),
        dispatcher_signals: dispatcherSignals,
        temp_memory_before: tempMemory,
        temp_memory_after: tempMemory,
      })
      const md = {
        ...(opts?.messageMetadata ?? {}),
        reason: "no_plan_loop_escalation",
        ...dec,
      } as any
      console.log("[RouterDecisionV1]", JSON.stringify(md?.router_decision_v1 ?? {}))
      await logMessage(supabase, userId, scope, "assistant", responseContent, "architect", md);
    } catch {}
    return { content: normalizeChatText(responseContent), mode: nextMode, aborted: false };
  }

  // --- DEEP REASONS STATE MACHINE EXECUTION ---
  // If there's an active deep_reasons state, run the state machine instead of normal agent flow
  if (targetMode === "architect" && deepReasonsStateFromTm) {
    try {
      const drResult = await runDeepReasonsExploration({
        supabase,
        userId,
        message: userMessage,
        history,
        currentState: deepReasonsStateFromTm,
        meta: { requestId: meta?.requestId, channel, model: meta?.model },
      })
      
      // Update or clear the deep_reasons state
      if (drResult.newState) {
        ;(tempMemory as any).deep_reasons_state = drResult.newState
        // Update supervisor session phase
        const sessionUpdated = upsertDeepReasonsExploration({
          tempMemory,
          topic: deepReasonsStateFromTm.action_context?.title ?? "blocage motivationnel",
          phase: drResult.newState.phase,
          pattern: drResult.newState.detected_pattern,
          source: drResult.newState.source,
        })
        if (sessionUpdated.changed) tempMemory = sessionUpdated.tempMemory
      } else {
        // Exploration ended - close session and clear state
        const closed = closeDeepReasonsExploration({ 
          tempMemory, 
          outcome: drResult.outcome,
        })
        if (closed.changed) tempMemory = closed.tempMemory
      }
      
      // Merge temp_memory updates back to state
      const mergedTempMemory = {
        ...((state?.temp_memory ?? {}) as any),
        ...((tempMemory ?? {}) as any),
      }
      await updateUserState(supabase, userId, scope, { temp_memory: mergedTempMemory })
      
      await trace("brain:deep_reasons_turn", "agent", {
        phase: drResult.newState?.phase ?? "ended",
        outcome: drResult.outcome ?? null,
        turn_count: drResult.newState?.turn_count ?? deepReasonsStateFromTm.turn_count,
      }, "info")
      
      return { content: normalizeChatText(drResult.content), mode: "architect" as AgentMode, aborted: false }
    } catch (e) {
      console.error("[Router] Deep reasons execution failed:", e)
      // Fall through to normal agent execution
    }
  }

  const selectedChatModel = selectChatModel(targetMode, riskScore)
  await trace("brain:model_selected", "agent", {
    target_mode: targetMode,
    risk_score: riskScore,
    selected_model: selectedChatModel,
    default_model: SOPHIA_CHAT_MODEL,
  }, selectedChatModel === SOPHIA_CHAT_MODEL ? "debug" : "info")

  const agentOut = await runAgentAndVerify({
            supabase,
            userId,
    scope,
    channel,
          userMessage,
          history,
          state,
          context,
    meta,
    targetMode,
    nCandidates,
    checkupActive,
    stopCheckup,
    isPostCheckup,
    outageTemplate,
    sophiaChatModel: (() => {
      if (selectedChatModel !== SOPHIA_CHAT_MODEL) {
        console.log(`[Model] Using PRO model (${selectedChatModel}) for ${targetMode} (risk=${riskScore})`);
      }
      return selectedChatModel;
    })(),
    // Pass dispatcher's formalized deferred topic to avoid extra AI call in agent_exec
    dispatcherDeferredTopic: dispatcherSignals.interrupt.deferred_topic_formalized ?? null,
  })

  responseContent = agentOut.responseContent
  nextMode = agentOut.nextMode
  await trace("brain:agent_done", "agent", {
    target_mode: targetMode,
    next_mode: nextMode,
    response_len: String(responseContent ?? "").length,
    aborted: Boolean((agentOut as any)?.aborted),
    rewritten: Boolean((agentOut as any)?.rewritten),
  }, "info")

  // Refresh temp_memory after agent execution to capture flow closures and markers.
  try {
    const latestAfterAgent = await getUserState(supabase, userId, scope)
    const tmLatest = (latestAfterAgent as any)?.temp_memory ?? {}
    const tmRouter = tempMemory ?? {}
    // Preserve router-only keys that may not be in latest
    const routerKeys = [
      "__deferred_ack_prefix",
      "__resume_message_prefix",
      "deferred_topics_v2",
      "__paused_machine_v2",
    ]
    const merged: any = { ...(tmLatest ?? {}) }
    for (const key of routerKeys) {
      if (Object.prototype.hasOwnProperty.call(tmRouter, key)) {
        merged[key] = (tmRouter as any)[key]
      }
    }
    tempMemory = merged
  } catch {}

  // Inject deferred/resume prefixes into the response (prefixes are prepended)
  const deferredPrefix = (tempMemory as any)?.__deferred_ack_prefix ?? ""
  const resumePrefix = (tempMemory as any)?.__resume_message_prefix ?? ""
  if (deferredPrefix || resumePrefix) {
    const prefix = `${String(deferredPrefix ?? "")}${String(resumePrefix ?? "")}`
    responseContent = `${prefix}${String(responseContent ?? "")}`.trim()
    try { delete (tempMemory as any).__deferred_ack_prefix } catch {}
    try { delete (tempMemory as any).__resume_message_prefix } catch {}
  }

  // AUTO-RELAUNCH FROM DEFERRED (after a flow closes normally)
  const flowJustClosed = (tempMemory as any)?.__flow_just_closed_normally
  if (flowJustClosed) {
    try { delete (tempMemory as any).__flow_just_closed_normally } catch {}

    if (!isDeferredPaused(tempMemory) && hasPendingDeferredTopics(tempMemory)) {
      const nextDeferred = getNextDeferredToProcess(tempMemory)
      if (nextDeferred) {
        const intro = generateAutoRelaunchIntro({ topic: nextDeferred })
        responseContent = `${String(responseContent ?? "").trim()}\n\n${intro}`.trim()

        // Remove from deferred (we're about to process it)
        const removeResult = removeDeferredTopicV2({ tempMemory, topicId: nextDeferred.id })
        tempMemory = removeResult.tempMemory

        // Initialize the next machine immediately
        if (nextDeferred.machine_type === "breakdown_action") {
          const candidate = createBreakdownCandidate({
            target_action: nextDeferred.action_target ? { title: nextDeferred.action_target } : undefined,
          })
          const updated = upsertBreakdownActionFlow({ tempMemory, candidate })
          tempMemory = updated.tempMemory
          nextMode = "architect"
        } else if (nextDeferred.machine_type === "update_action") {
          const candidate = createUpdateCandidate({
            target_action: { title: nextDeferred.action_target ?? "une action" },
            proposed_changes: {},
          })
          const updated = upsertUpdateActionFlow({ tempMemory, candidate })
          tempMemory = updated.tempMemory
          nextMode = "architect"
        } else if (nextDeferred.machine_type === "create_action") {
          const candidate = createActionCandidate({
            label: nextDeferred.action_target ?? "Nouvelle action",
            proposed_by: "sophia",
            status: "awaiting_confirm",
          })
          const updated = upsertCreateActionFlow({ tempMemory, candidate })
          tempMemory = updated.tempMemory
          nextMode = "architect"
        } else if (nextDeferred.machine_type === "topic_light") {
          const topic = nextDeferred.action_target ?? nextDeferred.signal_summaries[0]?.summary ?? "un sujet"
          const updated = upsertTopicLight({ tempMemory, topic, phase: "opening" })
          tempMemory = updated.tempMemory
          nextMode = "companion"
        } else if (nextDeferred.machine_type === "topic_serious") {
          const topic = nextDeferred.action_target ?? nextDeferred.signal_summaries[0]?.summary ?? "un sujet important"
          const updated = upsertTopicSerious({ tempMemory, topic, phase: "opening" })
          tempMemory = updated.tempMemory
          nextMode = "architect"
        } else if (nextDeferred.machine_type === "deep_reasons") {
          const topic = nextDeferred.action_target ?? nextDeferred.signal_summaries[0]?.summary ?? "un blocage motivationnel"
          const updated = upsertDeepReasonsExploration({
            tempMemory,
            topic,
            phase: "re_consent",
            source: "deferred",
          })
          tempMemory = updated.tempMemory
          nextMode = "architect"
        }

        await trace("brain:auto_relaunch", "routing", {
          machine_type: nextDeferred.machine_type,
          action_target: nextDeferred.action_target,
          from_deferred_id: nextDeferred.id,
          trigger_count: nextDeferred.trigger_count,
        })
      }
    }
  }

  // Lightweight global proactivity: occasionally remind a deferred topic (max 1/day, and only if we won't add a 2nd question).
  const nudged = maybeInjectGlobalDeferredNudge({ tempMemory, userMessage, responseText: responseContent })
  if (nudged.changed) {
    tempMemory = nudged.tempMemory
    responseContent = nudged.responseText
    await traceV("brain:global_deferred_nudge_injected", "routing", {
      reason: "maybeInjectGlobalDeferredNudge",
    })
  }

  // --- PR4: deterministic pending nudge (supervisor.queue-driven), behind flag ---
  // Goal: when the user is in a low-stakes moment, surface ONE pending obligation, in a predictable priority order.
  // We never do this in safety or during an active bilan lock.
  let pendingNudgeKind: string | null = null
  if (
    ENABLE_SUPERVISOR_PENDING_NUDGES_V1 &&
    !nudged.changed &&
    nextMode === "companion" &&
    riskScore <= 1 &&
    !checkupActive &&
    lowStakesTurn(userMessage)
  ) {
    const p = pickPendingFromSupervisorQueue(tempMemory)
    if (p?.kind === "post_checkup") {
      pendingNudgeKind = "post_checkup"
      responseContent =
        `${String(responseContent ?? "").trim()}\n\n` +
        `Au fait: il reste un sujet reporté à reprendre. Tu veux qu’on le traite maintenant ?`
    } else if (p?.kind === "profile_confirm") {
      pendingNudgeKind = "profile_confirm"
      responseContent =
        `${String(responseContent ?? "").trim()}\n\n` +
        `Au fait: on avait une petite confirmation en attente${p.excerpt ? ` (${p.excerpt})` : ""}. On la fait maintenant ?`
    } else if (p?.kind === "global_deferred") {
      // Global deferred already has its own injection logic; keep this as a marker only.
      pendingNudgeKind = "global_deferred"
      // No extra text: avoid duplicating the existing global-deferred phrasing.
    }
    if (pendingNudgeKind) {
      await traceV("brain:pending_nudge_injected", "routing", {
        kind: pendingNudgeKind,
        excerpt: p?.excerpt ?? null,
      }, "info")
    }
  }

  // --- PR5: deterministic resume prompt for queued toolflow (low-stakes only), behind flag ---
  if (
    ENABLE_SUPERVISOR_RESUME_NUDGES_V1 &&
    resumeActionV1 == null &&
    pendingNudgeKind == null &&
    !nudged.changed &&
    nextMode === "companion" &&
    riskScore <= 1 &&
    !checkupActive &&
    lowStakesTurn(userMessage)
  ) {
    const rt = getSupervisorRuntime(tempMemory)
    const hasQueuedToolflow = Array.isArray(rt.queue) && rt.queue.some((q: any) =>
      String(q?.reason ?? "") === "queued_due_to_irrelevant_active_session:architect_tool_flow"
    )
    if (hasQueuedToolflow) {
      resumeActionV1 = "prompted"
      ;(tempMemory as any).__router_resume_prompt_v1 = {
        kind: "architect_toolflow",
        asked_at: new Date().toISOString(),
      }
      responseContent =
        `${String(responseContent ?? "").trim()}\n\n` +
        `Au fait: tu veux qu'on reprenne la mise à jour du plan qu'on avait commencée, ou on laisse tomber ?`
      await traceV("brain:resume_prompt_prompted", "routing", {
        kind: "architect_toolflow",
        reason: "queued_due_to_irrelevant_active_session:architect_tool_flow",
      }, "info")
    }
  }

  // --- Safety preemption recovery: when firefighter/sentry preempts a flow, offer to resume later ---
  // Store marker if safety mode preempts an active toolflow
  if (
    (nextMode === "firefighter" || nextMode === "sentry") &&
    toolFlowActiveGlobal &&
    !toolflowCancelledOnStop
  ) {
    ;(tempMemory as any).__router_safety_preempted_v1 = {
      preempted_flow: "architect_tool_flow",
      preempted_at: new Date().toISOString(),
      safety_mode: nextMode,
    }
  }

  // On subsequent low-stakes turn after safety, offer to resume
  if (
    ENABLE_SUPERVISOR_RESUME_NUDGES_V1 &&
    resumeActionV1 == null &&
    pendingNudgeKind == null &&
    !nudged.changed &&
    nextMode === "companion" &&
    riskScore === 0 &&
    !checkupActive &&
    lowStakesTurn(userMessage)
  ) {
    const safetyMarker = (tempMemory as any)?.__router_safety_preempted_v1 ?? null
    const preemptedFlow = safetyMarker?.preempted_flow
    const preemptedAt = Date.parse(String(safetyMarker?.preempted_at ?? ""))
    const expired = !Number.isFinite(preemptedAt) || (Date.now() - preemptedAt) > 30 * 60 * 1000 // 30 min TTL
    
    if (preemptedFlow === "architect_tool_flow" && !expired && toolFlowActiveGlobal) {
      resumeActionV1 = "prompted"
      ;(tempMemory as any).__router_resume_prompt_v1 = {
        kind: "safety_recovery",
        asked_at: new Date().toISOString(),
      }
      responseContent =
        `${String(responseContent ?? "").trim()}\n\n` +
        `Tu as l'air d'aller mieux. Tu veux qu'on reprenne ce qu'on faisait avant, ou on laisse tomber ?`
      // Clear the safety preempted marker
      try { delete (tempMemory as any).__router_safety_preempted_v1 } catch {}
    } else if (expired || !toolFlowActiveGlobal) {
      // Clear stale marker
      try { delete (tempMemory as any).__router_safety_preempted_v1 } catch {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST-PARENTHESIS RESUME HANDLING (V2: for paused machines)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  // Check if we have a paused machine waiting to be resumed
  const pausedMachineV2 = getPausedMachine(tempMemory)
  
  // If the last assistant message asked the resume question, handle user's answer
  if (pausedMachineV2 && lastAssistantAskedResumeQuestion(lastAssistantMessage ?? "")) {
    const wantsResume = looksLikeWantsToResume(userMessage)
    const wantsRest = looksLikeWantsToRest(userMessage)
    
    if (wantsResume) {
      // User wants to resume - restore the machine
      const resumeResult = resumePausedMachine({ tempMemory })
      tempMemory = resumeResult.tempMemory
      
      if (resumeResult.resumed && resumeResult.machineType) {
        // Generate resume message
        const resumeMsg = generateResumeMessage({ pausedMachine: pausedMachineV2 })
        
        // Store for agent to prepend
        ;(tempMemory as any).__resume_message_prefix = resumeMsg
        
        // Route to appropriate owner
        if (resumeResult.machineType === "topic_light") {
          nextMode = "companion"
        } else {
          nextMode = "architect"
        }
        
        await trace("brain:machine_resumed", "routing", {
          machine_type: resumeResult.machineType,
          paused_duration_ms: Date.now() - new Date(pausedMachineV2.paused_at).getTime(),
          reason: pausedMachineV2.reason,
        })
      }
    } else if (wantsRest) {
      // User declined - move machine to deferred and pause ALL deferred for 2h
      
      // First, create a deferred topic from the paused machine
      const machineAsDeferredType = (
        pausedMachineV2.machine_type === "create_action_flow" ? "create_action" :
        pausedMachineV2.machine_type === "update_action_flow" ? "update_action" :
        pausedMachineV2.machine_type === "breakdown_action_flow" ? "breakdown_action" :
        pausedMachineV2.machine_type === "deep_reasons_exploration" ? "deep_reasons" :
        pausedMachineV2.machine_type === "topic_serious" ? "topic_serious" :
        pausedMachineV2.machine_type === "topic_light" ? "topic_light" : null
      ) as DeferredMachineType | null
      
      if (machineAsDeferredType) {
        const deferResult = deferSignal({
          tempMemory,
          machine_type: machineAsDeferredType,
          action_target: pausedMachineV2.action_target,
          summary: pausedMachineV2.resume_context ?? `Pausé après ${pausedMachineV2.reason}`,
        })
        tempMemory = deferResult.tempMemory
        
        await trace("brain:machine_to_deferred", "routing", {
          machine_type: pausedMachineV2.machine_type,
          action_target: pausedMachineV2.action_target,
          user_declined_resume: true,
        })
      }
      
      // Clear the paused machine
      tempMemory = clearPausedMachine(tempMemory).tempMemory
      
      // Pause ALL deferred topics for 2 hours
      const pauseResult = pauseAllDeferredTopics({ tempMemory, durationMs: 2 * 60 * 60 * 1000 })
      tempMemory = pauseResult.tempMemory
      
      await trace("brain:deferred_pause_activated", "routing", {
        duration_ms: 2 * 60 * 60 * 1000,
        reason: "user_declined_resume_after_safety",
      })
      
      // Generate decline message
      const declineMsg = generateDeclineResumeMessage()
      responseContent = declineMsg
    }
    // If neither yes nor no, continue normally (might be a follow-up)
  }
  
  // If there's a paused machine and we're now in a low-stakes turn (after safety),
  // append the resume question to the response
  else if (
    pausedMachineV2 &&
    nextMode === "companion" &&  // Safety intervention is over
    riskScore <= 1 &&
    !checkupActive
  ) {
    // Generate and append the post-parenthesis question
    const resumeQuestion = generatePostParenthesisQuestion({
      pausedMachine: pausedMachineV2,
      reason: pausedMachineV2.reason,
    })
    
    responseContent = `${String(responseContent ?? "").trim()}\n\n${resumeQuestion}`
    
    await trace("brain:post_parenthesis_question", "routing", {
      machine_type: pausedMachineV2.machine_type,
      action_target: pausedMachineV2.action_target,
      paused_duration_ms: Date.now() - new Date(pausedMachineV2.paused_at).getTime(),
    })
  }

  // 6. Mise à jour du mode final et log réponse
  // IMPORTANT: agents may have updated temp_memory mid-turn (e.g. Architect tool flows).
  // Merge with latest DB temp_memory to avoid clobbering those updates.
  let mergedTempMemory = tempMemory
  try {
    const latest = await getUserState(supabase, userId, scope)
    const latestTm = (latest as any)?.temp_memory ?? {}
    // Keep latestTm as base (preserve agent-written changes), but re-apply router-owned supervisor runtime.
    mergedTempMemory = { ...(latestTm ?? {}) }
    if (tempMemory && typeof tempMemory === "object") {
      if ((tempMemory as any).global_machine) (mergedTempMemory as any).global_machine = (tempMemory as any).global_machine
      if ((tempMemory as any).supervisor) (mergedTempMemory as any).supervisor = (tempMemory as any).supervisor
      if ((tempMemory as any).global_deferred_topics) (mergedTempMemory as any).global_deferred_topics = (tempMemory as any).global_deferred_topics
      if ((tempMemory as any).architect) (mergedTempMemory as any).architect = (tempMemory as any).architect
      // V2 deferred topics
      if ((tempMemory as any).deferred_topics_v2) (mergedTempMemory as any).deferred_topics_v2 = (tempMemory as any).deferred_topics_v2
      // Paused machine state (for safety parenthesis)
      if ((tempMemory as any).__paused_machine_v2) (mergedTempMemory as any).__paused_machine_v2 = (tempMemory as any).__paused_machine_v2
    }
    // Scheduler override: if we explicitly cancelled a toolflow on stop/boredom, ensure it stays cleared.
    if (toolflowCancelledOnStop) {
      try {
        delete (mergedTempMemory as any).architect_tool_flow
      } catch {}
    }
  } catch {}

  await updateUserState(supabase, userId, scope, {
    current_mode: nextMode,
    unprocessed_msg_count: msgCount,
    last_processed_at: lastProcessed,
    temp_memory: mergedTempMemory,
  })
  if (logMessages) {
    const dec = buildRouterDecisionV1({
      requestId: meta?.requestId,
      scope,
      channel,
      dispatcher_target_mode: String(dispatcherTargetMode),
      target_mode_initial: String(targetModeInitial),
      target_mode_final: String(targetModeFinalBeforeExec),
      final_mode: String(nextMode),
      risk_score: Number(riskScore ?? 0) || 0,
      checkup_active: Boolean(checkupActive),
      stop_checkup: Boolean(stopCheckup),
      is_post_checkup: Boolean(isPostCheckup),
      forced_preference_mode: forcedPref,
      forced_pending_confirm: forcedPendingConfirm,
      toolflow_active_global: Boolean(toolFlowActiveGlobal),
      toolflow_cancelled_on_stop: Boolean(toolflowCancelledOnStop),
        pending_nudge_kind: pendingNudgeKind,
        resume_action_v1: resumeActionV1,
        stale_cleaned: staleCleaned,
        topic_exploration_closed: topicSessionClosedThisTurn,
        topic_exploration_handoff: topicSessionHandoffThisTurn,
        safety_preempted_flow: Boolean((mergedTempMemory as any)?.__router_safety_preempted_v1),
        dispatcher_signals: dispatcherSignals,
        temp_memory_before: tempMemory,
        temp_memory_after: mergedTempMemory,
      })
      const md = { ...(opts?.messageMetadata ?? {}), ...dec } as any
      console.log("[RouterDecisionV1]", JSON.stringify(md?.router_decision_v1 ?? {}))
    await logMessage(supabase, userId, scope, 'assistant', responseContent, targetMode, md)
  }

  return {
    content: responseContent,
    mode: targetMode
  }
}
