import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildPersistedPayload,
  buildRetrievalExecutedPayload,
  classifyMemoryScope,
  getBudgetForContract,
  getLayerSources,
  getMemoryContract,
  LAYER_SOURCES,
  resolveV2RetrievalPlan,
  V2_MEMORY_CONTRACTS,
} from "./v2-memory-retrieval.ts";
import type { MemoryLayerScope, MemoryRetrievalIntent } from "./v2-types.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// Canonical contracts
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("getMemoryContract returns all 5 intents", () => {
  const intents: MemoryRetrievalIntent[] = [
    "answer_user_now",
    "nudge_decision",
    "daily_bilan",
    "weekly_bilan",
    "rendez_vous_or_outreach",
  ];
  for (const intent of intents) {
    const contract = getMemoryContract(intent);
    assertExists(contract);
    assertEquals(contract.intent, intent);
    assertEquals(contract.layers.length > 0, true);
    assertEquals(contract.max_tokens_hint > 0, true);
  }
});

Deno.test("answer_user_now has all 6 layers", () => {
  const c = V2_MEMORY_CONTRACTS.answer_user_now;
  assertEquals(c.layers.length, 6);
  assertEquals(c.budget_tier, "full");
  const expected: MemoryLayerScope[] = [
    "cycle",
    "transformation",
    "execution",
    "coaching",
    "relational",
    "event",
  ];
  assertEquals(c.layers, expected);
});

Deno.test("daily_bilan has minimal budget and 3 layers", () => {
  const c = V2_MEMORY_CONTRACTS.daily_bilan;
  assertEquals(c.layers.length, 3);
  assertEquals(c.budget_tier, "minimal");
  assertEquals(c.layers.includes("execution"), true);
  assertEquals(c.layers.includes("coaching"), true);
  assertEquals(c.layers.includes("event"), true);
  assertEquals(c.layers.includes("cycle"), false);
});

Deno.test("weekly_bilan has medium budget and 5 layers (no relational)", () => {
  const c = V2_MEMORY_CONTRACTS.weekly_bilan;
  assertEquals(c.layers.length, 5);
  assertEquals(c.budget_tier, "medium");
  assertEquals(c.layers.includes("relational"), false);
});

