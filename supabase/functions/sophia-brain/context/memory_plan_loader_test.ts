import {
  deriveDispatcherMemoryLoadStrategy,
  resolveContextMemoryLoadStrategy,
} from "./loader.ts";
import type { ContextProfile } from "./types.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

const COMPANION_PROFILE: ContextProfile = {
  temporal: true,
  identity: true,
  topic_memories: true,
  global_memories: true,
  event_memories: true,
  facts: true,
  short_term: true,
  history_depth: 15,
};

Deno.test("deriveDispatcherMemoryLoadStrategy: no plan keeps historical memory behaviour", () => {
  const strategy = deriveDispatcherMemoryLoadStrategy({
    mode: "companion",
    profile: COMPANION_PROFILE,
    message: "hello",
    memoryPlan: undefined,
  });

  assertEquals(strategy.usePlan, false);
  assertEquals(strategy.skipAllMemory, false);
  assertEquals(strategy.loadIdentity, false);
});

Deno.test("deriveDispatcherMemoryLoadStrategy: inventory on psychologie loads exact theme and no noisy fallback", () => {
  const strategy = deriveDispatcherMemoryLoadStrategy({
    mode: "companion",
    profile: COMPANION_PROFILE,
    message: "Qu'est-ce que tu sais sur ma psychologie ?",
    memoryPlan: {
      response_intent: "inventory",
      reasoning_complexity: "low",
      context_need: "dossier",
      memory_mode: "dossier",
      model_tier_hint: "standard",
      context_budget_tier: "large",
      targets: [
        {
          type: "global_theme",
          key: "psychologie",
          priority: "high",
          retrieval_policy: "force_taxonomy",
          expansion_policy: "expand_theme_subthemes",
        },
      ],
      plan_confidence: 0.95,
    },
  });

  assertEquals(strategy.usePlan, true);
  assertEquals(strategy.globalThemeKeys, ["psychologie"]);
  assertEquals(strategy.globalSubthemeKeys, []);
  assertEquals(strategy.fallbackSemanticGlobalMax, 0);
  assertEquals(strategy.fallbackSemanticTopicMax, 0);
  assertEquals(strategy.fallbackSemanticEventMax, 0);
  assertEquals(strategy.loadIdentity, false);
});

Deno.test("deriveDispatcherMemoryLoadStrategy: targeted work relation problem asks for topic support", () => {
  const strategy = deriveDispatcherMemoryLoadStrategy({
    mode: "companion",
    profile: COMPANION_PROFILE,
    message: "Je galère avec mes relations au travail",
    memoryPlan: {
      response_intent: "problem_solving",
      reasoning_complexity: "medium",
      context_need: "targeted",
      memory_mode: "targeted",
      model_tier_hint: "standard",
      context_budget_tier: "medium",
      targets: [
        {
          type: "global_subtheme",
          key: "travail.relations_professionnelles",
          priority: "high",
          retrieval_policy: "taxonomy_first",
          expansion_policy: "add_supporting_topics",
        },
      ],
      plan_confidence: 0.88,
    },
  });

  assertEquals(
    strategy.globalSubthemeKeys,
    ["travail.relations_professionnelles"],
  );
  assert(
    strategy.fallbackSemanticTopicMax > 0,
    "topic support should be enabled",
  );
  assertEquals(strategy.fallbackSemanticEventMax, 0);
});

Deno.test("deriveDispatcherMemoryLoadStrategy: memory_mode none disables all memory blocks", () => {
  const strategy = deriveDispatcherMemoryLoadStrategy({
    mode: "companion",
    profile: COMPANION_PROFILE,
    message: "Aide-moi à reformuler cette phrase",
    memoryPlan: {
      response_intent: "direct_answer",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      plan_confidence: 0.9,
    },
  });

  assertEquals(strategy.skipAllMemory, true);
  assertEquals(strategy.loadIdentity, false);
  assertEquals(strategy.fallbackSemanticGlobalMax, 0);
  assertEquals(strategy.fallbackSemanticTopicMax, 0);
  assertEquals(strategy.fallbackSemanticEventMax, 0);
});

