import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

type Severity = "info" | "warn" | "error"

function decodeJwtAlg(jwt: string) {
  const t = String(jwt ?? "").trim()
  const p0 = t.split(".")[0] ?? ""
  if (!p0) return "missing"
  try {
    const header = JSON.parse(atob(p0))
    return String(header?.alg ?? "unknown")
  } catch {
    return "parse_failed"
  }
}

function isLocalSupabaseUrl(url: string) {
  const u = String(url ?? "").trim()
  if (!u) return false
  try {
    const host = new URL(u).hostname.toLowerCase()
    return host === "127.0.0.1" || host === "localhost" || host === "kong" || host.startsWith("supabase_")
  } catch {
    // If SUPABASE_URL isn't a valid URL, treat it as non-local to be safe.
    return false
  }
}

function base64Url(bytes: Uint8Array) {
  const s = btoa(String.fromCharCode(...bytes))
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

async function signJwtHs256(secret: string, payload: Record<string, unknown>) {
  const header = { alg: "HS256", typ: "JWT" }
  const enc = (obj: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(obj)))
  const h = enc(header)
  const p = enc(payload)
  const toSign = `${h}.${p}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign)))
  return `${toSign}.${base64Url(sig)}`
}

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
    const envServiceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim()
    if (!url || !envServiceKey) {
      // Best-effort only: we don't want to hide the original error because logging failed.
      console.warn("[logEdgeFunctionError] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
      return
    }

    // Local-only compatibility: some local setups surface ES256 keys, but PostgREST/GoTrue local expects HS256.
    // When that happens, inserts into system_error_logs fail with PGRST301 (bad_jwt).
    const alg = decodeJwtAlg(envServiceKey)
    const admin =
      alg === "HS256"
        ? createClient(url, envServiceKey, { auth: { persistSession: false } })
        : isLocalSupabaseUrl(url)
          ? createClient(url, await signJwtHs256(Deno.env.get("JWT_SECRET")?.trim() ||
              "super-secret-jwt-token-with-at-least-32-characters-long", {
              iss: "supabase-demo",
              role: "service_role",
              exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10,
            }), { auth: { persistSession: false } })
          : createClient(url, envServiceKey, { auth: { persistSession: false } })

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


