/**
 * KEEL W5.1 — `fetchWhatsAppMedia`.
 *
 * Everything here mocks `globalThis.fetch`; no test in this file may reach the
 * network. The three non-network transports are asserted to make ZERO fetch
 * calls, because the whole point of honouring them is that a local QA run does
 * not hammer Meta with real media downloads.
 */

import { assertEquals } from "jsr:@std/assert@1";
import { fetchWhatsAppMedia } from "./whatsapp_graph.ts";

const ENV_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_DELIVERY_ENABLED",
  "MEGA_TEST_MODE",
  "SUPABASE_URL",
  "SUPABASE_INTERNAL_HOST_PORT",
];

type FetchCall = { url: string; headers: Record<string, string> };

async function withHarness(
  opts: {
    env?: Record<string, string | undefined>;
    loopback?: boolean;
    respond?: (url: string, calls: FetchCall[]) => Response;
  },
  run: (calls: FetchCall[]) => Promise<void>,
): Promise<void> {
  const envPermission = await Deno.permissions.query({ name: "env" });
  if (envPermission.state !== "granted") return;

  const snapshot = Object.fromEntries(
    ENV_KEYS.map((k) => [k, Deno.env.get(k)]),
  );
  const originalFetch = globalThis.fetch;
  const originalLoopback = (globalThis as any).__SOPHIA_WA_LOOPBACK;
  const calls: FetchCall[] = [];

  // Deterministic baseline: no local-supabase heuristics, delivery on, token set.
  Deno.env.set("MEGA_TEST_MODE", "0");
  Deno.env.set("WHATSAPP_DELIVERY_ENABLED", "1");
  Deno.env.set("WHATSAPP_ACCESS_TOKEN", "test-token");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_INTERNAL_HOST_PORT");
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  (globalThis as any).__SOPHIA_WA_LOOPBACK = Boolean(opts.loopback);

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k] = String(v);
    }
    calls.push({ url, headers });
    const responder = opts.respond ??
      (() => new Response("{}", { status: 500 }));
    return Promise.resolve(responder(url, calls));
  }) as typeof fetch;

  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).__SOPHIA_WA_LOOPBACK = originalLoopback;
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

const METADATA_OK = {
  url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=SIGNED&ext=1&hash=SECRET",
  mime_type: "image/jpeg",
  sha256: "abc123",
  file_size: 4,
  id: "MEDIA_1",
};

/** `Response` wants an ArrayBuffer, not a view over one. */
function body(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function twoHopResponder(binary: Uint8Array, binaryStatus = 200) {
  return (url: string) => {
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify(METADATA_OK), { status: 200 });
    }
    if (binaryStatus !== 200) return new Response("nope", { status: binaryStatus });
    return new Response(body(binary), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
  };
}

Deno.test("fetchWhatsAppMedia does both Graph hops and sends the Bearer on the lookaside url too", async () => {
  const payload = new Uint8Array([1, 2, 3, 4]);
  await withHarness({ respond: twoHopResponder(payload) }, async (calls) => {
    const result = await fetchWhatsAppMedia("MEDIA_1", { expectedMimePrefix: "image/" });
    if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);

    // Same invoke, two hops, in order.
    assertEquals(calls.length, 2);
    assertEquals(calls[0].url, "https://graph.facebook.com/v20.0/MEDIA_1");
    assertEquals(calls[0].headers.Authorization, "Bearer test-token");
    assertEquals(calls[1].url, METADATA_OK.url);
    // The one everybody forgets: the binary host is NOT graph.facebook.com and
    // still requires the app token.
    assertEquals(calls[1].headers.Authorization, "Bearer test-token");

    assertEquals(Array.from(result.bytes), [1, 2, 3, 4]);
    assertEquals(result.mime_type, "image/jpeg");
    assertEquals(result.sha256, "abc123");
    assertEquals(result.byte_length, 4);
    assertEquals(result.transport, "graph");
    // No url field exists to be persisted by a deferred job.
    assertEquals("url" in (result as unknown as Record<string, unknown>), false);
  });
});

Deno.test("fetchWhatsAppMedia honours MEGA_TEST_MODE without touching the network", async () => {
  await withHarness({ env: { MEGA_TEST_MODE: "1" } }, async (calls) => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    if (!result.ok) throw new Error("expected ok");
    assertEquals(calls.length, 0);
    assertEquals(result.transport, "mega_test");
    assertEquals(result.byte_length > 0, true);
  });
});

