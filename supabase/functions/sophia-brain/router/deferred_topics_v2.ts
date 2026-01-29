/**
 * Deferred Topics V2: Smart signal deferral system for state machine prioritization.
 *
 * Key features:
 * - Only SENTRY/FIREFIGHTER can interrupt active state machines
 * - Other signals are deferred with smart summarization
 * - UPDATE-instead-of-CREATE to avoid duplicates
 * - Tool machines handle ONE action at a time (action_target tracking)
 * - 48h TTL, max 5 topics (FIFO)
 */

import type { SupervisorSessionType } from "../supervisor.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DeferredMachineType =
  | "deep_reasons"
  | "topic_light"
  | "topic_serious"
  | "create_action"
  | "update_action"
  | "breakdown_action"

export interface SignalSummary {
  summary: string       // Max 100 chars, e.g. "L'utilisateur bloque sur lecture car trop long"
  timestamp: string     // ISO timestamp
}

export interface DeferredTopicV2 {
  id: string
  machine_type: DeferredMachineType

  // For tool machines: which specific action this is about
  action_target?: string  // "lecture", "sport", "méditation"

  // Signal summaries (max 3, most recent kept)
  signal_summaries: SignalSummary[]

  // Merged summary (LLM-generated when machine starts if >1 summary)
  merged_summary?: string

  created_at: string
  last_updated_at: string
  trigger_count: number   // How many times signal detected for this topic

  // TTL: expires after 48h
  expires_at: string
}

export interface DeferredTopicsV2State {
  topics: DeferredTopicV2[]         // Max 5, FIFO
  paused_until?: string             // ISO timestamp (2h pause after "non")
  last_processed_at?: string
}

export interface PausedMachineState {
  machine_type: SupervisorSessionType
  session_id: string
  action_target?: string            // For tool flows
  candidate_snapshot?: any          // ActionCandidate, UpdateCandidate, BreakdownCandidate
  paused_at: string
  reason: "sentry" | "firefighter"
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_TOPICS = 5
const MAX_SUMMARIES_PER_TOPIC = 3
const TTL_MS = 48 * 60 * 60 * 1000  // 48 hours
const PAUSE_DURATION_MS = 2 * 60 * 60 * 1000  // 2 hours

const DEFERRED_V2_KEY = "deferred_topics_v2"
const PAUSED_MACHINE_KEY = "paused_machine_state"

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString()
}

