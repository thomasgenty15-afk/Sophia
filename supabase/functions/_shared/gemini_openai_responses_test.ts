import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  generateWithGemini,
  openAiServiceTierFromEnv,
  resolveOpenAiServiceTier,
} from "./gemini.ts";

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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-08 — LE PALIER DE SERVICE : absent par défaut, envoyé si demandé,
// jamais deviné, et inscrit au registre avec ce que l'API a rendu.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("service_tier — sans variable d'env, la charge n'a PAS le champ (octet pour octet comme avant)", () => {
  Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");
  const r = openAiServiceTierFromEnv();
  assertEquals(r, { tier: null, rejected: null });
});

Deno.test("service_tier — `fast` est envoyé tel quel", () => {
  Deno.env.set("KEEL_OPENAI_SERVICE_TIER", "fast");
  try {
    assertEquals(openAiServiceTierFromEnv(), { tier: "fast", rejected: null });
  } finally {
    Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");
  }
});

Deno.test("⛔ service_tier — une valeur HORS LISTE n'est pas envoyée, et elle est NOMMÉE", () => {
  // Un palier mal orthographié ne doit pas devenir « pas de palier » en
  // silence : « fasst » se lirait comme une latence normale, et personne ne
  // saurait que le fast mode n'a jamais été demandé.
  Deno.env.set("KEEL_OPENAI_SERVICE_TIER", "fasst");
  try {
    assertEquals(openAiServiceTierFromEnv(), { tier: null, rejected: "fasst" });
  } finally {
    Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");
  }
});

Deno.test({
  name: "⛔ service_tier — `fast` ATTEINT LE FIL, et sans lui la charge n'a pas la clé",
  fn: async () => {
    // Le lecteur d'env peut être juste et le champ ne jamais partir : ce test
    // lit la CHARGE réellement envoyée, comme le test de routage au-dessus.
    const envPermission = await Deno.permissions.query({ name: "env" });
    if (envPermission.state !== "granted") return;
    const envKeys = [
      "OPENAI_API_KEY",
      "OPENAI_USE_RESPONSES_API",
      "OPENAI_STORE_RESPONSES",
      "KEEL_OPENAI_SERVICE_TIER",
    ];
    const envSnapshot = Object.fromEntries(
      envKeys.map((key) => [key, Deno.env.get(key)]),
    );
    const originalFetch = globalThis.fetch;
    const calls: { body: Record<string, unknown> }[] = [];
    globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "resp_x",
            model: "gpt-5.4-mini",
            service_tier: "priority",
            output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
            usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }) as typeof fetch;
    const run = () =>
      generateWithGemini("system prompt", "user prompt", 0.2, false, [], "auto", {
        requestId: "req_tier",
        userId: "user_tier",
        source: "sophia-brain:test",
        model: "gpt-5.4-mini",
        forceRealAi: true,
        disableFallbackChain: true,
        maxRetries: 1,
      });
    try {
      Deno.env.set("OPENAI_API_KEY", "test-key");
      Deno.env.set("OPENAI_USE_RESPONSES_API", "1");
      Deno.env.set("OPENAI_STORE_RESPONSES", "1");
      Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");
      await run();
      assertEquals("service_tier" in calls[0].body, false, "sans env, la clé part quand même");
      Deno.env.set("KEEL_OPENAI_SERVICE_TIER", "fast");
      await run();
      assertEquals(calls[1].body.service_tier, "fast", "`fast` n'atteint pas le fil");
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv(envSnapshot);
    }
  },
});

