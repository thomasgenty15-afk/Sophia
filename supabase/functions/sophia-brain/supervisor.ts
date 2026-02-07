import type { AgentMode } from "./state-manager.ts"
import { generateWithGemini } from "../_shared/gemini.ts"

/**
 * Supervisor Runtime (global orchestration state) persisted in `user_chat_states.temp_memory`.
 *
 * Design goals:
 * - Keep it lightweight and additive (doesn't break existing temp_memory keys).
 * - Enable stack (LIFO) + queue (non-urgent scheduling) primitives.
 */

export type SupervisorSessionType =
  | "user_profile_confirmation"      // Proper state machine for profile fact confirmation
  | "topic_serious"                  // Deep topics (owner=architect): introspection, personal issues
  | "topic_light"                    // Casual topics (owner=companion): small talk, anecdotes
  | "deep_reasons_exploration"
  | "create_action_flow"             // Simplified action creation flow (v2)
  | "update_action_flow"             // Simplified action update flow (v2)
  | "breakdown_action_flow"          // Simplified action breakdown flow (v2)
  | "track_progress_flow"            // Progress tracking flow (owner=architect)
  | "activate_action_flow"           // Action activation flow (owner=architect)
  | "safety_sentry_flow"             // Safety flow for vital danger (owner=sentry)
  | "safety_firefighter_flow"        // Safety flow for emotional crisis (owner=firefighter)

export type SupervisorSessionStatus = "active" | "paused"

/**
 * Profile fact to confirm - used in user_profile_confirmation machine.
 */
export interface ProfileFactToConfirm {
  key: string           // e.g. "schedule.wake_time", "personal.job"
  proposed_value: string
  confidence: number
  detected_at: string
}

/**
 * Phase for the user_profile_confirmation machine.
 * - presenting: About to present a fact for confirmation
 * - awaiting_confirm: Waiting for user response
 * - processing: Processing the user's response
 * - completed: All facts confirmed/processed
 */
export type ProfileConfirmationPhase = "presenting" | "awaiting_confirm" | "processing" | "completed"

/**
 * State for the user_profile_confirmation machine.
 * Stored in temp_memory.profile_confirmation_state
 */
export interface UserProfileConfirmationState {
  facts_queue: ProfileFactToConfirm[]
  current_index: number
  phase: ProfileConfirmationPhase  // Current phase in the confirmation flow
  status: "confirming" | "completed"
  started_at: string
  last_updated_at: string
}

export type TopicEngagementLevel = "high" | "medium" | "low" | "disengaged"

/**
 * Safety flow phase for structured crisis management.
 * - acute: Initial crisis state, immediate intervention needed
 * - grounding: Active grounding/breathing exercises in progress
 * - stabilizing: User showing signs of calming, monitoring
 * - confirming: Checking if user is stable/safe before handoff
 * - resolved: Crisis passed, ready for handoff
 */
export type SafetyFlowPhase = "acute" | "grounding" | "stabilizing" | "confirming" | "resolved"

/**
 * State for the safety_sentry_flow machine.
 * Handles vital danger situations with structured follow-up.
 */
export interface SafetySentryFlowState {
  phase: SafetyFlowPhase
  trigger_message: string           // The message that triggered sentry
  safety_confirmed: boolean         // User confirmed they are safe
  external_help_mentioned: boolean  // User mentioned contacting help (SAMU, etc.)
  turn_count: number                // Number of turns in this safety flow
  started_at: string
  last_updated_at: string
}

/**
 * State for the safety_firefighter_flow machine.
 * Handles emotional crisis with grounding and de-escalation.
 */
export interface SafetyFirefighterFlowState {
  phase: SafetyFlowPhase
  trigger_message: string           // The message that triggered firefighter
  technique_used?: string           // Last technique used (safety_check, guided_30s, etc.)
  stabilization_signals: number     // Count of positive signals ("ça va mieux", etc.)
  distress_signals: number          // Count of ongoing distress signals
  turn_count: number
  started_at: string
  last_updated_at: string
}

export interface SupervisorSession {
  id: string
  type: SupervisorSessionType
  owner_mode: AgentMode
  status: SupervisorSessionStatus
  started_at: string
  last_active_at: string
  // Topic machine specific fields (for topic_serious and topic_light)
  topic?: string
  phase?: "opening" | "exploring" | "converging" | "closing"
  focus_mode?: "plan" | "discussion" | "mixed"
  handoff_to?: AgentMode
  handoff_brief?: string
  // Topic machine internal state
  turn_count?: number                          // Number of turns in this session
  satisfaction_signal?: boolean                // IA detected user satisfaction
  escalate_to_librarian?: boolean              // Needs detailed explanation (librarian)
  last_user_engagement?: TopicEngagementLevel  // User engagement level
  /**
   * Short, ready-to-use recap when resuming this session.
   * (We keep it optional; resume UX can be implemented progressively.)
   */
  resume_brief?: string
  /**
   * Small, non-sensitive metadata for debugging / routing hints.
   */
  meta?: Record<string, unknown>
}

export interface SupervisorQueuedIntent {
  id: string
  requested_mode: AgentMode
  requested_at: string
  reason?: string
  message_excerpt?: string
}

export interface SupervisorRuntime {
  v: 1
  stack: SupervisorSession[]
  queue: SupervisorQueuedIntent[]
  updated_at: string
}

// Canonical key (requested naming): global_machine.
// Legacy alias: supervisor (backward compatibility with already persisted temp_memory).
const GLOBAL_MACHINE_KEY = "global_machine"
const SUPERVISOR_KEY = "supervisor"

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString()
}

function safeObj(x: any): Record<string, unknown> {
  return (x && typeof x === "object" && !Array.isArray(x)) ? x as any : {}
}

export function getSupervisorRuntime(tempMemory: any, now?: Date): SupervisorRuntime {
  const tm = safeObj(tempMemory)
  const gm = safeObj((tm as any)[GLOBAL_MACHINE_KEY])
  const sup = safeObj((tm as any)[SUPERVISOR_KEY])
  const raw = Object.keys(gm).length > 0 ? gm : sup
  const v = Number((raw as any).v) === 1 ? 1 : 1
  const stack = Array.isArray((raw as any).stack) ? ((raw as any).stack as any[]).filter(Boolean) : []
  const queue = Array.isArray((raw as any).queue) ? ((raw as any).queue as any[]).filter(Boolean) : []
  const updated_at = String((raw as any).updated_at ?? "") || nowIso(now)
  return { v, stack: stack as any, queue: queue as any, updated_at }
}

export function writeSupervisorRuntime(tempMemory: any, runtime: SupervisorRuntime): any {
  const tm = safeObj(tempMemory)
  // Write to both keys so old readers continue working and new naming is available immediately.
  return { ...(tm as any), [GLOBAL_MACHINE_KEY]: runtime, [SUPERVISOR_KEY]: runtime }
}

export function getActiveSupervisorSession(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const last = stack.length > 0 ? stack[stack.length - 1] : null
  return last && typeof last === "object" ? (last as SupervisorSession) : null
}

/** Check if a session type is a topic machine (serious or light) */
function isTopicMachine(type: string): boolean {
  return type === "topic_serious" || type === "topic_light"
}

/** Get the active topic session (either topic_serious or topic_light) */
export function getActiveTopicSession(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const last = stack.length > 0 ? stack[stack.length - 1] : null
  if (!last || typeof last !== "object") return null
  const t = String((last as any)?.type ?? "")
  return isTopicMachine(t) ? (last as SupervisorSession) : null
}

/** Get active topic_serious session specifically */
export function getActiveTopicSerious(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const last = stack.length > 0 ? stack[stack.length - 1] : null
  if (!last || typeof last !== "object") return null
  return String((last as any)?.type ?? "") === "topic_serious" ? (last as SupervisorSession) : null
}

/** Get active topic_light session specifically */
export function getActiveTopicLight(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const last = stack.length > 0 ? stack[stack.length - 1] : null
  if (!last || typeof last !== "object") return null
  return String((last as any)?.type ?? "") === "topic_light" ? (last as SupervisorSession) : null
}

function mkId(prefix: string, now?: Date): string {
  const t = nowIso(now).replace(/[:.]/g, "-")
  return `${prefix}_${t}`
}

export function enqueueSupervisorIntent(opts: {
  tempMemory: any
  requestedMode: AgentMode
  now?: Date
  reason?: string
  messageExcerpt?: string
}): { tempMemory: any; changed: boolean } {
  const rt0 = getSupervisorRuntime(opts.tempMemory, opts.now)
  const queue0 = Array.isArray(rt0.queue) ? [...rt0.queue] : []
  const maxQueue = 6
  const entry: SupervisorQueuedIntent = {
    id: mkId("q", opts.now),
    requested_mode: opts.requestedMode,
    requested_at: nowIso(opts.now),
    reason: opts.reason ? String(opts.reason).slice(0, 160) : undefined,
    message_excerpt: opts.messageExcerpt ? String(opts.messageExcerpt).slice(0, 180) : undefined,
  }
  queue0.push(entry)
  const bounded = queue0.slice(-maxQueue)
  const rtNext: SupervisorRuntime = { ...rt0, queue: bounded, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(opts.tempMemory, rtNext), changed: true }
}