function generateId(prefix: string, now?: Date): string {
  const t = nowIso(now).replace(/[:.]/g, "-")
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${t}_${rand}`
}

function safeObj(x: any): Record<string, unknown> {
  return (x && typeof x === "object" && !Array.isArray(x)) ? x as any : {}
}

function isExpired(topic: DeferredTopicV2, now?: Date): boolean {
  const expiresAt = new Date(topic.expires_at).getTime()
  const nowMs = (now ?? new Date()).getTime()
  return nowMs > expiresAt
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE ACCESS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the DeferredTopicsV2State from temp_memory.
 */
export function getDeferredTopicsV2State(tempMemory: any): DeferredTopicsV2State {
  const tm = safeObj(tempMemory)
  const raw = (tm as any)[DEFERRED_V2_KEY]
  if (!raw || typeof raw !== "object") {
    return { topics: [] }
  }
  return {
    topics: Array.isArray((raw as any).topics) ? (raw as any).topics : [],
    paused_until: typeof (raw as any).paused_until === "string" ? (raw as any).paused_until : undefined,
    last_processed_at: typeof (raw as any).last_processed_at === "string" ? (raw as any).last_processed_at : undefined,
  }
}

/**
 * Write DeferredTopicsV2State to temp_memory.
 */
export function writeDeferredTopicsV2State(tempMemory: any, state: DeferredTopicsV2State): any {
  const tm = safeObj(tempMemory)
  return { ...(tm as any), [DEFERRED_V2_KEY]: state }
}

/**
 * Get all non-expired deferred topics.
 */
export function getDeferredTopicsV2(tempMemory: any, now?: Date): DeferredTopicV2[] {
  const state = getDeferredTopicsV2State(tempMemory)
  return state.topics.filter(t => !isExpired(t, now))
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new deferred topic.
 * Returns the updated temp_memory and the created topic.
 */
export function createDeferredTopicV2(opts: {
  tempMemory: any
  machine_type: DeferredMachineType
  action_target?: string
  summary: string
  now?: Date
}): { tempMemory: any; topic: DeferredTopicV2; cancelled?: DeferredTopicV2 } {
  const state = getDeferredTopicsV2State(opts.tempMemory)
  const now = opts.now ?? new Date()
  const nowStr = nowIso(now)

  const topic: DeferredTopicV2 = {
    id: generateId("def", now),
    machine_type: opts.machine_type,
    action_target: opts.action_target?.trim().slice(0, 80),
    signal_summaries: [{
      summary: String(opts.summary ?? "").trim().slice(0, 100),
      timestamp: nowStr,
    }],
    created_at: nowStr,
    last_updated_at: nowStr,
    trigger_count: 1,
    expires_at: new Date(now.getTime() + TTL_MS).toISOString(),
  }

  // Filter expired topics first
  const validTopics = state.topics.filter(t => !isExpired(t, now))

  // Add new topic
  let newTopics = [...validTopics, topic]

  // Enforce max limit (FIFO: oldest cancelled)
  let cancelled: DeferredTopicV2 | undefined
  if (newTopics.length > MAX_TOPICS) {
    cancelled = newTopics[0]
    newTopics = newTopics.slice(-MAX_TOPICS)
  }

  const newState: DeferredTopicsV2State = {
    ...state,
    topics: newTopics,
  }

  return {
    tempMemory: writeDeferredTopicsV2State(opts.tempMemory, newState),
    topic,
    cancelled,
  }
}

/**
 * Update an existing deferred topic by adding a new summary.
 * Returns the updated temp_memory.
 */
export function updateDeferredTopicV2(opts: {
  tempMemory: any
  topicId: string
  summary: string
  now?: Date
}): { tempMemory: any; updated: boolean; topic?: DeferredTopicV2 } {
  const state = getDeferredTopicsV2State(opts.tempMemory)
  const now = opts.now ?? new Date()
  const nowStr = nowIso(now)

  const idx = state.topics.findIndex(t => t.id === opts.topicId)
  if (idx < 0) {
    return { tempMemory: opts.tempMemory, updated: false }
  }

  const existing = state.topics[idx]
  const newSummary: SignalSummary = {
    summary: String(opts.summary ?? "").trim().slice(0, 100),
    timestamp: nowStr,
  }

  // Keep max 3 summaries (most recent)
  let summaries = [...existing.signal_summaries, newSummary]
  if (summaries.length > MAX_SUMMARIES_PER_TOPIC) {
    summaries = summaries.slice(-MAX_SUMMARIES_PER_TOPIC)
  }

  const updated: DeferredTopicV2 = {
    ...existing,
    signal_summaries: summaries,
    last_updated_at: nowStr,
    trigger_count: existing.trigger_count + 1,
    // Extend TTL on update
    expires_at: new Date(now.getTime() + TTL_MS).toISOString(),
  }

  const newTopics = [...state.topics]
  newTopics[idx] = updated

  const newState: DeferredTopicsV2State = {
    ...state,
    topics: newTopics,
  }

  return {
    tempMemory: writeDeferredTopicsV2State(opts.tempMemory, newState),
    updated: true,
    topic: updated,
  }
}

/**
 * Find a matching deferred topic for UPDATE logic.
 * Matches by machine_type AND action_target (if provided).
 */
export function findMatchingDeferred(opts: {
  tempMemory: any
  machine_type: DeferredMachineType
  action_target?: string
  now?: Date
}): DeferredTopicV2 | null {
  const topics = getDeferredTopicsV2(opts.tempMemory, opts.now)

  for (const topic of topics) {
    if (topic.machine_type !== opts.machine_type) continue

    // For tool machines, action_target must match
    if (isToolMachine(opts.machine_type)) {
      if (opts.action_target && topic.action_target) {
        // Fuzzy match on action target (case-insensitive, partial)
        const targetLower = opts.action_target.toLowerCase()
        const topicTargetLower = topic.action_target.toLowerCase()
        if (targetLower.includes(topicTargetLower) || topicTargetLower.includes(targetLower)) {
          return topic
        }
      }
      // If no action_target specified, no match for tool machines
      continue
    }

    // For non-tool machines (topic_light, topic_serious, deep_reasons), just match machine_type
    return topic
  }

  return null
}

/**
 * Remove a deferred topic after processing.
 */
export function removeDeferredTopicV2(opts: {
  tempMemory: any
  topicId: string
}): { tempMemory: any; removed: boolean } {
  const state = getDeferredTopicsV2State(opts.tempMemory)
  const filtered = state.topics.filter(t => t.id !== opts.topicId)

  if (filtered.length === state.topics.length) {
    return { tempMemory: opts.tempMemory, removed: false }
  }

  const newState: DeferredTopicsV2State = {
    ...state,
    topics: filtered,
  }

  return {
    tempMemory: writeDeferredTopicsV2State(opts.tempMemory, newState),
    removed: true,
  }
}

/**
 * Get the next deferred topic to process (FIFO).
 * Respects pause status.
 */
export function getNextDeferredToProcess(tempMemory: any, now?: Date): DeferredTopicV2 | null {
  const state = getDeferredTopicsV2State(tempMemory)
  const nowMs = (now ?? new Date()).getTime()

  // Check if paused
  if (state.paused_until) {
    const pausedUntilMs = new Date(state.paused_until).getTime()
    if (nowMs < pausedUntilMs) {
      return null  // Still paused
    }
  }

  // Filter expired topics
  const validTopics = state.topics.filter(t => !isExpired(t, now))

  // FIFO: return oldest
  return validTopics.length > 0 ? validTopics[0] : null
}

/**
 * Prune expired deferred topics.
 */
export function pruneExpiredDeferredTopics(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; pruned: DeferredTopicV2[] } {
  const state = getDeferredTopicsV2State(opts.tempMemory)
  const now = opts.now ?? new Date()

  const valid: DeferredTopicV2[] = []
  const pruned: DeferredTopicV2[] = []

  for (const topic of state.topics) {
    if (isExpired(topic, now)) {
      pruned.push(topic)
    } else {
      valid.push(topic)
    }
  }

  if (pruned.length === 0) {
    return { tempMemory: opts.tempMemory, pruned: [] }
  }

  const newState: DeferredTopicsV2State = {
    ...state,
    topics: valid,
  }

  return {
    tempMemory: writeDeferredTopicsV2State(opts.tempMemory, newState),
    pruned,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAUSE MECHANISM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pause all deferred topics for a duration.
 * Used after user says "non" to resume question.
 */
export function pauseAllDeferredTopics(opts: {
  tempMemory: any
  durationMs?: number
  now?: Date
}): { tempMemory: any } {
  const state = getDeferredTopicsV2State(opts.tempMemory)
  const now = opts.now ?? new Date()
  const durationMs = opts.durationMs ?? PAUSE_DURATION_MS

  const newState: DeferredTopicsV2State = {
    ...state,
    paused_until: new Date(now.getTime() + durationMs).toISOString(),
  }

  return {
    tempMemory: writeDeferredTopicsV2State(opts.tempMemory, newState),
  }
}

/**
 * Check if deferred topics are currently paused.
 */
export function isDeferredPaused(tempMemory: any, now?: Date): boolean {
  const state = getDeferredTopicsV2State(tempMemory)
  if (!state.paused_until) return false

  const pausedUntilMs = new Date(state.paused_until).getTime()
  const nowMs = (now ?? new Date()).getTime()

  return nowMs < pausedUntilMs
}

/**
 * Clear the pause on deferred topics.
 */
export function clearDeferredPause(tempMemory: any): { tempMemory: any } {
  const state = getDeferredTopicsV2State(tempMemory)

  if (!state.paused_until) {
    return { tempMemory }
  }

  const newState: DeferredTopicsV2State = {
    ...state,
    paused_until: undefined,
  }

  return {
    tempMemory: writeDeferredTopicsV2State(tempMemory, newState),
  }
}

/**
 * Mark last processed timestamp.
 */
export function markDeferredProcessed(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any } {
  const state = getDeferredTopicsV2State(opts.tempMemory)
  const nowStr = nowIso(opts.now)

  const newState: DeferredTopicsV2State = {
    ...state,
    last_processed_at: nowStr,
  }

  return {
    tempMemory: writeDeferredTopicsV2State(opts.tempMemory, newState),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAUSED MACHINE STATE (for sentry/firefighter parenthesis)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get paused machine state.
 */
export function getPausedMachineState(tempMemory: any): PausedMachineState | null {
  const tm = safeObj(tempMemory)
  const raw = (tm as any)[PAUSED_MACHINE_KEY]
  if (!raw || typeof raw !== "object") return null

  return {
    machine_type: raw.machine_type as SupervisorSessionType,
    session_id: String(raw.session_id ?? ""),
    action_target: raw.action_target ? String(raw.action_target) : undefined,
    candidate_snapshot: raw.candidate_snapshot,
    paused_at: String(raw.paused_at ?? nowIso()),
    reason: (raw.reason === "sentry" || raw.reason === "firefighter") ? raw.reason : "firefighter",
  }
}

/**
 * Set paused machine state (when sentry/firefighter interrupts).
 */
export function setPausedMachineState(opts: {
  tempMemory: any
  state: PausedMachineState
}): { tempMemory: any } {
  const tm = safeObj(opts.tempMemory)
  return { ...(tm as any), [PAUSED_MACHINE_KEY]: opts.state }
}

/**
 * Clear paused machine state (after resume or move to deferred).
 */
export function clearPausedMachineState(tempMemory: any): { tempMemory: any } {
  const tm = safeObj(tempMemory)
  const next = { ...(tm as any) }
  delete next[PAUSED_MACHINE_KEY]
  return next
}

/**
 * Check if there's a paused machine.
 */
export function hasPausedMachine(tempMemory: any): boolean {
  return getPausedMachineState(tempMemory) !== null
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a machine type is a tool machine (handles single action).
 */
export function isToolMachine(machineType: DeferredMachineType | SupervisorSessionType): boolean {
  return machineType === "create_action_flow" ||
         machineType === "update_action_flow" ||
         machineType === "breakdown_action_flow" ||
         machineType === "create_action" ||
         machineType === "update_action" ||
         machineType === "breakdown_action"
}

/**
 * Convert supervisor session type to deferred machine type.
 */
export function sessionTypeToMachineType(sessionType: SupervisorSessionType): DeferredMachineType | null {
  switch (sessionType) {
    case "create_action_flow":
      return "create_action"
    case "update_action_flow":
      return "update_action"
    case "breakdown_action_flow":
      return "breakdown_action"
    case "deep_reasons_exploration":
      return "deep_reasons"
    case "topic_serious":
      return "topic_serious"
    case "topic_light":
      return "topic_light"
    default:
      return null
  }
}

/**
 * Convert deferred machine type to supervisor session type.
 */
export function machineTypeToSessionType(machineType: DeferredMachineType): SupervisorSessionType | null {
  switch (machineType) {
    case "create_action":
      return "create_action_flow"
    case "update_action":
      return "update_action_flow"
    case "breakdown_action":
      return "breakdown_action_flow"
    case "deep_reasons":
      return "deep_reasons_exploration"
    case "topic_serious":
      return "topic_serious"
    case "topic_light":
      return "topic_light"
    default:
      return null
  }
}

/**
 * Create or update a deferred topic based on whether a matching one exists.
 * This is the main entry point for deferring signals.
 */
export function deferSignal(opts: {
  tempMemory: any
  machine_type: DeferredMachineType
  action_target?: string
  summary: string
  now?: Date
}): {
  tempMemory: any
  action: "created" | "updated"
  topic: DeferredTopicV2
  cancelled?: DeferredTopicV2
} {
  // Check if matching deferred exists
  const existing = findMatchingDeferred({
    tempMemory: opts.tempMemory,
    machine_type: opts.machine_type,
    action_target: opts.action_target,
    now: opts.now,
  })

  if (existing) {
    // UPDATE existing
    const result = updateDeferredTopicV2({
      tempMemory: opts.tempMemory,
      topicId: existing.id,
      summary: opts.summary,
      now: opts.now,
    })
    return {
      tempMemory: result.tempMemory,
      action: "updated",
      topic: result.topic ?? existing,
    }
  }

  // CREATE new
  const result = createDeferredTopicV2({
    tempMemory: opts.tempMemory,
    machine_type: opts.machine_type,
    action_target: opts.action_target,
    summary: opts.summary,
    now: opts.now,
  })

  return {
    tempMemory: result.tempMemory,
    action: "created",
    topic: result.topic,
    cancelled: result.cancelled,
  }
}

/**
 * Get count of pending deferred topics.
 */
export function getDeferredTopicsCount(tempMemory: any, now?: Date): number {
  return getDeferredTopicsV2(tempMemory, now).length
}

/**
 * Check if there are any pending deferred topics (not paused).
 */
export function hasPendingDeferredTopics(tempMemory: any, now?: Date): boolean {
  if (isDeferredPaused(tempMemory, now)) return false
  return getDeferredTopicsCount(tempMemory, now) > 0
}