Deno.test("⛔ service_tier — le registre porte le palier ENVOYÉ et RENDU sur chaque site qui écrit une ligne", async () => {
  // Deux sites écrivent `llm_usage_events` avec `openai_response_id` ; le palier
  // doit y être posé côte à côte sur les DEUX. Un seul site couvert, et la
  // moitié des appels dirait « pas de palier » alors qu'il était demandé.
  const src = await Deno.readTextFile(new URL("./gemini.ts", import.meta.url));
  // ⚠️ CINQ sites écrivent `openai_response_id` ; UN est un `console.log`
  // (`tag: "openai_http"`), sans `metadata:` autour — les quatre autres sont
  // des lignes de registre ou d'archive, et tous doivent porter le palier.
  const metaSites = src.split("openai_response_id: String(rawJson?.id ?? json?.id ?? \"\") ||").length - 1;
  const consoleSites = src.split('tag: "openai_http",').length - 1;
  assertEquals(consoleSites, 1, "le journal console openai_http n'est plus unique");
  // ⟳ 2026-09-10 — les sites citent la valeur RÉSOLUE, plus l'environnement relu.
  // Relire l'env à chaque site rendait un journal qui ne pouvait PAS montrer un
  // palier demandé par l'appelant : il aurait dit « aucun » sur un appel Fast.
  const sent = src.split("service_tier_sent: resolvedServiceTier.tier,").length - 1;
  const echoed = src.split("service_tier_echoed: typeof rawJson?.service_tier === \"string\"").length - 1;
  const sourced = src.split("service_tier_source: resolvedServiceTier.source,").length - 1;
  // Le premier site (`tag: "openai_http"`) est un journal console, pas le registre :
  // il porte l'id mais pas le palier, d'où « sites − 1 ».
  assertEquals(sent, metaSites - consoleSites, `palier envoyé absent d'un site de registre (${sent}/${metaSites - consoleSites})`);
  assertEquals(echoed, metaSites - consoleSites, `palier rendu absent d'un site de registre (${echoed}/${metaSites - consoleSites})`);
  assertEquals(sourced, metaSites - consoleSites, `l'ORIGINE du palier manque à un site (${sourced}/${metaSites - consoleSites})`);
  // ⛔ ET LE CHAMP PART AUX DEUX ENDROITS. Il n'en avait qu'un : basculer
  // `OPENAI_USE_RESPONSES_API=0` faisait perdre le palier en silence, et un banc
  // « Fast » y aurait mesuré une latence ordinaire en croyant mesurer Fast.
  assertEquals(
    src.split("if (resolvedServiceTier.tier) payload.service_tier = resolvedServiceTier.tier;").length - 1,
    2,
    "le palier doit être posé dans la branche `responses` ET dans `chat/completions`",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 — LE PALIER PAR APPEL : l'appelant précède l'environnement.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("service_tier — le paramètre d'appel PRÉCÈDE la variable d'environnement", () => {
  Deno.env.set("KEEL_OPENAI_SERVICE_TIER", "flex");
  try {
    assertEquals(resolveOpenAiServiceTier("fast"), {
      tier: "fast",
      rejected: null,
      source: "call",
    });
  } finally {
    Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");
  }
});

Deno.test("service_tier — sans paramètre, l'environnement décide, et l'ORIGINE le dit", () => {
  Deno.env.set("KEEL_OPENAI_SERVICE_TIER", "flex");
  try {
    assertEquals(resolveOpenAiServiceTier(undefined), {
      tier: "flex",
      rejected: null,
      source: "env",
    });
  } finally {
    Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");
  }
});

Deno.test("service_tier — sans rien du tout, RIEN n'est envoyé", () => {
  Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");
  assertEquals(resolveOpenAiServiceTier(null), {
    tier: null,
    rejected: null,
    source: "none",
  });
});

Deno.test("⛔ service_tier — un paramètre INVALIDE ne retombe PAS sur l'environnement", () => {
  // Sinon la demande paraîtrait honorée : l'appelant a écrit « fasst », le
  // journal dirait « flex », et personne ne saurait que la faute de frappe a
  // été absorbée par une variable posée pour une autre raison.
  Deno.env.set("KEEL_OPENAI_SERVICE_TIER", "flex");
  try {
    assertEquals(resolveOpenAiServiceTier("fasst"), {
      tier: null,
      rejected: "fasst",
      source: "none",
    });
  } finally {
    Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");
  }
});

Deno.test({
  name: "⛔ service_tier — `meta.serviceTier` ATTEINT LE FIL sur les DEUX branches d'API",
  fn: async () => {
    const envPermission = await Deno.permissions.query({ name: "env" });
    if (envPermission.state !== "granted") return;
    const envKeys = [
      "OPENAI_API_KEY",
      "OPENAI_USE_RESPONSES_API",
      "OPENAI_STORE_RESPONSES",
      "KEEL_OPENAI_SERVICE_TIER",
      "SOPHIA_LLM_RAW_TRACE_ENABLED",
    ];
    const envSnapshot = Object.fromEntries(
      envKeys.map((key) => [key, Deno.env.get(key)]),
    );
    const originalFetch = globalThis.fetch;
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")),
      });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "resp_two_branches",
            model: "gpt-5.4-mini",
            service_tier: "priority",
            output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
            choices: [{ message: { content: "ok" } }],
            usage: { input_tokens: 4, output_tokens: 1, total_tokens: 5 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }) as typeof fetch;
    const run = () =>
      generateWithGemini("system prompt", "user prompt", 0.2, false, [], "auto", {
        requestId: "req_tier_two",
        userId: "user_tier_two",
        source: "keel:test",
        model: "gpt-5.4-mini",
        forceRealAi: true,
        disableFallbackChain: true,
        maxRetries: 1,
        serviceTier: "fast",
      });
    try {
      Deno.env.set("OPENAI_API_KEY", "test-key");
      Deno.env.set("OPENAI_STORE_RESPONSES", "1");
      Deno.env.set("SOPHIA_LLM_RAW_TRACE_ENABLED", "0");
      Deno.env.delete("KEEL_OPENAI_SERVICE_TIER");

      Deno.env.set("OPENAI_USE_RESPONSES_API", "1");
      await run();
      assertEquals(calls[0].url.endsWith("/v1/responses"), true);
      assertEquals(calls[0].body.service_tier, "fast", "branche `responses` sans palier");

      Deno.env.set("OPENAI_USE_RESPONSES_API", "0");
      await run();
      assertEquals(calls[1].url.endsWith("/v1/chat/completions"), true);
      assertEquals(
        calls[1].body.service_tier,
        "fast",
        "branche `chat/completions` sans palier — c'est le défaut qui manquait",
      );
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv(envSnapshot);
    }
  },
});
