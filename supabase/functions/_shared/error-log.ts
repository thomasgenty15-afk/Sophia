import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

type Severity = "info" | "warn" | "error"

type HttpErrorEventArgs = {
  req: Request
  status: number
  body?: unknown
  functionName?: string
  source?: string
  requestId?: string | null
  userId?: string | null
  metadata?: Record<string, unknown>
}

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

// Postgres / PostgREST / supabase-js errors carry the actual failure reason in
// these fields rather than in `.message`. We capture them so a wrapped error
// (`new AppError(..., { cause: pgError })`) stays diagnosable.
function extractErrorFields(err: unknown): Record<string, string> {
  if (!err || typeof err !== "object") return {}
  const anyErr = err as Record<string, unknown>
  const fields: Record<string, string> = {}
  for (const key of ["name", "code", "details", "hint"]) {
    const value = anyErr[key]
    if (typeof value === "string" && value.trim()) {
      fields[key] = value.trim()
    } else if (typeof value === "number") {
      fields[key] = String(value)
    }
  }
  return fields
}

function normalizeError(err: unknown): {
  name: string
  message: string
  stack?: string
  fields: Record<string, string>
  cause?: { name: string; message: string; fields: Record<string, string> }
} {
  const base = (() => {
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
  })()

  // Walk `.cause` so the real underlying failure (e.g. a PostgREST error wrapped
  // in a generic HttpError) is never silently dropped.
  const rawCause = (err && typeof err === "object")
    ? (err as { cause?: unknown }).cause
    : undefined
  let cause: { name: string; message: string; fields: Record<string, string> } | undefined
  if (rawCause != null && rawCause !== err) {
    const causeName = rawCause instanceof Error
      ? (rawCause.name || "Error")
      : typeof (rawCause as any)?.name === "string"
        ? (rawCause as any).name
        : "Error"
    const causeMessage = rawCause instanceof Error
      ? (rawCause.message || String(rawCause))
      : typeof (rawCause as any)?.message === "string"
        ? (rawCause as any).message
        : typeof rawCause === "string"
          ? rawCause
          : (() => { try { return JSON.stringify(rawCause) } catch { return String(rawCause) } })()
    cause = { name: causeName, message: causeMessage, fields: extractErrorFields(rawCause) }
  }

  return { ...base, fields: extractErrorFields(err), cause }
}

function scrubText(value: string, maxLen: number): string {
  const s = String(value ?? "")
  if (!s) return ""
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLen)
}

function inferFunctionNameFromRequest(req: Request): string {
  try {
    const u = new URL(req.url)
    const parts = u.pathname.split("/").filter(Boolean)
    const v1Idx = parts.findIndex((p) => p === "v1")
    if (v1Idx >= 0 && parts[v1Idx + 1]) return scrubText(parts[v1Idx + 1], 120)
    if (parts.length > 0) return scrubText(parts[parts.length - 1], 120)
    return "unknown_function"
  } catch {
    return "unknown_function"
  }
}

function extractBodyError(body: unknown): string {
  if (body == null) return ""
  if (typeof body === "string") return scrubText(body, 600)
  if (typeof body === "object") {
    const anyBody = body as Record<string, unknown>
    const msg =
      typeof anyBody.error === "string"
        ? anyBody.error
        : typeof anyBody.message === "string"
          ? anyBody.message
          : ""
    if (msg) return scrubText(msg, 600)
    try {
      return scrubText(JSON.stringify(anyBody), 600)
    } catch {
      return ""
    }
  }
  return scrubText(String(body), 600)
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
    const { name, message, stack, fields, cause } = normalizeError(args.error)
    // Surface the underlying cause (e.g. the real PostgREST/Postgres failure that
    // was wrapped in a generic application error) directly in the message so it is
    // visible without digging into metadata.
    const causeSummary = cause
      ? [cause.message, cause.fields.code ? `code=${cause.fields.code}` : "", cause.fields.details, cause.fields.hint]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(" | ")
      : ""
    const selfSummary = [fields.code ? `code=${fields.code}` : "", fields.details, fields.hint]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" | ")
    const enrichedMessage = [message, selfSummary, causeSummary ? `cause: ${causeSummary}` : ""]
      .filter(Boolean)
      .join(" | ")
    const safeMessage = scrubText(enrichedMessage, 1200)
    const safeStack = stack ? scrubText(stack, 2400) : null

    const insertRow = {
      severity: sev,
      source: (args.source ?? "edge").toString(),
      function_name: args.functionName,
      title: scrubText((args.title ?? name).toString(), 200),
      message: safeMessage,
      stack: safeStack,
      request_id: args.requestId ?? null,
      user_id: args.userId ?? null,
      metadata: {
        ...(args.metadata ?? {}),
        error_name: name,
        ...(Object.keys(fields).length > 0 ? { error_fields: fields } : {}),
        ...(cause ? { error_cause: { name: cause.name, message: scrubText(cause.message, 600), ...cause.fields } } : {}),
      },
    }

    const { error } = await admin.from("system_error_logs").insert(insertRow as any)
    if (error) {
      console.warn("[logEdgeFunctionError] insert failed:", error)
    }
  } catch (e) {
    console.warn("[logEdgeFunctionError] unexpected failure:", e)
  }
}

export async function logHttpErrorEvent(args: HttpErrorEventArgs) {
  const status = Math.floor(Number(args.status) || 0)
  if (status < 400) return

  const req = args.req
  const functionName = args.functionName || inferFunctionNameFromRequest(req)
  const requestId =
    args.requestId ??
    req.headers.get("x-request-id") ??
    req.headers.get("x-client-request-id") ??
    req.headers.get("x-sophia-client-request-id") ??
    null
  const messageFromBody = extractBodyError(args.body)
  const method = scrubText(req.method || "UNKNOWN", 16)
  let path = ""
  try {
    path = scrubText(new URL(req.url).pathname, 180)
  } catch {
    path = ""
  }
  const message = messageFromBody || `HTTP ${status} ${method}${path ? ` ${path}` : ""}`
  const severity: Severity = "error"

  await logEdgeFunctionError({
    functionName,
    error: message,
    severity,
    title: `http_status_${status}`,
    requestId,
    userId: args.userId ?? null,
    source: args.source ?? "edge",
    metadata: {
      ...(args.metadata ?? {}),
      category: "http_response",
      http_status: status,
      http_method: method,
      http_path: path,
    },
  })
}
