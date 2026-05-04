import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  applySensitivityFilter,
  assertOnlyActiveMemoryItems,
  loadMemoryV2Payload,
  mapTextToDomainKeys,
  mergeAndRerankCrossTopicItems,
  payloadJaccard,
} from "./loader.ts";

Deno.test("loader helpers map domain keys and rerank cross-topic items", () => {
  assertEquals(mapTextToDomainKeys("mon manager m'a humilie au travail"), [
    "relations.conflit",
    "travail.conflits",
  ]);
  const items = mergeAndRerankCrossTopicItems({
    message: "je repousse ma routine",
    domain_keys: ["habitudes.procrastination"],
    domain_items: [
      {
        id: "a",
        kind: "statement",
        content_text: "routine",
        status: "active",
        domain_keys: ["habitudes.execution"],
      },
      {
        id: "b",
        kind: "statement",
        content_text: "je repousse tout",
        status: "active",
        domain_keys: ["habitudes.procrastination"],
      },
    ],
    semantic_items: [],
  });
  assertEquals(items[0].id, "b");
});

Deno.test("global profile prompts map to domain keys without LLM fallback", () => {
  const cases = [
    ["Tu vois quoi dans ma psychologie ?", "psychologie.emotions"],
    ["Qu'est-ce que tu sais de mon rapport au travail ?", "travail.conflits"],
    ["Comment tu vois mes relations familiales ?", "relations.famille"],
    [
      "Mes habitudes, ma discipline, ma procrastination : tu vois quoi ?",
      "habitudes.procrastination",
    ],
    [
      "Quel est mon probleme principal d'apres toi ?",
      "objectifs.transformation",
    ],
  ] as const;
  for (const [prompt, expected] of cases) {
    assertEquals(mapTextToDomainKeys(prompt).includes(expected), true);
  }
});

Deno.test("loader enforces active-only payload and sensitivity policy", () => {
  assertThrows(
    () =>
      assertOnlyActiveMemoryItems([{
        id: "x",
        kind: "fact",
        content_text: "x",
        status: "deleted_by_user",
      }]),
    Error,
    "memory_v2_loader_invalid_item_status",
  );
  const filtered = applySensitivityFilter({
    retrieval_mode: "topic_continuation",
    active_topic_id: "t1",
    items: [
      {
        id: "n",
        kind: "fact",
        content_text: "n",
        status: "active",
        sensitivity_level: "normal",
      },
      {
        id: "s",
        kind: "fact",
        content_text: "s",
        status: "active",
        sensitivity_level: "sensitive",
        topic_ids: ["t1"],
      },
      {
        id: "x",
        kind: "fact",
        content_text: "x",
        status: "active",
        sensitivity_level: "safety",
      },
    ],
  });
  assertEquals(filtered.items.map((i) => i.id), ["n", "s"]);
  assertEquals(filtered.excluded_count, 1);
});

Deno.test("loader supports all three modes with a fake client", async () => {
  const fake = {
    from(table: string) {
      const query: any = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        in() {
          return query;
        },
        overlaps() {
          return query;
        },
        gte() {
          return query;
        },
        lt() {
          return query;
        },
        limit() {
          return Promise.resolve({
            data: table === "memory_item_topics"
              ? [{
                memory_items: {
                  id: "topic-item",
                  user_id: "u1",
                  kind: "fact",
                  content_text: "x",
                  status: "active",
                },
              }]
              : [{
                id: `${table}-item`,
                user_id: "u1",
                kind: "fact",
                content_text: "x",
                status: "active",
                sensitivity_level: "normal",
              }],
          });
        },
      };
      return query;
    },
  };
  for (
    const mode of [
      "topic_continuation",
      "cross_topic_lookup",
      "safety_first",
    ] as const
  ) {
    const payload = await loadMemoryV2Payload({
      supabase: fake,
      user_id: "u1",
      retrieval_mode: mode,
      active_topic_id: "t1",
      message: "routine",
    });
    assertEquals(payload.retrieval_mode, mode);
  }
  await assertRejects(() =>
    loadMemoryV2Payload({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              limit: () =>
                Promise.resolve({
                  data: [{
                    memory_items: {
                      id: "bad",
                      user_id: "u1",
                      kind: "fact",
                      content_text: "x",
                      status: "archived",
                    },
                  }],
                }),
            }),
          }),
        }),
      },
      user_id: "u1",
      retrieval_mode: "topic_continuation",
      active_topic_id: "t1",
    })
  );
});

