import { assertEquals } from "jsr:@std/assert@1";
import { ensureInternalRequest } from "./internal-auth.ts";

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

Deno.test("ensureInternalRequest: reject non-POST", () =>
  withEnv(
    {
      SUPABASE_URL: "http://localhost:54321",
      INTERNAL_FUNCTION_SECRET: "s3cr3t",
      SECRET_KEY: undefined,
    },
    () => {
      const req = new Request("http://localhost/internal", { method: "GET" });
      const res = ensureInternalRequest(req);
      assertEquals(res?.status, 405);
    },
  ));

Deno.test("ensureInternalRequest: reject invalid secret", () =>
  withEnv(
    {
      SUPABASE_URL: "http://localhost:54321",
      INTERNAL_FUNCTION_SECRET: "expected-secret",
      SECRET_KEY: undefined,
    },
    () => {
      const req = new Request("http://localhost/internal", {
        method: "POST",
        headers: { "x-internal-secret": "wrong-secret" },
      });
      const res = ensureInternalRequest(req);
      assertEquals(res?.status, 403);
    },
  ));

Deno.test("ensureInternalRequest: allow valid INTERNAL_FUNCTION_SECRET", () =>
  withEnv(
    {
      SUPABASE_URL: "http://localhost:54321",
      INTERNAL_FUNCTION_SECRET: "expected-secret",
      SECRET_KEY: undefined,
    },
    () => {
      const req = new Request("http://localhost/internal", {
        method: "POST",
        headers: { "x-internal-secret": "expected-secret" },
      });
      const res = ensureInternalRequest(req);
      assertEquals(res, null);
    },
  ));

Deno.test("ensureInternalRequest: local fallback to SECRET_KEY works only in local env", () =>
  withEnv(
    {
      SUPABASE_URL: "http://localhost:54321",
      INTERNAL_FUNCTION_SECRET: undefined,
      SECRET_KEY: "local-secret",
    },
    () => {
      const req = new Request("http://localhost/internal", {
        method: "POST",
        headers: { "x-internal-secret": "local-secret" },
      });
      const res = ensureInternalRequest(req);
      assertEquals(res, null);
    },
  ));

Deno.test("ensureInternalRequest: SECRET_KEY fallback disabled in non-local env", () =>
  withEnv(
    {
      SUPABASE_URL: "https://project.supabase.co",
      INTERNAL_FUNCTION_SECRET: undefined,
      SECRET_KEY: "should-not-work",
    },
    () => {
      const req = new Request("https://project.supabase.co/internal", {
        method: "POST",
        headers: { "x-internal-secret": "should-not-work" },
      });
      const res = ensureInternalRequest(req);
      assertEquals(res?.status, 500);
    },
  ));