Deno.test("fetchWhatsAppMedia honours __SOPHIA_WA_LOOPBACK without touching the network", async () => {
  await withHarness({ loopback: true }, async (calls) => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    if (!result.ok) throw new Error("expected ok");
    assertEquals(calls.length, 0);
    assertEquals(result.transport, "loopback");
  });
});

Deno.test("fetchWhatsAppMedia stays offline when WhatsApp delivery is disabled", async () => {
  await withHarness({ env: { WHATSAPP_DELIVERY_ENABLED: "0" } }, async (calls) => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    if (!result.ok) throw new Error("expected ok");
    assertEquals(calls.length, 0);
    assertEquals(result.transport, "disabled");
  });
});

Deno.test("fetchWhatsAppMedia fails at config when the token is missing", async () => {
  await withHarness({ env: { WHATSAPP_ACCESS_TOKEN: "" } }, async (calls) => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "config");
    assertEquals(result.retryable, false);
    assertEquals(calls.length, 0);
  });
});

Deno.test("fetchWhatsAppMedia reports an empty media id instead of calling Graph", async () => {
  await withHarness({}, async (calls) => {
    const result = await fetchWhatsAppMedia("   ");
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "config");
    assertEquals(calls.length, 0);
  });
});

Deno.test("fetchWhatsAppMedia distinguishes a metadata failure from a binary failure", async () => {
  await withHarness({
    respond: () => new Response(JSON.stringify({ error: { code: 100 } }), { status: 404 }),
  }, async () => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "metadata");
    assertEquals(result.http_status, 404);
    assertEquals(result.retryable, false);
  });

  await withHarness({
    respond: twoHopResponder(new Uint8Array([1]), 500),
  }, async (calls) => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "binary");
    assertEquals(result.http_status, 500);
    assertEquals(result.retryable, true);
    assertEquals(calls.length, 2);
  });
});

Deno.test("fetchWhatsAppMedia never echoes the signed lookaside url in an error", async () => {
  await withHarness({
    respond: () =>
      new Response(JSON.stringify({ mime_type: "image/jpeg" }), { status: 200 }),
  }, async () => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "metadata");
    const blob = JSON.stringify(result);
    assertEquals(blob.includes("lookaside"), false);
    assertEquals(blob.includes("SECRET"), false);
  });
});

Deno.test("fetchWhatsAppMedia rejects a mime mismatch before downloading anything", async () => {
  await withHarness({
    respond: () =>
      new Response(
        JSON.stringify({ ...METADATA_OK, mime_type: "application/pdf" }),
        { status: 200 },
      ),
  }, async (calls) => {
    const result = await fetchWhatsAppMedia("MEDIA_1", { expectedMimePrefix: "image/" });
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "metadata");
    // The binary hop never happened: a document announced as a photo does not
    // get to spend bandwidth or reach a vision model.
    assertEquals(calls.length, 1);
  });
});

Deno.test("fetchWhatsAppMedia refuses an oversized object, declared or actual", async () => {
  await withHarness({
    respond: () =>
      new Response(
        JSON.stringify({ ...METADATA_OK, file_size: 999_999_999 }),
        { status: 200 },
      ),
  }, async (calls) => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "too_large");
    assertEquals(calls.length, 1);
  });

  await withHarness({
    // Metadata lies (small), the body is big: the cap must hold on real bytes too.
    respond: twoHopResponder(new Uint8Array(64)),
  }, async () => {
    const result = await fetchWhatsAppMedia("MEDIA_1", { maxBytes: 8 });
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "too_large");
  });
});

Deno.test("fetchWhatsAppMedia treats an empty body as a retryable binary failure", async () => {
  await withHarness({
    respond: (url) =>
      url.startsWith("https://graph.facebook.com/")
        ? new Response(JSON.stringify(METADATA_OK), { status: 200 })
        : new Response(body(new Uint8Array(0)), { status: 200 }),
  }, async () => {
    const result = await fetchWhatsAppMedia("MEDIA_1");
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.stage, "binary");
    assertEquals(result.retryable, true);
  });
});
