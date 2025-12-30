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

  // Primary: explicit internal secret
  // Local fallback: Supabase Edge Runtime provides SECRET_KEY; use it only when INTERNAL_FUNCTION_SECRET is unset.
  const expectedInternalSecret =
    Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() || Deno.env.get("SECRET_KEY")?.trim();
  const gotInternalSecret = req.headers.get("x-internal-secret")?.trim();

  if (!expectedInternalSecret) {
    console.error("[internal-auth] Server misconfigured: missing INTERNAL_FUNCTION_SECRET/SECRET_KEY");
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


