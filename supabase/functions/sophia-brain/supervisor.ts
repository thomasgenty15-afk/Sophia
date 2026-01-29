import type { AgentMode } from "./state-manager.ts"
import { generateWithGemini } from "../_shared/gemini.ts"

/**
 * Supervisor Runtime (global orchestration state) persisted in `user_chat_states.temp_memory`.
 *
 * Design goals:
 * - Keep it lightweight and additive (doesn't break existing temp_memory keys).
 * - Enable stack (LIFO) + queue (non-urgent scheduling) primitives.
 * - Provide sync helpers for existing "legacy" state machines (e.g. architect_tool_flow).
 */

export type SupervisorSessionType =
  | "architect_tool_flow"
  | "user_profile_confirm"
  | "topic_serious"           // Deep topics (owner=architect): introspection, personal issues
  | "topic_light"             // Casual topics (owner=companion): small talk, anecdotes
  | "deep_reasons_exploration"
  | "create_action_flow"      // Simplified action creation flow (v2)
  | "update_action_flow"      // Simplified action update flow (v2)
  | "breakdown_action_flow"   // Simplified action breakdown flow (v2)

export type SupervisorSessionStatus = "active" | "paused"

export type TopicEngagementLevel = "high" | "medium" | "low" | "disengaged"

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

