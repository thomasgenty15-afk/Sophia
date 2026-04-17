import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"

type EvalTraceLevel = "debug" | "info" | "warn" | "error"

async function logEvalEvent(opts: {
  supabase: SupabaseClient
  evalRunId: string | null
  requestId: string
  source: string
  event: string
  level?: EvalTraceLevel
  payload?: any
}): Promise<void> {
  const { supabase, evalRunId, requestId, source, event } = opts
  try {
    await supabase.from("conversation_eval_events").insert({
      eval_run_id: evalRunId,
      request_id: requestId,
      source: String(source ?? "unknown").slice(0, 80),
      event: String(event ?? "event").slice(0, 120),
      level: (opts.level ?? "info"),
      payload: (opts.payload && typeof opts.payload === "object") ? opts.payload : { value: opts.payload ?? null },
    } as any)
  } catch {
    // Best-effort. Never fail request handling because tracing insert failed.
  }
}

// Cache in isolate memory to avoid repeated DB lookups per request_id during eval runs.
function getCache(): Map<string, string> {
  const g = globalThis as any
  if (!g.__sophiaEvalRunIdByRequestId) g.__sophiaEvalRunIdByRequestId = new Map()
  return g.__sophiaEvalRunIdByRequestId as Map<string, string>
}

async function resolveEvalRunIdByRequestId(supabase: SupabaseClient, requestId: string): Promise<string | null> {
  const rid = String(requestId ?? "").trim()
  if (!rid) return null
  // Only meaningful for eval runs with tagged request ids.
  if (!rid.includes(":state_machines:") && !rid.includes(":tools:") && !rid.includes(":whatsapp:")) return null
  const cache = getCache()
  if (cache.has(rid)) return cache.get(rid) ?? null
  try {
    const { data: row } = await supabase
      .from("conversation_eval_runs")
      .select("id,created_at")
      .eq("config->>request_id", rid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const id = (row as any)?.id ? String((row as any).id) : null
    if (id) cache.set(rid, id)
    return id
  } catch {
    return null
  }
}

export async function logVerifierEvalEvent(opts: {
  supabase: SupabaseClient
  requestId: string
  source: string
  event: string
  level?: "debug" | "info" | "warn" | "error"
  payload?: any
}): Promise<void> {
  const evalRunId = await resolveEvalRunIdByRequestId(opts.supabase, opts.requestId)
  await logEvalEvent({
    supabase: opts.supabase,
    evalRunId,
    requestId: opts.requestId,
    source: opts.source,
    event: opts.event,
    level: opts.level ?? "info",
    payload: opts.payload,
  })
}




