import { assertEquals } from "jsr:@std/assert@1";
import { verifyXHubSignature } from "./wa_security.ts";

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

Deno.test("verifyXHubSignature: valid signature passes", async () =>
  await withEnv(
    {
      MEGA_TEST_MODE: "0",
      WHATSAPP_APP_SECRET: "wa-secret",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_INTERNAL_HOST_PORT: undefined,
    },
    async () => {
      const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
      const raw = new TextEncoder().encode(body).buffer;
      const sig = await hmacHex("wa-secret", body);
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": `sha256=${sig}` },
      });
      const ok = await verifyXHubSignature(req, raw);
      assertEquals(ok, true);
    },
  ));

Deno.test("verifyXHubSignature: invalid signature fails", async () =>
  await withEnv(
    {
      MEGA_TEST_MODE: "0",
      WHATSAPP_APP_SECRET: "wa-secret",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_INTERNAL_HOST_PORT: undefined,
    },
    async () => {
      const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
      const raw = new TextEncoder().encode(body).buffer;
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
      });
      const ok = await verifyXHubSignature(req, raw);
      assertEquals(ok, false);
    },
  ));

Deno.test("verifyXHubSignature: missing app secret fails outside MEGA", async () =>
  await withEnv(
    {
      MEGA_TEST_MODE: "0",
      WHATSAPP_APP_SECRET: undefined,
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_INTERNAL_HOST_PORT: undefined,
    },
    async () => {
      const body = JSON.stringify({ ok: true });
      const raw = new TextEncoder().encode(body).buffer;
      const req = new Request("https://example.com/webhook", { method: "POST" });
      const ok = await verifyXHubSignature(req, raw);
      assertEquals(ok, false);
    },
  ));

Deno.test("verifyXHubSignature: MEGA test mode bypasses signature", async () =>
  await withEnv(
    {
      MEGA_TEST_MODE: "1",
      WHATSAPP_APP_SECRET: undefined,
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_INTERNAL_HOST_PORT: undefined,
    },
    async () => {
      const body = JSON.stringify({ ok: true });
      const raw = new TextEncoder().encode(body).buffer;
      const req = new Request("https://example.com/webhook", { method: "POST" });
      const ok = await verifyXHubSignature(req, raw);
      assertEquals(ok, true);
    },
  ));
