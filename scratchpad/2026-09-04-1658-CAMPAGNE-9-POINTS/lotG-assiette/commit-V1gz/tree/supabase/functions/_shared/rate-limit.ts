// @ts-nocheck
// Shared rate limiter for cost-bearing / abusable edge endpoints (SEC-05 / SEC-06).
//
// Backed by the atomic `enforce_rate_limit(key, window_seconds, limit)` RPC and the
// `rate_limit_counters` table (migration 20260707170000). Each call checks one or more
// fixed windows (e.g. a short burst window + a daily cap). If ANY window is exceeded the
// caller gets HTTP 429 with a Retry-After header.
//
// Design choices:
//  * Self-contained: it creates its own service-role client, so call sites don't need to
//    thread one through. Integration is a two-line guard, mirroring enforceCors().
//  * Fail-OPEN: these are cost/abuse limits, not authentication. If the counter backend is
//    unavailable we log and allow the request rather than take the whole app down. A limiter
//    outage must not become an availability outage.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "./http.ts";

export type RateWindow = { limit: number; windowSeconds: number };

export type RateLimitSpec = {
  // Stable identifier for the caller within this scope, e.g. "defense-card:<user_id>".
  key: string;
  // One or more windows; the request is blocked if any is exceeded.
  windows: RateWindow[];
};

// Tunable presets — change limits here, not at each call site.
export const RATE_PRESETS: Record<string, RateWindow[]> = {
  // Main chat: generous so real conversations aren't throttled.
  llmChat: [
    { limit: 30, windowSeconds: 60 },
    { limit: 500, windowSeconds: 86_400 },
  ],
  // Standard user-triggered generations.
  llmStandard: [
    { limit: 20, windowSeconds: 60 },
    { limit: 200, windowSeconds: 86_400 },
  ],
  // Heaviest / most abusable generations (large prompts, premium models).
  llmHeavy: [
    { limit: 5, windowSeconds: 60 },
    { limit: 40, windowSeconds: 86_400 },
  ],
  // Unauthenticated guest onboarding routes (keyed by IP + session).
  guest: [
    { limit: 5, windowSeconds: 600 },
    { limit: 20, windowSeconds: 86_400 },
  ],
};

let cachedAdmin: ReturnType<typeof createClient> | null = null;

function getAdminClient(): ReturnType<typeof createClient> | null {
  if (cachedAdmin) return cachedAdmin;
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !serviceRoleKey) return null;
  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

/**
 * Best-effort client IP for keying unauthenticated limits. Uses the first hop of
 * x-forwarded-for (Supabase edge sets it), falling back to a shared bucket.
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Enforce the given rate-limit spec.
 * @returns a 429 Response if the caller is over any window, otherwise null (proceed).
 */
export async function enforceRateLimit(
  req: Request,
  requestId: string,
  spec: RateLimitSpec,
): Promise<Response | null> {
  const windows = spec.windows ?? [];
  if (!spec.key || windows.length === 0) return null;

  const admin = getAdminClient();
  if (!admin) {
    // Misconfigured env: fail open but make it visible.
    console.error(
      JSON.stringify({
        tag: "rate_limit_misconfigured",
        request_id: requestId,
        reason: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      }),
    );
    return null;
  }

  let worstRetryAfter = 0;
  let blocked = false;

  for (const w of windows) {
    if (!w || w.limit < 0 || w.windowSeconds <= 0) continue;
    const bucketKey = `${spec.key}:${w.windowSeconds}`;
    try {
      const { data, error } = await admin.rpc("enforce_rate_limit", {
        p_key: bucketKey,
        p_window_seconds: w.windowSeconds,
        p_limit: w.limit,
      });
      if (error) {
        // Fail open on backend error; log for observability.
        console.error(
          JSON.stringify({
            tag: "rate_limit_backend_error",
            request_id: requestId,
            key: bucketKey,
            error: error.message ?? String(error),
          }),
        );
        continue;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.allowed === false) {
        blocked = true;
        const retry = Number(row.retry_after_seconds ?? 0);
        if (retry > worstRetryAfter) worstRetryAfter = retry;
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          tag: "rate_limit_exception",
          request_id: requestId,
          key: bucketKey,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      // Fail open.
    }
  }

  if (!blocked) return null;

  const retryAfter = Math.max(1, worstRetryAfter);
  return jsonResponse(
    req,
    {
      error: "Rate limit exceeded. Please slow down and try again shortly.",
      request_id: requestId,
      retry_after_seconds: retryAfter,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
      errorLogMeta: { rate_limit_key: spec.key },
    },
  );
}
