/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import {
  AgentMode,
  getUserState,
  logMessage,
  normalizeScope,
  updateUserState,
} from "../state-manager.ts"
import { runCompanion, retrieveContext } from "../agents/companion.ts"
import {
  loadContextForMode,
  buildContextString,
  type OnDemandTriggers,
} from "../context/loader.ts"
import { getVectorResultsCount, getContextProfile } from "../context/types.ts"
import { runWatcher } from "../agents/watcher.ts"
import { normalizeChatText } from "../chat_text.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"
import { getUserTimeContext } from "../../_shared/user_time_context.ts"
import { getEffectiveTierForUser } from "../../_shared/billing-tier.ts"
import { logBrainTrace, type BrainTracePhase } from "../../_shared/brain-trace.ts"
import { handleTracking } from "../lib/tracking.ts"
// NOTE: getUserProfileFacts and formatUserProfileFactsForPrompt are now handled by context/loader.ts
import {
  countNoPlanBlockerMentions,
  isExplicitStopCheckup,
  lastAssistantAskedForStepConfirmation,
  lastAssistantAskedForMotivation,
  looksLikeActionProgress,
  // looksLikeAttrapeRevesActivation removed - now handled via activate_action signal
  looksLikeDailyBilanAnswer,
  looksLikeExplicitResumeCheckupIntent,
  looksLikeHowToExerciseQuestion,
  looksLikeMotivationScoreAnswer,
  looksLikeUserConfirmsStep,
  looksLikeUserClaimsPlanIsDone,
  looksLikeWorkPressureVenting,
  shouldBypassCheckupLockForDeepWork,
} from "./classifiers.ts"
import {
  looksLikeAcuteDistress, 
  type DispatcherSignals,
  type DispatcherOutputV2,
  type NewSignalEntry,
  type SignalEnrichment,
  type DeferredMachineType,
} from "./dispatcher.ts"
import {
  buildDispatcherStateSnapshot,
  buildLastAssistantInfo,
  runContextualDispatcherV2,
} from "./dispatcher_flow.ts"
import {
  normalizeLoose,
  pickToolflowSummary,
  pickSupervisorSummary,
  pickDeferredSummary,
  pickProfileConfirmSummary,
} from "./router_helpers.ts"
import { resolveCheckupEntryConfirmation } from "./checkup_entry.ts"
import {
  getSignalHistory,
  updateSignalHistory,
} from "./signal_history.ts"
import {
  // NOTE: appendDeferredTopicToState removed - parking lot replaced by deferred_topics_v2
  extractDeferredTopicFromUserMessage,
  userExplicitlyDefersTopic,
} from "./deferred_topics.ts"
import {
  generateDeferredAckWithTopic,
} from "./deferred_messages.ts"
import {
  wasCheckupDoneToday,
} from "../agents/investigator/db.ts"
import { debounceAndBurstMerge } from "./debounce.ts"
import { runAgentAndVerify } from "./agent_exec.ts"
import { maybeInjectGlobalDeferredNudge, pruneGlobalDeferredTopics, shouldStoreGlobalDeferredFromUserMessage, storeGlobalDeferredTopic } from "./global_deferred.ts"
import { applyDeterministicRouting } from "./routing_decision.ts"
import { applyDeepReasonsFlow } from "./deep_reasons_flow.ts"
import { filterToSingleMotherSignal, handleSignalDeferral } from "./deferral_handling.ts"
import {
  closeTopicSession,
  enqueueSupervisorIntent,
  getActiveSupervisorSession,
  getActiveTopicSession,
  getSupervisorRuntime,
  pruneStaleArchitectToolFlow,
  pruneStaleSupervisorState,
  setArchitectToolFlowInTempMemory,
  syncLegacyArchitectToolFlowSession,
  upsertTopicSerious,
  upsertTopicLight,
  incrementTopicTurnCount,
  updateTopicEngagement,
  shouldConvergeTopic,
  computeNextTopicPhase,
  upsertDeepReasonsExploration,
  closeDeepReasonsExploration,
  getActiveDeepReasonsExploration,
  resumeDeepReasonsExplorationSession,
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
  // Track Progress Flow v2
  getActiveTrackProgressFlow,
  upsertTrackProgressFlow,
  closeTrackProgressFlow,
  isTrackProgressFlowStale,
  // Activate Action Flow v2
  getActiveActivateActionFlow,
  upsertActivateActionFlow,
  closeActivateActionFlow,
  isActivateActionFlowStale,
  writeSupervisorRuntime,
  // Machine pause/resume for safety parenthesis
  getPausedMachine,
  resumePausedMachine,
  clearPausedMachine,
  hasActiveToolFlow,
  hasAnyActiveMachine,
  type TopicEngagementLevel,
  type PausedMachineStateV2,
  // Profile confirmation machine
  getProfileConfirmationState,
  hasActiveProfileConfirmation,
  upsertProfileConfirmation,
  getCurrentFactToConfirm,
  advanceProfileConfirmation,
  closeProfileConfirmation,
  type ProfileFactToConfirm,
  // Safety flow machines
  getActiveSafetySentryFlow,
  upsertSafetySentryFlow,
  closeSafetySentryFlow,
  isSafetySentryFlowStale,
  computeSentryNextPhase,
  getActiveSafetyFirefighterFlow,
  upsertSafetyFirefighterFlow,
  closeSafetyFirefighterFlow,
  isSafetyFirefighterFlowStale,
  computeFirefighterNextPhase,
  getActiveSafetyFlow,
  hasActiveSafetyFlow,
  type SafetyFlowPhase,
  type SafetySentryFlowState,
  type SafetyFirefighterFlowState,
} from "../supervisor.ts"
import {
  // Deferred Topics V2
  deferSignal,
  getDeferredTopicsV2,
  updateDeferredTopicV2,
  pauseAllDeferredTopics,
  isDeferredPaused,
  clearDeferredPause,
  hasPendingDeferredTopics,
  isToolMachine,
  machineTypeToSessionType,
  MAX_PROFILE_FACTS_PER_SESSION,
  type DeferredTopicV2,
} from "./deferred_topics_v2.ts"
import {
  generatePostParenthesisQuestion,
  generateDeclineResumeMessage,
  generateResumeMessage,
  looksLikeWantsToResume,
  looksLikeWantsToRest,
  lastAssistantAskedResumeQuestion,
} from "./deferred_messages.ts"
import { runDeepReasonsExploration } from "../agents/architect/deep_reasons.ts"
import type { DeepReasonsState } from "../agents/architect/deep_reasons_types.ts"
import { 
  applyAutoRelaunchFromDeferred, 
  processRelaunchConsentResponse,
  getPendingRelaunchConsent,
} from "./deferred_relaunch.ts"
import { buildRelaunchConsentAgentAddon } from "./relaunch_consent_addons.ts"
import { buildResumeFromSafetyAddon } from "./resume_from_safety_addons.ts"
import { findNextSameTypeTopic, buildNextTopicProposalAddon, type PendingNextTopic } from "./next_topic_addons.ts"

const SOPHIA_CHAT_MODEL =
  (
    ((globalThis as any)?.Deno?.env?.get?.("GEMINI_SOPHIA_CHAT_MODEL") ?? "") as string
  ).trim() || "gemini-2.5-flash";

// Premium model for critical modes (sentry, firefighter high-risk, architect)
const SOPHIA_CHAT_MODEL_PRO =
  (
    ((globalThis as any)?.Deno?.env?.get?.("GEMINI_SOPHIA_CHAT_MODEL_PRO") ?? "") as string
  ).trim() || "gemini-2.5-flash";

// Dedicated model for the safety-router (kept deterministic and fast).
// Note: this is *not* the same as the safety agent models; it's only the classifier that decides sentry routing.
const SOPHIA_SAFETY_ROUTER_MODEL =
  (
    ((globalThis as any)?.Deno?.env?.get?.("SOPHIA_SAFETY_ROUTER_MODEL") ?? "") as string
  ).trim() || "gemini-2.5-flash";

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

const PROFILE_CONFIRM_DEFERRED_KEY = "__profile_confirm_deferred_facts";

// Dispatcher v2 is now the only dispatcher

// ═══════════════════════════════════════════════════════════════════════════════
// HEAVY BACKGROUND JOB FLAGS (useful for tests / local CPU budget)
// Defaults: enabled (set *_DISABLED=1 to skip)
// ═══════════════════════════════════════════════════════════════════════════════
const WATCHER_DISABLED =
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_WATCHER_DISABLED") ?? "") as string).trim() === "1" ||
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_VEILLEUR_DISABLED") ?? "") as string).trim() === "1"

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL HISTORY: Storage and management in temp_memory
// ═══════════════════════════════════════════════════════════════════════════════

const SIGNAL_HISTORY_KEY = "signal_history"
const MAX_SIGNAL_HISTORY_TURNS = 5  // Keep signals from last 5 turns
const MIN_SIGNAL_HISTORY_TURN_INDEX = -(MAX_SIGNAL_HISTORY_TURNS - 1)