/** Internal helper to upsert a topic session (serious or light) */
function upsertTopicInternal(opts: {
  tempMemory: any
  sessionType: "topic_serious" | "topic_light"
  topic: string
  ownerMode: AgentMode
  phase: "opening" | "exploring" | "converging" | "closing"
  focusMode: "plan" | "discussion" | "mixed"
  turnCount?: number
  engagement?: TopicEngagementLevel
  satisfaction?: boolean
  escalateToLibrarian?: boolean
  handoffTo?: AgentMode
  handoffBrief?: string
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  
  // Find existing topic session of the same type
  const isSameType = (s: any) => String(s?.type ?? "") === opts.sessionType
  const existing = stack0.findLast?.((s: any) => isSameType(s))
    ?? [...stack0].reverse().find((s: any) => isSameType(s))
    ?? null

  // Remove any existing topic sessions (both serious and light) - only one active at a time
  const filtered = stack0.filter((s: any) => !isTopicMachine(String(s?.type ?? "")))

  const topic = String(opts.topic ?? "").trim().slice(0, 160)
  const startedAt = existing ? String((existing as any).started_at ?? nowIso(opts.now)) : nowIso(opts.now)
  const id = existing ? String((existing as any).id ?? mkId("sess_topic", opts.now)) : mkId("sess_topic", opts.now)
  const turnCount = opts.turnCount ?? (existing?.turn_count ?? 0)

  const resumeBrief = opts.sessionType === "topic_serious"
    ? (topic ? `On explorait en profondeur: ${topic}` : "On explorait un sujet important")
    : (topic ? `On discutait de: ${topic}` : "On bavardait")

  const session: SupervisorSession = {
    id,
    type: opts.sessionType,
    owner_mode: opts.ownerMode,
    status: "active",
    started_at: startedAt,
    last_active_at: nowIso(opts.now),
    topic,
    phase: opts.phase,
    focus_mode: opts.focusMode,
    turn_count: turnCount,
    satisfaction_signal: opts.satisfaction ?? existing?.satisfaction_signal,
    escalate_to_librarian: opts.escalateToLibrarian ?? existing?.escalate_to_librarian,
    last_user_engagement: opts.engagement ?? existing?.last_user_engagement,
    handoff_to: opts.handoffTo,
    handoff_brief: opts.handoffBrief ? String(opts.handoffBrief).slice(0, 360) : undefined,
    resume_brief: resumeBrief,
    meta: {
      ...(typeof (existing as any)?.meta === "object" ? (existing as any).meta : {}),
    },
  }
  filtered.push(session)
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/** Create/update a topic_serious session (deep topics, owner=architect) */
export function upsertTopicSerious(opts: {
  tempMemory: any
  topic: string
  phase: "opening" | "exploring" | "converging" | "closing"
  turnCount?: number
  engagement?: TopicEngagementLevel
  satisfaction?: boolean
  escalateToLibrarian?: boolean
  handoffTo?: AgentMode
  handoffBrief?: string
  focusMode?: "plan" | "discussion" | "mixed"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  return upsertTopicInternal({
    ...opts,
    sessionType: "topic_serious",
    ownerMode: "architect",
    focusMode: opts.focusMode ?? "mixed",
  })
}

/** Create/update a topic_light session (casual topics, owner=companion) */
export function upsertTopicLight(opts: {
  tempMemory: any
  topic: string
  phase: "opening" | "exploring" | "converging" | "closing"
  turnCount?: number
  engagement?: TopicEngagementLevel
  satisfaction?: boolean
  escalateToLibrarian?: boolean
  handoffTo?: AgentMode
  handoffBrief?: string
  focusMode?: "plan" | "discussion" | "mixed"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  return upsertTopicInternal({
    ...opts,
    sessionType: "topic_light",
    ownerMode: "companion",
    focusMode: opts.focusMode ?? "discussion",
  })
}

/** Close any active topic session (topic_serious or topic_light) */
export function closeTopicSession(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const filtered = stack0.filter((s: any) => !isTopicMachine(String(s?.type ?? "")))
  if (filtered.length === stack0.length) return { tempMemory: tm0, changed: false }
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/** Increment the turn count for the active topic session */
export function incrementTopicTurnCount(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const session = getActiveTopicSession(opts.tempMemory)
  if (!session) return { tempMemory: opts.tempMemory, changed: false }
  
  const newTurnCount = (session.turn_count ?? 0) + 1
  
  if (session.type === "topic_serious") {
    return upsertTopicSerious({
      tempMemory: opts.tempMemory,
      topic: session.topic ?? "",
      phase: session.phase ?? "exploring",
      turnCount: newTurnCount,
      engagement: session.last_user_engagement,
      satisfaction: session.satisfaction_signal,
      escalateToLibrarian: session.escalate_to_librarian,
      now: opts.now,
    })
  } else {
    return upsertTopicLight({
      tempMemory: opts.tempMemory,
      topic: session.topic ?? "",
      phase: session.phase ?? "exploring",
      turnCount: newTurnCount,
      engagement: session.last_user_engagement,
      satisfaction: session.satisfaction_signal,
      escalateToLibrarian: session.escalate_to_librarian,
      now: opts.now,
    })
  }
}

/** Update user engagement level for the active topic session */
export function updateTopicEngagement(opts: {
  tempMemory: any
  level: TopicEngagementLevel
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const session = getActiveTopicSession(opts.tempMemory)
  if (!session) return { tempMemory: opts.tempMemory, changed: false }
  
  if (session.type === "topic_serious") {
    return upsertTopicSerious({
      tempMemory: opts.tempMemory,
      topic: session.topic ?? "",
      phase: session.phase ?? "exploring",
      turnCount: session.turn_count,
      engagement: opts.level,
      satisfaction: session.satisfaction_signal,
      escalateToLibrarian: session.escalate_to_librarian,
      now: opts.now,
    })
  } else {
    return upsertTopicLight({
      tempMemory: opts.tempMemory,
      topic: session.topic ?? "",
      phase: session.phase ?? "exploring",
      turnCount: session.turn_count,
      engagement: opts.level,
      satisfaction: session.satisfaction_signal,
      escalateToLibrarian: session.escalate_to_librarian,
      now: opts.now,
    })
  }
}

/** Mark that librarian escalation is needed/done */
export function setTopicLibrarianEscalation(opts: {
  tempMemory: any
  escalate: boolean
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const session = getActiveTopicSession(opts.tempMemory)
  if (!session) return { tempMemory: opts.tempMemory, changed: false }
  
  if (session.type === "topic_serious") {
    return upsertTopicSerious({
      tempMemory: opts.tempMemory,
      topic: session.topic ?? "",
      phase: session.phase ?? "exploring",
      turnCount: session.turn_count,
      engagement: session.last_user_engagement,
      satisfaction: session.satisfaction_signal,
      escalateToLibrarian: opts.escalate,
      now: opts.now,
    })
  } else {
    return upsertTopicLight({
      tempMemory: opts.tempMemory,
      topic: session.topic ?? "",
      phase: session.phase ?? "exploring",
      turnCount: session.turn_count,
      engagement: session.last_user_engagement,
      satisfaction: session.satisfaction_signal,
      escalateToLibrarian: opts.escalate,
      now: opts.now,
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOPIC MACHINE LOGIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Thresholds for topic convergence (different for serious vs light) */
const TOPIC_SERIOUS_TURN_LIMIT = 8
const TOPIC_LIGHT_TURN_LIMIT = 4

/**
 * Determine if a topic session should transition to "converging" phase.
 * 
 * Triggers:
 * - User satisfaction detected (topic_satisfaction signal)
 * - Turn limit reached (8 for serious, 4 for light)
 * - Low engagement detected
 */
export function shouldConvergeTopic(
  session: SupervisorSession | null,
  signals: {
    topic_satisfaction?: { detected: boolean; confidence: number }
    user_engagement?: { level: string; confidence: number }
  }
): boolean {
  if (!session || !isTopicMachine(session.type)) return false
  if (session.phase === "converging" || session.phase === "closing") return false

  const turnCount = session.turn_count ?? 0
  const isSerious = session.type === "topic_serious"
  const turnLimit = isSerious ? TOPIC_SERIOUS_TURN_LIMIT : TOPIC_LIGHT_TURN_LIMIT

  // 1. Satisfaction detected with high confidence
  if (signals.topic_satisfaction?.detected && signals.topic_satisfaction.confidence >= 0.7) {
    return true
  }

  // 2. Turn limit reached
  if (turnCount >= turnLimit) {
    return true
  }

  // 3. Low engagement or disengaged (more strict for light topics)
  const engagement = signals.user_engagement?.level ?? session.last_user_engagement
  if (engagement === "disengaged") {
    return true
  }
  if (!isSerious && engagement === "low") {
    return true  // Light topics close faster on low engagement
  }

  return false
}

/**
 * Determine if we should escalate to librarian for a detailed explanation.
 * 
 * Triggers:
 * - needs_explanation signal with high confidence
 * - Not already escalated
 */
export function shouldEscalateToLibrarian(
  session: SupervisorSession | null,
  signals: {
    needs_explanation?: { value: boolean; confidence: number; reason?: string }
  }
): boolean {
  if (!session || !isTopicMachine(session.type)) return false
  
  // Don't escalate if already escalated
  if (session.escalate_to_librarian) return false
  
  // Don't escalate during closing phase
  if (session.phase === "closing") return false

  // Check needs_explanation signal
  if (signals.needs_explanation?.value && signals.needs_explanation.confidence >= 0.7) {
    return true
  }

  return false
}

/**
 * Determine the next phase based on current state and signals.
 */
export function computeNextTopicPhase(
  session: SupervisorSession | null,
  signals: {
    topic_satisfaction?: { detected: boolean; confidence: number }
    user_engagement?: { level: string; confidence: number }
    interrupt?: { kind: string; confidence: number }
  }
): "opening" | "exploring" | "converging" | "closing" | null {
  if (!session || !isTopicMachine(session.type)) return null

  const currentPhase = session.phase ?? "exploring"
  
  // Check for explicit stop/bored signals
  const interrupt = signals.interrupt
  const isBoredOrStop = 
    (interrupt?.kind === "EXPLICIT_STOP" || interrupt?.kind === "BORED") &&
    interrupt.confidence >= 0.6

  // State transitions
  if (currentPhase === "opening") {
    return "exploring"  // Always move to exploring after first turn
  }

  if (currentPhase === "exploring") {
    if (isBoredOrStop) {
      return "closing"  // Skip converging on explicit stop
    }
    if (shouldConvergeTopic(session, signals)) {
      return "converging"
    }
    return "exploring"  // Stay in exploring
  }

  if (currentPhase === "converging") {
    if (isBoredOrStop) {
      return "closing"
    }
    // Check if user wants to continue
    const highEngagement = signals.user_engagement?.level === "HIGH" || signals.user_engagement?.level === "MEDIUM"
    if (highEngagement && signals.user_engagement?.confidence >= 0.6) {
      return "exploring"  // User wants to continue, go back to exploring
    }
    return "closing"  // Default: move to closing
  }

  return "closing"
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEEP REASONS EXPLORATION SESSION
// ═══════════════════════════════════════════════════════════════════════════════

export function getActiveDeepReasonsExploration(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const last = stack.length > 0 ? stack[stack.length - 1] : null
  if (!last || typeof last !== "object") return null
  const t = String((last as any)?.type ?? "")
  return t === "deep_reasons_exploration" ? (last as SupervisorSession) : null
}

export function upsertDeepReasonsExploration(opts: {
  tempMemory: any
  topic: string
  phase: "re_consent" | "clarify" | "hypotheses" | "resonance" | "intervention" | "closing"
  pattern?: string
  actionTitle?: string
  source?: "deferred" | "direct"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const isDeepReasons = (s: any) => String(s?.type ?? "") === "deep_reasons_exploration"
  const existing = stack0.findLast?.((s: any) => isDeepReasons(s))
    ?? [...stack0].reverse().find((s: any) => isDeepReasons(s))
    ?? null

  const filtered = stack0.filter((s: any) => !isDeepReasons(s))

  const topic = String(opts.topic ?? "").trim().slice(0, 160)
  const startedAt = existing ? String((existing as any).started_at ?? nowIso(opts.now)) : nowIso(opts.now)
  const id = existing ? String((existing as any).id ?? mkId("sess_deep", opts.now)) : mkId("sess_deep", opts.now)

  const session: SupervisorSession = {
    id,
    type: "deep_reasons_exploration",
    owner_mode: "architect",
    status: "active",
    started_at: startedAt,
    last_active_at: nowIso(opts.now),
    topic,
    phase: opts.phase as any,
    resume_brief: topic ? `On explorait: ${topic}` : "On explorait un blocage motivationnel",
    meta: {
      ...(typeof (existing as any)?.meta === "object" ? (existing as any).meta : {}),
      pattern: opts.pattern,
      action_title: opts.actionTitle,
      source: opts.source,
    },
  }
  filtered.push(session)
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

export function closeDeepReasonsExploration(opts: {
  tempMemory: any
  outcome?: "resolved" | "defer_continue" | "user_stop" | "needs_human_support"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "deep_reasons_exploration")
  if (filtered.length === stack0.length) return { tempMemory: tm0, changed: false }
  
  // Also clear deep_reasons_state from temp_memory
  const tmCleaned = { ...(tm0 as any) }
  delete tmCleaned.deep_reasons_state
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tmCleaned, rtNext), changed: true }
}

/**
 * Pause a deep_reasons exploration (set status to "paused").
 * This happens when the user wants to explore a broader topic (topic_serious).
 */
export function pauseDeepReasonsExploration(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean; pausedSession: SupervisorSession | null } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  
  const idx = stack0.findIndex((s: any) => String(s?.type ?? "") === "deep_reasons_exploration")
  if (idx < 0) return { tempMemory: tm0, changed: false, pausedSession: null }
  
  const session = { ...stack0[idx] } as SupervisorSession
  session.status = "paused"
  session.last_active_at = nowIso(opts.now)
  stack0[idx] = session
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: stack0, updated_at: nowIso(opts.now) }
  return { 
    tempMemory: writeSupervisorRuntime(tm0, rtNext), 
    changed: true,
    pausedSession: session,
  }
}

/**
 * Check if there's a paused deep_reasons exploration that can be resumed.
 */
export function getPausedDeepReasonsExploration(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const paused = stack.find((s: any) => 
    String(s?.type ?? "") === "deep_reasons_exploration" && s?.status === "paused"
  )
  return paused ? (paused as SupervisorSession) : null
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER PROFILE CONFIRMATION SESSION
// ═══════════════════════════════════════════════════════════════════════════════

const PROFILE_CONFIRM_STATE_KEY = "profile_confirmation_state"

/**
 * Get active user profile confirmation state.
 */
export function getProfileConfirmationState(tempMemory: any): UserProfileConfirmationState | null {
  const tm = safeObj(tempMemory)
  const state = (tm as any)[PROFILE_CONFIRM_STATE_KEY] ?? null
  if (!state || typeof state !== "object") return null
  if (!Array.isArray(state.facts_queue)) return null
  return state as UserProfileConfirmationState
}

/**
 * Check if profile confirmation machine is active.
 */
export function hasActiveProfileConfirmation(tempMemory: any): boolean {
  const state = getProfileConfirmationState(tempMemory)
  return state !== null && state.status === "confirming"
}

/**
 * Create or update profile confirmation state with new facts to confirm.
 * Limits to MAX_PROFILE_FACTS_PER_SESSION (3).
 */
export function upsertProfileConfirmation(opts: {
  tempMemory: any
  factsToAdd: ProfileFactToConfirm[]
  now?: Date
}): { tempMemory: any; changed: boolean; state: UserProfileConfirmationState } {
  const tm0 = safeObj(opts.tempMemory)
  const existing = getProfileConfirmationState(tm0)
  const now = nowIso(opts.now)
  
  // Max 3 facts per session
  const MAX_FACTS = 3
  
  let factsQueue: ProfileFactToConfirm[]
  let currentIndex: number
  let startedAt: string
  let phase: ProfileConfirmationPhase
  
  if (existing && existing.status === "confirming") {
    // Append to existing queue (up to limit)
    const remainingSlots = MAX_FACTS - existing.facts_queue.length
    const toAdd = opts.factsToAdd.slice(0, remainingSlots)
    factsQueue = [...existing.facts_queue, ...toAdd]
    currentIndex = existing.current_index
    startedAt = existing.started_at
    phase = existing.phase ?? "presenting"  // Keep current phase or default
  } else {
    // Create new session
    factsQueue = opts.factsToAdd.slice(0, MAX_FACTS)
    currentIndex = 0
    startedAt = now
    phase = "presenting"  // Start with presenting the first fact
  }
  
  const state: UserProfileConfirmationState = {
    facts_queue: factsQueue,
    current_index: currentIndex,
    phase,
    status: "confirming",
    started_at: startedAt,
    last_updated_at: now,
  }
  
  const tmNext = {
    ...(tm0 as any),
    [PROFILE_CONFIRM_STATE_KEY]: state,
  }
  
  return { tempMemory: tmNext, changed: true, state }
}

/**
 * Get the current fact being confirmed.
 */
export function getCurrentFactToConfirm(tempMemory: any): ProfileFactToConfirm | null {
  const state = getProfileConfirmationState(tempMemory)
  if (!state || state.status !== "confirming") return null
  if (state.current_index >= state.facts_queue.length) return null
  return state.facts_queue[state.current_index]
}

/**
 * Advance to next fact after user confirms/rejects current one.
 */
export function advanceProfileConfirmation(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean; completed: boolean; nextFact: ProfileFactToConfirm | null } {
  const tm0 = safeObj(opts.tempMemory)
  const state = getProfileConfirmationState(tm0)
  if (!state || state.status !== "confirming") {
    return { tempMemory: tm0, changed: false, completed: true, nextFact: null }
  }
  
  const nextIndex = state.current_index + 1
  const completed = nextIndex >= state.facts_queue.length
  const nextFact = completed ? null : state.facts_queue[nextIndex]
  
  const newState: UserProfileConfirmationState = {
    ...state,
    current_index: nextIndex,
    phase: completed ? "completed" : "presenting",  // Move to presenting next fact or completed
    status: completed ? "completed" : "confirming",
    last_updated_at: nowIso(opts.now),
  }
  
  const tmNext = {
    ...(tm0 as any),
    [PROFILE_CONFIRM_STATE_KEY]: newState,
  }
  
  return { tempMemory: tmNext, changed: true, completed, nextFact }
}

/**
 * Update the phase of the profile confirmation machine.
 */
export function updateProfileConfirmationPhase(opts: {
  tempMemory: any
  phase: ProfileConfirmationPhase
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const state = getProfileConfirmationState(tm0)
  if (!state || state.status !== "confirming") {
    return { tempMemory: tm0, changed: false }
  }
  
  const newState: UserProfileConfirmationState = {
    ...state,
    phase: opts.phase,
    last_updated_at: nowIso(opts.now),
  }
  
  const tmNext = {
    ...(tm0 as any),
    [PROFILE_CONFIRM_STATE_KEY]: newState,
  }
  
  return { tempMemory: tmNext, changed: true }
}

/**
 * Close profile confirmation session.
 */
export function closeProfileConfirmation(opts: {
  tempMemory: any
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const state = getProfileConfirmationState(tm0)
  if (!state) return { tempMemory: tm0, changed: false }
  
  const tmNext = { ...(tm0 as any) }
  delete tmNext[PROFILE_CONFIRM_STATE_KEY]
  
  return { tempMemory: tmNext, changed: true }
}


// ═══════════════════════════════════════════════════════════════════════════════
// TTL / STALE CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

/** TTL constants (ms) */
const TTL_TOPIC_SERIOUS_MS = 2 * 60 * 60 * 1000          // 2 hours (deep topics need more time)
const TTL_TOPIC_LIGHT_MS = 30 * 60 * 1000                // 30 min (casual topics expire faster)
const TTL_DEEP_REASONS_EXPLORATION_MS = 30 * 60 * 1000   // 30 min (keep shorter, sensitive context)
const TTL_CREATE_ACTION_FLOW_MS = 15 * 60 * 1000          // 15 min (short, focused flow)
const TTL_UPDATE_ACTION_FLOW_MS = 10 * 60 * 1000          // 10 min (shorter, simpler flow)
const TTL_BREAKDOWN_ACTION_FLOW_MS = 10 * 60 * 1000       // 10 min (short, needs concrete blocker)
const TTL_QUEUE_INTENT_MS = 2 * 60 * 60 * 1000            // 2 hours

/**
 * Prune stale sessions from supervisor stack and stale intents from queue.
 * Returns pruned tempMemory and list of what was cleaned.
 */
export function pruneStaleSupervisorState(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean; cleaned: string[] } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const nowMs = (opts.now ?? new Date()).getTime()
  const cleaned: string[] = []

  // Prune stale stack sessions
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const stackFiltered = stack0.filter((s: SupervisorSession) => {
    const lastActive = new Date(s.last_active_at ?? s.started_at ?? 0).getTime()
    const age = nowMs - lastActive
    const type = String(s.type ?? "")

    if (type === "topic_serious" && age > TTL_TOPIC_SERIOUS_MS) {
      cleaned.push(`stack:topic_serious:stale`)
      return false
    }
    if (type === "topic_light" && age > TTL_TOPIC_LIGHT_MS) {
      cleaned.push(`stack:topic_light:stale`)
      return false
    }
    if (type === "deep_reasons_exploration" && age > TTL_DEEP_REASONS_EXPLORATION_MS) {
      cleaned.push(`stack:deep_reasons_exploration:stale`)
      return false
    }
    if (type === "create_action_flow" && age > TTL_CREATE_ACTION_FLOW_MS) {
      cleaned.push(`stack:create_action_flow:stale`)
      return false
    }
    if (type === "update_action_flow" && age > TTL_UPDATE_ACTION_FLOW_MS) {
      cleaned.push(`stack:update_action_flow:stale`)
      return false
    }
    if (type === "breakdown_action_flow" && age > TTL_BREAKDOWN_ACTION_FLOW_MS) {
      cleaned.push(`stack:breakdown_action_flow:stale`)
      return false
    }
    return true
  })

  // Prune stale queue intents
  const queue0 = Array.isArray(rt0.queue) ? [...rt0.queue] : []
  const queueFiltered = queue0.filter((q: SupervisorQueuedIntent) => {
    const reqAt = new Date(q.requested_at ?? 0).getTime()
    const age = nowMs - reqAt
    if (age > TTL_QUEUE_INTENT_MS) {
      cleaned.push(`queue:${String(q.reason ?? "unknown")}:stale`)
      return false
    }
    return true
  })

  const stackChanged = stackFiltered.length !== stack0.length
  const queueChanged = queueFiltered.length !== queue0.length
  if (!stackChanged && !queueChanged) {
    return { tempMemory: tm0, changed: false, cleaned: [] }
  }

  const rtNext: SupervisorRuntime = {
    ...rt0,
    stack: stackFiltered,
    queue: queueFiltered,
    updated_at: nowIso(opts.now),
  }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true, cleaned }
}


// ═══════════════════════════════════════════════════════════════════════════════
// RESUME BRIEF GENERATION (LLM-assisted)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an intelligent resume_brief when pausing a flow.
 * This creates a concise 1-2 sentence summary ready to use when resuming.
 *
 * @param context What was happening (e.g., "creating an action about sleep hygiene")
 * @param reason Why paused (e.g., "user felt stressed and needed a break")
 * @param opts Optional: requestId for tracing
 */
export async function generateResumeBrief(opts: {
  context: string
  reason: string
  requestId?: string
}): Promise<string> {
  const fallback = opts.context
    ? `On en était à: ${opts.context.slice(0, 120)}`
    : "On reprenait là où on s'était arrêté."

  try {
    const prompt = `Tu dois générer une phrase de résumé très courte (max 25 mots) pour reprendre une conversation interrompue.

CONTEXTE (ce qu'on faisait):
"${(opts.context ?? "").slice(0, 200)}"

RAISON DE L'INTERRUPTION:
"${(opts.reason ?? "").slice(0, 100)}"

RÈGLES:
- Maximum 25 mots
- Commence par "On en était à" ou "Tu voulais" ou similaire
- Ton naturel, pas robotique
- Pas de formalités ("Bien sûr", "Je comprends")
- Si le contexte est vide, dis juste "On reprend où on en était."

Réponds UNIQUEMENT avec la phrase de résumé:`

    const response = await generateWithGemini(prompt, "", 0.3, true, [], "auto", {
      requestId: opts.requestId,
      model: "gemini-2.5-flash",
      source: "sophia-brain:resume_brief",
    })

    const brief = String(response ?? "").trim()
    if (!brief || brief.length < 5 || brief.length > 200) {
      return fallback
    }
    return brief
  } catch (e) {
    console.error("[generateResumeBrief] error:", e)
    return fallback
  }
}

/**
 * Update the resume_brief of an active session using LLM.
 * Call this when a flow is being paused/preempted.
 */
export async function updateSessionResumeBrief(opts: {
  tempMemory: any
  sessionType: SupervisorSessionType
  context: string
  reason: string
  requestId?: string
  now?: Date
}): Promise<{ tempMemory: any; changed: boolean }> {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []

  // Find the session to update
  const idx = stack0.findIndex((s) => String((s as any)?.type ?? "") === opts.sessionType)
  if (idx < 0) return { tempMemory: tm0, changed: false }

  // Generate the resume brief
  const brief = await generateResumeBrief({
    context: opts.context,
    reason: opts.reason,
    requestId: opts.requestId,
  })

  // Update the session
  const session = { ...stack0[idx] } as SupervisorSession
  session.resume_brief = brief
  session.last_active_at = nowIso(opts.now)

  stack0[idx] = session
  const rtNext: SupervisorRuntime = { ...rt0, stack: stack0, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE ACTION FLOW (v2 simplified)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get active create_action_flow session from the supervisor stack.
 */
export function getActiveCreateActionFlow(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const session = stack.find((s: any) => String(s?.type ?? "") === "create_action_flow" && s?.status === "active")
  return session ? (session as SupervisorSession) : null
}

/**
 * Upsert a create_action_flow session.
 * Stores the ActionCandidate in session.meta.candidate.
 */
export function upsertCreateActionFlow(opts: {
  tempMemory: any
  candidate: any  // ActionCandidate
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []

  // Remove any existing create_action_flow sessions
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "create_action_flow")

  const candidate = opts.candidate
  const label = String(candidate?.label ?? "une action").trim().slice(0, 80)
  const status = String(candidate?.status ?? "exploring")

  const session: SupervisorSession = {
    id: candidate?.id ?? mkId("sess_create_action", opts.now),
    type: "create_action_flow",
    owner_mode: "architect",
    status: "active",
    started_at: candidate?.started_at ?? nowIso(opts.now),
    last_active_at: nowIso(opts.now),
    topic: label,
    resume_brief: `On créait: ${label}`,
    meta: {
      candidate,
      candidate_status: status,
    },
  }

  filtered.push(session)
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Close the create_action_flow session.
 */
export function closeCreateActionFlow(opts: {
  tempMemory: any
  outcome: "created" | "abandoned"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "create_action_flow")
  if (filtered.length === stack0.length) {
    return { tempMemory: tm0, changed: false }
  }
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Get the ActionCandidate from an active create_action_flow session.
 */
export function getActionCandidateFromFlow(tempMemory: any): any | null {
  const session = getActiveCreateActionFlow(tempMemory)
  if (!session) return null
  return (session.meta as any)?.candidate ?? null
}

/**
 * Check if create_action_flow is stale (exceeded TTL).
 */
export function isCreateActionFlowStale(tempMemory: any, now?: Date): boolean {
  const session = getActiveCreateActionFlow(tempMemory)
  if (!session) return false
  
  const nowMs = (now ?? new Date()).getTime()
  const lastActive = new Date(session.last_active_at ?? session.started_at ?? 0).getTime()
  const age = nowMs - lastActive
  
  return age > TTL_CREATE_ACTION_FLOW_MS
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE ACTION FLOW (v2 simplified)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get active update_action_flow session from the supervisor stack.
 */
export function getActiveUpdateActionFlow(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const session = stack.find((s: any) => String(s?.type ?? "") === "update_action_flow" && s?.status === "active")
  return session ? (session as SupervisorSession) : null
}

/**
 * Upsert an update_action_flow session.
 * Stores the UpdateActionCandidate in session.meta.candidate.
 */
export function upsertUpdateActionFlow(opts: {
  tempMemory: any
  candidate: any  // UpdateActionCandidate
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []

  // Remove any existing update_action_flow sessions
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "update_action_flow")

  const candidate = opts.candidate
  const title = String(candidate?.target_action?.title ?? "une action").trim().slice(0, 80)
  const status = String(candidate?.status ?? "awaiting_confirm")

  const session: SupervisorSession = {
    id: candidate?.id ?? mkId("sess_update_action", opts.now),
    type: "update_action_flow",
    owner_mode: "architect",
    status: "active",
    started_at: candidate?.started_at ?? nowIso(opts.now),
    last_active_at: nowIso(opts.now),
    topic: title,
    resume_brief: `On modifiait: ${title}`,
    meta: {
      candidate,
      candidate_status: status,
    },
  }

  filtered.push(session)
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Close the update_action_flow session.
 */
export function closeUpdateActionFlow(opts: {
  tempMemory: any
  outcome: "applied" | "abandoned"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "update_action_flow")
  if (filtered.length === stack0.length) {
    return { tempMemory: tm0, changed: false }
  }
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Get the UpdateActionCandidate from an active update_action_flow session.
 */
export function getUpdateCandidateFromFlow(tempMemory: any): any | null {
  const session = getActiveUpdateActionFlow(tempMemory)
  if (!session) return null
  return (session.meta as any)?.candidate ?? null
}

/**
 * Check if update_action_flow is stale (exceeded TTL).
 */
export function isUpdateActionFlowStale(tempMemory: any, now?: Date): boolean {
  const session = getActiveUpdateActionFlow(tempMemory)
  if (!session) return false
  
  const nowMs = (now ?? new Date()).getTime()
  const lastActive = new Date(session.last_active_at ?? session.started_at ?? 0).getTime()
  const age = nowMs - lastActive
  
  return age > TTL_UPDATE_ACTION_FLOW_MS
}

// ═══════════════════════════════════════════════════════════════════════════════
// BREAKDOWN ACTION FLOW (v2 simplified)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get active breakdown_action_flow session from the supervisor stack.
 */
export function getActiveBreakdownActionFlow(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const session = stack.find((s: any) => String(s?.type ?? "") === "breakdown_action_flow" && s?.status === "active")
  return session ? (session as SupervisorSession) : null
}

/**
 * Upsert a breakdown_action_flow session.
 * Stores the BreakdownCandidate in session.meta.candidate.
 */
export function upsertBreakdownActionFlow(opts: {
  tempMemory: any
  candidate: any  // BreakdownCandidate
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []

  // Remove any existing breakdown_action_flow sessions
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "breakdown_action_flow")

  const candidate = opts.candidate
  const targetTitle = String(candidate?.target_action?.title ?? "une action").trim().slice(0, 80)
  const status = String(candidate?.status ?? "awaiting_target")

  const session: SupervisorSession = {
    id: candidate?.id ?? mkId("sess_breakdown_action", opts.now),
    type: "breakdown_action_flow",
    owner_mode: "architect",
    status: "active",
    started_at: candidate?.started_at ?? nowIso(opts.now),
    last_active_at: nowIso(opts.now),
    topic: targetTitle,
    resume_brief: `On débloquait: ${targetTitle}`,
    meta: {
      candidate,
      candidate_status: status,
    },
  }

  filtered.push(session)
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Close the breakdown_action_flow session.
 */
export function closeBreakdownActionFlow(opts: {
  tempMemory: any
  outcome: "applied" | "abandoned"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "breakdown_action_flow")
  if (filtered.length === stack0.length) {
    return { tempMemory: tm0, changed: false }
  }
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Get the BreakdownCandidate from an active breakdown_action_flow session.
 */
export function getBreakdownCandidateFromFlow(tempMemory: any): any | null {
  const session = getActiveBreakdownActionFlow(tempMemory)
  if (!session) return null
  return (session.meta as any)?.candidate ?? null
}

/**
 * Check if breakdown_action_flow is stale (exceeded TTL).
 */
export function isBreakdownActionFlowStale(tempMemory: any, now?: Date): boolean {
  const session = getActiveBreakdownActionFlow(tempMemory)
  if (!session) return false
  
  const nowMs = (now ?? new Date()).getTime()
  const lastActive = new Date(session.last_active_at ?? session.started_at ?? 0).getTime()
  const age = nowMs - lastActive
  
  return age > TTL_BREAKDOWN_ACTION_FLOW_MS
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACK PROGRESS FLOW (v2)
// ═══════════════════════════════════════════════════════════════════════════════

const TTL_TRACK_PROGRESS_FLOW_MS = 5 * 60 * 1000  // 5 minutes

/**
 * Get active track_progress_flow session from the supervisor stack.
 */
export function getActiveTrackProgressFlow(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const session = stack.find((s: any) => String(s?.type ?? "") === "track_progress_flow" && s?.status === "active")
  return session ? (session as SupervisorSession) : null
}

/**
 * Upsert a track_progress_flow session.
 */
export function upsertTrackProgressFlow(opts: {
  tempMemory: any
  targetAction?: string
  statusHint?: "completed" | "missed" | "partial" | "unknown"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []

  // Remove any existing track_progress_flow sessions
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "track_progress_flow")

  const targetAction = opts.targetAction ?? "une action"
  const statusHint = opts.statusHint ?? "unknown"

  const session: SupervisorSession = {
    id: mkId("sess_track_progress", opts.now),
    type: "track_progress_flow",
    owner_mode: "architect",
    status: "active",
    started_at: nowIso(opts.now),
    last_active_at: nowIso(opts.now),
    topic: targetAction,
    resume_brief: `On notait un progrès sur: ${targetAction}`,
    meta: {
      target_action: targetAction,
      status_hint: statusHint,
    },
  }

  filtered.push(session)
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Close the track_progress_flow session.
 */
export function closeTrackProgressFlow(opts: {
  tempMemory: any
  outcome: "logged" | "abandoned"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "track_progress_flow")
  if (filtered.length === stack0.length) {
    return { tempMemory: tm0, changed: false }
  }
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Check if track_progress_flow is stale (exceeded TTL).
 */
export function isTrackProgressFlowStale(tempMemory: any, now?: Date): boolean {
  const session = getActiveTrackProgressFlow(tempMemory)
  if (!session) return false
  
  const nowMs = (now ?? new Date()).getTime()
  const lastActive = new Date(session.last_active_at ?? session.started_at ?? 0).getTime()
  const age = nowMs - lastActive
  
  return age > TTL_TRACK_PROGRESS_FLOW_MS
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATE ACTION FLOW (v2)
// ═══════════════════════════════════════════════════════════════════════════════

const TTL_ACTIVATE_ACTION_FLOW_MS = 5 * 60 * 1000  // 5 minutes

/**
 * Get active activate_action_flow session from the supervisor stack.
 */
export function getActiveActivateActionFlow(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const session = stack.find((s: any) => String(s?.type ?? "") === "activate_action_flow" && s?.status === "active")
  return session ? (session as SupervisorSession) : null
}

/**
 * Phase for the activate_action_flow machine.
 * - exploring: Identifying which action to activate
 * - confirming: Action identified, awaiting user confirmation (oui/non)
 * - activated: User confirmed, tool will be called
 * - abandoned: User declined or stopped
 */
export type ActivateActionPhase = "exploring" | "confirming" | "activated" | "abandoned"

/**
 * Upsert an activate_action_flow session.
 */
export function upsertActivateActionFlow(opts: {
  tempMemory: any
  targetAction?: string
  exerciseType?: string
  phase?: ActivateActionPhase
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []

  // Remove any existing activate_action_flow sessions
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "activate_action_flow")

  const targetAction = opts.targetAction ?? "une action"
  const exerciseType = opts.exerciseType
  const phase: ActivateActionPhase = opts.phase ?? "exploring"

  const session: SupervisorSession = {
    id: mkId("sess_activate_action", opts.now),
    type: "activate_action_flow",
    owner_mode: "architect",
    status: "active",
    started_at: nowIso(opts.now),
    last_active_at: nowIso(opts.now),
    topic: targetAction,
    resume_brief: `On activait: ${targetAction}`,
    meta: {
      target_action: targetAction,
      exercise_type: exerciseType,
      phase,
    },
  }

  filtered.push(session)
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Get the current phase of the activate_action_flow machine.
 */
export function getActivateActionFlowPhase(tempMemory: any): ActivateActionPhase | null {
  const session = getActiveActivateActionFlow(tempMemory)
  if (!session) return null
  return (session.meta as any)?.phase ?? "exploring"
}

/**
 * Close the activate_action_flow session.
 */
export function closeActivateActionFlow(opts: {
  tempMemory: any
  outcome: "activated" | "abandoned"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "activate_action_flow")
  if (filtered.length === stack0.length) {
    return { tempMemory: tm0, changed: false }
  }
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Check if activate_action_flow is stale (exceeded TTL).
 */
export function isActivateActionFlowStale(tempMemory: any, now?: Date): boolean {
  const session = getActiveActivateActionFlow(tempMemory)
  if (!session) return false
  
  const nowMs = (now ?? new Date()).getTime()
  const lastActive = new Date(session.last_active_at ?? session.started_at ?? 0).getTime()
  const age = nowMs - lastActive
  
  return age > TTL_ACTIVATE_ACTION_FLOW_MS
}

// ═══════════════════════════════════════════════════════════════════════════════
// MACHINE PAUSE/RESUME FOR SENTRY/FIREFIGHTER PARENTHESIS
// ═══════════════════════════════════════════════════════════════════════════════

const PAUSED_MACHINE_KEY = "__paused_machine_v2"

export interface PausedMachineStateV2 {
  machine_type: SupervisorSessionType
  session_id: string
  action_target?: string
  candidate_snapshot?: any
  paused_at: string
  reason: "sentry" | "firefighter"
  resume_context?: string  // Brief context for resuming
}

/**
 * Get the currently paused machine state (if any).
 */
export function getPausedMachine(tempMemory: any): PausedMachineStateV2 | null {
  const tm = safeObj(tempMemory)
  const raw = (tm as any)[PAUSED_MACHINE_KEY]
  if (!raw || typeof raw !== "object") return null
  
  return {
    machine_type: raw.machine_type as SupervisorSessionType,
    session_id: String(raw.session_id ?? ""),
    action_target: raw.action_target ? String(raw.action_target) : undefined,
    candidate_snapshot: raw.candidate_snapshot,
    paused_at: String(raw.paused_at ?? nowIso()),
    reason: raw.reason === "sentry" ? "sentry" : "firefighter",
    resume_context: raw.resume_context ? String(raw.resume_context) : undefined,
  }
}

/**
 * Pause the current machine for sentry/firefighter intervention.
 * Stores the machine state and clears it from the active stack.
 */
export function pauseMachineForSafety(opts: {
  tempMemory: any
  session: SupervisorSession
  candidate?: any
  reason: "sentry" | "firefighter"
  now?: Date
}): { tempMemory: any; pausedState: PausedMachineStateV2 } {
  const tm0 = safeObj(opts.tempMemory)
  const nowStr = nowIso(opts.now)
  
  // Extract action_target from session metadata
  let actionTarget: string | undefined
  if (opts.session.type === "create_action_flow" || 
      opts.session.type === "update_action_flow" || 
      opts.session.type === "breakdown_action_flow") {
    const candidate = opts.candidate ?? (opts.session.meta as any)?.candidate
    actionTarget = candidate?.label ?? candidate?.target_action?.title ?? opts.session.topic
  } else if (opts.session.type === "topic_serious" || opts.session.type === "topic_light") {
    actionTarget = opts.session.topic ?? undefined
  } else if (opts.session.type === "deep_reasons_exploration") {
    actionTarget = opts.session.topic ?? undefined
  } else if (opts.session.type === "user_profile_confirmation") {
    // For profile confirmation, extract current fact as action_target
    const profileState = getProfileConfirmationState(tm0)
    const currentFact = profileState?.facts_queue?.[profileState.current_index]
    actionTarget = currentFact ? `${currentFact.key}: ${currentFact.proposed_value}` : "confirmation profil"
  }
  
  // Generate resume context
  const resumeContext = opts.session.topic 
    ? `On était en train de travailler sur: ${opts.session.topic}` 
    : `On était dans un flow de ${opts.session.type}`
  
  // For profile confirmation, save the full state as candidate_snapshot
  let candidateSnapshot = opts.candidate ?? (opts.session.meta as any)?.candidate
  if (opts.session.type === "user_profile_confirmation") {
    candidateSnapshot = getProfileConfirmationState(tm0)
  } else if (opts.session.type === "deep_reasons_exploration") {
    // Preserve deep_reasons state so resume can restore the phase accurately.
    candidateSnapshot = (tm0 as any)?.deep_reasons_state ?? candidateSnapshot
  }
  
  const pausedState: PausedMachineStateV2 = {
    machine_type: opts.session.type,
    session_id: opts.session.id,
    action_target: actionTarget?.slice(0, 80),
    candidate_snapshot: candidateSnapshot,
    paused_at: nowStr,
    reason: opts.reason,
    resume_context: resumeContext,
  }
  
  // Store paused state
  let tempMemory = { ...(tm0 as any), [PAUSED_MACHINE_KEY]: pausedState }
  
  // Remove the session from active stack
  const sessionType = opts.session.type
  if (sessionType === "create_action_flow") {
    const closed = closeCreateActionFlow({ tempMemory, outcome: "abandoned", now: opts.now })
    tempMemory = closed.tempMemory
  } else if (sessionType === "update_action_flow") {
    const closed = closeUpdateActionFlow({ tempMemory, outcome: "abandoned", now: opts.now })
    tempMemory = closed.tempMemory
  } else if (sessionType === "breakdown_action_flow") {
    const closed = closeBreakdownActionFlow({ tempMemory, outcome: "abandoned", now: opts.now })
    tempMemory = closed.tempMemory
  } else if (sessionType === "deep_reasons_exploration") {
    const closed = closeDeepReasonsExploration({ tempMemory, outcome: "defer_continue", now: opts.now })
    tempMemory = closed.tempMemory
  } else if (sessionType === "topic_serious" || sessionType === "topic_light") {
    const closed = closeTopicSession({ tempMemory, now: opts.now })
    tempMemory = closed.tempMemory
  } else if (sessionType === "user_profile_confirmation") {
    // For profile confirmation, remove active state so safety flow can take over.
    // The state is preserved in pausedState.candidate_snapshot for resume.
    const next = { ...(tempMemory as any) }
    delete next[PROFILE_CONFIRM_STATE_KEY]
    tempMemory = next
  }
  
  return { tempMemory, pausedState }
}

/**
 * Resume a paused machine after safety intervention.
 * Restores the machine to active state.
 */
export function resumePausedMachine(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; resumed: boolean; machineType?: SupervisorSessionType } {
  const tm0 = safeObj(opts.tempMemory)
  const pausedState = getPausedMachine(tm0)
  
  if (!pausedState) {
    return { tempMemory: tm0, resumed: false }
  }
  
  let tempMemory = { ...(tm0 as any) }
  
  // Restore the machine based on type
  const machineType = pausedState.machine_type
  const candidate = pausedState.candidate_snapshot
  
  if (machineType === "create_action_flow" && candidate) {
    const result = upsertCreateActionFlow({ tempMemory, candidate, now: opts.now })
    tempMemory = result.tempMemory
  } else if (machineType === "update_action_flow" && candidate) {
    const result = upsertUpdateActionFlow({ tempMemory, candidate, now: opts.now })
    tempMemory = result.tempMemory
  } else if (machineType === "breakdown_action_flow" && candidate) {
    const result = upsertBreakdownActionFlow({ tempMemory, candidate, now: opts.now })
    tempMemory = result.tempMemory
  } else if (machineType === "track_progress_flow") {
    const result = upsertTrackProgressFlow({
      tempMemory,
      targetAction: pausedState.action_target,
      now: opts.now,
    })
    tempMemory = result.tempMemory
  } else if (machineType === "activate_action_flow") {
    const result = upsertActivateActionFlow({
      tempMemory,
      targetAction: pausedState.action_target,
      now: opts.now,
    })
    tempMemory = result.tempMemory
  } else if (machineType === "deep_reasons_exploration") {
    const state = pausedState.candidate_snapshot
    const restoredState = state && typeof state === "object" ? state : null
    const topic = String(
      restoredState?.action_context?.title ??
      pausedState.action_target ??
      "blocage motivationnel"
    ).trim().slice(0, 160)
    const rawPhase = String(restoredState?.phase ?? "clarify")
    const validDeepReasonsPhases = [
      "re_consent",
      "clarify",
      "hypotheses",
      "resonance",
      "intervention",
      "closing",
    ] as const
    const phase = (validDeepReasonsPhases.includes(rawPhase as any) ? rawPhase : "clarify") as
      "re_consent" | "clarify" | "hypotheses" | "resonance" | "intervention" | "closing"
    const result = upsertDeepReasonsExploration({
      tempMemory,
      topic,
      phase,
      pattern: restoredState?.detected_pattern,
      actionTitle: restoredState?.action_context?.title,
      source: restoredState?.source === "deferred" ? "deferred" : "direct",
      now: opts.now,
    })
    tempMemory = result.tempMemory
    if (restoredState) {
      ;(tempMemory as any).deep_reasons_state = restoredState
    }
  } else if (machineType === "topic_serious") {
    const result = upsertTopicSerious({
      tempMemory,
      topic: pausedState.action_target ?? "",
      phase: "exploring",
      now: opts.now,
    })
    tempMemory = result.tempMemory
  } else if (machineType === "topic_light") {
    const result = upsertTopicLight({
      tempMemory,
      topic: pausedState.action_target ?? "",
      phase: "exploring",
      now: opts.now,
    })
    tempMemory = result.tempMemory
  } else if (machineType === "user_profile_confirmation") {
    // Profile confirmation state is preserved in candidate_snapshot
    // Restore it from there
    if (pausedState.candidate_snapshot) {
      ;(tempMemory as any).profile_confirmation_state = pausedState.candidate_snapshot
    }
    // Also set a flag to indicate we're resuming
    ;(tempMemory as any).__resume_profile_confirmation = {
      context: pausedState.resume_context,
    }
  }
  
  // Clear paused state
  delete (tempMemory as any)[PAUSED_MACHINE_KEY]
  
  return { tempMemory, resumed: true, machineType }
}

/**
 * Check if there's a paused machine waiting to be resumed.
 */
export function hasPausedMachine(tempMemory: any): boolean {
  return getPausedMachine(tempMemory) !== null
}

/**
 * Clear paused machine state without resuming (e.g., when user declines).
 */
export function clearPausedMachine(tempMemory: any): { tempMemory: any } {
  const tm = safeObj(tempMemory)
  const next = { ...(tm as any) }
  delete next[PAUSED_MACHINE_KEY]
  return { tempMemory: next }
}

/**
 * Get any active tool flow (create, update, breakdown, track_progress, or activate).
 * Returns the session if one exists.
 */
export function getAnyActiveToolFlow(tempMemory: any): SupervisorSession | null {
  return getActiveCreateActionFlow(tempMemory) 
    ?? getActiveUpdateActionFlow(tempMemory) 
    ?? getActiveBreakdownActionFlow(tempMemory)
    ?? getActiveTrackProgressFlow(tempMemory)
    ?? getActiveActivateActionFlow(tempMemory)
}

/**
 * Get any active state machine (tool flow, topic, or deep_reasons).
 */
export function getAnyActiveMachine(tempMemory: any): SupervisorSession | null {
  return getAnyActiveToolFlow(tempMemory)
    ?? getActiveTopicSession(tempMemory)
    ?? getActiveDeepReasonsExploration(tempMemory)
}

/**
 * Check if any tool flow is currently active.
 */
export function hasActiveToolFlow(tempMemory: any): boolean {
  return getAnyActiveToolFlow(tempMemory) !== null
}

/**
 * Check if any state machine is currently active.
 */
export function hasAnyActiveMachine(tempMemory: any): boolean {
  return getAnyActiveMachine(tempMemory) !== null
}

/**
 * Get the action target from an active tool flow session.
 */
export function getActiveToolFlowActionTarget(tempMemory: any): string | null {
  const session = getAnyActiveToolFlow(tempMemory)
  if (!session) return null
  
  const candidate = (session.meta as any)?.candidate
  if (!candidate) return session.topic ?? null
  
  // Different candidate types have different field names
  return candidate.label 
    ?? candidate.target_action?.title 
    ?? session.topic 
    ?? null
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY SENTRY FLOW
// State machine for vital danger situations (suicidal ideation, physical danger)
// ═══════════════════════════════════════════════════════════════════════════════

const SAFETY_SENTRY_KEY = "__safety_sentry_flow"
const TTL_SAFETY_SENTRY_MS = 30 * 60 * 1000  // 30 minutes (safety flows have longer TTL)

/**
 * Get the active safety_sentry_flow state.
 */
export function getActiveSafetySentryFlow(tempMemory: any): SafetySentryFlowState | null {
  const tm = safeObj(tempMemory)
  const raw = (tm as any)[SAFETY_SENTRY_KEY]
  if (!raw || typeof raw !== "object") return null
  if (raw.phase === "resolved") return null  // Resolved flows are not active
  
  return {
    phase: raw.phase as SafetyFlowPhase,
    trigger_message: String(raw.trigger_message ?? ""),
    safety_confirmed: Boolean(raw.safety_confirmed),
    external_help_mentioned: Boolean(raw.external_help_mentioned),
    turn_count: Number(raw.turn_count ?? 0),
    started_at: String(raw.started_at ?? nowIso()),
    last_updated_at: String(raw.last_updated_at ?? nowIso()),
  }
}

/**
 * Start or update the safety_sentry_flow.
 */
export function upsertSafetySentryFlow(opts: {
  tempMemory: any
  triggerMessage?: string
  phase?: SafetyFlowPhase
  safetyConfirmed?: boolean
  externalHelpMentioned?: boolean
  now?: Date
}): { tempMemory: any; state: SafetySentryFlowState } {
  const tm0 = safeObj(opts.tempMemory)
  const existing = getActiveSafetySentryFlow(tm0)
  const nowStr = nowIso(opts.now)
  
  const state: SafetySentryFlowState = {
    phase: opts.phase ?? existing?.phase ?? "acute",
    trigger_message: opts.triggerMessage ?? existing?.trigger_message ?? "",
    safety_confirmed: opts.safetyConfirmed ?? existing?.safety_confirmed ?? false,
    external_help_mentioned: opts.externalHelpMentioned ?? existing?.external_help_mentioned ?? false,
    turn_count: (existing?.turn_count ?? 0) + (existing ? 1 : 0),
    started_at: existing?.started_at ?? nowStr,
    last_updated_at: nowStr,
  }
  
  // Also add to supervisor stack for visibility
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "safety_sentry_flow")
  
  if (state.phase !== "resolved") {
    const session: SupervisorSession = {
      id: mkId("sess_safety_sentry", opts.now),
      type: "safety_sentry_flow",
      owner_mode: "sentry",
      status: "active",
      started_at: state.started_at,
      last_active_at: nowStr,
      topic: "Situation de danger",
      turn_count: state.turn_count,
      meta: {
        phase: state.phase,
        safety_confirmed: state.safety_confirmed,
        external_help_mentioned: state.external_help_mentioned,
      },
    }
    filtered.push(session)
  }
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowStr }
  const tempMemory = {
    ...writeSupervisorRuntime(tm0, rtNext),
    [SAFETY_SENTRY_KEY]: state,
  }
  
  return { tempMemory, state }
}

/**
 * Close the safety_sentry_flow.
 */
export function closeSafetySentryFlow(opts: {
  tempMemory: any
  outcome: "resolved_safe" | "escalated_external" | "abandoned"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const existing = getActiveSafetySentryFlow(tm0)
  
  if (!existing) {
    return { tempMemory: tm0, changed: false }
  }
  
  // Remove from supervisor stack
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "safety_sentry_flow")
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  const tempMemory = writeSupervisorRuntime(tm0, rtNext)
  
  // Clear the state
  delete (tempMemory as any)[SAFETY_SENTRY_KEY]
  
  return { tempMemory, changed: true }
}

/**
 * Check if safety_sentry_flow is stale.
 */
export function isSafetySentryFlowStale(tempMemory: any, now?: Date): boolean {
  const state = getActiveSafetySentryFlow(tempMemory)
  if (!state) return false
  
  const nowMs = (now ?? new Date()).getTime()
  const lastActive = new Date(state.last_updated_at ?? state.started_at ?? 0).getTime()
  const age = nowMs - lastActive
  
  return age > TTL_SAFETY_SENTRY_MS
}

/**
 * Determine if sentry flow should advance to next phase based on signals.
 */
export function computeSentryNextPhase(
  current: SafetySentryFlowState,
  signals: {
    user_confirms_safe?: boolean
    external_help_mentioned?: boolean
    still_in_danger?: boolean
  }
): SafetyFlowPhase {
  // If user is still expressing danger, stay in acute
  if (signals.still_in_danger) {
    return "acute"
  }
  
  // If user confirms they are safe, move to confirming/resolved
  if (signals.user_confirms_safe || signals.external_help_mentioned) {
    if (current.phase === "confirming") {
      return "resolved"
    }
    return "confirming"
  }
  
  // Natural progression based on turn count
  if (current.phase === "acute" && current.turn_count >= 1) {
    return "stabilizing"
  }
  
  if (current.phase === "stabilizing" && current.turn_count >= 2) {
    return "confirming"
  }
  
  return current.phase
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY FIREFIGHTER FLOW
// State machine for emotional crisis (panic, acute distress, need for support)
// ═══════════════════════════════════════════════════════════════════════════════

const SAFETY_FIREFIGHTER_KEY = "__safety_firefighter_flow"
const TTL_SAFETY_FIREFIGHTER_MS = 20 * 60 * 1000  // 20 minutes

/**
 * Get the active safety_firefighter_flow state.
 */
export function getActiveSafetyFirefighterFlow(tempMemory: any): SafetyFirefighterFlowState | null {
  const tm = safeObj(tempMemory)
  const raw = (tm as any)[SAFETY_FIREFIGHTER_KEY]
  if (!raw || typeof raw !== "object") return null
  if (raw.phase === "resolved") return null  // Resolved flows are not active
  
  return {
    phase: raw.phase as SafetyFlowPhase,
    trigger_message: String(raw.trigger_message ?? ""),
    technique_used: raw.technique_used ? String(raw.technique_used) : undefined,
    stabilization_signals: Number(raw.stabilization_signals ?? 0),
    distress_signals: Number(raw.distress_signals ?? 0),
    turn_count: Number(raw.turn_count ?? 0),
    started_at: String(raw.started_at ?? nowIso()),
    last_updated_at: String(raw.last_updated_at ?? nowIso()),
  }
}

/**
 * Start or update the safety_firefighter_flow.
 */
export function upsertSafetyFirefighterFlow(opts: {
  tempMemory: any
  triggerMessage?: string
  phase?: SafetyFlowPhase
  techniqueUsed?: string
  stabilizationSignalDelta?: number  // +1 for positive signal, -1 for negative
  distressSignalDelta?: number       // +1 for distress signal
  now?: Date
}): { tempMemory: any; state: SafetyFirefighterFlowState } {
  const tm0 = safeObj(opts.tempMemory)
  const existing = getActiveSafetyFirefighterFlow(tm0)
  const nowStr = nowIso(opts.now)
  
  const state: SafetyFirefighterFlowState = {
    phase: opts.phase ?? existing?.phase ?? "acute",
    trigger_message: opts.triggerMessage ?? existing?.trigger_message ?? "",
    technique_used: opts.techniqueUsed ?? existing?.technique_used,
    stabilization_signals: Math.max(0, (existing?.stabilization_signals ?? 0) + (opts.stabilizationSignalDelta ?? 0)),
    distress_signals: Math.max(0, (existing?.distress_signals ?? 0) + (opts.distressSignalDelta ?? 0)),
    turn_count: (existing?.turn_count ?? 0) + (existing ? 1 : 0),
    started_at: existing?.started_at ?? nowStr,
    last_updated_at: nowStr,
  }
  
  // Also add to supervisor stack for visibility
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "safety_firefighter_flow")
  
  if (state.phase !== "resolved") {
    const session: SupervisorSession = {
      id: mkId("sess_safety_firefighter", opts.now),
      type: "safety_firefighter_flow",
      owner_mode: "firefighter",
      status: "active",
      started_at: state.started_at,
      last_active_at: nowStr,
      topic: "Crise émotionnelle",
      turn_count: state.turn_count,
      meta: {
        phase: state.phase,
        technique_used: state.technique_used,
        stabilization_signals: state.stabilization_signals,
        distress_signals: state.distress_signals,
      },
    }
    filtered.push(session)
  }
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowStr }
  const tempMemory = {
    ...writeSupervisorRuntime(tm0, rtNext),
    [SAFETY_FIREFIGHTER_KEY]: state,
  }
  
  return { tempMemory, state }
}

/**
 * Close the safety_firefighter_flow.
 */
export function closeSafetyFirefighterFlow(opts: {
  tempMemory: any
  outcome: "stabilized" | "escalated_sentry" | "abandoned"
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const existing = getActiveSafetyFirefighterFlow(tm0)
  
  if (!existing) {
    return { tempMemory: tm0, changed: false }
  }
  
  // Remove from supervisor stack
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "safety_firefighter_flow")
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  const tempMemory = writeSupervisorRuntime(tm0, rtNext)
  
  // Clear the state
  delete (tempMemory as any)[SAFETY_FIREFIGHTER_KEY]
  
  return { tempMemory, changed: true }
}

/**
 * Check if safety_firefighter_flow is stale.
 */
export function isSafetyFirefighterFlowStale(tempMemory: any, now?: Date): boolean {
  const state = getActiveSafetyFirefighterFlow(tempMemory)
  if (!state) return false
  
  const nowMs = (now ?? new Date()).getTime()
  const lastActive = new Date(state.last_updated_at ?? state.started_at ?? 0).getTime()
  const age = nowMs - lastActive
  
  return age > TTL_SAFETY_FIREFIGHTER_MS
}

/**
 * Determine if firefighter flow should advance to next phase based on signals.
 * This is the core logic for structured crisis resolution.
 */
export function computeFirefighterNextPhase(
  current: SafetyFirefighterFlowState,
  signals: {
    user_stabilizing?: boolean     // "ça va mieux", "merci", calm tone
    symptoms_still_present?: boolean  // physical symptoms still mentioned
    user_wants_to_continue?: boolean  // explicit "continue", doesn't want to stop
    escalate_to_sentry?: boolean     // situation became life-threatening
  }
): SafetyFlowPhase {
  // Escalation to sentry takes priority
  if (signals.escalate_to_sentry) {
    return "acute"  // Will trigger sentry handoff in router
  }
  
  // If physical symptoms still present, stay in grounding/stabilizing
  if (signals.symptoms_still_present) {
    if (current.phase === "acute") {
      return "grounding"
    }
    return "stabilizing"
  }
  
  // If user shows stabilization signals
  if (signals.user_stabilizing) {
    const newStabilizationCount = current.stabilization_signals + 1
    
    // Need 2+ stabilization signals to move to confirming
    if (newStabilizationCount >= 2 && current.phase !== "confirming") {
      return "confirming"
    }
    
    // In confirming phase with another stabilization signal = resolved
    if (current.phase === "confirming") {
      return "resolved"
    }
    
    // Move from acute/grounding to stabilizing
    if (current.phase === "acute" || current.phase === "grounding") {
      return "stabilizing"
    }
  }
  
  // Natural progression based on technique and turn count
  if (current.phase === "acute") {
    return "grounding"
  }
  
  if (current.phase === "grounding" && current.turn_count >= 2) {
    return "stabilizing"
  }
  
  return current.phase
}

/**
 * Get any active safety flow (sentry or firefighter).
 */
export function getActiveSafetyFlow(tempMemory: any): {
  type: "sentry" | "firefighter"
  state: SafetySentryFlowState | SafetyFirefighterFlowState
} | null {
  const sentry = getActiveSafetySentryFlow(tempMemory)
  if (sentry) return { type: "sentry", state: sentry }
  
  const firefighter = getActiveSafetyFirefighterFlow(tempMemory)
  if (firefighter) return { type: "firefighter", state: firefighter }
  
  return null
}

/**
 * Check if a safety flow is active.
 */
export function hasActiveSafetyFlow(tempMemory: any): boolean {
  return getActiveSafetyFlow(tempMemory) !== null
}
