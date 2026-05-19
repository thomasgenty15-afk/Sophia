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

Deno.test("cross-topic profile prompts map to domain keys without LLM fallback", () => {
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
  const sensitiveRequested = applySensitivityFilter({
    retrieval_mode: "cross_topic_lookup",
    requested_sensitive: true,
    items: [
      {
        id: "guarded",
        kind: "fact",
        content_text: "allergie aux pistaches",
        status: "active",
        sensitivity_level: "safety",
        requires_user_initiated: true,
      },
    ],
  });
  assertEquals(sensitiveRequested.items.map((i) => i.id), ["guarded"]);
  const neutral = applySensitivityFilter({
    retrieval_mode: "cross_topic_lookup",
    requested_sensitive: false,
    items: [
      {
        id: "guarded",
        kind: "fact",
        content_text: "allergie aux pistaches",
        status: "active",
        sensitivity_level: "safety",
        requires_user_initiated: true,
      },
    ],
  });
  assertEquals(neutral.items.length, 0);
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
        level_items: 0,
      },
      requested_scopes: ["event"],
      topic_targets: [],
      event_queries: ["hier"],
      domain_keys: [],
      domain_prefixes: [],
      retrieval_policy: "semantic_first",
      requires_topic_router: false,
      dispatcher_memory_plan_applied: true,
      dispatcher_memory_mode: "light",
      dispatcher_context_need: "targeted",
    },
  });
  assertEquals(payload.items.map((item) => item.id), ["event-item"]);
  assertEquals(calls.includes("memory_item_topics"), false);
});

Deno.test("loader retrieves action memories by exact plan item then action family", async () => {
  const fake = {
    from(table: string) {
      const state: {
        inValues?: string[];
        containsValue?: Record<string, unknown>;
      } = {};
      const query: any = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        in(_column: string, values: string[]) {
          state.inValues = values;
          return query;
        },
        contains(_column: string, value: Record<string, unknown>) {
          state.containsValue = value;
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
          if (table === "user_plan_items") {
            return Promise.resolve({
              data: [
                {
                  id: "pushups-week-2",
                  title: "Faire 12 pompes",
                  kind: "habit",
                  dimension: "habits",
                  status: "active",
                  target_reps: 12,
                  payload: { action_family_key: "habit:pompes" },
                },
                {
                  id: "stretching",
                  title: "Etirements 8 minutes",
                  kind: "habit",
                  dimension: "habits",
                  status: "active",
                  payload: { action_family_key: "habit:etirements" },
                },
              ],
            });
          }
          if (table === "memory_item_actions") {
            const all = [
              {
                plan_item_id: "pushups-week-2",
                aggregation_kind: "single_occurrence",
                metadata: { action_family_key: "habit:pompes" },
                memory_items: {
                  id: "exact",
                  user_id: "u1",
                  kind: "action_observation",
                  content_text: "Les pompes 12 reps ont ete difficiles hier.",
                  status: "active",
                  sensitivity_level: "normal",
                },
              },
              {
                plan_item_id: "pushups-week-1",
                aggregation_kind: "week_summary",
                metadata: { action_family_key: "habit:pompes" },
                memory_items: {
                  id: "family",
                  user_id: "u1",
                  kind: "action_observation",
                  content_text:
                    "Les pompes passent mieux apres le petit-dejeuner.",
                  status: "active",
                  sensitivity_level: "normal",
                },
              },
              {
                plan_item_id: "stretching",
                aggregation_kind: "week_summary",
                metadata: { action_family_key: "habit:etirements" },
                memory_items: {
                  id: "wrong-action",
                  user_id: "u1",
                  kind: "action_observation",
                  content_text: "Les etirements passent mieux le soir.",
                  status: "active",
                  sensitivity_level: "normal",
                },
              },
            ];
            const data = state.containsValue?.action_family_key
              ? all.filter((row) =>
                row.metadata.action_family_key ===
                  state.containsValue?.action_family_key
              )
              : all.filter((row) => state.inValues?.includes(row.plan_item_id));
            return Promise.resolve({ data });
          }
          return Promise.resolve({ data: [] });
        },
      };
      return query;
    },
  };
  const payload = await loadMemoryV2Payload({
    supabase: fake,
    user_id: "u1",
    retrieval_mode: "cross_topic_lookup",
    message: "Pour mes pompes aujourd'hui, tu te rappelles ce qui m'aide ?",
    loader_plan: {
      enabled: true,
      reason: "action_memory",
      retrieval_mode: "cross_topic_lookup",
      budget: {
        max_items: 4,
        max_entities: 0,
        topic_items: 0,
        event_items: 0,
        global_items: 0,
        action_items: 4,
        level_items: 0,
      },
      requested_scopes: ["action"],
      topic_targets: [],
      event_queries: [],
      action_targets: ["Faire 12 pompes"],
      domain_keys: [],
      domain_prefixes: [],
      retrieval_policy: "semantic_first",
      requires_topic_router: false,
      dispatcher_memory_plan_applied: true,
      dispatcher_memory_mode: "light",
      dispatcher_context_need: "targeted",
    },
  });
  assertEquals(payload.items.map((item) => item.id), ["exact", "family"]);
  assertEquals(payload.items[0].action_link?.plan_item_id, "pushups-week-2");
  assertEquals(payload.items[1].action_link?.action_family_key, "habit:pompes");
});

