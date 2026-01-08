import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

type Severity = "info" | "warn" | "error"

function normalizeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name || "Error", message: err.message || String(err), stack: err.stack }
  }

  // Supabase client / fetch errors are often plain objects
  const anyErr = err as any
  const name = typeof anyErr?.name === "string" ? anyErr.name : "Error"
  const message =
    typeof anyErr?.message === "string"
      ? anyErr.message
      : typeof anyErr === "string"
        ? anyErr
        : JSON.stringify(anyErr ?? {})
  const stack = typeof anyErr?.stack === "string" ? anyErr.stack : undefined
  return { name, message, stack }
}

export async function logEdgeFunctionError(args: {
  functionName: string
  error: unknown
  severity?: Severity
  title?: string
  requestId?: string | null
  userId?: string | null
  source?: string
  metadata?: Record<string, unknown>
}) {
  try {
    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim()
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim()
    if (!url || !serviceKey) {
      // Best-effort only: we don't want to hide the original error because logging failed.
      console.warn("[logEdgeFunctionError] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
      return
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const sev: Severity = args.severity ?? "error"
    const { name, message, stack } = normalizeError(args.error)

    const insertRow = {
      severity: sev,
      source: (args.source ?? "edge").toString(),
      function_name: args.functionName,
      title: (args.title ?? name).toString(),
      message,
      stack: stack ?? null,
      request_id: args.requestId ?? null,
      user_id: args.userId ?? null,
      metadata: { ...(args.metadata ?? {}), error_name: name },
    }

    const { error } = await admin.from("system_error_logs").insert(insertRow as any)
    if (error) {
      console.warn("[logEdgeFunctionError] insert failed:", error)
    }
  } catch (e) {
    console.warn("[logEdgeFunctionError] unexpected failure:", e)
  }
}


