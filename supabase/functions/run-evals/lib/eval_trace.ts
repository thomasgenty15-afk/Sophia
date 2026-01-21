import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

export type EvalTraceLevel = "debug" | "info" | "warn" | "error"

export async function logEvalEvent(opts: {
  supabase: SupabaseClient
  evalRunId: string | null
  requestId: string
  source: string
  event: string
  level?: EvalTraceLevel
  payload?: any
}): Promise<void> {
  const { supabase, evalRunId, requestId, source, event } = opts
  if (!evalRunId) return
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
    // Best-effort. Never fail the eval run because tracing insert failed.
  }
}


