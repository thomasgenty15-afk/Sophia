import { assert, assertEquals } from "jsr:@std/assert@1";
import { enforceCors, getCorsHeaders } from "./cors.ts";

async function withEnv<T>(pairs: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(pairs)) {
    previous.set(k, Deno.env.get(k));
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of previous.entries()) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("cors headers: public allow-headers do not expose x-internal-secret", () =>
  withEnv(
    { CORS_ALLOWED_ORIGINS: "https://app.example.com", APP_ENV: "production", NODE_ENV: undefined },
    () => {
      const req = new Request("https://api.example.com/fn", {
        method: "POST",
        headers: { Origin: "https://app.example.com" },
      });
      const headers = getCorsHeaders(req);
      const allowHeaders = String(headers["Access-Control-Allow-Headers"] ?? "").toLowerCase();
      assert(!allowHeaders.includes("x-internal-secret"));
    },
  ));

Deno.test("enforceCors: non-browser request (no Origin) is allowed", () =>
  withEnv(
    { APP_ENV: "production", CORS_ALLOWED_ORIGINS: "https://app.example.com", NODE_ENV: undefined },
    () => {
      const req = new Request("https://api.example.com/fn", { method: "POST" });
      const out = enforceCors(req);
      assertEquals(out, null);
    },
  ));

Deno.test("enforceCors: disallowed origin is blocked", () =>
  withEnv(
    { APP_ENV: "production", CORS_ALLOWED_ORIGINS: "https://app.example.com", NODE_ENV: undefined },
    () => {
      const req = new Request("https://api.example.com/fn", {
        method: "POST",
        headers: { Origin: "https://evil.example.com" },
      });
      const out = enforceCors(req);
      assertEquals(out?.status, 403);
    },
  ));