Deno.test("loader respects dispatcher scopes and budgets", async () => {
  const calls: string[] = [];
  const fake = {
    from(table: string) {
      calls.push(table);
      const query: any = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        in() {
          return query;
        },
        overlaps() {
          return query;
        },
        gte() {
          return query;
        },
        lt() {
          return query;
        },
        limit() {
          return Promise.resolve({
            data: table === "memory_items"
              ? [{
                id: "event-item",
                user_id: "u1",
                kind: "event",
                content_text: "hier a ete difficile",
                status: "active",
                sensitivity_level: "normal",
              }]
              : [],
          });
        },
      };
      return query;
    },
  };
  const payload = await loadMemoryV2Payload({
    supabase: fake,
    user_id: "u1",
    retrieval_mode: "topic_continuation",
    active_topic_id: "t1",
    loader_plan: {
      enabled: true,
      reason: "test_event_only",
      retrieval_mode: "topic_continuation",
      budget: {
        max_items: 1,
        max_entities: 0,
        topic_items: 0,
        event_items: 1,
        global_items: 0,
        action_items: 0,
      },
      requested_scopes: ["event"],
      topic_targets: [],
      event_queries: ["hier"],
      global_keys: [],
      retrieval_policy: "semantic_first",
      requires_topic_router: false,
      dispatcher_memory_plan_applied: true,
      dispatcher_memory_mode: "targeted",
      dispatcher_context_need: "targeted",
    },
  });
  assertEquals(payload.items.map((item) => item.id), ["event-item"]);
  assertEquals(calls.includes("memory_item_topics"), false);
});

Deno.test("cross-topic profile uses global keys and filters unrelated sensitive items", async () => {
  const fake = {
    from(table: string) {
      const state: { overlaps?: string[] } = {};
      const query: any = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        in() {
          return query;
        },
        overlaps(_column: string, values: string[]) {
          state.overlaps = values;
          return query;
        },
        gte() {
          return query;
        },
        lt() {
          return query;
        },
        limit() {
          if (table !== "memory_items") return Promise.resolve({ data: [] });
          const all = [
            {
              id: "psych-normal",
              user_id: "u1",
              kind: "statement",
              content_text: "Le user a peur de rater une action.",
              status: "active",
              domain_keys: ["psychologie.peur_echec"],
              sensitivity_level: "normal",
            },
            {
              id: "family-sensitive",
              user_id: "u1",
              kind: "statement",
              content_text: "Detail familial sensible unrelated.",
              status: "active",
              domain_keys: ["relations.famille"],
              sensitivity_level: "sensitive",
            },
          ];
          const data = state.overlaps
            ? all.filter((item) =>
              item.domain_keys.some((key) => state.overlaps?.includes(key))
            )
            : all;
          return Promise.resolve({ data });
        },
      };
      return query;
    },
  };
  const payload = await loadMemoryV2Payload({
    supabase: fake,
    user_id: "u1",
    retrieval_mode: "cross_topic_lookup",
    message: "Pourquoi j'ai peur de l'echec en general ?",
    loader_plan: {
      enabled: true,
      reason: "global_profile",
      retrieval_mode: "cross_topic_lookup",
      budget: {
        max_items: 4,
        max_entities: 0,
        topic_items: 0,
        event_items: 0,
        global_items: 4,
        action_items: 0,
      },
      requested_scopes: ["global"],
      topic_targets: [],
      event_queries: [],
      global_keys: ["psychologie"],
      retrieval_policy: "semantic_first",
      requires_topic_router: false,
      dispatcher_memory_plan_applied: true,
      dispatcher_memory_mode: "broad",
      dispatcher_context_need: "global_profile",
    },
  });
  assertEquals(payload.items.map((item) => item.id), ["psych-normal"]);
  assertEquals(payload.metrics.sensitive_excluded_count, 1);
  assertEquals(payload.metrics.fallback_used, false);
});

Deno.test("payloadJaccard computes overlap", () => {
  assertEquals(payloadJaccard(["a", "b"], ["b", "c"]), 1 / 3);
  assertEquals(payloadJaccard([], []), 1);
});