Deno.test("nudge_decision does not load cycle or transformation", () => {
  const c = V2_MEMORY_CONTRACTS.nudge_decision;
  assertEquals(c.layers.includes("cycle"), false);
  assertEquals(c.layers.includes("transformation"), false);
  assertEquals(c.budget_tier, "light");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Layer sources
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("getLayerSources returns correct tables for daily_bilan", () => {
  const c = V2_MEMORY_CONTRACTS.daily_bilan;
  const sources = getLayerSources(c);
  assertEquals(sources.length, 3);

  const executionSource = sources.find((s) => s.layer === "execution");
  assertExists(executionSource);
  assertEquals(executionSource.sources.length, 1);
  assertEquals(executionSource.sources[0].table, "user_topic_memories");
  assertEquals(executionSource.sources[0].filter_transformation, true);
});

Deno.test("cycle layer source filters by scope=cycle and cycle_id", () => {
  const src = LAYER_SOURCES.cycle;
  assertEquals(src.sources.length, 1);
  assertEquals(src.sources[0].scope_filter?.value, "cycle");
  assertEquals(src.sources[0].filter_cycle, true);
  assertEquals(src.sources[0].filter_transformation, false);
});

Deno.test("relational layer maps core_identity and scoped global_memories separately", () => {
  const src = LAYER_SOURCES.relational;
  assertEquals(src.sources.length, 2);

  const identitySource = src.sources.find((s) =>
    s.table === "user_core_identity"
  );
  assertExists(identitySource);
  assertEquals(identitySource.scope_filter, null);

  const globalSource = src.sources.find((s) =>
    s.table === "user_global_memories"
  );
  assertExists(globalSource);
  assertEquals(globalSource.scope_filter?.value, "relational");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scope classifier
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("classifyMemoryScope: default is transformation", () => {
  const result = classifyMemoryScope({
    content: "la coherence cardiaque m'aide le matin",
  });
  assertEquals(result.scope, "transformation");
  assertEquals(result.reason, "default_transformation");
});

Deno.test("classifyMemoryScope: explicit relational flag", () => {
  const result = classifyMemoryScope({
    content: "anything",
    is_relational: true,
  });
  assertEquals(result.scope, "relational");
});

Deno.test("classifyMemoryScope: explicit cycle flag", () => {
  const result = classifyMemoryScope({
    content: "anything",
    is_cycle_level: true,
  });
  assertEquals(result.scope, "cycle");
});

Deno.test("classifyMemoryScope: relational keyword 'préfère'", () => {
  const result = classifyMemoryScope({
    content: "je préfère les messages courts",
  });
  assertEquals(result.scope, "relational");
});

Deno.test("classifyMemoryScope: cycle keyword 'north star'", () => {
  const result = classifyMemoryScope({
    content: "mon north star c'est de retrouver confiance",
  });
  assertEquals(result.scope, "cycle");
});

Deno.test("classifyMemoryScope: cycle keyword 'étoile polaire'", () => {
  const result = classifyMemoryScope({
    content: "mon étoile polaire a changé",
  });
  assertEquals(result.scope, "cycle");
});

Deno.test("classifyMemoryScope: category_hint relational overrides content", () => {
  const result = classifyMemoryScope({
    content: "le sport me fait du bien",
    category_hint: "relational_preference",
  });
  assertEquals(result.scope, "relational");
});

Deno.test("classifyMemoryScope: references_plan_item → execution", () => {
  const result = classifyMemoryScope({
    content: "la séance de sport m'a fait du bien",
    references_plan_item: true,
  });
  assertEquals(result.scope, "execution");
});

Deno.test("classifyMemoryScope: relational keyword 'pression' detected", () => {
  const result = classifyMemoryScope({
    content: "je n'aime pas la pression",
  });
  assertEquals(result.scope, "relational");
});

Deno.test("classifyMemoryScope: relational keyword takes priority over plan_item", () => {
  const result = classifyMemoryScope({
    content: "je préfère qu'on ne me tutoie pas",
    references_plan_item: true,
  });
  assertEquals(result.scope, "relational");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Retrieval plan resolver
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("resolveV2RetrievalPlan: answer_user_now loads everything", () => {
  const plan = resolveV2RetrievalPlan("answer_user_now");
  assertEquals(plan.load_global_memories, true);
  assertEquals(plan.load_topic_memories, true);
  assertEquals(plan.load_event_memories, true);
  assertEquals(plan.load_identity, false);
  assertEquals(plan.load_coaching, true);
  assertExists(plan.global_scope_filter);
  assertEquals(plan.global_scope_filter!.length, 3);
});

Deno.test("resolveV2RetrievalPlan: daily_bilan is minimal", () => {
  const plan = resolveV2RetrievalPlan("daily_bilan");
  assertEquals(plan.load_global_memories, false);
  assertEquals(plan.load_topic_memories, true);
  assertEquals(plan.load_event_memories, true);
  assertEquals(plan.load_identity, false);
  assertEquals(plan.load_coaching, true);
  assertEquals(plan.budget.global_max, 0);
  assertEquals(plan.budget.topic_max, 1);
});

Deno.test("resolveV2RetrievalPlan: weekly_bilan loads globals scoped to cycle+transformation", () => {
  const plan = resolveV2RetrievalPlan("weekly_bilan");
  assertEquals(plan.load_global_memories, true);
  assertExists(plan.global_scope_filter);
  assertEquals(plan.global_scope_filter!.includes("cycle"), true);
  assertEquals(plan.global_scope_filter!.includes("transformation"), true);
  assertEquals(plan.global_scope_filter!.includes("relational"), false);
});

Deno.test("resolveV2RetrievalPlan: nudge_decision has relational but no cycle/transformation globals", () => {
  const plan = resolveV2RetrievalPlan("nudge_decision");
  assertEquals(plan.load_global_memories, true);
  assertExists(plan.global_scope_filter);
  assertEquals(plan.global_scope_filter!.includes("relational"), true);
  assertEquals(plan.global_scope_filter!.includes("cycle"), false);
  assertEquals(plan.global_scope_filter!.includes("transformation"), false);
});

Deno.test("resolveV2RetrievalPlan: rendez_vous_or_outreach loads event + relational + execution", () => {
  const plan = resolveV2RetrievalPlan("rendez_vous_or_outreach");
  assertEquals(plan.load_event_memories, true);
  assertEquals(plan.load_topic_memories, true);
  assertEquals(plan.topic_filter_transformation, true);
  assertEquals(plan.load_global_memories, true);
  assertExists(plan.global_scope_filter);
  assertEquals(plan.global_scope_filter!.includes("relational"), true);
  assertEquals(plan.global_scope_filter!.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Budget resolution
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("getBudgetForContract scales with tier", () => {
  const minimal = getBudgetForContract(V2_MEMORY_CONTRACTS.daily_bilan);
  const full = getBudgetForContract(V2_MEMORY_CONTRACTS.answer_user_now);
  assertEquals(minimal.global_max < full.global_max, true);
  assertEquals(minimal.topic_max <= full.topic_max, true);
  assertEquals(minimal.identity_max, 0);
  assertEquals(full.identity_max, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Event payload builders
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("buildRetrievalExecutedPayload produces correct shape", () => {
  const plan = resolveV2RetrievalPlan("weekly_bilan");
  const payload = buildRetrievalExecutedPayload({
    userId: "u-123",
    cycleId: "c-456",
    transformationId: "t-789",
    plan,
    tokensUsed: 1800,
    hitCount: 7,
    layersLoaded: ["transformation", "execution", "coaching"],
  });
  assertEquals(payload.user_id, "u-123");
  assertEquals(payload.intent, "weekly_bilan");
  assertEquals(payload.budget_tier, "medium");
  assertEquals(payload.layers_loaded, [
    "transformation",
    "execution",
    "coaching",
  ]);
  assertEquals(payload.tokens_used, 1800);
  assertEquals(payload.hit_count, 7);
});

Deno.test("buildPersistedPayload produces correct shape", () => {
  const payload = buildPersistedPayload({
    userId: "u-123",
    cycleId: "c-456",
    transformationId: "t-789",
    scope: "transformation",
    action: "enrich",
    memoryType: "global",
    memoryId: "gm-001",
  });
  assertEquals(payload.layer, "transformation");
  assertEquals(payload.action, "enrich");
  assertEquals(payload.memory_type, "global");
  assertEquals(payload.memory_id, "gm-001");
});