/** @deprecated Use getActiveTopicSession instead */
export const getActiveTopicExploration = getActiveTopicSession

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
  now?: Date
}): { tempMemory: any; changed: boolean } {
  return upsertTopicInternal({
    ...opts,
    sessionType: "topic_serious",
    ownerMode: "architect",
    focusMode: "mixed",
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
  now?: Date
}): { tempMemory: any; changed: boolean } {
  return upsertTopicInternal({
    ...opts,
    sessionType: "topic_light",
    ownerMode: "companion",
    focusMode: "discussion",
  })
}

/** @deprecated Use upsertTopicSerious or upsertTopicLight instead */
export function upsertTopicExploration(opts: {
  tempMemory: any
  topic: string
  ownerMode: AgentMode
  phase: "opening" | "exploring" | "converging" | "closing"
  focusMode: "plan" | "discussion" | "mixed"
  handoffTo?: AgentMode
  handoffBrief?: string
  now?: Date
}): { tempMemory: any; changed: boolean } {
  // Route to appropriate function based on ownerMode
  if (opts.ownerMode === "architect") {
    return upsertTopicSerious({ ...opts })
  } else {
    return upsertTopicLight({ ...opts })
  }
}

/** @deprecated Use upsertTopicSerious or upsertTopicLight instead */
export const upsertTopicSession = upsertTopicExploration

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

/** @deprecated Use closeTopicSession instead */
export const closeTopicExploration = closeTopicSession

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
 * Resume a paused deep_reasons exploration.
 */
export function resumeDeepReasonsExplorationSession(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  
  const idx = stack0.findIndex((s: any) => 
    String(s?.type ?? "") === "deep_reasons_exploration" && s?.status === "paused"
  )
  if (idx < 0) return { tempMemory: tm0, changed: false }
  
  const session = { ...stack0[idx] } as SupervisorSession
  session.status = "active"
  session.last_active_at = nowIso(opts.now)
  stack0[idx] = session
  
  const rtNext: SupervisorRuntime = { ...rt0, stack: stack0, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
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

/**
 * Keep the supervisor stack in sync with the legacy Architect multi-turn toolflow stored at
 * `temp_memory.architect_tool_flow`.
 *
 * This is intentionally conservative:
 * - If architect_tool_flow exists -> ensure there's a top-of-stack session for it.
 * - If architect_tool_flow is cleared -> remove any stack sessions of this type.
 */
export function syncLegacyArchitectToolFlowSession(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const flow = (tm0 as any).architect_tool_flow ?? null
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []

  const filtered = stack0.filter((s) => String((s as any)?.type ?? "") !== "architect_tool_flow")
  let changed = filtered.length !== stack0.length

  if (flow) {
    const kind = String((flow as any)?.kind ?? "")
    const stage = String((flow as any)?.stage ?? "")
    const resume = kind
      ? `On reprenait une mise à jour du plan (${kind}${stage ? ` / ${stage}` : ""}).`
      : "On reprenait une mise à jour du plan."

    const session: SupervisorSession = {
      id: mkId("sess_arch_flow", opts.now),
      type: "architect_tool_flow",
      owner_mode: "architect",
      status: "active",
      started_at: nowIso(opts.now),
      last_active_at: nowIso(opts.now),
      resume_brief: resume,
      meta: { kind, stage },
    }
    filtered.push(session)
    changed = true
  }

  if (!changed) return { tempMemory: tm0, changed: false }
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

/**
 * Canonical helper to set/clear the Architect toolflow, while keeping the supervisor runtime synced.
 */
export function setArchitectToolFlowInTempMemory(opts: {
  tempMemory: any
  nextFlow: any | null
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const tm1: any = { ...(tm0 as any) }
  if (opts.nextFlow == null) delete tm1.architect_tool_flow
  else tm1.architect_tool_flow = opts.nextFlow
  const synced = syncLegacyArchitectToolFlowSession({ tempMemory: tm1, now: opts.now })
  return { tempMemory: synced.tempMemory, changed: true }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TTL / STALE CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

/** TTL constants (ms) */
const TTL_ARCHITECT_TOOL_FLOW_MS = 60 * 60 * 1000        // 60 min
const TTL_TOPIC_SERIOUS_MS = 2 * 60 * 60 * 1000          // 2 hours (deep topics need more time)
const TTL_TOPIC_LIGHT_MS = 30 * 60 * 1000                // 30 min (casual topics expire faster)
const TTL_DEEP_REASONS_EXPLORATION_MS = 30 * 60 * 1000   // 30 min (keep shorter, sensitive context)
const TTL_CREATE_ACTION_FLOW_MS = 15 * 60 * 1000          // 15 min (short, focused flow)
const TTL_UPDATE_ACTION_FLOW_MS = 10 * 60 * 1000          // 10 min (shorter, simpler flow)
const TTL_BREAKDOWN_ACTION_FLOW_MS = 10 * 60 * 1000       // 10 min (short, needs concrete blocker)
const TTL_USER_PROFILE_CONFIRM_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
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

    if (type === "architect_tool_flow" && age > TTL_ARCHITECT_TOOL_FLOW_MS) {
      cleaned.push(`stack:architect_tool_flow:stale`)
      return false
    }
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

/**
 * Prune stale `temp_memory.architect_tool_flow` (legacy key) if it's older than TTL.
 */
export function pruneStaleArchitectToolFlow(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const flow = (tm0 as any).architect_tool_flow ?? null
  if (!flow) return { tempMemory: tm0, changed: false }

  const nowMs = (opts.now ?? new Date()).getTime()
  const startedAt = typeof (flow as any)?.started_at === "string"
    ? new Date((flow as any).started_at).getTime()
    : 0
  const age = startedAt > 0 ? nowMs - startedAt : Infinity

  if (age > TTL_ARCHITECT_TOOL_FLOW_MS) {
    return setArchitectToolFlowInTempMemory({ tempMemory: tm0, nextFlow: null, now: opts.now })
  }
  return { tempMemory: tm0, changed: false }
}

/**
 * Prune stale `temp_memory.user_profile_confirm.pending` if it's older than TTL.
 */
export function pruneStaleUserProfileConfirm(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const confirm = (tm0 as any).user_profile_confirm ?? null
  const pending = confirm?.pending ?? null
  if (!pending) return { tempMemory: tm0, changed: false }

  const nowMs = (opts.now ?? new Date()).getTime()
  const addedAt = typeof (pending as any)?.added_at === "string"
    ? new Date((pending as any).added_at).getTime()
    : 0
  const age = addedAt > 0 ? nowMs - addedAt : Infinity

  if (age > TTL_USER_PROFILE_CONFIRM_MS) {
    const tm1: any = { ...(tm0 as any) }
    const c = { ...(confirm ?? {}) }
    delete c.pending
    tm1.user_profile_confirm = Object.keys(c).length > 0 ? c : undefined
    if (!tm1.user_profile_confirm) delete tm1.user_profile_confirm
    return { tempMemory: tm1, changed: true }
  }
  return { tempMemory: tm0, changed: false }
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
  }
  
  // Generate resume context
  const resumeContext = opts.session.topic 
    ? `On était en train de travailler sur: ${opts.session.topic}` 
    : `On était dans un flow de ${opts.session.type}`
  
  const pausedState: PausedMachineStateV2 = {
    machine_type: opts.session.type,
    session_id: opts.session.id,
    action_target: actionTarget?.slice(0, 80),
    candidate_snapshot: opts.candidate ?? (opts.session.meta as any)?.candidate,
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
  } else if (machineType === "deep_reasons_exploration") {
    // For deep_reasons, we need more context - just set a flag to indicate resume
    ;(tempMemory as any).__resume_deep_reasons = {
      action_target: pausedState.action_target,
      context: pausedState.resume_context,
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
 * Get any active tool flow (create, update, or breakdown).
 * Returns the session if one exists.
 */
export function getAnyActiveToolFlow(tempMemory: any): SupervisorSession | null {
  return getActiveCreateActionFlow(tempMemory) 
    ?? getActiveUpdateActionFlow(tempMemory) 
    ?? getActiveBreakdownActionFlow(tempMemory)
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