Deno.test("resolveContextMemoryLoadStrategy: daily_bilan uses V2 minimal execution/coaching/event", () => {
  const strategy = resolveContextMemoryLoadStrategy({
    mode: "investigator",
    profile: COMPANION_PROFILE,
    message: "daily",
    v2Intent: "daily_bilan",
  });

  assertEquals(strategy.source, "v2_intent");
  assertEquals(strategy.fallbackSemanticGlobalMax, 0);
  assertEquals(strategy.fallbackSemanticTopicMax, 1);
  assertEquals(strategy.fallbackSemanticEventMax, 1);
  assertEquals(strategy.topicFilterTransformation, true);
});

Deno.test("resolveContextMemoryLoadStrategy: weekly_bilan uses V2 scoped globals", () => {
  const strategy = resolveContextMemoryLoadStrategy({
    mode: "investigator",
    profile: COMPANION_PROFILE,
    message: "weekly",
    v2Intent: "weekly_bilan",
  });

  assertEquals(strategy.source, "v2_intent");
  assertEquals(strategy.globalScopeFilter, ["cycle", "transformation"]);
  assertEquals(strategy.fallbackSemanticGlobalMax, 3);
  assertEquals(strategy.fallbackSemanticTopicMax, 2);
  assertEquals(strategy.fallbackSemanticEventMax, 2);
});

Deno.test("resolveContextMemoryLoadStrategy: nudge_decision keeps relational globals only", () => {
  const strategy = resolveContextMemoryLoadStrategy({
    mode: "investigator",
    profile: COMPANION_PROFILE,
    message: "nudge",
    v2Intent: "nudge_decision",
  });

  assertEquals(strategy.source, "v2_intent");
  assertEquals(strategy.globalScopeFilter, ["relational"]);
  assertEquals(strategy.fallbackSemanticGlobalMax, 2);
  assertEquals(strategy.fallbackSemanticTopicMax, 1);
  assertEquals(strategy.fallbackSemanticEventMax, 1);
});

Deno.test("resolveContextMemoryLoadStrategy: rendez_vous_or_outreach keeps relational + execution + event", () => {
  const strategy = resolveContextMemoryLoadStrategy({
    mode: "investigator",
    profile: COMPANION_PROFILE,
    message: "rdv",
    v2Intent: "rendez_vous_or_outreach",
  });

  assertEquals(strategy.source, "v2_intent");
  assertEquals(strategy.globalScopeFilter, ["relational"]);
  assertEquals(strategy.fallbackSemanticGlobalMax, 2);
  assertEquals(strategy.fallbackSemanticTopicMax, 1);
  assertEquals(strategy.fallbackSemanticEventMax, 1);
});

Deno.test("resolveContextMemoryLoadStrategy: answer_user_now keeps dispatcher plan and applies V2 caps", () => {
  const strategy = resolveContextMemoryLoadStrategy({
    mode: "companion",
    profile: COMPANION_PROFILE,
    message: "Qu'est-ce que tu sais sur ma psychologie ?",
    v2Intent: "answer_user_now",
    memoryPlan: {
      response_intent: "inventory",
      reasoning_complexity: "low",
      context_need: "dossier",
      memory_mode: "dossier",
      model_tier_hint: "standard",
      context_budget_tier: "large",
      targets: [
        {
          type: "global_theme",
          key: "psychologie",
          priority: "high",
          retrieval_policy: "force_taxonomy",
          expansion_policy: "expand_theme_subthemes",
        },
        {
          type: "core_identity",
          key: "temple",
          priority: "high",
          retrieval_policy: "semantic_only",
          expansion_policy: "exact_only",
        },
      ],
      plan_confidence: 0.95,
    },
  });

  assertEquals(strategy.source, "dispatcher_capped");
  assertEquals(strategy.globalScopeFilter, [
    "cycle",
    "transformation",
    "relational",
  ]);
  assert(
    strategy.budget.globalThemeMax <= 4,
    "global cap should respect V2 full budget",
  );
  assertEquals(strategy.loadIdentity, false);
});
