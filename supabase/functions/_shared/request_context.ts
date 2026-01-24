import "jsr:@supabase/functions-js/edge-runtime.d.ts"

export type RequestContext = {
  requestId: string
  userId: string | null
  clientRequestId: string | null
}

function base64UrlToJson(b64url: string): any | null {
  const s = String(b64url ?? "").trim()
  if (!s) return null
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
  const padLen = (4 - (b64.length % 4)) % 4
  const padded = b64 + (padLen ? "=".repeat(padLen) : "")
  try {
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function extractJwtSub(req: Request): string | null {
  const h = String(req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "").trim()
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h)
  const token = (m?.[1] ?? "").trim()
  if (!token) return null
  const parts = token.split(".")
  if (parts.length < 2) return null
  const payload = base64UrlToJson(parts[1] ?? "")
  const sub = payload?.sub
  return typeof sub === "string" && sub.trim() ? sub.trim() : null
}

function extractUserIdFromBody(body: any): string | null {
  const candidates = [
    body?.user_id,
    body?.userId,
    body?.user?.id,
    body?.record?.user_id, // DB trigger payloads
    body?.record?.userId,
  ]
  for (const c of candidates) {
    const v = typeof c === "string" ? c.trim() : ""
    if (v) return v
  }
  return null
}

function extractUserIdFromUrl(req: Request): string | null {
  try {
    const u = new URL(req.url)
    const v = (u.searchParams.get("user_id") ?? u.searchParams.get("userId") ?? "").trim()
    return v || null
  } catch {
    return null
  }
}

export function getRequestContext(req: Request, body?: unknown): RequestContext {
  const requestId = (req.headers.get("x-request-id") ?? "").trim() || crypto.randomUUID()
  const clientRequestId =
    (req.headers.get("x-client-request-id") ??
      req.headers.get("x-sophia-client-request-id") ??
      req.headers.get("x-frontend-request-id") ??
      req.headers.get("x-correlation-id") ??
      "")?.trim() || null

  const userId =
    extractUserIdFromBody(body as any) ??
    extractUserIdFromUrl(req) ??
    (req.headers.get("x-user-id") ?? "").trim() ||
    extractJwtSub(req)

  return {
    requestId,
    userId: userId ? String(userId) : null,
    clientRequestId,
  }
}


