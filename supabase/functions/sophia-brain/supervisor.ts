import type { AgentMode } from "./state-manager.ts"

export type SafetyFlowPhase = "acute" | "grounding" | "stabilizing" | "confirming" | "resolved"

export interface SafetySentryFlowState {
  phase: SafetyFlowPhase
  trigger_message: string
  safety_confirmed: boolean
  external_help_mentioned: boolean
  turn_count: number
  started_at: string
  last_updated_at: string
}

export interface SafetyFirefighterFlowState {
  phase: SafetyFlowPhase
  trigger_message: string
  technique_used?: string
  stabilization_signals: number
  distress_signals: number
  turn_count: number
  started_at: string
  last_updated_at: string
}

const SAFETY_SENTRY_KEY = "__safety_sentry_flow"
const SAFETY_FIREFIGHTER_KEY = "__safety_firefighter_flow"
const GLOBAL_MACHINE_KEY = "global_machine"
const SUPERVISOR_KEY = "supervisor"

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString()
}

function safeObj(x: any): Record<string, unknown> {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

function getLegacyRuntimeStack(tempMemory: any): any[] {
  const tm = safeObj(tempMemory)
  const gm = safeObj((tm as any)[GLOBAL_MACHINE_KEY])
  const sup = safeObj((tm as any)[SUPERVISOR_KEY])
  const raw = Object.keys(gm).length > 0 ? gm : sup
  return Array.isArray((raw as any).stack) ? ((raw as any).stack as any[]) : []
}

function latestSafetySession(tempMemory: any, type: "safety_sentry_flow" | "safety_firefighter_flow"): any | null {
  const stack = getLegacyRuntimeStack(tempMemory)
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i]
    if (!s || typeof s !== "object") continue
    if (String((s as any).type ?? "") !== type) continue
    if (String((s as any).status ?? "active") !== "active") continue
    return s
  }
  return null
}

function normalizeSentry(raw: any): SafetySentryFlowState | null {
  if (!raw || typeof raw !== "object") return null
  const phase = String(raw.phase ?? "acute") as SafetyFlowPhase
  if (phase === "resolved") return null
  return {
    phase,
    trigger_message: String(raw.trigger_message ?? ""),
    safety_confirmed: Boolean(raw.safety_confirmed),
    external_help_mentioned: Boolean(raw.external_help_mentioned),
    turn_count: Number(raw.turn_count ?? 0),
    started_at: String(raw.started_at ?? nowIso()),
    last_updated_at: String(raw.last_updated_at ?? nowIso()),
  }
}

function normalizeFirefighter(raw: any): SafetyFirefighterFlowState | null {
  if (!raw || typeof raw !== "object") return null
  const phase = String(raw.phase ?? "acute") as SafetyFlowPhase
  if (phase === "resolved") return null
  return {
    phase,
    trigger_message: String(raw.trigger_message ?? ""),
    technique_used: raw.technique_used ? String(raw.technique_used) : undefined,
    stabilization_signals: Number(raw.stabilization_signals ?? 0),
    distress_signals: Number(raw.distress_signals ?? 0),
    turn_count: Number(raw.turn_count ?? 0),
    started_at: String(raw.started_at ?? nowIso()),
    last_updated_at: String(raw.last_updated_at ?? nowIso()),
  }
}

export function getActiveSafetySentryFlow(tempMemory: any): SafetySentryFlowState | null {
  const tm = safeObj(tempMemory)
  const direct = normalizeSentry((tm as any)[SAFETY_SENTRY_KEY])
  if (direct) return direct

  const legacy = latestSafetySession(tempMemory, "safety_sentry_flow")
  if (!legacy) return null
  return normalizeSentry({
    phase: (legacy as any)?.meta?.phase ?? "acute",
    trigger_message: (legacy as any)?.topic ?? "",
    safety_confirmed: (legacy as any)?.meta?.safety_confirmed,
    external_help_mentioned: (legacy as any)?.meta?.external_help_mentioned,
    turn_count: (legacy as any)?.turn_count,
    started_at: (legacy as any)?.started_at,
    last_updated_at: (legacy as any)?.last_active_at,
  })
}

export function getActiveSafetyFirefighterFlow(tempMemory: any): SafetyFirefighterFlowState | null {
  const tm = safeObj(tempMemory)
  const direct = normalizeFirefighter((tm as any)[SAFETY_FIREFIGHTER_KEY])
  if (direct) return direct

  const legacy = latestSafetySession(tempMemory, "safety_firefighter_flow")
  if (!legacy) return null
  return normalizeFirefighter({
    phase: (legacy as any)?.meta?.phase ?? "acute",
    trigger_message: (legacy as any)?.topic ?? "",
    technique_used: (legacy as any)?.meta?.technique_used,
    stabilization_signals: (legacy as any)?.meta?.stabilization_signals,
    distress_signals: (legacy as any)?.meta?.distress_signals,
    turn_count: (legacy as any)?.turn_count,
    started_at: (legacy as any)?.started_at,
    last_updated_at: (legacy as any)?.last_active_at,
  })
}

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

export function hasActiveSafetyFlow(tempMemory: any): boolean {
  return getActiveSafetyFlow(tempMemory) !== null
}

// Backward-compatible type aliases for older traces/rows that may still contain these values.
export type SupervisorSessionStatus = "active" | "paused"
export type SupervisorSessionType =
  | "topic_serious"
  | "topic_light"
  | "deep_reasons_exploration"
  | "create_action_flow"
  | "update_action_flow"
  | "breakdown_action_flow"
  | "track_progress_flow"
  | "activate_action_flow"
  | "delete_action_flow"
  | "deactivate_action_flow"
  | "safety_sentry_flow"
  | "safety_firefighter_flow"

export interface SupervisorSession {
  id: string
  type: SupervisorSessionType
  owner_mode: AgentMode
  status: SupervisorSessionStatus
  started_at: string
  last_active_at: string
  topic?: string
  turn_count?: number
  meta?: Record<string, unknown>
}
