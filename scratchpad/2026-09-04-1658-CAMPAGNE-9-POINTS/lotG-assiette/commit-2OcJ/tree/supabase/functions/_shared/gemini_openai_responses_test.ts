import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { generateWithGemini } from "./gemini.ts";

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
}

Deno.test({
  name: "generateWithGemini routes OpenAI models through stored Responses API",
  fn: async () => {
    const envPermission = await Deno.permissions.query({ name: "env" });
    if (envPermission.state !== "granted") return;

    const envKeys = [
      "OPENAI_API_KEY",
      "OPENAI_USE_RESPONSES_API",
      "OPENAI_STORE_RESPONSES",
      "GLOBAL_AI_MODEL",
      "MEGA_TEST_MODE",
      "SOPHIA_LLM_RAW_TRACE_ENABLED",
    ];
    const envSnapshot = Object.fromEntries(
      envKeys.map((key) => [key, Deno.env.get(key)]),
    );
    const originalFetch = globalThis.fetch;
    const calls: any[] = [];

    Deno.env.set("OPENAI_API_KEY", "test-key");
    Deno.env.set("OPENAI_USE_RESPONSES_API", "1");
    Deno.env.set("OPENAI_STORE_RESPONSES", "1");
    Deno.env.set("GLOBAL_AI_MODEL", "gpt-5.4-mini");
    Deno.env.set("MEGA_TEST_MODE", "0");
    Deno.env.set("SOPHIA_LLM_RAW_TRACE_ENABLED", "0");

    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ url, body });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "resp_test_123",
            model: "gpt-5.4-mini",
            output: [{
              type: "message",
              content: [{ type: "output_text", text: "Bonjour" }],
            }],
            usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    try {
      const result = await generateWithGemini(
        "system prompt",
        "user prompt",
        0.2,
        false,
        [],
        "auto",
        {
          requestId: "req_test_123",
          userId: "user_test_123",
          source: "sophia-brain:test",
          model: "gpt-5.4-mini",
          forceRealAi: true,
          disableFallbackChain: true,
          maxRetries: 1,
        },
      );

      assertEquals(result, "Bonjour");
      assertEquals(calls.length, 1);
      assertEquals(calls[0].url.endsWith("/v1/responses"), true);
      assertEquals(calls[0].body.model, "gpt-5.4-mini");
      assertEquals(calls[0].body.input, "user prompt");
      assertEquals(calls[0].body.instructions, "system prompt");
      assertEquals(calls[0].body.store, true);
      assertEquals(calls[0].body.metadata.request_id, "req_test_123");
      assertEquals(calls[0].body.metadata.user_id, "user_test_123");
      assertEquals(calls[0].body.metadata.source, "sophia-brain:test");
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv(envSnapshot);
    }
  },
});

Deno.test({
  name:
    "generateWithGemini adds explicit JSON instruction for OpenAI JSON mode",
  fn: async () => {
    const envPermission = await Deno.permissions.query({ name: "env" });
    if (envPermission.state !== "granted") return;

    const envKeys = [
      "OPENAI_API_KEY",
      "OPENAI_USE_RESPONSES_API",
      "OPENAI_STORE_RESPONSES",
      "GLOBAL_AI_MODEL",
      "MEGA_TEST_MODE",
      "SOPHIA_LLM_RAW_TRACE_ENABLED",
    ];
    const envSnapshot = Object.fromEntries(
      envKeys.map((key) => [key, Deno.env.get(key)]),
    );
    const originalFetch = globalThis.fetch;
    const calls: any[] = [];

    Deno.env.set("OPENAI_API_KEY", "test-key");
    Deno.env.set("OPENAI_USE_RESPONSES_API", "1");
    Deno.env.set("OPENAI_STORE_RESPONSES", "1");
    Deno.env.set("GLOBAL_AI_MODEL", "gpt-5.4-mini");
    Deno.env.set("MEGA_TEST_MODE", "0");
    Deno.env.set("SOPHIA_LLM_RAW_TRACE_ENABLED", "0");

    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ url, body });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "resp_test_json_123",
            model: "gpt-5.4-mini",
            output: [{
              type: "message",
              content: [{ type: "output_text", text: '{"ok":true}' }],
            }],
            usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    try {
      const result = await generateWithGemini(
        "Return the dispatcher decision as a JSON object.",
        "normal conversation",
        0.2,
        true,
        [],
        "auto",
        {
          requestId: "req_test_json_123",
          userId: "user_test_123",
          source: "dispatcher-v2-llm",
          model: "gpt-5.4-mini",
          forceRealAi: true,
          disableFallbackChain: true,
          maxRetries: 1,
        },
      );

      assertEquals(result, '{"ok":true}');
      assertEquals(calls.length, 1);
      assertEquals(calls[0].url.endsWith("/v1/responses"), true);
      assertEquals(calls[0].body.text.format.type, "json_object");
      assertEquals(/\bjson\b/i.test(calls[0].body.instructions), true);
      assertEquals(/\bjson\b/i.test(calls[0].body.input), true);
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv(envSnapshot);
    }
  },
});
