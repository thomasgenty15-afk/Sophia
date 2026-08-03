// Unit tests for _shared/vision.ts — payload building + retry behavior.
// No real network: fetch is mocked (same pattern as gemini_openai_responses_test.ts).
//
// CONTRACT non-input #4 reminder: these tests only cover transport mechanics.
// The vision client never produces micronutrient/energy/macro facts.

import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  assertValidVisionMedia,
  buildVisionPayload,
  generateWithVision,
  resolveVisionModel,
} from "./vision.ts";

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "KEEL_VISION_MODEL",
  "MEGA_TEST_MODE",
  "SUPABASE_INTERNAL_HOST_PORT",
  "SUPABASE_URL",
  "SOPHIA_LLM_RAW_TRACE_ENABLED",
];

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, Deno.env.get(key)]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
}

function setTestEnv() {
  Deno.env.set("GEMINI_API_KEY", "test-key");
  Deno.env.delete("KEEL_VISION_MODEL");
  Deno.env.set("MEGA_TEST_MODE", "0");
  Deno.env.delete("SUPABASE_INTERNAL_HOST_PORT");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.set("SOPHIA_LLM_RAW_TRACE_ENABLED", "0");
}

function geminiTextResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        totalTokenCount: 120,
      },
    }),
    { status },
  );
}

Deno.test("buildVisionPayload: text part first, then inline_data per media", () => {
  const payload = buildVisionPayload({
    systemPrompt: "sys",
    userMessage: "what is on this plate",
    media: [
      { mimeType: "image/jpeg", base64: "AAA" },
      { mimeType: "image/png", base64: "BBB" },
    ],
    temperature: 0.4,
  });

  assertEquals(payload.contents.length, 1);
  assertEquals(payload.contents[0].role, "user");
  const parts = payload.contents[0].parts;
  assertEquals(parts.length, 3);
  assertEquals(parts[0], { text: "what is on this plate" });
  assertEquals(parts[1], {
    inline_data: { mime_type: "image/jpeg", data: "AAA" },
  });
  assertEquals(parts[2], {
    inline_data: { mime_type: "image/png", data: "BBB" },
  });
  assertEquals(payload.systemInstruction, { parts: [{ text: "sys" }] });
  assertEquals(payload.generationConfig.temperature, 0.4);
  assertEquals(payload.generationConfig.responseMimeType, undefined);
});

Deno.test("buildVisionPayload: jsonMode sets responseMimeType", () => {
  const payload = buildVisionPayload({
    systemPrompt: "",
    userMessage: "msg",
    media: [{ mimeType: "image/webp", base64: "CCC" }],
    jsonMode: true,
  });
  assertEquals(payload.generationConfig.responseMimeType, "application/json");
  // Empty system prompt: no systemInstruction key.
  assertEquals(payload.systemInstruction, undefined);
});

Deno.test("buildVisionPayload: single PDF is accepted", () => {
  const payload = buildVisionPayload({
    systemPrompt: "sys",
    userMessage: "read this plan",
    media: [{ mimeType: "application/pdf", base64: "PDF64" }],
  });
  assertEquals(payload.contents[0].parts[1], {
    inline_data: { mime_type: "application/pdf", data: "PDF64" },
  });
});

Deno.test("assertValidVisionMedia: R7 fail loudly on invalid inputs", () => {
  // Empty media
  assertThrows(() => assertValidVisionMedia([]), Error, "Vision media required");
  // Unknown mime type
  assertThrows(
    () => assertValidVisionMedia([{ mimeType: "image/gif", base64: "AAA" }]),
    Error,
    "Unsupported vision mime type",
  );
  // PDF mixed with an image
  assertThrows(
    () =>
      assertValidVisionMedia([
        { mimeType: "application/pdf", base64: "AAA" },
        { mimeType: "image/jpeg", base64: "BBB" },
      ]),
    Error,
    "PDF must be sent alone",
  );
  // Empty base64
  assertThrows(
    () => assertValidVisionMedia([{ mimeType: "image/jpeg", base64: "" }]),
    Error,
    "empty base64",
  );
  // data: URL prefix refused (raw base64 only)
  assertThrows(
    () =>
      assertValidVisionMedia([
        { mimeType: "image/jpeg", base64: "data:image/jpeg;base64,AAA" },
      ]),
    Error,
    "no data: URL prefix",
  );
});

