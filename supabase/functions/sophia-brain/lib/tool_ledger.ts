import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

type ToolLedgerLevel = "debug" | "info" | "warn" | "error"

function safeJsonValue(x: unknown): any {
  if (x && typeof x === "object") return x
  return { value: x ?? null }
}

function safeErrorObject(err: unknown): any {
  try {
    if (err instanceof Error) {
      return {
        name: err.name,
        message: String(err.message ?? "").slice(0, 4000),
        stack: String(err.stack ?? "").slice(0, 12000),
      }
    }
    return { message: String(err ?? "").slice(0, 4000) }
  } catch {
    return { message: "unknown_error" }
  }
}

function jsonSizeBytes(x: any): number {
  try {
    return new TextEncoder().encode(JSON.stringify(x)).length
  } catch {
    return 0
  }
}

function capJsonValue(x: any, maxBytes: number): any {
  // Keep full JSON when reasonable; otherwise keep a truncated text + hash.
  const size = jsonSizeBytes(x)
  if (size <= maxBytes) return { kind: "full", size_bytes: size, value: x }
  let txt = ""
  try {
    txt = JSON.stringify(x)
  } catch {
    txt = String(x)
  }
  return {
    kind: "truncated_text",
    size_bytes: size,
    value_truncated: txt.slice(0, Math.max(0, maxBytes)),
  }
}

async function sha256Hex(text: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(String(text ?? ""))
    const digest = await crypto.subtle.digest("SHA-256", buf)
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return ""
  }
}

function stableStringify(x: any): string {
  try {
    if (x == null) return "null"
    if (typeof x !== "object") return JSON.stringify(x)
    if (Array.isArray(x)) return `[${x.map((v) => stableStringify(v)).join(",")}]`
    const keys = Object.keys(x).sort()
    const body = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((x as any)[k])}`).join(",")
    return `{${body}}`
  } catch {
    try {
      return JSON.stringify(x)
    } catch {
      return String(x)
    }
  }
}

function summarizeToolArgs(toolName: string, args: any): any {
  const a = (args && typeof args === "object") ? args : {}
  // Keep a small, safe preview to avoid dumping large user content into the ledger.
  const pick = (keys: string[]) => {
    const out: any = {}
    for (const k of keys) if (a?.[k] != null) out[k] = a[k]
    return out
  }
  switch (String(toolName)) {
    case "track_progress":
      return pick(["target_name", "status", "value", "operation", "date"])
    case "break_down_action":
      return pick(["action_title_or_id", "apply_to_plan", "problem"])
    case "update_action_structure":
      return pick(["target_name", "new_title", "new_target_reps", "new_scheduled_days"])
    case "activate_plan_action":
    case "archive_plan_action":
      return pick(["action_title_or_id", "reason"])
    case "create_simple_action":
      return pick(["title", "type", "targetReps", "time_of_day"])
    case "create_framework":
      return pick(["title", "targetReps", "time_of_day"])
    case "create_action_flow":
      // ActionCandidate v2 flow - log relevant state
      return pick(["status", "label", "type", "clarification_count", "proposed_by"])
    case "update_action_flow":
      // UpdateActionCandidate v2 flow - log relevant state
      return pick(["status", "target_title", "change_type", "clarification_count"])
    case "breakdown_action_flow":
      // BreakdownCandidate v2 flow - log relevant state
      return pick(["status", "target_action", "blocker", "clarification_count", "proposed_step_title"])
    default:
      return pick(Object.keys(a).slice(0, 8))
  }
}

function summarizeToolResult(toolName: string, result: any): any {
  if (result == null) return { ok: true, result: null }
  if (typeof result === "string") return { ok: true, text_len: result.length, text_preview: result.slice(0, 240) }
  if (typeof result !== "object") return { ok: true, value: result }
  const r: any = result
  // Common patterns in our tool handlers
  const ids: any = {}
  for (const k of ["id", "action_id", "plan_id", "submission_id", "framework_id"]) {
    if (r?.[k] != null) ids[k] = r[k]
  }
  return {
    ok: true,
    keys: Object.keys(r).slice(0, 30),
    ...(Object.keys(ids).length ? { ids } : {}),
  }
}

export async function logToolLedgerEvent(opts: {
  supabase: SupabaseClient
  requestId: string
  evalRunId?: string | null
  userId?: string | null
  source: string
  event:
    | "tool_call_proposed"
    | "tool_call_attempted"
    | "tool_call_blocked"
    | "tool_call_succeeded"
    | "tool_call_failed"
  level?: ToolLedgerLevel
  toolName?: string
  toolArgs?: any
  toolResult?: any
  error?: unknown
  latencyMs?: number
  metadata?: any
}): Promise<void> {
  const requestId = String(opts.requestId ?? "").trim()
  if (!requestId) return
  const toolName = opts.toolName != null ? String(opts.toolName) : null
  const argsPreview = toolName ? summarizeToolArgs(toolName, opts.toolArgs) : null
  const argsHash = toolName ? await sha256Hex(stableStringify(opts.toolArgs)) : null
  const resultPreview = toolName ? summarizeToolResult(toolName, opts.toolResult) : null
  const resultHash = toolName ? await sha256Hex(stableStringify(opts.toolResult)) : null

  // Best-effort in-process dedup (prevents duplicated ledger rows when the same tool call is executed twice
  // due to upstream retries within the same isolate).
  try {
    const g: any = globalThis as any
    if (!g.__sophia_tool_ledger_dedup) g.__sophia_tool_ledger_dedup = { set: new Set<string>(), order: [] as string[] }
    const bag = g.__sophia_tool_ledger_dedup
    const key = [
      requestId,
      String(opts.source ?? ""),
      String(opts.event ?? ""),
      String(toolName ?? ""),
      String(argsHash ?? ""),
      String(resultHash ?? ""),
    ].join("|")
    if (bag.set.has(key)) return
    bag.set.add(key)
    bag.order.push(key)
    const MAX = 2000
    while (bag.order.length > MAX) {
      const old = bag.order.shift()
      if (old) bag.set.delete(old)
    }
  } catch {
    // ignore
  }

  const maxBytes = 64_000 // “full details” but bounded to keep DB sane
  const argsFull = toolName ? capJsonValue(opts.toolArgs ?? null, maxBytes) : null
  const resultFull = toolName ? capJsonValue(opts.toolResult ?? null, maxBytes) : null
  const errFull = opts.error != null ? safeErrorObject(opts.error) : null

  // IMPORTANT: conversation_eval_events is admin-only (RLS).
  // We therefore persist via a SECURITY DEFINER RPC to avoid relying on service role env inside Edge.
  try {
    await (opts.supabase as any).rpc("log_conversation_event", {
      p_eval_run_id: (opts.evalRunId ?? null),
      p_request_id: requestId,
      p_source: String(opts.source ?? "tool-ledger").slice(0, 80),
      p_event: String(opts.event).slice(0, 120),
      p_level: (opts.level ?? "info"),
      p_payload: safeJsonValue({
        tool: toolName,
        user_id: opts.userId ?? null,
        args: argsFull,
        args_hash: argsHash,
        args_preview: argsPreview,
        result: resultFull,
        result_hash: resultHash,
        result_preview: resultPreview,
        error: errFull,
        latency_ms: Number.isFinite(Number(opts.latencyMs)) ? Math.max(0, Math.floor(Number(opts.latencyMs))) : null,
        metadata: opts.metadata ?? null,
      }),
    })
  } catch {
    // best-effort; never block the user flow
  }
}


