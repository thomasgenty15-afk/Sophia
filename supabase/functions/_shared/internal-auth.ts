/**
 * Internal auth guard for Edge Functions that run with Service Role.
 *
 * Supported callers:
 * - Cron/DB triggers sending `X-Internal-Secret: <secret>` (recommended)
 *
 * Configure:
 * - Set Edge secret: INTERNAL_FUNCTION_SECRET (recommended)
 */
export function ensureInternalRequest(req: Request): Response | null {
  // Most internal callers are non-browser, but allow OPTIONS to avoid noisy failures.
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        // minimal CORS for accidental browser preflight; keep restrictive by default
        "Access-Control-Allow-Origin": "null",
        "Access-Control-Allow-Headers": "x-internal-secret, content-type, x-request-id",
      },
    });
  }

  // Internal endpoints should not be callable via GET from a browser URL bar.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  function isLocalEnv(): boolean {
    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim()
    if (!url) return false
    try {
      const host = new URL(url).hostname.toLowerCase()
      return host === "127.0.0.1" || host === "localhost" || host === "kong" || host.startsWith("supabase_")
    } catch {
      return false
    }
  }

  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim()
  const fallbackSecret = isLocalEnv() ? Deno.env.get("SECRET_KEY")?.trim() : ""
  const expectedInternalSecret = internalSecret || fallbackSecret
  const gotInternalSecret = req.headers.get("x-internal-secret")?.trim();

  if (!expectedInternalSecret) {
    console.error("[internal-auth] Server misconfigured: missing INTERNAL_FUNCTION_SECRET");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!gotInternalSecret || gotInternalSecret !== expectedInternalSecret) {
    // Keep logs non-sensitive: do not print secrets, only presence + basic request info.
    console.warn("[internal-auth] Forbidden: invalid or missing X-Internal-Secret", {
      method: req.method,
      has_header: Boolean(gotInternalSecret),
    });
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

