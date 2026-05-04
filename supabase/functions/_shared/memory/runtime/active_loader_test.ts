import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  formatMemoryV2PayloadForPrompt,
  isMemoryV2LoaderActiveForUser,
  memoryV2RolloutBucket,
  runMemoryV2ActiveLoader,
} from "./active_loader.ts";

function fakeSupabase() {
  return {
    from(table: string) {
      const query: any = {
        table,
        selected: "",
        select(value: string) {
          query.selected = value;
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
        order() {
          return query;
        },
        limit() {
          if (
            table === "memory_item_topics" &&
            query.selected.includes("memory_items")
          ) {
            return Promise.resolve({
              data: [{
                memory_items: {
                  id: "item-routine",
                  user_id: "u1",
                  kind: "statement",
                  content_text: "Le user veut reprendre sa routine de marche.",
                  status: "active",
                  sensitivity_level: "normal",
                },
              }],
            });
          }
          if (table === "memory_item_topics") {
            return Promise.resolve({ data: [] });
          }
          if (table === "user_topic_memories") {
            return Promise.resolve({
              data: [{
                id: "topic-routine",
                topic_slug: "routine",
                title: "Routine",
                lifecycle_stage: "durable",
                search_doc: "routine marche habitude",
                updated_at: "2026-05-01T00:00:00.000Z",
              }],
            });
          }
          return Promise.resolve({ data: [] });
        },
      };
      return query;
    },
  };
}

const targetedTopicPlan = {
  response_intent: "support",
  reasoning_complexity: "medium",
  context_need: "targeted",
  memory_mode: "targeted",
  model_tier_hint: "standard",
  context_budget_tier: "medium",
  targets: [{
    type: "topic",
    query_hint: "routine marche",
    priority: "high",
    retrieval_policy: "semantic_first",
    expansion_policy: "exact_only",
  }],
  plan_confidence: 0.9,
};

Deno.test("memory V2 loader is V2-only and ignores rollout canary", () => {
  assertEquals(memoryV2RolloutBucket("u1"), memoryV2RolloutBucket("u1"));
  assertEquals(
    isMemoryV2LoaderActiveForUser({
      user_id: "u1",
      loader_enabled: false,
      rollout_percent: 100,
    }),
    false,
  );
  assertEquals(
    isMemoryV2LoaderActiveForUser({
      user_id: "u1",
      loader_enabled: true,
      rollout_percent: 100,
    }),
    true,
  );
  assertEquals(
    isMemoryV2LoaderActiveForUser({
      user_id: "u1",
      loader_enabled: true,
      rollout_percent: 0,
    }),
    true,
  );
});

Deno.test("active loader builds prompt block and updates payload state", async () => {
  const result = await runMemoryV2ActiveLoader({
    supabase: fakeSupabase() as any,
    userId: "u1",
    scope: "web",
    userMessage: "je veux reprendre ma routine de marche",
    history: [],
    tempMemory: {},
    memoryPlan: targetedTopicPlan,
    flags: { loader_enabled: true, rollout_percent: 100 },
  });

  assertEquals(result?.active_topic_id, "topic-routine");
  assertEquals(result?.payload_item_ids, ["item-routine"]);
  assertEquals(
    result?.context_block.includes("=== MEMOIRE V2 ACTIVE ==="),
    true,
  );
  assertEquals(
    (result?.tempMemory as any).__memory_payload_state_v2.items[0]
      .memory_item_id,
    "item-routine",
  );
});

Deno.test("active loader respects dispatcher memory_mode none", async () => {
  const result = await runMemoryV2ActiveLoader({
    supabase: fakeSupabase() as any,
    userId: "u1",
    scope: "web",
    userMessage: "Hello",
    history: [],
    tempMemory: {},
    memoryPlan: {
      response_intent: "direct_answer",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      plan_confidence: 0.95,
    },
    flags: { loader_enabled: true, rollout_percent: 100 },
  });

  assertEquals(result?.topic_decision, "skipped");
  assertEquals(result?.payload_item_ids, []);
  assertEquals(result?.context_block, "");
  assertEquals(result?.metrics.loader_plan_reason, "dispatcher_memory_none");
});

Deno.test("prompt formatter hides ids and exposes usable memory", () => {
  const block = formatMemoryV2PayloadForPrompt({
    retrieval_mode: "topic_continuation",
    hints: ["action_related"],
    topic_id: "topic-secret",
    items: [{
      id: "item-secret",
      kind: "fact",
      content_text: "Le user aime les reponses courtes.",
      status: "active",
      sensitivity_level: "normal",
    }],
    entities: [],
    modules: {},
    metrics: {
      load_ms: 1,
      sensitive_excluded_count: 0,
      invalid_injection_simulated_count: 0,
      fallback_used: false,
      cross_topic_cache_hit: false,
    },
  });
  assertEquals(block.includes("item-secret"), false);
  assertEquals(block.includes("Le user aime les reponses courtes."), true);
});
