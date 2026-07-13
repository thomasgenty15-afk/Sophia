import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  buildPotionInputText,
  formatPotionRecentContextForPrompt,
  loadPotionRecentContext,
} from "./potion-recent-context.ts";

// The thematic path calls geminiEmbed, which throws without an API key and
// then degrades to lexical similarity. Force that deterministic path.
Deno.env.delete("GEMINI_API_KEY");

type FakeTables = Record<string, { rows?: unknown[]; single?: unknown }>;

// Permissive chainable fake: any query-builder method returns the chain, any
// await resolves to the table rows, maybeSingle/single resolve to `single`.
function fakeAdmin(tables: FakeTables) {
  function chain(table: string) {
    const proxy: Record<string, unknown> = new Proxy(function () {}, {
      get(_target, prop: string) {
        if (prop === "then") {
          const promise = Promise.resolve({
            data: tables[table]?.rows ?? [],
            error: null,
          });
          return promise.then.bind(promise);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return () =>
            Promise.resolve({
              data: tables[table]?.single ?? null,
              error: null,
            });
        }
        return (..._args: unknown[]) => proxy;
      },
    }) as unknown as Record<string, unknown>;
    return proxy;
  }
  return new Proxy({}, {
    get(_target, prop: string) {
      if (prop === "from") return (table: string) => chain(table);
      return (..._args: unknown[]) => chain(`__${prop}__`);
    },
    // deno-lint-ignore no-explicit-any
  }) as any;
}

function hangingAdmin() {
  const never = new Proxy(function () {}, {
    get(_target, prop: string) {
      if (prop === "then") return () => {};
      return (..._args: unknown[]) => never;
    },
    // deno-lint-ignore no-explicit-any
  }) as any;
  // deno-lint-ignore no-explicit-any
  return { from: () => never } as any;
}

Deno.test("buildPotionInputText merges free text and answers", () => {
  const text = buildPotionInputText(
    { pressure_state: "stresse", pressure_source: "peur que ca bloque" },
    "  la pression monte  ",
  );
  assertEquals(text, "la pression monte — stresse — peur que ca bloque");
  assertEquals(buildPotionInputText({}, null), "");
});

Deno.test("formatPotionRecentContextForPrompt stays empty without blocks", () => {
  assertEquals(formatPotionRecentContextForPrompt(null), "");
  assertEquals(
    formatPotionRecentContextForPrompt({
      conversation_block: null,
      thematic_memory_block: null,
      topic_id: null,
      topic_confidence: null,
      user_named_theme: false,
    }),
    "",
  );
});

Deno.test("formatPotionRecentContextForPrompt renders blocks and guardrails", () => {
  const output = formatPotionRecentContextForPrompt({
    conversation_block: "[user] je me mets la pression",
    thematic_memory_block: "=== MEMOIRE V2 ACTIVE ===",
    topic_id: "t1",
    topic_confidence: 0.7,
    user_named_theme: true,
  });
  assertStringIncludes(output, "## Conversation recente");
  assertStringIncludes(output, "[user] je me mets la pression");
  assertStringIncludes(output, "## Memoire du theme le plus proche");
  assertStringIncludes(output, "Consignes contexte recent:");
  assertStringIncludes(output, "n'invente rien");
  // Consentement structurel: le user a nommé le sujet → référence sobre permise.
  assertStringIncludes(output, "NOMME lui-meme ce sujet");
});

Deno.test("consent line is absent without a user-named theme", () => {
  // Anti-faux-positif: conversation seule (thème gaté) → pas d'assouplissement
  // de la garde sensibilité.
  const output = formatPotionRecentContextForPrompt({
    conversation_block: "[user] je me sens bof",
    thematic_memory_block: null,
    topic_id: null,
    topic_confidence: 0.61,
    user_named_theme: false,
  });
  assertStringIncludes(output, "## Conversation recente");
  assertEquals(output.includes("NOMME lui-meme"), false);
});

Deno.test("conversation since memorizer is ordered oldest-first with roles", async () => {
  const admin = fakeAdmin({
    memory_message_processing: {
      single: { created_at: "2026-07-09T00:00:00Z" },
    },
    chat_messages: {
      // Fetched newest-first by the query; helper must re-order.
      rows: [
        {
          role: "assistant",
          content: "Le plus utile, c'est de faire redescendre la pression.",
          created_at: "2026-07-09T03:10:14Z",
        },
        {
          role: "user",
          content: "Comment je fais pour relacher la pression ?",
          created_at: "2026-07-09T03:09:33Z",
        },
      ],
    },
    user_topic_memories: { rows: [] },
  });

  const context = await loadPotionRecentContext({
    admin,
    userId: "user-1",
    inputText: "je me mets la pression",
  });

  assertEquals(
    context.conversation_block,
    "[user] Comment je fais pour relacher la pression ?\n" +
      "[assistant] Le plus utile, c'est de faire redescendre la pression.",
  );
  assertEquals(context.thematic_memory_block, null);
  assertEquals(context.topic_id, null);
});

Deno.test("thematic gating rejects an unrelated topic", async () => {
  const admin = fakeAdmin({
    chat_messages: { rows: [] },
    user_topic_memories: {
      rows: [
        {
          id: "topic-sommeil",
          slug: "sommeil-rythme",
          title: "Rythme de sommeil",
          search_doc: "se coucher tot, reveil 6h, dette de sommeil",
          lifecycle_stage: "durable",
          search_doc_embedding: null,
        },
      ],
    },
  });

  const context = await loadPotionRecentContext({
    admin,
    userId: "user-1",
    inputText:
      "grosse pression avec les femmes, peur que ca ne monte pas au moment meme",
  });

  assertEquals(context.thematic_memory_block, null);
  assertEquals(context.topic_id, null);
});

Deno.test("thematic gating accepts a clearly matching topic", async () => {
  const admin = fakeAdmin({
    chat_messages: { rows: [] },
    user_topic_memories: {
      rows: [
        {
          id: "topic-anxiete",
          slug: "anxiete-performance",
          title: "Anxiete de performance",
          search_doc:
            "pression au moment meme, peur que ca ne monte pas, anxiete de performance",
          lifecycle_stage: "durable",
          search_doc_embedding: null,
        },
      ],
    },
  });

  const context = await loadPotionRecentContext({
    admin,
    userId: "user-1",
    inputText:
      "anxiete de performance, la pression monte au mauvais moment et j'ai peur que ca ne monte pas",
  });

  // Routing succeeded and passed the threshold; the fake memory tables are
  // empty so no block is produced, but the topic is identified.
  assertEquals(context.topic_id, "topic-anxiete");
  assert((context.topic_confidence ?? 0) >= 0.55);
});

Deno.test("recent context is time-boxed and degrades to empty", async () => {
  const started = Date.now();
  const context = await loadPotionRecentContext({
    admin: hangingAdmin(),
    userId: "user-1",
    inputText: "je me mets la pression",
    budgetMs: 80,
  });
  const elapsed = Date.now() - started;

  assertEquals(context.conversation_block, null);
  assertEquals(context.thematic_memory_block, null);
  assertEquals(context.topic_id, null);
  assert(elapsed < 2_000, `expected fast fallback, took ${elapsed}ms`);
});
