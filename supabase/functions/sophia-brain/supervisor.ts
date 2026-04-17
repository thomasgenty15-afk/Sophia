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

const SAFETY_SENTRY_KEY = "__safety_sentry_flow"
const GLOBAL_MACHINE_KEY = "global_machine"
const SUPERVISOR_KEY = "supervisor"

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString()
}

function safeObj(x: any): Record<string, unknown> {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

function getFallbackRuntimeStack(tempMemory: any): any[] {
  const tm = safeObj(tempMemory)
  const gm = safeObj((tm as any)[GLOBAL_MACHINE_KEY])
  const sup = safeObj((tm as any)[SUPERVISOR_KEY])
  const raw = Object.keys(gm).length > 0 ? gm : sup
  return Array.isArray((raw as any).stack) ? ((raw as any).stack as any[]) : []
}

function latestFallbackSafetySession(tempMemory: any, type: "safety_sentry_flow"): any | null {
  const stack = getFallbackRuntimeStack(tempMemory)
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

export function getActiveSafetySentryFlow(tempMemory: any): SafetySentryFlowState | null {
  const tm = safeObj(tempMemory)
  const direct = normalizeSentry((tm as any)[SAFETY_SENTRY_KEY])
  if (direct) return direct

  const fallback = latestFallbackSafetySession(tempMemory, "safety_sentry_flow")
  if (!fallback) return null
  return normalizeSentry({
    phase: (fallback as any)?.meta?.phase ?? "acute",
    trigger_message: (fallback as any)?.topic ?? "",
    safety_confirmed: (fallback as any)?.meta?.safety_confirmed,
    external_help_mentioned: (fallback as any)?.meta?.external_help_mentioned,
    turn_count: (fallback as any)?.turn_count,
    started_at: (fallback as any)?.started_at,
    last_updated_at: (fallback as any)?.last_active_at,
  })
}
