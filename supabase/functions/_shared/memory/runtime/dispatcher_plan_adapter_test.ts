import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildMemoryV2LoaderPlan } from "./dispatcher_plan_adapter.ts";
import { detectMemorySignals } from "./signal_detection.ts";

function plan(overrides: Record<string, unknown>) {
  return {
    response_intent: "direct_answer",
    reasoning_complexity: "low",
    context_need: "minimal",
    memory_mode: "none",
    model_tier_hint: "lite",
    context_budget_tier: "tiny",
    targets: [],
    plan_confidence: 0.9,
    ...overrides,
  };
}

Deno.test("dispatcher adapter disables durable memory for memory_mode none", () => {
  const out = buildMemoryV2LoaderPlan({
    memory_plan: plan({ memory_mode: "none" }),
    signals: detectMemorySignals("Hello"),
  });
  assertEquals(out.enabled, false);
  assertEquals(out.requires_topic_router, false);
  assertEquals(out.requested_scopes, []);
  assertEquals(out.budget.max_items, 0);
});

Deno.test("dispatcher adapter maps targeted topic and event scopes", () => {
  const out = buildMemoryV2LoaderPlan({
    memory_plan: plan({
      memory_mode: "targeted",
      context_need: "targeted",
      context_budget_tier: "medium",
      targets: [
        {
          type: "topic",
          query_hint: "routine marche",
          priority: "high",
          retrieval_policy: "semantic_first",
          expansion_policy: "add_topics_and_events",
        },
        {
          type: "event",
          query_hint: "hier",
          priority: "medium",
          retrieval_policy: "semantic_first",
          expansion_policy: "exact_only",
        },
      ],
    }),
    signals: detectMemorySignals(
      "Je me sens vraiment pas bien par rapport a hier",
    ),
  });
  assertEquals(out.enabled, true);
  assertEquals(out.retrieval_mode, "topic_continuation");
  assertEquals(out.requested_scopes.includes("topic"), true);
  assertEquals(out.requested_scopes.includes("event"), true);
  assertEquals(out.requires_topic_router, true);
  assertEquals(out.budget.max_items, 8);
});

Deno.test("dispatcher adapter maps global inventory to cross-topic lookup", () => {
  const out = buildMemoryV2LoaderPlan({
    memory_plan: plan({
      response_intent: "inventory",
      memory_mode: "dossier",
      context_need: "dossier",
      context_budget_tier: "large",
      targets: [{
        type: "global_theme",
        key: "psychologie",
        priority: "high",
        retrieval_policy: "taxonomy_first",
        expansion_policy: "expand_theme_subthemes",
      }],
    }),
    signals: detectMemorySignals("Qu'est-ce que tu sais sur ma psychologie ?"),
  });
  assertEquals(out.enabled, true);
  assertEquals(out.retrieval_mode, "cross_topic_lookup");
  assertEquals(out.requested_scopes.includes("global"), true);
  assertEquals(out.requested_scopes.includes("topic"), false);
  assertEquals(out.global_keys, ["psychologie"]);
  assertEquals(out.requires_topic_router, false);
});

Deno.test("dispatcher adapter lets safety override memory none", () => {
  const out = buildMemoryV2LoaderPlan({
    memory_plan: plan({ memory_mode: "none" }),
    signals: detectMemorySignals("j'ai envie de me tuer"),
  });
  assertEquals(out.enabled, true);
  assertEquals(out.retrieval_mode, "safety_first");
  assertEquals(out.requested_scopes.includes("topic"), true);
});
