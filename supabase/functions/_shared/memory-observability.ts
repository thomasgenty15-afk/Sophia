import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

declare const Deno: any;

function parseBoolEnv(v: string | undefined): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function truncateDeep(
  input: unknown,
  opts?: { maxLen?: number; maxDepth?: number; maxKeys?: number; maxArray?: number },
): unknown {
  const maxLen = Math.max(64, Math.floor(opts?.maxLen ?? 1200));
  const maxDepth = Math.max(1, Math.floor(opts?.maxDepth ?? 7));
  const maxKeys = Math.max(10, Math.floor(opts?.maxKeys ?? 80));
  const maxArray = Math.max(5, Math.floor(opts?.maxArray ?? 25));
  const seen = new WeakSet<object>();

  const clamp = (s: string) => (s.length > maxLen ? s.slice(0, maxLen) + "…" : s);
  const rec = (v: any, depth: number): any => {
    if (v == null) return v;
    const t = typeof v;
    if (t === "string") return clamp(v);
    if (t === "number" || t === "boolean") return v;
    if (t !== "object") return clamp(String(v));
    if (depth >= maxDepth) return "[truncated_depth]";
    if (seen.has(v)) return "[circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.slice(0, maxArray).map((x) => rec(x, depth + 1));
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).slice(0, maxKeys)) {
      out[k] = rec(v[k], depth + 1);
    }
    return out;
  };
  return rec(input, 0);
}

export function isMemoryObservabilityEnabled(): boolean {
  const value = (globalThis as any)?.Deno?.env?.get?.("MEMORY_OBSERVABILITY_ON");
  return parseBoolEnv(value);
}

export async function logMemoryObservabilityEvent(opts: {
  supabase: SupabaseClient;
  userId: string;
  requestId?: string | null;
  turnId?: string | null;
  channel?: "web" | "whatsapp" | null;
  scope?: string | null;
  sourceComponent: string;
  eventName: string;
  payload?: unknown;
}): Promise<void> {
  try {
    if (!isMemoryObservabilityEnabled()) return;
    const userId = String(opts.userId ?? "").trim();
    const sourceComponent = String(opts.sourceComponent ?? "").trim();
    const eventName = String(opts.eventName ?? "").trim();
    if (!userId || !sourceComponent || !eventName) return;

    const payload = truncateDeep(opts.payload ?? {});
    const { error } = await (opts.supabase as any)
      .from("memory_observability_events")
      .insert({
        request_id: opts.requestId ? String(opts.requestId).trim() : null,
        turn_id: opts.turnId ? String(opts.turnId).trim() : null,
        user_id: userId,
        channel: opts.channel ?? null,
        scope: opts.scope ? String(opts.scope).trim() : null,
        source_component: sourceComponent,
        event_name: eventName,
        payload,
      });
    if (error) {
      console.warn("[MemoryObservability] insert failed", {
        event_name: eventName,
        source_component: sourceComponent,
        error: String((error as any)?.message ?? error ?? "").slice(0, 280),
      });
    }
  } catch (error) {
    console.warn("[MemoryObservability] unexpected error", {
      event_name: String(opts.eventName ?? "").trim(),
      source_component: String(opts.sourceComponent ?? "").trim(),
      error: String((error as any)?.message ?? error ?? "").slice(0, 280),
    });
  }
}
