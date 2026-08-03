/**
 * KEEL W5.1 — `fetchWhatsAppMedia`.
 *
 * Everything here mocks `globalThis.fetch`; no test in this file may reach the
 * network. The three non-network transports are asserted to make ZERO fetch
 * calls, because the whole point of honouring them is that a local QA run does
 * not hammer Meta with real media downloads.
 */

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  clearWhatsAppMediaFixtures,
  fetchWhatsAppMedia,
  registerWhatsAppMediaFixture,
} from "./whatsapp_graph.ts";

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

// ---------------------------------------------------------------------------
// PIVOT NUTRITION (N1/N2) — fixture injection on the network-free transports.
//
// Why these tests exist: the simulated week asserts on what the agent SAYS
// about a plate ("I see chicken and broccoli"). A 1x1 PNG can never produce
// that, so before this door the photo half of PLAN-NUIT 7.4 was structurally
// unprovable in the simulator -- not because the pipeline was wrong, but
// because no real image could reach it. These tests pin both halves of the
// door: it opens for a registered id, and it stays shut for everything else.
// ---------------------------------------------------------------------------

Deno.test("media fixture: a registered id serves the real bytes", async () => {
  const real = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]); // JPEG magic
  registerWhatsAppMediaFixture("meal_j1", { bytes: real, mime_type: "image/jpeg" });
  try {
    await withHarness({ env: { WHATSAPP_DELIVERY_ENABLED: "0" } }, async () => {
      const res = await fetchWhatsAppMedia("meal_j1");
      assert(res.ok);
      if (!res.ok) return;
      assertEquals(res.transport, "disabled");
      assertEquals(res.mime_type, "image/jpeg");
      assertEquals(res.byte_length, 8);
      assertEquals(Array.from(res.bytes), Array.from(real));
    });
  } finally {
    clearWhatsAppMediaFixtures();
  }
});

Deno.test("media fixture: works on the loopback transport too", async () => {
  registerWhatsAppMediaFixture("meal_j2", {
    bytes: new Uint8Array([9, 9, 9]),
    mime_type: "image/jpeg",
  });
  try {
    await withHarness({ loopback: true }, async (calls) => {
      const res = await fetchWhatsAppMedia("meal_j2");
      assert(res.ok);
      if (!res.ok) return;
      assertEquals(res.transport, "loopback");
      assertEquals(res.byte_length, 3);
      // The whole point of a network-free transport: still zero calls to Meta.
      assertEquals(calls.length, 0);
    });
  } finally {
    clearWhatsAppMediaFixtures();
  }
});

Deno.test("media fixture: an UNregistered id still gets the 1x1 PNG", async () => {
  registerWhatsAppMediaFixture("meal_j1", {
    bytes: new Uint8Array([1, 2, 3]),
    mime_type: "image/jpeg",
  });
  try {
    await withHarness({ env: { WHATSAPP_DELIVERY_ENABLED: "0" } }, async () => {
      const res = await fetchWhatsAppMedia("some_other_id");
      assert(res.ok);
      if (!res.ok) return;
      // The default is untouched: no other caller changes behaviour because a
      // harness registered one photo elsewhere in the same process.
      assertEquals(res.mime_type, "image/png");
    });
  } finally {
    clearWhatsAppMediaFixtures();
  }
});

Deno.test("media fixture: a fixture NEVER opens the network transport", async () => {
  // The door is read only AFTER the three network-free doors were taken. With
  // delivery enabled and no loopback, the Graph path must run as before --
  // otherwise a stray fixture in a production process would serve a fake photo.
  registerWhatsAppMediaFixture("meal_j1", {
    bytes: new Uint8Array([1, 2, 3]),
    mime_type: "image/jpeg",
  });
  try {
    await withHarness(
      {
        env: { WHATSAPP_DELIVERY_ENABLED: "1", MEGA_TEST_MODE: "0" },
        respond: () => new Response("{}", { status: 500 }),
      },
      async (calls) => {
        const res = await fetchWhatsAppMedia("meal_j1");
        assertEquals(res.ok, false);
        assert(calls.length > 0, "the Graph metadata hop must still be attempted");
      },
    );
  } finally {
    clearWhatsAppMediaFixtures();
  }
});

Deno.test("media fixture: registering an empty media id fails loudly (R7)", () => {
  assertThrows(() =>
    registerWhatsAppMediaFixture("  ", {
      bytes: new Uint8Array([1]),
      mime_type: "image/jpeg",
    })
  );
});