function mergeDeferredProfileFacts(
  existing: ProfileFactToConfirm[],
  incoming: ProfileFactToConfirm[],
  maxFacts: number,
): ProfileFactToConfirm[] {
  const map = new Map<string, ProfileFactToConfirm>()
  const add = (fact: ProfileFactToConfirm) => {
    const key = `${fact.key}::${fact.proposed_value}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, fact)
      return
    }
    const prevConf = Number(prev.confidence ?? 0)
    const nextConf = Number(fact.confidence ?? 0)
    const prevTs = Date.parse(String(prev.detected_at ?? ""))
    const nextTs = Date.parse(String(fact.detected_at ?? ""))
    if (nextConf > prevConf || (nextConf === prevConf && nextTs > prevTs)) {
      map.set(key, fact)
    }
  }
  for (const fact of existing) {
    if (fact && fact.key && fact.proposed_value) add(fact)
  }
  for (const fact of incoming) {
    if (fact && fact.key && fact.proposed_value) add(fact)
  }
  return Array.from(map.values())
    .sort((a, b) => {
      const confDiff = Number(b.confidence ?? 0) - Number(a.confidence ?? 0)
      if (confDiff !== 0) return confDiff
      return Date.parse(String(b.detected_at ?? "")) - Date.parse(String(a.detected_at ?? ""))
    })
    .slice(0, maxFacts)
}


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

  function pickPendingFromSupervisorQueue(tm: any): { kind: "global_deferred"; excerpt?: string } | null {
    const rt = getSupervisorRuntime(tm)
    const reasons = Array.isArray(rt.queue) ? rt.queue.map((q: any) => String(q?.reason ?? "")).filter(Boolean) : []
    const has = (r: string) => reasons.includes(r)
    // Priority order (NOTE: post_checkup_parking_lot removed - now uses deferred_topics_v2)
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
    // Avoid false positives like "j'ai fait mon premier cours de salsa".
    // We only want this when the user is explicitly ASKING for an explanation.
    const looksLikeNarration =
      /\b(j['’]ai\s+fait|j['’]ai\s+eu|je\s+viens\s+de|mon\s+premier|premier)\b/i.test(s) &&
      /\b(cours|cours\s+de)\b/i.test(s)
    if (looksLikeNarration) return false

    // Strong explicit requests for detail / explanation / mechanisms (ask forms).
    // Require an intent marker (question mark OR "tu peux" / "peux-tu" / "j'aimerais" / "je veux") so nouns like "cours"
    // don't accidentally route to librarian.
    const hasAskMarker =
      /\?/.test(s) ||
      /\b(peux\s*-?\s*tu|tu\s+peux|j['’]aimerais|je\s+veux|je\s+voudrais)\b/i.test(s)

    const asksForExplanation =
      /\b(explique|explique\s+moi|pourquoi|comment|m[ée]canisme|comment\s+ca\s+marche|comment\s+ca\s+fonctionne|clarifie|clarifier|d[ée]tail|d[ée]tails|d[ée]taille|d[ée]veloppe|d[ée]velopper|pr[ée]cise|pr[ée]cision|guide|pas\s+[aà]\s+pas|step\s+by\s+step)\b/i
        .test(s)

    if (hasAskMarker && asksForExplanation) return true

    // Also treat explicit "réponse longue / explication longue" requests.
    if (/\b(r[ée]ponse\s+longue|longue\s+explication|explication\s+longue)\b/i.test(s)) return true
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
        model: SOPHIA_SAFETY_ROUTER_MODEL,
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

  const isEvalParkingLotTest =
    Boolean(opts?.contextOverride && String(opts.contextOverride).includes("MODE TEST PARKING LOT")) ||
    Boolean(opts?.contextOverride && String(opts.contextOverride).includes("CONSIGNE TEST PARKING LOT"));
  const disableForcedRouting = Boolean(opts?.disableForcedRouting)
  const channel = meta?.channel ?? "web"
  // Ensure all replies use real AI responses.
  meta = {
    ...(meta ?? {}),
    channel,
    forceRealAi: true,
  }
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

    const c2 = pruneStaleSupervisorState({ tempMemory })
    if (c2.changed) { tempMemory = c2.tempMemory; staleCleaned.push(...c2.cleaned) }
  }

  // --- SUPERVISOR (global runtime: stack/queue) ---
  // Keep supervisor runtime in sync with existing multi-turn flows.
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
    "pending:global_deferred_nudge": false,
    // NOTE: "pending:post_checkup_parking_lot" removed - parking lot replaced by deferred_topics_v2
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

  if (!WATCHER_DISABLED && msgCount >= 15 && !isEvalParkingLotTest) {
    // Trigger watcher analysis (best effort).
    // IMPORTANT: do NOT block the user response on watcher work (it can add significant wall-clock time).
    runWatcher(supabase, userId, scope, lastProcessed, meta).catch((e) => {
      console.error("[Router] watcher failed (non-blocking):", e)
    })
    msgCount = 0
    lastProcessed = new Date().toISOString()
  }
  // ---------------------------------

  // NOTE: Relaunch consent handling moved to AFTER dispatcher (uses consent_to_relaunch signal)
  let relaunchConsentHandled = false
  let relaunchConsentNextMode: AgentMode | undefined
  let relaunchDeclineMessage: string | undefined

  // 3. Analyse du Chef de Gare (Dispatcher)
  // On récupère le dernier message de l'assistant pour le contexte
  const { lastAssistantMessage, lastAssistantAgent } = buildLastAssistantInfo(history)
  
  // --- DISPATCHER: Signal-based routing ---
  // Structured signals → deterministic policies instead of LLM choosing the mode directly.
  let riskScore = 0
  let dispatcherTargetMode: AgentMode = "companion"
  let targetMode: AgentMode = "companion"
  let checkupConfirmedThisTurn = false

  // Build state snapshot for dispatcher
  const stateSnapshot = buildDispatcherStateSnapshot({ tempMemory, state })

  // --- CONTEXTUAL DISPATCHER V2 (with signal history) ---
  let dispatcherSignals: DispatcherSignals
  let dispatcherResult: DispatcherOutputV2 | null = null
  let newSignalsDetected: NewSignalEntry[] = []
  let signalEnrichments: SignalEnrichment[] = []
  let primaryMotherSignal: string | null = null
  
  const contextual = await runContextualDispatcherV2({
    userMessage,
    lastAssistantMessage,
    history,
    tempMemory,
    state,
    meta,
    stateSnapshot,
    signalHistoryKey: SIGNAL_HISTORY_KEY,
    minTurnIndex: MIN_SIGNAL_HISTORY_TURN_INDEX,
    trace,
    traceV,
  })
  dispatcherResult = contextual.dispatcherResult
  dispatcherSignals = contextual.dispatcherSignals
  newSignalsDetected = contextual.newSignalsDetected
  signalEnrichments = contextual.signalEnrichments
  tempMemory = contextual.tempMemory
  const flowContext = contextual.flowContext
  const activeMachine = contextual.activeMachine
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEFERRED ENRICHMENT: Apply enrichment to existing deferred topic
  // Dispatcher identified that user's message enriches an existing topic
  // ═══════════════════════════════════════════════════════════════════════════
  if (dispatcherResult.deferred_enrichment) {
    const { topic_id, new_brief } = dispatcherResult.deferred_enrichment
    const enrichResult = updateDeferredTopicV2({
      tempMemory,
      topicId: topic_id,
      summary: new_brief,
    })
    if (enrichResult.updated) {
      tempMemory = enrichResult.tempMemory
      await traceV("brain:deferred_enrichment_applied", "routing", {
        topic_id,
        new_brief,
        total_summaries: enrichResult.topic?.signal_summaries.length ?? 0,
      })
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
    // SINGLE MOTHER SIGNAL ENFORCEMENT
    // Keep only ONE mother signal (except safety) even if dispatcher detected many
    // ═══════════════════════════════════════════════════════════════════════════
    {
      const { primarySignal, filtered } = filterToSingleMotherSignal(dispatcherSignals)
      primaryMotherSignal = primarySignal
      if (primarySignal && filtered.length > 0) {
        const shouldClear = (signal: string) => signal !== primarySignal
        
        if (shouldClear("create_action")) {
          dispatcherSignals.create_action = {
            ...dispatcherSignals.create_action,
            intent_strength: "none",
            sophia_suggested: false,
            user_response: "none",
            modification_info: "none",
            action_type_hint: "unknown",
            action_label_hint: undefined,
          }
        }
        if (shouldClear("update_action")) {
          dispatcherSignals.update_action = {
            ...dispatcherSignals.update_action,
            detected: false,
            target_hint: undefined,
            change_type: "unknown",
            new_value_hint: undefined,
            user_response: "none",
          }
        }
        if (shouldClear("breakdown_action")) {
          dispatcherSignals.breakdown_action = {
            ...dispatcherSignals.breakdown_action,
            detected: false,
            target_hint: undefined,
            blocker_hint: undefined,
            sophia_suggested: false,
            user_response: "none",
          }
        }
        if (shouldClear("topic_exploration")) {
          dispatcherSignals.topic_depth = {
            value: "NONE",
            confidence: 0,
            plan_focus: false,
          }
        }
        if (shouldClear("deep_reasons")) {
          dispatcherSignals.deep_reasons = {
            ...dispatcherSignals.deep_reasons,
            opportunity: false,
            action_mentioned: false,
            action_hint: undefined,
            confidence: 0,
          }
        }
        if (shouldClear("track_progress")) {
          dispatcherSignals.track_progress = {
            ...dispatcherSignals.track_progress,
            detected: false,
            target_hint: undefined,
            status_hint: "unknown",
            value_hint: undefined,
          }
        }
        if (shouldClear("activate_action")) {
          dispatcherSignals.activate_action = {
            ...dispatcherSignals.activate_action,
            detected: false,
            target_hint: undefined,
            exercise_type_hint: undefined,
          }
        }
        
        await traceV("brain:mother_signal_filtered", "dispatcher", {
          primary: primarySignal,
          filtered,
        })
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // RELAUNCH CONSENT HANDLING (uses dispatcher's consent_to_relaunch signal)
    // If we asked the user to confirm relaunch of a deferred topic, process their response
    // ═══════════════════════════════════════════════════════════════════════════
    const pendingRelaunchConsent = getPendingRelaunchConsent(tempMemory)
    if (pendingRelaunchConsent) {
      // Get consent signal from dispatcher (if detected)
      const dispatcherConsentSignal = dispatcherSignals.consent_to_relaunch
      
      const consentResult = processRelaunchConsentResponse({
        tempMemory,
        userMessage,
        profileConfirmDeferredKey: PROFILE_CONFIRM_DEFERRED_KEY,
        dispatcherConsentSignal,
      })
      
      if (consentResult.handled) {
        tempMemory = consentResult.tempMemory
        relaunchConsentHandled = true
        
        if (consentResult.shouldInitMachine && consentResult.nextMode) {
          // User consented - machine is now initialized
          relaunchConsentNextMode = consentResult.nextMode
          await trace("brain:relaunch_consent_accepted", "routing", {
            machine_type: consentResult.machineType,
            action_target: consentResult.actionTarget,
            next_mode: consentResult.nextMode,
            from_dispatcher: Boolean(dispatcherConsentSignal),
          })
          console.log(`[Router] Relaunch consent ACCEPTED: ${consentResult.machineType} → ${consentResult.nextMode} (dispatcher=${Boolean(dispatcherConsentSignal)})`)
        } else if (consentResult.declineMessage) {
          // User declined - store message to prepend
          relaunchDeclineMessage = consentResult.declineMessage
          await trace("brain:relaunch_consent_declined", "routing", {
            machine_type: pendingRelaunchConsent.machine_type,
            action_target: pendingRelaunchConsent.action_target,
            from_dispatcher: Boolean(dispatcherConsentSignal),
          })
          console.log(`[Router] Relaunch consent DECLINED: ${pendingRelaunchConsent.machine_type}`)
        } else {
          // Unclear response - topic dropped silently
          await trace("brain:relaunch_consent_unclear", "routing", {
            machine_type: pendingRelaunchConsent.machine_type,
          })
          console.log(`[Router] Relaunch consent UNCLEAR - topic dropped`)
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BILAN SIGNAL DEFERRAL: Store tool signals during bilan for post-bilan processing
    // ═══════════════════════════════════════════════════════════════════════════
    const bilanActive = flowContext?.isBilan && stateSnapshot.investigation_active
    const machineSignals = dispatcherResult.machine_signals
    
    // Process confirmation signals during bilan
    if (bilanActive && machineSignals) {
      const invState = state?.investigation_state
      const currentItemTitle = flowContext?.currentItemTitle
      const currentItemId = flowContext?.currentItemId
      const missedStreak = flowContext?.missedStreak ?? 0
      
      // Check for pending defer question and process confirmations
      const pendingQuestion = invState?.temp_memory?.pending_defer_question
      
      // Process confirm_deep_reasons signal
      if (machineSignals.confirm_deep_reasons !== undefined && machineSignals.confirm_deep_reasons !== null) {
        const confirmed = Boolean(machineSignals.confirm_deep_reasons)
        
        // Update bilan_defer_consents
        const existingConsents = invState?.temp_memory?.bilan_defer_consents ?? {}
        const newConsents = {
          ...existingConsents,
          explore_deep_reasons: {
            action_id: pendingQuestion?.action_id ?? currentItemId ?? "",
            action_title: pendingQuestion?.action_title ?? currentItemTitle ?? "",
            confirmed,
          },
        }
        
        // Update investigation state
        if (invState) {
          invState.temp_memory = {
            ...(invState.temp_memory ?? {}),
            bilan_defer_consents: newConsents,
            pending_defer_question: undefined, // Clear pending question
          }
        }
        
        // If confirmed, defer the signal
        if (confirmed) {
          const deferResult = deferSignal({
      tempMemory,
            machine_type: "deep_reasons",
            action_target: currentItemTitle,
            summary: `Explorer blocage sur ${currentItemTitle ?? "une action"}`,
          })
          tempMemory = deferResult.tempMemory
          console.log(`[Router] Bilan: deep_reasons confirmed for "${currentItemTitle}"`)
        } else {
          console.log(`[Router] Bilan: deep_reasons declined for "${currentItemTitle}"`)
        }
      }
      
      // Process confirm_breakdown signal
      if (machineSignals.confirm_breakdown !== undefined && machineSignals.confirm_breakdown !== null) {
        const confirmed = Boolean(machineSignals.confirm_breakdown)
        const actionId = pendingQuestion?.action_id ?? currentItemId ?? ""
        
        // Update bilan_defer_consents
        const existingConsents = invState?.temp_memory?.bilan_defer_consents ?? {}
        const existingBreakdowns = (existingConsents as any).breakdown_action ?? {}
        const newConsents = {
          ...existingConsents,
          breakdown_action: {
            ...existingBreakdowns,
            [actionId]: {
              action_title: pendingQuestion?.action_title ?? currentItemTitle ?? "",
              streak_days: pendingQuestion?.streak_days ?? missedStreak,
              confirmed,
            },
          },
        }
        
        // Update investigation state
        if (invState) {
          invState.temp_memory = {
            ...(invState.temp_memory ?? {}),
            bilan_defer_consents: newConsents,
            pending_defer_question: undefined, // Clear pending question
          }
        }
        
        // If confirmed, defer the signal
        if (confirmed) {
          const deferResult = deferSignal({
            tempMemory,
            machine_type: "breakdown_action",
            action_target: currentItemTitle,
            summary: `Micro-étape pour ${currentItemTitle ?? "une action"}`,
          })
          tempMemory = deferResult.tempMemory
          console.log(`[Router] Bilan: breakdown confirmed for "${currentItemTitle}"`)
        } else {
          console.log(`[Router] Bilan: breakdown declined for "${currentItemTitle}"`)
        }
      }
      
      // Process confirm_topic signal
      if (machineSignals.confirm_topic !== undefined && machineSignals.confirm_topic !== null) {
        const confirmed = Boolean(machineSignals.confirm_topic)
        
        // Update bilan_defer_consents
        const existingConsents = invState?.temp_memory?.bilan_defer_consents ?? {}
        const newConsents = {
          ...existingConsents,
          topic_exploration: {
            topic_hint: pendingQuestion?.topic_hint ?? "",
            confirmed,
          },
        }
        
        // Update investigation state
        if (invState) {
          invState.temp_memory = {
            ...(invState.temp_memory ?? {}),
            bilan_defer_consents: newConsents,
            pending_defer_question: undefined, // Clear pending question
          }
        }
        
        // If confirmed, defer the signal
        if (confirmed) {
          const deferResult = deferSignal({
            tempMemory,
            machine_type: "topic_light",
            action_target: pendingQuestion?.topic_hint,
            summary: pendingQuestion?.topic_hint ?? "Sujet à explorer",
          })
          tempMemory = deferResult.tempMemory
          console.log(`[Router] Bilan: topic exploration confirmed`)
        } else {
          console.log(`[Router] Bilan: topic exploration declined`)
        }
      }
      
      // Set pending_defer_question when signals are detected (for investigator to ask)
      // Only set if no pending question already exists
      if (!pendingQuestion && invState) {
        if (machineSignals.deep_reasons_opportunity && !invState.temp_memory?.bilan_defer_consents?.explore_deep_reasons) {
          invState.temp_memory = {
            ...(invState.temp_memory ?? {}),
            pending_defer_question: {
              machine_type: "deep_reasons",
              action_id: currentItemId,
              action_title: currentItemTitle,
            },
          }
          console.log(`[Router] Bilan: setting pending_defer_question for deep_reasons on "${currentItemTitle}"`)
        } else if (machineSignals.breakdown_recommended && missedStreak >= 5) {
          const existingBreakdowns = (invState.temp_memory?.bilan_defer_consents as any)?.breakdown_action ?? {}
          if (!existingBreakdowns[currentItemId ?? ""]) {
            invState.temp_memory = {
              ...(invState.temp_memory ?? {}),
              pending_defer_question: {
                machine_type: "breakdown",
                action_id: currentItemId,
                action_title: currentItemTitle,
                streak_days: missedStreak,
              },
            }
            console.log(`[Router] Bilan: setting pending_defer_question for breakdown on "${currentItemTitle}" (streak: ${missedStreak})`)
          }
        }
      }
    }
    
    const hasExplicitConfirm =
      machineSignals?.confirm_deep_reasons !== undefined ||
      machineSignals?.confirm_breakdown !== undefined ||
      machineSignals?.confirm_topic !== undefined
    if (bilanActive && machineSignals?.user_consents_defer && !hasExplicitConfirm) {
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
        
        await trace("brain:bilan_signal_deferred", "dispatcher", {
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
    // Now uses proper state machine (user_profile_confirmation) via deferred_topics_v2
    // ═══════════════════════════════════════════════════════════════════════════
    const profileFacts = dispatcherResult.machine_signals?.profile_facts_detected
    const profileConfirmActive = hasActiveProfileConfirmation(tempMemory)
    const pendingCheckupEntryForProfileFacts = Boolean((tempMemory as any)?.__checkup_entry_pending)
    
    // Only process if facts detected, no active confirmation machine, and not in safety mode
    if (profileFacts && !profileConfirmActive && !bilanActive) {
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
      
      // Collect ALL high-confidence facts (up to MAX_PROFILE_FACTS_PER_SESSION)
      const factEntries = Object.entries(profileFacts) as [string, { value: string; confidence: number }][]
      const userMsgNorm = normalizeLoose(userMessage)
      const looksLikeStableHobbyMention = (() => {
        // Require stable statements ("j'aime", "je fais", "passion") to treat as hobbies.
        if (!userMsgNorm) return false
        return /\b(j['’]aime|j'adore|je\s+fais|je\s+pratique|ma\s+passion|mon\s+loisir|je\s+suis\s+fan\s+de)\b/i.test(userMsgNorm)
      })()
      const hobbyMinConfidence = looksLikeStableHobbyMention ? 0.7 : 0.88
      const highConfFacts = factEntries
        .filter(([factType, f]) => {
          if (!f) return false
          const conf = Number(f.confidence ?? 0) || 0
          // Prevent one-off activity narration ("j'ai fait un cours de salsa") from starting profile confirmation.
          if (factType === "hobbies") {
            if (!looksLikeStableHobbyMention && /\b(cours|premier|j['’]ai\s+fait|je\s+viens\s+de)\b/i.test(userMsgNorm)) {
              return false
            }
            return conf >= hobbyMinConfidence
          }
          return conf >= 0.7
        })
        .sort((a, b) => b[1].confidence - a[1].confidence)
        .slice(0, MAX_PROFILE_FACTS_PER_SESSION)
      
      if (highConfFacts.length > 0) {
        const now = new Date()
        const nowStr = now.toISOString()
        
        // Convert to ProfileFactToConfirm format
        const factsToConfirm: ProfileFactToConfirm[] = highConfFacts
          .map(([factType, factData]) => {
            const dbKey = dbKeyMapping[factType]
            if (!dbKey) return null
            return {
              key: dbKey,
              proposed_value: factData.value,
              confidence: factData.confidence,
              detected_at: nowStr,
            }
          })
          .filter((f): f is ProfileFactToConfirm => f !== null)
        
        if (factsToConfirm.length > 0) {
          // Check if another machine is active (not profile confirmation)
          const otherMachineActive =
            (activeMachine && activeMachine !== "user_profile_confirmation") ||
            // Do NOT interrupt checkup entry: defer profile confirmations until after the bilan starts/completes.
            pendingCheckupEntryForProfileFacts
          
          if (otherMachineActive) {
            // Defer to after current machine completes
            const currentTopicLabel =
              pendingCheckupEntryForProfileFacts
                ? "ton bilan"
                : (flowContext?.topicLabel || flowContext?.actionLabel || flowContext?.breakdownTarget || "le sujet actuel")
            const deferResult = deferSignal({
              tempMemory,
              machine_type: "user_profile_confirmation",
              summary: `${factsToConfirm.length} fait(s) a confirmer`,
            })
            tempMemory = deferResult.tempMemory
            const existingDeferredFacts = Array.isArray((tempMemory as any)?.[PROFILE_CONFIRM_DEFERRED_KEY])
              ? (tempMemory as any)[PROFILE_CONFIRM_DEFERRED_KEY] as ProfileFactToConfirm[]
              : []
            const mergedFacts = mergeDeferredProfileFacts(
              existingDeferredFacts,
              factsToConfirm,
              MAX_PROFILE_FACTS_PER_SESSION,
            )
            tempMemory = { ...(tempMemory ?? {}), [PROFILE_CONFIRM_DEFERRED_KEY]: mergedFacts }
            if (deferResult.cancelled?.machine_type === "user_profile_confirmation") {
              const next = { ...(tempMemory ?? {}) }
              delete next[PROFILE_CONFIRM_DEFERRED_KEY]
              tempMemory = next
            }
            
            // Persist facts for deferred profile confirmation (used when auto-relaunching).
            await trace("brain:profile_facts_deferred", "dispatcher", {
              count: factsToConfirm.length,
              current_machine: activeMachine,
              current_topic: currentTopicLabel,
            })
            console.log(`[Router] Profile facts deferred (${factsToConfirm.length} facts), current machine: ${activeMachine}`)
          } else {
            // No other machine active - start profile confirmation machine immediately
            const result = upsertProfileConfirmation({
              tempMemory,
              factsToAdd: factsToConfirm,
              now,
            })
            tempMemory = result.tempMemory
            
            await trace("brain:profile_facts_machine_started", "dispatcher", {
              count: factsToConfirm.length,
              first_key: factsToConfirm[0].key,
            })
            console.log(`[Router] Profile confirmation machine started with ${factsToConfirm.length} fact(s)`)
          }
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PROFILE CONFIRMATION RESPONSES: handle explicit "no" without tool call
    // If user refuses the current fact, advance queue to avoid getting stuck.
    // (Yes/nuance are handled via apply_profile_fact in Companion.)
    // ═══════════════════════════════════════════════════════════════════════════
    if (profileConfirmActive && dispatcherResult.machine_signals?.user_confirms_fact === "no") {
      const advanceResult = advanceProfileConfirmation({ tempMemory })
      tempMemory = advanceResult.tempMemory
      
      if (advanceResult.completed) {
        const closed = closeProfileConfirmation({ tempMemory })
        tempMemory = closed.tempMemory
        await traceV("brain:profile_confirmation_declined_completed", "dispatcher", {
          reason: "user_declined_fact",
        })
      } else {
        await traceV("brain:profile_confirmation_declined_advanced", "dispatcher", {
          next_fact_key: advanceResult.nextFact?.key,
        })
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CHECKUP FLOW: Handle checkup_intent, wants_to_checkup, track_from_bilan_done_ok
    // ═══════════════════════════════════════════════════════════════════════════
    const checkupIntentSignal = dispatcherResult.machine_signals?.checkup_intent
    const wantsToCheckup = dispatcherResult.machine_signals?.wants_to_checkup
    const trackFromBilanDoneOk = dispatcherResult.machine_signals?.track_from_bilan_done_ok
    const pendingCheckupEntry = (tempMemory as any)?.__checkup_entry_pending
    const pendingBilanAlreadyDone = (tempMemory as any)?.__bilan_already_done_pending
    const allowCheckupIntent = !primaryMotherSignal || primaryMotherSignal === "checkup"
    
    // --- Handle response to "tu veux faire le bilan?" question ---
    if (pendingCheckupEntry) {
      const resolved = resolveCheckupEntryConfirmation({
        userMessage,
        wantsToCheckupFromDispatcher: wantsToCheckup,
      })

      if (resolved) {
        // Clear the pending flag only when we actually resolved the answer.
        tempMemory = {
          ...(tempMemory ?? {}),
          __checkup_entry_pending: undefined,
        }

        if (resolved.kind === "yes") {
          checkupConfirmedThisTurn = true
          await trace("brain:checkup_confirmed", "dispatcher", { confirmed: true, via: resolved.via })
          console.log("[Router] Checkup confirmed by user, will start investigation")
        } else {
          await trace("brain:checkup_declined", "dispatcher", { confirmed: false, via: resolved.via })
          console.log("[Router] Checkup declined by user")
          const deferredTopics = getDeferredTopicsV2(tempMemory)
          if (deferredTopics.length > 0) {
            console.log(`[Router] Checkup declined, ${deferredTopics.length} deferred topics pending`)
          }
        }
      }
    }
    
    // --- Handle response to "tu veux noter un progres?" when bilan already done ---
    if (pendingBilanAlreadyDone && trackFromBilanDoneOk !== undefined) {
      // Clear the pending flag
      tempMemory = {
        ...(tempMemory ?? {}),
        __bilan_already_done_pending: undefined,
      }
      
      if (trackFromBilanDoneOk) {
        // User wants to track progress
        if (activeMachine) {
          // Defer the track_progress to after current machine
          const currentTopicLabel = flowContext?.topicLabel || flowContext?.actionLabel || flowContext?.breakdownTarget || "le sujet actuel"
          const deferResult = deferSignal({
            tempMemory,
            machine_type: "track_progress",
            summary: "Noter un progres demande par user",
          })
          tempMemory = deferResult.tempMemory
          
          // Generate acknowledgment with topic context
          const ackMessage = generateDeferredAckWithTopic({
            deferredType: "track_progress",
            currentTopic: currentTopicLabel,
          })
          ;(tempMemory as any).__deferred_ack_prefix = ackMessage
          
          await trace("brain:track_progress_deferred", "dispatcher", { current_topic: currentTopicLabel })
          console.log(`[Router] Track progress deferred, current machine: ${activeMachine}`)
        } else {
          // No active machine - can do track_progress directly via architect
          ;(tempMemory as any).__track_progress_from_bilan_done = true
          await trace("brain:track_progress_direct", "dispatcher", {})
          console.log("[Router] Track progress direct (no active machine)")
        }
      } else {
        // User declined track_progress
        await trace("brain:track_progress_declined", "dispatcher", {})
        console.log("[Router] Track progress declined")
      }
    }
    
    // --- Handle new checkup_intent detection ---
    if (
      checkupIntentSignal?.detected && 
      checkupIntentSignal.confidence >= 0.7 &&
      allowCheckupIntent &&
      !bilanActive &&  // Not already in bilan
      !pendingCheckupEntry &&  // Not already asking
      !pendingBilanAlreadyDone  // Not already handling bilan-done
    ) {
      // Check if checkup was already done today
      const checkupDoneToday = await wasCheckupDoneToday(supabase, userId)
      
      if (checkupDoneToday) {
        // Bilan already done today
        if (activeMachine) {
          // Another machine is active - set addon for current agent to inform user
          ;(tempMemory as any).__bilan_already_done_pending = true
          // The addon will be used by buildFlowContext on next iteration
          // For now, inject a message prefix
          const currentTopicLabel = flowContext?.topicLabel || flowContext?.actionLabel || flowContext?.breakdownTarget || "le sujet actuel"
          ;(tempMemory as any).__deferred_ack_prefix = 
            `Tu as deja fait ton bilan aujourd'hui ! Si tu veux noter un progres sur une action, je peux le faire. Ca t'interesse ? (Sinon, on continue avec ${currentTopicLabel}) `
          await trace("brain:bilan_already_done_with_machine", "dispatcher", { 
            active_machine: activeMachine,
            trigger_phrase: checkupIntentSignal.trigger_phrase,
          })
          console.log(`[Router] Bilan already done today, active machine: ${activeMachine}`)
        } else {
          // No active machine - set flag for companion to propose track_progress
          ;(tempMemory as any).__bilan_already_done_pending = true
          ;(tempMemory as any).__propose_track_progress = true
          await trace("brain:bilan_already_done_no_machine", "dispatcher", {
            trigger_phrase: checkupIntentSignal.trigger_phrase,
          })
          console.log("[Router] Bilan already done today, proposing track_progress")
        }
      } else {
        // Bilan not done today - can proceed
        if (activeMachine) {
          // Another machine is active - defer checkup
          const currentTopicLabel = flowContext?.topicLabel || flowContext?.actionLabel || flowContext?.breakdownTarget || "le sujet actuel"
          const deferResult = deferSignal({
            tempMemory,
            machine_type: "checkup",
            summary: "Bilan demande par user",
          })
          tempMemory = deferResult.tempMemory
          ;(tempMemory as any).__checkup_deferred_topic = currentTopicLabel
          
          // Generate acknowledgment with topic context
          const ackMessage = generateDeferredAckWithTopic({
            deferredType: "checkup",
            currentTopic: currentTopicLabel,
          })
          ;(tempMemory as any).__deferred_ack_prefix = ackMessage
          
          await trace("brain:checkup_deferred", "dispatcher", { 
            active_machine: activeMachine,
            current_topic: currentTopicLabel,
            trigger_phrase: checkupIntentSignal.trigger_phrase,
          })
          console.log(`[Router] Checkup deferred, current machine: ${activeMachine}`)
        } else {
          // No active machine - start immediately if consent is already explicit in the same user message.
          // Example: "Yes fais le bilan stp" should not require an extra confirmation turn.
          const immediate = resolveCheckupEntryConfirmation({
            userMessage,
            wantsToCheckupFromDispatcher: undefined,
          })
          const canStartImmediately =
            (immediate?.kind === "yes") ||
            (Number(checkupIntentSignal.confidence ?? 0) >= 0.88)
          if (canStartImmediately) {
            checkupConfirmedThisTurn = true
            await trace("brain:checkup_confirmed", "dispatcher", {
              confirmed: true,
              via: immediate?.via ?? "deterministic",
              immediate: true,
              trigger_phrase: checkupIntentSignal.trigger_phrase,
              confidence: checkupIntentSignal.confidence,
            })
            console.log("[Router] Checkup confirmed immediately from user message, will start investigation")
          } else {
            // Ask confirmation before starting (avoid accidental launches).
            ;(tempMemory as any).__checkup_entry_pending = true
            ;(tempMemory as any).__ask_checkup_confirmation = true
            await trace("brain:checkup_entry_pending", "dispatcher", {
              trigger_phrase: checkupIntentSignal.trigger_phrase,
              confidence: checkupIntentSignal.confidence,
            })
            console.log("[Router] Checkup entry pending confirmation")
          }
        }
      }
    }
  riskScore = dispatcherSignals.risk_score

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK_PROGRESS PARALLEL (non-blocking) - do not interrupt active machines
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const track = dispatcherSignals.track_progress
    const trackStatus = String(track?.status_hint ?? "unknown")
    const trackTarget = String(track?.target_hint ?? "").trim()
    const canTrack =
      !state?.investigation_state &&
      track?.detected === true &&
      (track?.confidence ?? 0) >= 0.8 &&
      trackTarget.length >= 2 &&
      (trackStatus === "completed" || trackStatus === "missed" || trackStatus === "partial")
    const alreadyLogged =
      (tempMemory as any)?.__track_progress_parallel?.source_message_id &&
      loggedMessageId &&
      (tempMemory as any).__track_progress_parallel.source_message_id === loggedMessageId

    if (canTrack && !alreadyLogged) {
      try {
        const trackingMsg = await handleTracking(
          supabase,
          userId,
          {
            target_name: trackTarget,
            value: trackStatus === "missed" ? 0 : 1,
            operation: "add",
            status: trackStatus as any,
          },
          { source: channel },
        )
        const raw = String(trackingMsg ?? "")
        if (raw.startsWith("INFO_POUR_AGENT:")) {
          ;(tempMemory as any).__track_progress_parallel = {
            mode: "needs_clarify",
            message: raw.replace(/^INFO_POUR_AGENT:\s*/i, "").trim(),
            source_message_id: loggedMessageId ?? null,
          }
        } else {
          ;(tempMemory as any).__track_progress_parallel = {
            mode: "logged",
            message: raw,
            target: trackTarget,
            status: trackStatus,
            source_message_id: loggedMessageId ?? null,
          }
        }
        await traceV("brain:track_progress_parallel", "dispatcher", {
          detected: track?.detected,
          confidence: track?.confidence,
          target: trackTarget,
          status: trackStatus,
          mode: (tempMemory as any)?.__track_progress_parallel?.mode,
        })
      } catch (e) {
        console.warn("[Router] parallel track_progress failed (non-blocking):", e)
      }
    }
  }

  // Tracing flags for topic exploration (reported in RouterDecisionV1)
  let topicSessionClosedThisTurn = false
  let topicSessionHandoffThisTurn = false
  let closedTopicType: "topic_serious" | "topic_light" | null = null

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
    const deepReasonsOpportunity =
      Boolean(dispatcherSignals?.deep_reasons?.opportunity) &&
      (Number(dispatcherSignals?.deep_reasons?.confidence ?? 0) >= 0.65)

    // Should trigger topic machine:
    // - SERIOUS/LIGHT + digression/switch topic
    // - OR plan-focused discussion (even without explicit digression)
    const isTopicDepthTrigger = (topicDepth === "SERIOUS" || topicDepth === "LIGHT") && topicDepthConf >= 0.6
    const isInterruptTrigger =
      (interrupt?.kind === "DIGRESSION" || interrupt?.kind === "SWITCH_TOPIC") &&
      (Number(interrupt?.confidence ?? 0) >= 0.6)
    const isPlanFocusTrigger = Boolean(dispatcherSignals?.topic_depth?.plan_focus) && isTopicDepthTrigger
    // Sticky sessions: if the dispatcher is confident about LIGHT/SERIOUS, start a topic session
    // even when interrupt confidence is borderline. Otherwise the next turns can "fall out" of the topic machine.
    const isDirectTopicTrigger = isTopicDepthTrigger && !hasExistingTopic && topicDepthConf >= 0.8
    const shouldTrigger = isTopicDepthTrigger && (isInterruptTrigger || isPlanFocusTrigger || isDirectTopicTrigger)

    const bored = looksLikeUserBoredOrWantsToStop(userMessage)

    // PREEMPTION RULE: topic_serious preempts topic_light
    // If a SERIOUS topic is detected and there's an active topic_light, close the light topic.
    // Exception: if deep_reasons opportunity is detected, keep topic_light in the stack so it can resume
    // after deep_reasons closes (deep_reasons acts like a temporary overlay/intervention).
    if (
      topicDepth === "SERIOUS" && 
      topicDepthConf >= 0.6 && 
      existing?.type === "topic_light" &&
      !deepReasonsOpportunity
    ) {
      closedTopicType = existing?.type === "topic_light" ? "topic_light" : null
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
      closedTopicType = (existing?.type === "topic_serious" || existing?.type === "topic_light")
        ? existing.type
        : null
      const closed = closeTopicSession({ tempMemory: tm0 })
      if (closed.changed) {
        tempMemory = closed.tempMemory
        topicSessionClosedThisTurn = true
      }
    }
    // Also close if user explicitly wants to stop
    else if (hasExistingTopic && bored && existing?.phase !== "opening") {
      closedTopicType = (existing?.type === "topic_serious" || existing?.type === "topic_light")
        ? existing.type
        : null
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
      
      // Determine focus mode (plan discussions route through topic machines)
      const planFocus = Boolean(dispatcherSignals?.topic_depth?.plan_focus)
      const existingFocusMode = (hasExistingTopic && existing?.focus_mode)
        ? (existing.focus_mode as "plan" | "discussion" | "mixed")
        : undefined
      const focusMode: "plan" | "discussion" | "mixed" = planFocus
        ? "plan"
        : (existingFocusMode ?? "discussion")

      // Route to appropriate machine based on topic_depth
      // NOTE: escalateToLibrarian is no longer used - librarian overlay handles this transversally
      const shouldTreatSeriousAsTopicSession =
        topicDepth === "SERIOUS" &&
        !(deepReasonsOpportunity && existing?.type === "topic_light")

      if (shouldTreatSeriousAsTopicSession || (hasExistingTopic && existing?.type === "topic_serious")) {
        const updated = upsertTopicSerious({
          tempMemory: tm0,
          topic,
          phase,
          turnCount,
          engagement,
          satisfaction,
          focusMode: planFocus ? "plan" : (existingFocusMode ?? "mixed"),
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
          focusMode,
        })
        if (updated.changed) tempMemory = updated.tempMemory
      }
    }
  } catch {
    // best-effort
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTO-CHAINING: If a topic machine was closed, check for next topic in queue
  // ═══════════════════════════════════════════════════════════════════════════════
  if (topicSessionClosedThisTurn && closedTopicType) {
    const deferredTopics = getDeferredTopicsV2(tempMemory)
    const nextTopic = findNextSameTypeTopic(deferredTopics, closedTopicType)
    
    if (nextTopic) {
      const pendingNext: PendingNextTopic = {
        type: nextTopic.machine_type,
        topic_id: nextTopic.id,
        briefs: nextTopic.signal_summaries.map(s => s.summary),
        action_target: nextTopic.action_target,
      }
      tempMemory = {
        ...(tempMemory ?? {}),
        __pending_next_topic: pendingNext,
      }
      await traceV("brain:auto_chaining_detected", "routing", {
        closed_type: closedTopicType,
        next_topic_id: nextTopic.id,
        next_topic_type: nextTopic.machine_type,
      })
    }
  }

  let deepReasonsActiveSession: any | null = null
  let deepReasonsStateFromTm: DeepReasonsState | undefined
  {
    const deepReasons = applyDeepReasonsFlow({
          tempMemory,
      state,
      userMessage,
      dispatcherSignals,
    })
    tempMemory = deepReasons.tempMemory
    deepReasonsActiveSession = deepReasons.deepReasonsActiveSession
    deepReasonsStateFromTm = deepReasons.deepReasonsStateFromTm
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
  {
    const routing = await applyDeterministicRouting({
      dispatcherSignals,
        tempMemory,
      state,
      checkupConfirmedThisTurn,
      disableForcedRouting,
      forceMode: opts?.forceMode,
      deepReasonsActiveSession,
      deepReasonsStateFromTm,
      trace,
      traceV,
    })
    targetMode = routing.targetMode
    tempMemory = routing.tempMemory
  }

  // If the user accepted a deferred-topic relaunch consent, honor the initialized machine's requested mode
  // (e.g., checkup → investigator, action flows → architect). Safety modes still win.
  if (
    relaunchConsentHandled &&
    relaunchConsentNextMode &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter"
  ) {
    targetMode = relaunchConsentNextMode
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

  // 5.8. Track Progress Flow v2 routing
  // If there's an active track_progress_flow session, route to Architect
  const activeTrackProgressSession = getActiveTrackProgressFlow(tempMemory)
  if (
    activeTrackProgressSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    targetMode = "architect"
    await traceV("brain:track_progress_flow_routing", "routing", {
      reason: "active_track_progress_flow",
      target_action: (activeTrackProgressSession.meta as any)?.target_action,
    })
  }
  
  // Prune stale track_progress_flow sessions
  if (isTrackProgressFlowStale(tempMemory)) {
    const pruned = closeTrackProgressFlow({ tempMemory, outcome: "abandoned" })
    if (pruned.changed) {
      tempMemory = pruned.tempMemory
      console.log("[Router] Pruned stale track_progress_flow session")
    }
  }

  // Handle track_progress signals from dispatcher
  const trackProgressSignal = dispatcherSignals?.track_progress
  if (
    trackProgressSignal &&
    trackProgressSignal.detected &&
    trackProgressSignal.confidence >= 0.6 &&
    !activeTrackProgressSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Create track_progress_flow machine and route to architect
    const flowResult = upsertTrackProgressFlow({
      tempMemory,
      targetAction: trackProgressSignal.target_hint,
      statusHint: trackProgressSignal.status_hint,
    })
    tempMemory = flowResult.tempMemory
    targetMode = "architect"
    
    // Store the signal info for architect to use
    ;(tempMemory as any).__track_progress_signal = {
      detected: trackProgressSignal.detected,
      target_hint: trackProgressSignal.target_hint,
      status_hint: trackProgressSignal.status_hint,
      value_hint: trackProgressSignal.value_hint,
    }
    await traceV("brain:track_progress_signal_routing", "routing", {
      reason: "track_progress_signal",
      target_hint: trackProgressSignal.target_hint,
      status_hint: trackProgressSignal.status_hint,
    })
  }

  // 5.9. Activate Action Flow v2 routing
  // If there's an active activate_action_flow session, route to Architect
  const activeActivateActionSession = getActiveActivateActionFlow(tempMemory)
  if (
    activeActivateActionSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    targetMode = "architect"
    await traceV("brain:activate_action_flow_routing", "routing", {
      reason: "active_activate_action_flow",
      target_action: (activeActivateActionSession.meta as any)?.target_action,
    })
  }
  
  // Prune stale activate_action_flow sessions
  if (isActivateActionFlowStale(tempMemory)) {
    const pruned = closeActivateActionFlow({ tempMemory, outcome: "abandoned" })
    if (pruned.changed) {
      tempMemory = pruned.tempMemory
      console.log("[Router] Pruned stale activate_action_flow session")
    }
  }

  // Handle activate_action signals from dispatcher
  const activateActionSignal = dispatcherSignals?.activate_action
  if (
    activateActionSignal &&
    activateActionSignal.detected &&
    activateActionSignal.confidence >= 0.6 &&
    !activeActivateActionSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Create activate_action_flow machine and route to architect
    const flowResult = upsertActivateActionFlow({
      tempMemory,
      targetAction: activateActionSignal.target_hint,
      exerciseType: activateActionSignal.exercise_type_hint,
    })
    tempMemory = flowResult.tempMemory
    targetMode = "architect"
    
    // Store the signal info for architect to use
    ;(tempMemory as any).__activate_action_signal = {
      detected: activateActionSignal.detected,
      target_hint: activateActionSignal.target_hint,
      exercise_type_hint: activateActionSignal.exercise_type_hint,
    }
    await traceV("brain:activate_action_signal_routing", "routing", {
      reason: "activate_action_signal",
      target_hint: activateActionSignal.target_hint,
      exercise_type_hint: activateActionSignal.exercise_type_hint,
    })
  }

  // 5.10. User Profile Confirmation Flow routing
  // If there's an active user_profile_confirmation session, route to Companion
  const activeProfileConfirmSession = hasActiveProfileConfirmation(tempMemory)
  if (
    activeProfileConfirmSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    targetMode = "companion"
    const currentFact = getCurrentFactToConfirm(tempMemory)
    await traceV("brain:profile_confirmation_flow_routing", "routing", {
      reason: "active_profile_confirmation",
      current_fact_key: currentFact?.key,
      facts_remaining: getProfileConfirmationState(tempMemory)?.facts_queue?.length ?? 0,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5.10.5. USER ABANDONS - Close active machine if user explicitly wants to stop
  // Dispatcher detects "laisse tomber", "annule", "non finalement", etc.
  // ═══════════════════════════════════════════════════════════════════════════════
  const userAbandons = dispatcherResult?.machine_signals?.user_abandons === true
  if (userAbandons) {
    let abandonedMachine: string | null = null
    let abandonMessage = ""
    
    // Check which machine is active and close it
    if (getActiveCreateActionFlow(tempMemory)) {
      const closed = closeCreateActionFlow({ tempMemory, outcome: "abandoned" })
      tempMemory = closed.tempMemory
      abandonedMachine = "create_action_flow"
      abandonMessage = "Ok, on laisse tomber la création. Tu pourras me redemander quand tu veux."
    } else if (getActiveUpdateActionFlow(tempMemory)) {
      const closed = closeUpdateActionFlow({ tempMemory, outcome: "abandoned" })
      tempMemory = closed.tempMemory
      abandonedMachine = "update_action_flow"
      abandonMessage = "Ok, je ne modifie rien. Tu pourras me redemander quand tu veux."
    } else if (getActiveBreakdownActionFlow(tempMemory)) {
      const closed = closeBreakdownActionFlow({ tempMemory, outcome: "abandoned" })
      tempMemory = closed.tempMemory
      abandonedMachine = "breakdown_action_flow"
      abandonMessage = "Ok, on laisse ça pour l'instant. Tu pourras me redemander quand tu veux."
    } else if (getActiveTrackProgressFlow(tempMemory)) {
      const closed = closeTrackProgressFlow({ tempMemory, outcome: "abandoned" })
      tempMemory = closed.tempMemory
      abandonedMachine = "track_progress_flow"
      abandonMessage = "Ok, pas de souci."
    } else if (getActiveActivateActionFlow(tempMemory)) {
      const closed = closeActivateActionFlow({ tempMemory, outcome: "abandoned" })
      tempMemory = closed.tempMemory
      abandonedMachine = "activate_action_flow"
      abandonMessage = "Ok, on laisse ça pour l'instant."
    } else if (getActiveTopicSession(tempMemory)) {
      const closed = closeTopicSession({ tempMemory })
      tempMemory = closed.tempMemory
      abandonedMachine = "topic_session"
      abandonMessage = "Ok, on change de sujet."
    } else if (getActiveDeepReasonsExploration(tempMemory)) {
      const closed = closeDeepReasonsExploration({ tempMemory, outcome: "user_stop" })
      tempMemory = closed.tempMemory
      abandonedMachine = "deep_reasons_exploration"
      abandonMessage = "Ok, on laisse ça pour l'instant. Tu pourras en reparler quand tu veux."
    }
    
    if (abandonedMachine) {
      // Store the abandon message to prepend to response
      ;(tempMemory as any).__abandon_message = abandonMessage
      // Route back to companion for natural conversation
      targetMode = "companion"
      
      await trace("brain:user_abandons_machine", "routing", {
        abandoned_machine: abandonedMachine,
      })
      console.log(`[Router] User abandoned ${abandonedMachine} via user_abandons signal`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5.11. SIGNAL DEFERRAL DURING ACTIVE MACHINE
  // Only SENTRY/FIREFIGHTER can interrupt; other signals are deferred
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    const deferral = await handleSignalDeferral({
      tempMemory,
      dispatcherSignals,
        userMessage,
      profileConfirmDeferredKey: PROFILE_CONFIRM_DEFERRED_KEY,
      trace,
    })
    tempMemory = deferral.tempMemory
    if (deferral.deferredAckPrefix) {
      ;(tempMemory as any).__deferred_ack_prefix = deferral.deferredAckPrefix
    }
    // Store intelligent add-on for the conversational agent
    if (deferral.deferredSignalAddon) {
      ;(tempMemory as any).__deferred_signal_addon = deferral.deferredSignalAddon
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5.12. WANTS_RESUME HANDLING - User wants to discuss a recently deferred topic
  // If user says "je veux en parler" / "maintenant" after a topic was deferred,
  // do NOT force a safety mode by itself. Actual routing to safety is handled by:
  // - dispatcherSignals.safety
  // - topic_depth=NEED_SUPPORT
  // - safety state machines (safety_firefighter_flow / safety_sentry_flow)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    const flowResolution = dispatcherSignals.flow_resolution
    const wantsResume = flowResolution.kind === "WANTS_RESUME" && flowResolution.confidence >= 0.6
    
    // Also detect via regex fallback (dispatcher might miss nuanced "non je veux")
    const wantsResumeRegex = /\b(je\s+veux|j['']?veux|veux\s+en\s+parler|parler\s+maintenant|en\s+parler\s+maintenant|bah\s+je\s+veux|bah\s+oui|mais\s+si|non\s+je\s+veux)\b/i.test(userMessage)
    
    if (wantsResume || wantsResumeRegex) {
      const hasDeferredTopic = (tempMemory as any)?.__checkup_deferred_topic ||
        (history.slice(-3).some((m: any) => 
          m?.role === "assistant" && 
          /j['']ai\s+not[ée]|on\s+y\s+reviendra|on\s+en\s+reparlera/i.test(String(m?.content ?? ""))
        ))
      
      // We log the user's intention to resume, but we do NOT force firefighter here.
      // If the resumed topic truly requires support, the dispatcher will emit NEED_SUPPORT / safety
      // and the safety state machines will take over deterministically.
      await trace("brain:wants_resume_detected", "routing", {
        has_deferred_topic: Boolean(hasDeferredTopic),
        flow_resolution_kind: flowResolution.kind,
        flow_resolution_conf: flowResolution.confidence,
        regex_fallback: wantsResumeRegex && !wantsResume,
      })
    }
  }
  
  // 6. Topic Machine routing (topic_serious / topic_light)
  // If there's an active topic session, route based on owner_mode
  // NOTE: Librarian escalation is now handled by the transversal "librarian overlay" (see below)
  const activeTopicSession = getActiveTopicSession(tempMemory)
  if (
    activeTopicSession &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    const isSerious = activeTopicSession.type === "topic_serious"
    const isLight = activeTopicSession.type === "topic_light"
    
    // Route to owner based on topic type
    if (isSerious) {
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
  const nCandidates = 1 // Multi-candidate generation disabled (was only used for complex messages)
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
    // Include full dispatcher signals so eval bundles can be audited turn-by-turn.
    flow_resolution: dispatcherSignals.flow_resolution,
    topic_depth: dispatcherSignals.topic_depth,
    deep_reasons: dispatcherSignals.deep_reasons,
    needs_explanation: dispatcherSignals.needs_explanation,
    user_engagement: dispatcherSignals.user_engagement,
    topic_satisfaction: dispatcherSignals.topic_satisfaction,
    create_action: dispatcherSignals.create_action,
    update_action: dispatcherSignals.update_action,
    breakdown_action: dispatcherSignals.breakdown_action,
    track_progress: dispatcherSignals.track_progress,
    activate_action: dispatcherSignals.activate_action,
    safety_resolution: dispatcherSignals.safety_resolution,
    wants_tools: dispatcherSignals.wants_tools,
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
  // when the user mentions "suite"/"plan"/"style". This breaks the user_profile_confirmation machine.
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
    const pending = getCurrentFactToConfirm(tempMemory)
    ;(tempMemory as any).__router_forced_pending_confirm = pending ? true : false
    if (
      pending &&
      targetMode !== "sentry" &&
      targetMode !== "firefighter" &&
      targetMode !== "investigator"
    ) {
      targetMode = "companion"
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

  // NOTE: General plan discussions now go through topic machines with plan_focus=true.
  // The dispatcher sets topic_depth (LIGHT/SERIOUS) with plan_focus when user discusses their plan.
  // Only tool operations (create/update/breakdown actions) route directly to Architect via tool signals.

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

  // NOTE: "what's next in my plan" questions now go through topic machines with plan_focus=true.
  // If dispatcher detects plan discussion, topic_depth will be set (LIGHT/SERIOUS) with plan_focus.
  // topic_serious routes to Architect, topic_light routes to Companion.

  // Plan-building continuity: avoid "ping-pong" while a tool flow is active.
  // Only force Architect if a tool flow is actually running.
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    toolFlowActiveGlobal &&
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

  // Guardrail: during an active checkup, do NOT route to firefighter for "stress" talk unless
  // risk is elevated or the message clearly signals acute distress.
  // This prevents breaking the checkup flow for normal "stress/organisation" topics.
  const checkupActive = Boolean(state?.investigation_state);
  const isPostCheckup = state?.investigation_state?.status === "post_checkup"

  // If the user digresses during an active bilan (even without saying "later"),
  // capture the topic so it can be revisited after the checkup.
  // NOW USES deferred_topics_v2 instead of the old parking lot.
  if (checkupActive && !isPostCheckup && !stopCheckup) {
    const digressionSignal =
      (dispatcherSignals.interrupt.kind === "DIGRESSION" || dispatcherSignals.interrupt.kind === "SWITCH_TOPIC") &&
      dispatcherSignals.interrupt.confidence >= 0.6
    const shouldCaptureDigression = digressionSignal || looksLikeDigressionRequest(userMessage)
    if (shouldCaptureDigression) {
      try {
          // USE DISPATCHER'S FORMALIZED TOPIC (no extra AI call!)
          const formalizedFromDispatcher = dispatcherSignals.interrupt.deferred_topic_formalized
          const fallbackExtracted = extractTopicFromUserDigression(userMessage) || String(userMessage ?? "").trim().slice(0, 160)
          const topicToStore = formalizedFromDispatcher || fallbackExtracted
          
          if (topicToStore && topicToStore.length >= 3) {
          // Store in deferred_topics_v2 as topic_light (will auto-relaunch after bilan)
          const deferResult = deferSignal({
            tempMemory,
            machine_type: "topic_light",
            action_target: topicToStore.slice(0, 80),
            summary: topicToStore.slice(0, 100),
          })
          tempMemory = deferResult.tempMemory
          console.log(`[Router] Digression captured to deferred_topics_v2: "${topicToStore}" (from=${formalizedFromDispatcher ? "dispatcher" : "fallback"})`)
          } else {
            console.log(`[Router] Digression rejected - no valid topic extracted`)
        }
      } catch (e) {
        console.error("[Router] digression deferred topic store failed (non-blocking):", e)
      }
    }
  }

  // If the user hints at a preference during an active checkup, capture it for later confirmation.
  if (checkupActive && !isPostCheckup && !stopCheckup) {
    const prefHint = detectPreferenceHint(userMessage)
    const pending = getCurrentFactToConfirm(tempMemory)
    if (prefHint?.key && prefHint.uncertain && !pending) {
      const now = new Date()
      const fact: ProfileFactToConfirm = {
        key: prefHint.key,
        proposed_value: "",
        confidence: 0.5,
        detected_at: now.toISOString(),
      }
      const result = upsertProfileConfirmation({ tempMemory, factsToAdd: [fact], now })
      tempMemory = result.tempMemory
    }
  }

  // NOTE: Legacy firefighter continuity block removed.
  // Safety flow resolution is now handled by safety_firefighter_flow state machine.

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

  // NOTE: Hard guard for looksLikeAttrapeRevesActivation removed.
  // This is now handled by the activate_action signal from the dispatcher,
  // which creates an activate_action_flow machine (owner: architect).

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
    checkupConfirmedThisTurn ||
    dailyBilanReply
  if (!checkupActive && targetMode === 'investigator' && !shouldStartInvestigator) {
    targetMode = 'companion'
  }

  // Deferred-topic helpers are implemented in `router/deferred_topics.ts` (imported).

  // NOTE: Legacy parking lot removed. Topics during bilan now go to deferred_topics_v2
  // and auto-relaunch when bilan completes via __flow_just_closed_normally flag.

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

  // NOTE: Legacy topic capture to parking lot removed.
  // Topics during bilan are now captured via dispatcher signals to deferred_topics_v2.
  // The Investigator's bilan addon instructs the dispatcher to detect topic_exploration_intent
  // and defer to deferred_topics_v2 with machine_type: "topic_light" or "topic_serious".

  // NOTE: Legacy POST-CHECKUP PARKING LOT removed.
  // Topics mentioned during bilan are now stored in deferred_topics_v2 via dispatcher signals.
  // When bilan completes (investigationComplete flag), the __flow_just_closed_normally flag
  // triggers auto-relaunch of deferred topics from deferred_topics_v2.
  // This provides a cleaner, unified approach that works with all state machines.

  // Clean up any post_checkup state
  if (isPostCheckup) {
    console.log("[Router] Legacy post_checkup state detected - clearing")
        await updateUserState(supabase, userId, scope, { investigation_state: null })
      targetMode = "companion"
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

  // 4.1 SAFETY FLOW MACHINE MANAGEMENT
  // This replaces the ad-hoc "resolved" detection in agents.
  // We use state machines to track crisis progression and determine when to hand off.
  {
    const activeSentryFlow = getActiveSafetySentryFlow(tempMemory)
    const activeFirefighterFlow = getActiveSafetyFirefighterFlow(tempMemory)
    const safetyResolution = dispatcherSignals.safety_resolution
    const safetyResolutionConfident = (safetyResolution?.confidence ?? 0) >= 0.6
    const safetyResolutionSignals = safetyResolutionConfident ? {
      user_confirms_safe: safetyResolution?.user_confirms_safe,
      stabilizing_signal: safetyResolution?.stabilizing_signal,
      symptoms_still_present: safetyResolution?.symptoms_still_present,
      external_help_mentioned: safetyResolution?.external_help_mentioned,
      escalate_to_sentry: safetyResolution?.escalate_to_sentry,
    } : {
      user_confirms_safe: false,
      stabilizing_signal: false,
      symptoms_still_present: false,
      external_help_mentioned: false,
      escalate_to_sentry: false,
    }
    
    // ─── SENTRY FLOW MANAGEMENT ───
    if (activeSentryFlow) {
      // Update the flow state based on safety_resolution signals
      const nextPhase = computeSentryNextPhase(activeSentryFlow, {
        user_confirms_safe: safetyResolutionSignals.user_confirms_safe,
        external_help_mentioned: safetyResolutionSignals.external_help_mentioned,
        still_in_danger: dispatcherSignals.safety.level === "SENTRY" && dispatcherSignals.safety.confidence >= 0.6,
      })
      
      if (nextPhase === "resolved") {
        // Crisis resolved - close the flow and hand off to companion
        const closed = closeSafetySentryFlow({ tempMemory, outcome: "resolved_safe" })
        tempMemory = closed.tempMemory
        
        const pausedMachine = getPausedMachine(tempMemory)
        if (targetMode !== "firefighter") {
          targetMode = "companion"
        }
        
        await trace("brain:safety_sentry_resolved", "routing", {
          phase: nextPhase,
          turn_count: activeSentryFlow.turn_count,
          paused_machine: pausedMachine?.machine_type ?? null,
        })
      } else if (nextPhase !== activeSentryFlow.phase) {
        // Phase changed - update the flow
        const updated = upsertSafetySentryFlow({
          tempMemory,
          phase: nextPhase,
          safetyConfirmed: safetyResolutionSignals.user_confirms_safe,
          externalHelpMentioned: safetyResolutionSignals.external_help_mentioned,
        })
        tempMemory = updated.tempMemory
        
        await traceV("brain:safety_sentry_phase_change", "routing", {
          from: activeSentryFlow.phase,
          to: nextPhase,
          turn_count: updated.state.turn_count,
        })
      } else {
        // Same phase - just increment turn count
        const updated = upsertSafetySentryFlow({ tempMemory })
        tempMemory = updated.tempMemory
      }
      
      // Keep routing to sentry unless resolved
      if (nextPhase !== "resolved") {
        targetMode = "sentry"
      }
    }
    // ─── FIREFIGHTER FLOW MANAGEMENT ───
    else if (activeFirefighterFlow) {
      // Check for escalation to sentry
      if (safetyResolutionSignals.escalate_to_sentry || 
          (dispatcherSignals.safety.level === "SENTRY" && dispatcherSignals.safety.confidence >= 0.75)) {
        // Escalate: close firefighter flow, create sentry flow
        const closed = closeSafetyFirefighterFlow({ tempMemory, outcome: "escalated_sentry" })
        tempMemory = closed.tempMemory
        
        const created = upsertSafetySentryFlow({
          tempMemory,
          triggerMessage: userMessage,
          phase: "acute",
        })
        tempMemory = created.tempMemory
        targetMode = "sentry"
        
        await trace("brain:safety_escalated_to_sentry", "routing", {
          from_phase: activeFirefighterFlow.phase,
          trigger: "safety_resolution_or_signal",
        })
      } else {
        // Update the flow state based on safety_resolution signals
        const nextPhase = computeFirefighterNextPhase(activeFirefighterFlow, {
          user_stabilizing: safetyResolutionSignals.stabilizing_signal,
          symptoms_still_present: safetyResolutionSignals.symptoms_still_present,
          escalate_to_sentry: false,
        })
        
        if (nextPhase === "resolved") {
          // Crisis resolved - close the flow and hand off to companion
          const closed = closeSafetyFirefighterFlow({ tempMemory, outcome: "stabilized" })
          tempMemory = closed.tempMemory
          
          const pausedMachine = getPausedMachine(tempMemory)
          if (targetMode !== "sentry") {
            targetMode = "companion"
          }
          
          await trace("brain:safety_firefighter_resolved", "routing", {
            phase: nextPhase,
            turn_count: activeFirefighterFlow.turn_count,
            stabilization_signals: activeFirefighterFlow.stabilization_signals,
            paused_machine: pausedMachine?.machine_type ?? null,
          })
        } else {
          // Update phase and signal counters
          const stabilizationDelta = safetyResolutionSignals.stabilizing_signal ? 1 : 0
          const distressDelta = safetyResolutionSignals.symptoms_still_present ? 1 : 0
          
          const updated = upsertSafetyFirefighterFlow({
            tempMemory,
            phase: nextPhase,
            stabilizationSignalDelta: stabilizationDelta,
            distressSignalDelta: distressDelta,
          })
          tempMemory = updated.tempMemory
          
          if (nextPhase !== activeFirefighterFlow.phase) {
            await traceV("brain:safety_firefighter_phase_change", "routing", {
              from: activeFirefighterFlow.phase,
              to: nextPhase,
              stabilization_signals: updated.state.stabilization_signals,
              distress_signals: updated.state.distress_signals,
            })
          }
          
          // Keep routing to firefighter unless resolved
          targetMode = "firefighter"
        }
      }
    }
    // ─── NEW SAFETY FLOW CREATION ───
    // Only create if no active safety flow and we're routing to sentry/firefighter
    else if (targetMode === "sentry" && !activeSentryFlow) {
      const created = upsertSafetySentryFlow({
        tempMemory,
        triggerMessage: userMessage,
        phase: "acute",
      })
      tempMemory = created.tempMemory
      
      await trace("brain:safety_sentry_started", "routing", {
        trigger: "safety_signal",
        safety_level: dispatcherSignals.safety.level,
        confidence: dispatcherSignals.safety.confidence,
      })
    }
    else if (targetMode === "firefighter" && !activeFirefighterFlow) {
      const created = upsertSafetyFirefighterFlow({
        tempMemory,
        triggerMessage: userMessage,
        phase: "acute",
      })
      tempMemory = created.tempMemory
      
      await trace("brain:safety_firefighter_started", "routing", {
        trigger: "safety_signal_or_need_support",
        safety_level: dispatcherSignals.safety.level,
        topic_depth: dispatcherSignals.topic_depth.value,
      })
    }
    
    // ─── STALE SAFETY FLOW CLEANUP ───
    // Safety flows should not persist indefinitely - clean up if stale
    if (isSafetySentryFlowStale(tempMemory)) {
      const closed = closeSafetySentryFlow({ tempMemory, outcome: "abandoned" })
      tempMemory = closed.tempMemory
      await traceV("brain:safety_sentry_stale", "routing", { reason: "TTL_exceeded" })
    }
    if (isSafetyFirefighterFlowStale(tempMemory)) {
      const closed = closeSafetyFirefighterFlow({ tempMemory, outcome: "abandoned" })
      tempMemory = closed.tempMemory
      await traceV("brain:safety_firefighter_stale", "routing", { reason: "TTL_exceeded" })
    }
  }

  // 4.5 Context Loading (Modular - profile-based)
  // Build a shared context string used by agent prompts.
  // Each agent mode has a ContextProfile that specifies exactly what context it needs.
  const injectedContext = context
  context = ""

  // Build on-demand triggers from dispatcher signals
  // These triggers determine whether to load heavy context (plan JSON, action details)
  const onDemandTriggers: OnDemandTriggers = {
    create_action_intent: dispatcherSignals.create_action?.intent_strength === "explicit" || 
                          dispatcherSignals.create_action?.intent_strength === "implicit",
    update_action_intent: dispatcherSignals.update_action?.detected ?? false,
    plan_discussion_intent: dispatcherSignals.topic_depth?.plan_focus ?? false,
    breakdown_recommended: dispatcherSignals.breakdown_action?.detected ?? false,
    topic_depth: dispatcherSignals.topic_depth?.value === "SERIOUS" ? "deep" : 
                 dispatcherSignals.topic_depth?.value === "LIGHT" ? "shallow" : undefined,
  }

  // Use modular context loader based on agent profile
  const contextProfile = getContextProfile(targetMode)
  const needsContextLoading = targetMode !== "sentry" && targetMode !== "watcher" && targetMode !== "dispatcher"

  if (needsContextLoading) {
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
      injectedContext: opts?.contextOverride,
      deferredUserPrefContext,
    })

    // Load vectors separately (with maxResults based on profile)
    // Firefighter gets minimal vectors (2), others get full (5)
    const vectorMaxResults = getVectorResultsCount(contextProfile)
    if (vectorMaxResults > 0) {
      const isMinimalMode = vectorMaxResults <= 2
      const vectorContext = await retrieveContext(supabase, userId, userMessage, {
        maxResults: vectorMaxResults,
        includeActionHistory: !isMinimalMode, // Skip action history for firefighter
      })
      if (vectorContext) {
        contextLoadResult.context.vectors = vectorContext
        contextLoadResult.metrics.elements_loaded.push("vectors")
      }
    }

    // Build final context string
    context = buildContextString(contextLoadResult.context)

    // Log metrics
    console.log(`[Context] Loaded profile=${targetMode}, elements=${contextLoadResult.metrics.elements_loaded.join(",")}, tokens~${contextLoadResult.metrics.estimated_tokens}`)
      await trace("brain:context_loaded", "context", {
        target_mode: targetMode,
      profile_used: targetMode,
      elements_loaded: contextLoadResult.metrics.elements_loaded,
      load_ms: contextLoadResult.metrics.load_ms,
      estimated_tokens: contextLoadResult.metrics.estimated_tokens,
      triggers: onDemandTriggers,
      }, "info")
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
      
      let contentOut = drResult.content
      
      // If deep_reasons closed, propose the next queued deep_reasons topic (auto-chaining)
      if (!drResult.newState) {
        const deferredTopics = getDeferredTopicsV2(tempMemory)
        const nextTopic = findNextSameTypeTopic(deferredTopics, "deep_reasons_exploration")
        if (nextTopic) {
          const brief = nextTopic.signal_summaries?.[0]?.summary ?? nextTopic.action_target ?? "un autre point"
          contentOut = `${contentOut}\n\nAu fait, tu avais aussi mentionné \"${brief}\". On le creuse maintenant ou plus tard ?`
          await traceV("brain:auto_chaining_injected", "routing", {
            closed_type: "deep_reasons_exploration",
            next_topic_id: nextTopic.id,
            next_topic_type: nextTopic.machine_type,
          })
        }
      }
      
      return { content: normalizeChatText(contentOut), mode: "architect" as AgentMode, aborted: false }
    } catch (e) {
      console.error("[Router] Deep reasons execution failed:", e)
      // Fall through to normal agent execution
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LIBRARIAN OVERLAY: Can intercept ANY machine for detailed explanations
  // The Librarian responds this turn, but the active machine state is NOT modified.
  // Next turn, routing returns to the machine's owner agent automatically.
  // ═══════════════════════════════════════════════════════════════════════════════
  let librarianOverlayActive = false
  let librarianOverlayOriginalTarget: AgentMode | null = null
  const looksLikeExplanationAsk = (() => {
    const s = normalizeLoose(userMessage)
    if (!s) return false
    // Only allow overlay on explicit "explain/why/how/what does it mean" user asks.
    return /\b(pourquoi|comment|explique|explique\s+moi|peux\s*-?\s*tu\s+expliquer|tu\s+peux\s+expliquer|clarifie|clarifier|c['’]est\s+quoi|ca\s+veut\s+dire\s+quoi|ça\s+veut\s+dire\s+quoi|comment\s+ca\s+marche|comment\s+ca\s+fonctionne|reformule|reformuler)\b/i.test(s)
  })()
  
  if (
    dispatcherSignals.needs_explanation?.value &&
    (dispatcherSignals.needs_explanation.confidence ?? 0) >= 0.7 &&
    looksLikeExplanationAsk &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator" &&
    targetMode !== "librarian"  // Not already librarian
  ) {
    // Save original target for tracing
    librarianOverlayOriginalTarget = targetMode
    librarianOverlayActive = true
    targetMode = "librarian"
    
    await traceV("brain:librarian_overlay", "routing", {
      original_target: librarianOverlayOriginalTarget,
      reason: dispatcherSignals.needs_explanation.reason ?? "needs_explanation",
      active_machine: (() => {
        if ((tempMemory as any)?.create_action_flow) return "create_action_flow"
        if ((tempMemory as any)?.update_action_flow) return "update_action_flow"
        if ((tempMemory as any)?.breakdown_action_flow) return "breakdown_action_flow"
        if ((tempMemory as any)?.deep_reasons_state) return "deep_reasons_exploration"
        const topic = getActiveTopicSession(tempMemory)
        if (topic) return topic.type
        return null
      })(),
      confidence: dispatcherSignals.needs_explanation.confidence,
    })
    
    console.log(`[Router] Librarian overlay activated (original: ${librarianOverlayOriginalTarget}, reason: ${dispatcherSignals.needs_explanation.reason ?? "needs_explanation"})`)
  }

  const selectedChatModel = selectChatModel(targetMode, riskScore)
  await trace("brain:model_selected", "agent", {
    target_mode: targetMode,
    risk_score: riskScore,
    selected_model: selectedChatModel,
    default_model: SOPHIA_CHAT_MODEL,
    librarian_overlay: librarianOverlayActive,
  }, selectedChatModel === SOPHIA_CHAT_MODEL ? "debug" : "info")

  // Inject deferred signal add-on into context (guides agent to personalize acknowledgment)
  const deferredSignalAddon = (tempMemory as any)?.__deferred_signal_addon ?? ""
  if (deferredSignalAddon) {
    context = `${context}\n\n${deferredSignalAddon}`
    // Clear after injection (one-time use)
    try { delete (tempMemory as any).__deferred_signal_addon } catch {}
  }

  // Inject resume from safety add-on into context (guides agent for smooth transition after firefighter/sentry)
  const resumeSafetyAddon = (tempMemory as any)?.__resume_safety_addon ?? ""
  if (resumeSafetyAddon) {
    context = `${context}\n\n${resumeSafetyAddon}`
    // Clear after injection (one-time use)
    try { delete (tempMemory as any).__resume_safety_addon } catch {}
  }

  // Inject relaunch consent add-on into context (guides agent to ask consent question)
  const askRelaunchConsent = (tempMemory as any)?.__ask_relaunch_consent
  if (askRelaunchConsent) {
    const consentAddon = buildRelaunchConsentAgentAddon({
      machine_type: askRelaunchConsent.machine_type,
      action_target: askRelaunchConsent.action_target,
      summaries: askRelaunchConsent.summaries ?? [],
    })
    context = `${context}\n\n${consentAddon}`
    // Clear after injection (one-time use)
    try { delete (tempMemory as any).__ask_relaunch_consent } catch {}
    console.log(`[Router] Injected relaunch consent agent add-on for ${askRelaunchConsent.machine_type}`)
  }

  // Inject next topic proposal add-on (for auto-chaining after topic/deep_reasons closure)
  const pendingNextTopic = (tempMemory as any)?.__pending_next_topic as PendingNextTopic | undefined
  if (pendingNextTopic) {
    const nextTopicAddon = buildNextTopicProposalAddon({
      type: pendingNextTopic.type,
      briefs: pendingNextTopic.briefs,
      action_target: pendingNextTopic.action_target,
    })
    context = `${context}\n\n${nextTopicAddon}`
    // Clear after injection (one-time use)
    try { delete (tempMemory as any).__pending_next_topic } catch {}
    console.log(`[Router] Injected next topic proposal add-on for ${pendingNextTopic.type}`)
  }

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
    tempMemory,
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
  if (agentOut.tempMemory) {
    tempMemory = agentOut.tempMemory
  }
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
      "__deferred_signal_addon",
      "__resume_message_prefix",
      "__resume_safety_addon",
      "__track_progress_parallel",
      "deferred_topics_v2",
      "__paused_machine_v2",
      "__pending_next_topic",
      PROFILE_CONFIRM_DEFERRED_KEY,
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
  
  // Inject relaunch decline message if user declined relaunch consent
  if (relaunchDeclineMessage && relaunchConsentHandled) {
    responseContent = `${relaunchDeclineMessage}\n\n${String(responseContent ?? "")}`.trim()
  }
  
  // Inject abandon message if user abandoned a machine
  const abandonMessage = (tempMemory as any)?.__abandon_message ?? ""
  if (abandonMessage) {
    responseContent = `${abandonMessage}\n\n${String(responseContent ?? "")}`.trim()
    try { delete (tempMemory as any).__abandon_message } catch {}
  }
  // Clear one-off checkup addon flags after response
  try { delete (tempMemory as any).__checkup_addon } catch {}
  try { delete (tempMemory as any).__checkup_deferred_topic } catch {}
  try { delete (tempMemory as any).__track_progress_parallel } catch {}

  // AUTO-RELAUNCH FROM DEFERRED (after a flow closes normally)
  {
    const relaunch = await applyAutoRelaunchFromDeferred({
            tempMemory,
      responseContent,
      nextMode,
      profileConfirmDeferredKey: PROFILE_CONFIRM_DEFERRED_KEY,
      trace,
    })
    tempMemory = relaunch.tempMemory
    responseContent = relaunch.responseContent
    nextMode = relaunch.nextMode
  }

  // Lightweight global proactivity: occasionally remind a deferred topic (max 1/day, and only if we won't add a 2nd question).
  let nudged = { tempMemory, responseText: responseContent, changed: false }
  if (!hasAnyActiveMachine(tempMemory)) {
    nudged = maybeInjectGlobalDeferredNudge({ tempMemory, userMessage, responseText: responseContent })
  if (nudged.changed) {
    tempMemory = nudged.tempMemory
    responseContent = nudged.responseText
    await traceV("brain:global_deferred_nudge_injected", "routing", {
      reason: "maybeInjectGlobalDeferredNudge",
    })
    }
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
    if (p?.kind === "global_deferred") {
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
        // Calculate parenthesis duration for context
        const parenthesisDurationMs = Date.now() - new Date(pausedMachineV2.paused_at).getTime()
        
        // Generate AI-driven resume addon (guides agent for smooth transition)
        const resumeSafetyAddon = buildResumeFromSafetyAddon({
          pausedMachine: pausedMachineV2,
          safetyType: pausedMachineV2.reason,
          parenthesisDurationMs,
        })
        
        // Store addon for agent context injection (one-shot)
        ;(tempMemory as any).__resume_safety_addon = resumeSafetyAddon
        
        // Route to appropriate owner
        if (resumeResult.machineType === "topic_light") {
          nextMode = "companion"
        } else {
          nextMode = "architect"
        }
        
        await trace("brain:machine_resumed", "routing", {
          machine_type: resumeResult.machineType,
          paused_duration_ms: parenthesisDurationMs,
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