Deno.test("resolveVisionModel: default, env override, arg override", () => {
  const snapshot = snapshotEnv();
  try {
    Deno.env.delete("KEEL_VISION_MODEL");
    assertEquals(resolveVisionModel(), "gemini-3.1-pro-preview");
    Deno.env.set("KEEL_VISION_MODEL", "gemini-vision-env");
    assertEquals(resolveVisionModel(), "gemini-vision-env");
    assertEquals(resolveVisionModel("gemini-vision-arg"), "gemini-vision-arg");
  } finally {
    restoreEnv(snapshot);
  }
});

Deno.test("generateWithVision: posts v1beta generateContent with inline_data", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: any }> = [];
  setTestEnv();

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return Promise.resolve(geminiTextResponse("a plate with salmon"));
  }) as typeof fetch;

  try {
    const result = await generateWithVision({
      systemPrompt: "describe the photo",
      userMessage: "lunch photo",
      media: [{ mimeType: "image/jpeg", base64: "ZZZ" }],
      temperature: 0.1,
      meta: { source: "keel-vision-test", requestId: "req_v_1" },
    });

    assertEquals(result.text, "a plate with salmon");
    assertEquals(calls.length, 1);
    assertEquals(
      calls[0].url.startsWith(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent",
      ),
      true,
    );
    assertEquals(calls[0].body.contents[0].parts[0], { text: "lunch photo" });
    assertEquals(calls[0].body.contents[0].parts[1], {
      inline_data: { mime_type: "image/jpeg", data: "ZZZ" },
    });
    assertEquals(calls[0].body.systemInstruction, {
      parts: [{ text: "describe the photo" }],
    });
    assertEquals(calls[0].body.generationConfig.temperature, 0.1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

Deno.test("generateWithVision: jsonMode strips markdown fences", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  setTestEnv();

  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(
      geminiTextResponse('```json\n{"presence": true}\n```'),
    )) as typeof fetch;

  try {
    const result = await generateWithVision({
      systemPrompt: "sys",
      userMessage: "msg",
      media: [{ mimeType: "image/png", base64: "AAA" }],
      jsonMode: true,
    });
    assertEquals(result.text, '{"presence": true}');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

Deno.test("generateWithVision: retries on 500 then succeeds", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  setTestEnv();

  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: "boom" } }), {
          status: 500,
        }),
      );
    }
    return Promise.resolve(geminiTextResponse("recovered"));
  }) as typeof fetch;

  try {
    const result = await generateWithVision({
      systemPrompt: "sys",
      userMessage: "msg",
      media: [{ mimeType: "image/jpeg", base64: "AAA" }],
    });
    assertEquals(result.text, "recovered");
    assertEquals(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

Deno.test("generateWithVision: gives up after 2 retries on persistent 503", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  setTestEnv();

  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(
      new Response(JSON.stringify({ error: { message: "overloaded" } }), {
        status: 503,
      }),
    );
  }) as typeof fetch;

  try {
    await assertRejects(
      () =>
        generateWithVision({
          systemPrompt: "sys",
          userMessage: "msg",
          media: [{ mimeType: "image/jpeg", base64: "AAA" }],
        }),
      Error,
      "overloaded",
    );
    // 1 initial attempt + 2 retries.
    assertEquals(callCount, 3);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

Deno.test("generateWithVision: 400 is non-retryable and throws immediately", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  setTestEnv();

  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(
      new Response(JSON.stringify({ error: { message: "invalid argument" } }), {
        status: 400,
      }),
    );
  }) as typeof fetch;

  try {
    await assertRejects(
      () =>
        generateWithVision({
          systemPrompt: "sys",
          userMessage: "msg",
          media: [{ mimeType: "image/jpeg", base64: "AAA" }],
        }),
      Error,
      "invalid argument",
    );
    assertEquals(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

Deno.test("generateWithVision: missing GEMINI_API_KEY fails loudly, no fetch", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  setTestEnv();
  Deno.env.delete("GEMINI_API_KEY");

  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(geminiTextResponse("should not happen"));
  }) as typeof fetch;

  try {
    await assertRejects(
      () =>
        generateWithVision({
          systemPrompt: "sys",
          userMessage: "msg",
          media: [{ mimeType: "image/jpeg", base64: "AAA" }],
        }),
      Error,
      "GEMINI_API_KEY missing",
    );
    assertEquals(callCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

Deno.test("generateWithVision: invalid media rejected before any network call", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  setTestEnv();

  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(geminiTextResponse("should not happen"));
  }) as typeof fetch;

  try {
    await assertRejects(
      () =>
        generateWithVision({
          systemPrompt: "sys",
          userMessage: "msg",
          media: [{ mimeType: "video/mp4", base64: "AAA" }],
        }),
      Error,
      "Unsupported vision mime type",
    );
    assertEquals(callCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});
