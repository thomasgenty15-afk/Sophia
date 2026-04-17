// @ts-nocheck
// This file runs in the Supabase Edge (Deno) runtime. Cursor/TS language services
// may not have Deno globals enabled for this workspace, so we disable TS checking here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { logHttpErrorEvent } from "./error-log.ts";

const PROD_ALLOWED_ORIGINS = [
  "https://sophia-coach.ai",
  "https://www.sophia-coach.ai",
];

function isProdEnv(): boolean {
  const env = (Deno.env.get("APP_ENV") ?? Deno.env.get("NODE_ENV") ?? "").toLowerCase();
  return env === "production";
}

// True when the Edge Runtime is talking to a local Supabase instance (127.0.0.1 / kong).
// More reliable than APP_ENV for CORS purposes because APP_ENV=production is often kept
// in local .env files to test production behaviour, while the Supabase URL reveals the
// actual runtime environment.
function isLocalSupabase(): boolean {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "kong" ||
      host.startsWith("supabase_")
    );
  } catch {
    return false;
  }
}

function isCorsAllowlistConfigured(): boolean {
  return Boolean(Deno.env.get("CORS_ALLOWED_ORIGINS")?.trim());
}

function parseAllowedOrigins(): Set<string> {
  const raw = Deno.env.get("CORS_ALLOWED_ORIGINS");
  if (!raw) return new Set(PROD_ALLOWED_ORIGINS);
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string): boolean {
  // When connected to a local Supabase instance: accept any localhost/127.0.0.1 origin
  // regardless of port (Vite can pick 5173, 5174, 5175… depending on availability).
  if (isLocalSupabase() && isLocalOrigin(origin)) return true;
  // Custom allowlist (env var) or production hard-coded list.
  const allowed = parseAllowedOrigins();
  return allowed.has(origin);
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "null";

  // Keep browser-visible headers minimal; internal secrets are for server-to-server calls only.
  const allowHeaders =
    "authorization, apikey, x-client-info, content-type, x-request-id, x-client-request-id, x-sophia-client-request-id";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    // Default: keep it minimal; add GET only if you really need it.
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Supabase client requires `apikey` + `authorization` + `x-client-info`.
    // Browser calls may include supabase-js tracing headers and our own request id header.
    "Access-Control-Allow-Headers": allowHeaders,
  };
}

export function enforceCors(req: Request): Response | null {
  const origin = req.headers.get("Origin");
  // Non-browser / server-to-server calls usually have no Origin header; don't block those.
  if (!origin) return null;

  // In production we want an explicit allowlist; otherwise it's too easy to forget configuring it.
  if (isProdEnv() && !isCorsAllowlistConfigured()) {
    void logHttpErrorEvent({
      req,
      status: 500,
      body: { error: "CORS_ALLOWED_ORIGINS is required in production" },
      functionName: "cors",
      source: "edge",
      metadata: { cors_stage: "prod_config_guard", origin },
    });
    // Important: include CORS headers so browsers don't mask the real error as a CORS failure.
    return new Response(JSON.stringify({ error: "CORS_ALLOWED_ORIGINS is required in production" }), {
      status: 500,
      headers: {
        // Echo origin so the frontend can read the error and fix the env var quickly.
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, apikey, x-client-info, content-type, x-request-id, x-client-request-id, x-sophia-client-request-id",
        "Content-Type": "application/json",
      },
    });
  }
  if (isAllowedOrigin(origin)) return null;

  void logHttpErrorEvent({
    req,
    status: 403,
    body: { error: "CORS origin not allowed" },
    functionName: "cors",
    source: "edge",
    metadata: { cors_stage: "allowlist_guard", origin },
  });
  return new Response(JSON.stringify({ error: "CORS origin not allowed" }), {
    status: 403,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

export function handleCorsOptions(req: Request): Response {
  const forbidden = enforceCors(req);
  if (forbidden) return forbidden;
  return new Response("ok", { headers: getCorsHeaders(req) });
}
