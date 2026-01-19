import type { AgentMode } from "./state-manager.ts"

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

export type SupervisorSessionStatus = "active" | "paused"

export interface SupervisorSession {
  id: string
  type: SupervisorSessionType
  owner_mode: AgentMode
  status: SupervisorSessionStatus
  started_at: string
  last_active_at: string
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


