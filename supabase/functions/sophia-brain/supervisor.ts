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
  | "topic_session"

export type SupervisorSessionStatus = "active" | "paused"

export interface SupervisorSession {
  id: string
  type: SupervisorSessionType
  owner_mode: AgentMode
  status: SupervisorSessionStatus
  started_at: string
  last_active_at: string
  // Topic-session specific fields (kept optional so other session types remain unchanged).
  topic?: string
  phase?: "opening" | "exploring" | "converging" | "closing"
  focus_mode?: "plan" | "discussion" | "mixed"
  handoff_to?: AgentMode
  handoff_brief?: string
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

const SUPERVISOR_KEY = "supervisor"

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString()
}

function safeObj(x: any): Record<string, unknown> {
  return (x && typeof x === "object" && !Array.isArray(x)) ? x as any : {}
}

export function getSupervisorRuntime(tempMemory: any, now?: Date): SupervisorRuntime {
  const tm = safeObj(tempMemory)
  const raw = safeObj((tm as any)[SUPERVISOR_KEY])
  const v = Number((raw as any).v) === 1 ? 1 : 1
  const stack = Array.isArray((raw as any).stack) ? ((raw as any).stack as any[]).filter(Boolean) : []
  const queue = Array.isArray((raw as any).queue) ? ((raw as any).queue as any[]).filter(Boolean) : []
  const updated_at = String((raw as any).updated_at ?? "") || nowIso(now)
  return { v, stack: stack as any, queue: queue as any, updated_at }
}

export function writeSupervisorRuntime(tempMemory: any, runtime: SupervisorRuntime): any {
  const tm = safeObj(tempMemory)
  return { ...(tm as any), [SUPERVISOR_KEY]: runtime }
}

export function getActiveSupervisorSession(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const last = stack.length > 0 ? stack[stack.length - 1] : null
  return last && typeof last === "object" ? (last as SupervisorSession) : null
}

export function getActiveTopicSession(tempMemory: any): SupervisorSession | null {
  const rt = getSupervisorRuntime(tempMemory)
  const stack = Array.isArray(rt.stack) ? rt.stack : []
  const last = stack.length > 0 ? stack[stack.length - 1] : null
  if (!last || typeof last !== "object") return null
  return String((last as any)?.type ?? "") === "topic_session" ? (last as SupervisorSession) : null
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

export function upsertTopicSession(opts: {
  tempMemory: any
  topic: string
  ownerMode: AgentMode
  phase: "opening" | "exploring" | "converging" | "closing"
  focusMode: "plan" | "discussion" | "mixed"
  handoffTo?: AgentMode
  handoffBrief?: string
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const existing = stack0.findLast?.((s: any) => String(s?.type ?? "") === "topic_session")
    ?? [...stack0].reverse().find((s: any) => String(s?.type ?? "") === "topic_session")
    ?? null

  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "topic_session")

  const topic = String(opts.topic ?? "").trim().slice(0, 160)
  const startedAt = existing ? String((existing as any).started_at ?? nowIso(opts.now)) : nowIso(opts.now)
  const id = existing ? String((existing as any).id ?? mkId("sess_topic", opts.now)) : mkId("sess_topic", opts.now)

  const session: SupervisorSession = {
    id,
    type: "topic_session",
    owner_mode: opts.ownerMode,
    status: "active",
    started_at: startedAt,
    last_active_at: nowIso(opts.now),
    topic,
    phase: opts.phase,
    focus_mode: opts.focusMode,
    handoff_to: opts.handoffTo,
    handoff_brief: opts.handoffBrief ? String(opts.handoffBrief).slice(0, 360) : undefined,
    resume_brief: topic ? `On parlait de: ${topic}` : undefined,
    meta: {
      ...(typeof (existing as any)?.meta === "object" ? (existing as any).meta : {}),
    },
  }
  filtered.push(session)
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
}

export function closeTopicSession(opts: {
  tempMemory: any
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const tm0 = safeObj(opts.tempMemory)
  const rt0 = getSupervisorRuntime(tm0, opts.now)
  const stack0 = Array.isArray(rt0.stack) ? [...rt0.stack] : []
  const filtered = stack0.filter((s: any) => String(s?.type ?? "") !== "topic_session")
  if (filtered.length === stack0.length) return { tempMemory: tm0, changed: false }
  const rtNext: SupervisorRuntime = { ...rt0, stack: filtered, updated_at: nowIso(opts.now) }
  return { tempMemory: writeSupervisorRuntime(tm0, rtNext), changed: true }
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
const TTL_TOPIC_SESSION_MS = 2 * 60 * 60 * 1000          // 2 hours
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
    if (type === "topic_session" && age > TTL_TOPIC_SESSION_MS) {
      cleaned.push(`stack:topic_session:stale`)
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