Deno.test("loader retrieves level execution handoff with generic transition target", async () => {
  const fake = {
    from(table: string) {
      const query: any = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        contains() {
          return query;
        },
        limit() {
          if (table !== "memory_items") return Promise.resolve({ data: [] });
          return Promise.resolve({
            data: [{
              id: "handoff-1",
              user_id: "u1",
              kind: "statement",
              content_text:
                "Niveau precedent: le user avance mieux avec une seule action simple.",
              status: "active",
              domain_keys: ["objectifs.transformation"],
              sensitivity_level: "normal",
              metadata: {
                memory_type: "level_execution_handoff",
                previous_transformation_id: "level-1",
                next_transformation_id: "level-2",
              },
            }],
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
    message: "On commence le nouveau niveau.",
    loader_plan: {
      enabled: true,
      reason: "level_handoff",
      retrieval_mode: "topic_continuation",
      budget: {
        max_items: 1,
        max_entities: 0,
        topic_items: 0,
        event_items: 0,
        global_items: 0,
        action_items: 0,
        level_items: 1,
      },
      requested_scopes: ["level"],
      topic_targets: [],
      event_queries: [],
      action_targets: [],
      level_targets: ["current_level", "transition"],
      domain_keys: [],
      domain_prefixes: [],
      retrieval_policy: "semantic_first",
      requires_topic_router: false,
      dispatcher_memory_plan_applied: true,
      dispatcher_memory_mode: "light",
      dispatcher_context_need: "targeted",
    },
  });

  assertEquals(payload.items.map((item) => item.id), ["handoff-1"]);
  assertEquals(payload.metrics.loaded_scope_counts.level, 1);
});

Deno.test("cross-topic profile uses domain prefixes and filters unrelated sensitive items", async () => {
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
        level_items: 0,
      },
      requested_scopes: ["global"],
      topic_targets: [],
      event_queries: [],
      domain_keys: [],
      domain_prefixes: ["psychologie"],
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

Deno.test("cross-topic direct food recall can load sensitive food memories", async () => {
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
              id: "allergy",
              user_id: "u1",
              kind: "statement",
              content_text: "Le user a une allergie aux noix.",
              status: "active",
              domain_keys: ["sante.alimentation"],
              sensitivity_level: "sensitive",
            },
            {
              id: "work",
              user_id: "u1",
              kind: "statement",
              content_text: "Le client Orion change le brief.",
              status: "active",
              domain_keys: ["travail.conflits"],
              sensitivity_level: "normal",
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
    message:
      "On cherche un restaurant ensemble: quels ingredients dois-tu eviter pour moi ?",
    loader_plan: {
      enabled: true,
      reason: "food_recall",
      retrieval_mode: "cross_topic_lookup",
      budget: {
        max_items: 4,
        max_entities: 0,
        topic_items: 0,
        event_items: 0,
        global_items: 4,
        action_items: 0,
        level_items: 0,
      },
      requested_scopes: ["global"],
      topic_targets: [],
      event_queries: [],
      domain_keys: ["sante.alimentation"],
      domain_prefixes: [],
      retrieval_policy: "taxonomy_first",
      requires_topic_router: false,
      dispatcher_memory_plan_applied: true,
      dispatcher_memory_mode: "broad",
      dispatcher_context_need: "targeted",
    },
  });
  assertEquals(payload.items.map((item) => item.id), ["allergy"]);
  assertEquals(payload.metrics.sensitive_excluded_count, 0);
});

Deno.test("payloadJaccard computes overlap", () => {
  assertEquals(payloadJaccard(["a", "b"], ["b", "c"]), 1 / 3);
  assertEquals(payloadJaccard([], []), 1);
});
