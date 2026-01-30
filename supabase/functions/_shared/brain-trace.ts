import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type BrainTraceLevel = "debug" | "info" | "warn" | "error";
export type BrainTracePhase =
  | "dispatcher"
  | "routing"
  | "context"
  | "agent"
  | "verifier"
  | "state"
  | "io"
  | "soft_cap"
  | "other";

export type BrainTraceMeta = {
  requestId?: string;
  evalRunId?: string | null;
  // Debug escape hatch (non-prod usage): allow enabling traces outside evals.
  forceBrainTrace?: boolean;
};

function parseBoolEnv(v: string | undefined): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

export function shouldBrainTrace(meta?: BrainTraceMeta): boolean {
  if (meta?.forceBrainTrace) return true;
  // Primary mode: eval runs (run-evals passes meta.evalRunId)
  if (meta?.evalRunId) return true;
  // Manual override (staging only): set SOPHIA_BRAIN_TRACE_ENABLED=1
  if (parseBoolEnv((globalThis as any)?.Deno?.env?.get?.("SOPHIA_BRAIN_TRACE_ENABLED"))) return true;
  return false;
}

export async function logBrainTrace(opts: {
  supabase: SupabaseClient;
  userId: string;
  meta?: BrainTraceMeta;
  event: string;
  level?: BrainTraceLevel;
  phase?: BrainTracePhase;
  payload?: unknown;
}): Promise<void> {
  const evalRunId = opts.meta?.evalRunId ? String(opts.meta.evalRunId) : null;
  const requestId = opts.meta?.requestId ? String(opts.meta.requestId) : null;
  const event = String(opts.event ?? "").trim();
  try {
    if (!shouldBrainTrace(opts.meta)) return;
    if (!event) return;

    // Canonical stream (for bundling): always write into conversation_eval_events during eval runs.
    // This table is already consumed by the eval bundle and is the most reliable place to persist
    // high-granularity structured traces without relying on external log drains.
    if (evalRunId && requestId) {
      try {
        await (opts.supabase as any).from("conversation_eval_events").insert({
          eval_run_id: evalRunId,
          request_id: requestId,
          source: "brain-trace",
          level: String(opts.level ?? "info"),
          event,
          payload: { phase: opts.phase ?? null, ...(opts.payload ? { payload: opts.payload } : {}) },
        });
      } catch {
        // ignore
      }
    }

    // One-time ping (per isolate + request_id) to confirm tracing is active and evalRunId is wired.
    try {
      if (evalRunId && requestId) {
        const anyGlobalThis = globalThis as any;
        if (!anyGlobalThis.__sophiaBrainTracePinged) anyGlobalThis.__sophiaBrainTracePinged = new Set();
        const key = `${evalRunId}:${requestId}`;
        if (!anyGlobalThis.__sophiaBrainTracePinged.has(key)) {
          anyGlobalThis.__sophiaBrainTracePinged.add(key);
          await (opts.supabase as any).from("conversation_eval_events").insert({
            eval_run_id: evalRunId,
            request_id: requestId,
            source: "brain-trace",
            level: "debug",
            event: "brain_trace_ping",
            payload: { ok: true },
          });
        }
      }
    } catch {
      // ignore
    }
  } catch (e) {
    // If something throws (serialization/fetch), try to surface it into the eval event stream for debugging.
    if (evalRunId && requestId) {
      try {
        await (opts.supabase as any).from("conversation_eval_events").insert({
          eval_run_id: evalRunId,
          request_id: requestId,
          source: "brain-trace",
          level: "error",
          event: "brain_trace_exception",
          payload: { event, phase: opts.phase ?? null, message: String((e as any)?.message ?? e ?? "unknown").slice(0, 1200) },
        });
      } catch {
        // ignore
      }
    }
  }
}


