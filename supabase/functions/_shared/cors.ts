const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function isProdEnv(): boolean {
  const env = (Deno.env.get("APP_ENV") ?? Deno.env.get("NODE_ENV") ?? "").toLowerCase();
  return env === "production";
}

function isCorsAllowlistConfigured(): boolean {
  return Boolean(Deno.env.get("CORS_ALLOWED_ORIGINS")?.trim());
}

function parseAllowedOrigins(): Set<string> {
  const raw = Deno.env.get("CORS_ALLOWED_ORIGINS");
  if (!raw) return new Set(DEFAULT_ALLOWED_ORIGINS);
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin: string): boolean {
  const allowed = parseAllowedOrigins();
  return allowed.has(origin);
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    // Default: keep it minimal; add GET only if you really need it.
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Supabase client requires `apikey` + `authorization` + `x-client-info`.
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-request-id, x-internal-secret",
  };
}

export function enforceCors(req: Request): Response | null {
  const origin = req.headers.get("Origin");
  // Non-browser / server-to-server calls usually have no Origin header; don't block those.
  if (!origin) return null;

  // In production we want an explicit allowlist; otherwise it's too easy to forget configuring it.
  if (isProdEnv() && !isCorsAllowlistConfigured()) {
    return new Response(JSON.stringify({ error: "CORS_ALLOWED_ORIGINS is required in production" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (isAllowedOrigin(origin)) return null;

  return new Response(JSON.stringify({ error: "CORS origin not allowed" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export function handleCorsOptions(req: Request): Response {
  const forbidden = enforceCors(req);
  if (forbidden) return forbidden;
  return new Response("ok", { headers: getCorsHeaders(req) });
}


