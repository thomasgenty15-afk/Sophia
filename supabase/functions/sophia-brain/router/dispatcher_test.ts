import {
  analyzeSignalsV2,
  DEFAULT_MEMORY_PLAN,
  DEFAULT_SURFACE_PLAN,
  resolveDispatcherModelSelection,
  setDispatcherLlmRunnerForTest,
  sanitizeDispatcherMemoryPlan,
  sanitizeDispatcherSurfacePlan,
} from "./dispatcher.ts";

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

Deno.test("sanitizeDispatcherMemoryPlan: keeps canonical global targets and normalizes enums", () => {
  const plan = sanitizeDispatcherMemoryPlan({
    response_intent: "inventory",
    reasoning_complexity: "HIGH",
    context_need: "dossier",
    memory_mode: "dossier",
    model_tier_hint: "deep",
    context_budget_tier: "large",
    plan_confidence: 0.91,
    targets: [
      {
        type: "global_theme",
        key: "psychologie",
        priority: "high",
        retrieval_policy: "force_taxonomy",
        expansion_policy: "expand_theme_subthemes",
      },
      {
        type: "global_subtheme",
        key: "travail.relations_professionnelles",
        priority: "medium",
        retrieval_policy: "taxonomy_first",
        expansion_policy: "add_supporting_topics",
      },
      {
        type: "topic",
        query_hint: "Projet Sophia",
        priority: "low",
        retrieval_policy: "semantic_first",
        expansion_policy: "add_topics_and_events",
      },
      {
        type: "core_identity",
        priority: "low",
        retrieval_policy: "taxonomy_first",
        expansion_policy: "exact_only",
      },
    ],
  });

  assertEquals(plan.response_intent, "inventory");
  assertEquals(plan.reasoning_complexity, "high");
  assertEquals(plan.context_need, "dossier");
  assertEquals(plan.memory_mode, "dossier");
  assertEquals(plan.model_tier_hint, "deep");
  assertEquals(plan.context_budget_tier, "large");
  assertEquals(plan.targets.length, 4);
  assertEquals(plan.targets[0]?.key, "psychologie");
  assertEquals(plan.targets[1]?.key, "travail.relations_professionnelles");
  assertEquals(plan.targets[2]?.query_hint, "Projet Sophia");
  assertEquals(plan.targets[3]?.key, "core_identity");
});

Deno.test("sanitizeDispatcherMemoryPlan: drops invalid targets and falls back to defaults", () => {
  const plan = sanitizeDispatcherMemoryPlan({
    response_intent: "mystery_mode",
    reasoning_complexity: "extreme",
    context_need: "massive",
    memory_mode: "whatever",
    model_tier_hint: "ultra",
    context_budget_tier: "huge",
    plan_confidence: 42,
    targets: [
      {
        type: "global_theme",
        key: "argent",
      },
      {
        type: "global_subtheme",
        key: "travail.argent",
      },
      {
        type: "topic",
      },
      {
        type: "core_identity",
        key: "identity_blob",
      },
      {
        type: "event",
        key: "",
        query_hint: "   ",
      },
    ],
  });

  assertEquals(plan.response_intent, DEFAULT_MEMORY_PLAN.response_intent);
  assertEquals(
    plan.reasoning_complexity,
    DEFAULT_MEMORY_PLAN.reasoning_complexity,
  );
  assertEquals(plan.context_need, DEFAULT_MEMORY_PLAN.context_need);
  assertEquals(plan.memory_mode, DEFAULT_MEMORY_PLAN.memory_mode);
  assertEquals(plan.model_tier_hint, DEFAULT_MEMORY_PLAN.model_tier_hint);
  assertEquals(
    plan.context_budget_tier,
    DEFAULT_MEMORY_PLAN.context_budget_tier,
  );
  assertEquals(plan.plan_confidence, 1);
  assert(Array.isArray(plan.targets) && plan.targets.length === 0, "invalid targets should be dropped");
});

Deno.test("sanitizeDispatcherSurfacePlan: keeps canonical surfaces and normalizes levels", () => {
  const plan = sanitizeDispatcherSurfacePlan({
    surface_mode: "GUIDED",
    planning_horizon: "multi_turn",
    plan_confidence: 0.88,
    candidates: [
      {
        surface_id: "architect.reflections",
        opportunity_type: "reflection",
        confidence: 0.9,
        suggested_level: 4.6,
        reason: "Le user structure une idée",
        evidence_window: "both",
        persistence_horizon: "session",
        cta_style: "soft",
        content_need: "ranked",
        content_query_hint: "discipline sabotage",
      },
      {
        surface_id: "dashboard.north_star",
        opportunity_type: "identity",
        confidence: 0.7,
        suggested_level: 3,
        reason: "Le user parle de cap",
        evidence_window: "current_turn",
        persistence_horizon: "3_turns",
        cta_style: "direct",
        content_need: "light",
      },
    ],
  });

  assertEquals(plan.surface_mode, "guided");
  assertEquals(plan.planning_horizon, "multi_turn");
  assertEquals(plan.candidates.length, 2);
  assertEquals(plan.candidates[0]?.surface_id, "architect.reflections");
  assertEquals(plan.candidates[0]?.suggested_level, 4);
  assertEquals(plan.candidates[1]?.surface_id, "dashboard.north_star");
});

Deno.test("sanitizeDispatcherSurfacePlan: drops unknown surfaces and invalid rows", () => {
  const plan = sanitizeDispatcherSurfacePlan({
    surface_mode: "giant",
    planning_horizon: "forever",
    plan_confidence: 9,
    candidates: [
      {
        surface_id: "architect.magic",
        reason: "unknown",
      },
      {
        surface_id: "architect.quotes",
      },
    ],
  });

  assertEquals(plan.surface_mode, DEFAULT_SURFACE_PLAN.surface_mode);
  assertEquals(plan.planning_horizon, DEFAULT_SURFACE_PLAN.planning_horizon);
  assertEquals(plan.plan_confidence, 1);
  assertEquals(plan.candidates, []);
});

Deno.test("sanitizeDispatcherSurfacePlan: normalizes incompatible intensity fields", () => {
  const plan = sanitizeDispatcherSurfacePlan({
    surface_mode: "light",
    planning_horizon: "this_turn",
    plan_confidence: 0.9,
    candidates: [
      {
        surface_id: "dashboard.north_star",
        opportunity_type: "identity",
        confidence: 0.9,
        suggested_level: 5,
        reason: "Le user parle de cap",
        evidence_window: "both",
        persistence_horizon: "session",
        cta_style: "direct",
        content_need: "full",
        content_query_hint: "cap long terme",
      },
      {
        surface_id: "architect.coaching",
        opportunity_type: "identity",
        confidence: 0.85,
        suggested_level: 4,
        reason: "Travail identitaire profond",
        evidence_window: "both",
        persistence_horizon: "session",
        cta_style: "direct",
        content_need: "full",
        content_query_hint: "identite",
      },
    ],
  });

  assertEquals(plan.surface_mode, "light");
  assertEquals(plan.planning_horizon, "this_turn");
  assertEquals(plan.candidates[0]?.suggested_level, 2);
  assertEquals(plan.candidates[0]?.cta_style, "none");
  assertEquals(plan.candidates[0]?.content_need, "none");
  assertEquals(plan.candidates[0]?.content_query_hint, undefined);
  assertEquals(plan.candidates[0]?.persistence_horizon, "1_turn");
  assertEquals(plan.candidates[1]?.content_need, "none");
});

Deno.test("sanitizeDispatcherSurfacePlan: low confidence disables surface push entirely", () => {
  const plan = sanitizeDispatcherSurfacePlan({
    surface_mode: "push",
    planning_horizon: "multi_turn",
    plan_confidence: 0.51,
    candidates: [
      {
        surface_id: "architect.reflections",
        opportunity_type: "reflection",
        confidence: 0.75,
        suggested_level: 5,
        reason: "Signal trop faible pour pousser",
        evidence_window: "current_turn",
        persistence_horizon: "session",
        cta_style: "direct",
        content_need: "full",
      },
    ],
  });

  assertEquals(plan.surface_mode, "none");
  assertEquals(plan.candidates, []);
});

Deno.test("resolveDispatcherModelSelection: defaults to GPT 5.4 Mini + Gemini fallback", () => {
  const selected = resolveDispatcherModelSelection();

  assertEquals(selected.primaryModel, "gpt-5.4-mini");
  assertEquals(selected.fallbackGeminiModel, "gemini-2.5-flash");
});

Deno.test("analyzeSignalsV2: uses GPT 5.4 Mini with reasoning low", async () => {
  const calls: Array<Record<string, unknown>> = [];
  setDispatcherLlmRunnerForTest((...args: any[]) => {
    const meta = args[6] ?? {};
    calls.push(meta);
    return Promise.resolve(JSON.stringify({
      signals: {},
      memory_plan: {},
      surface_plan: {},
      new_signals: [],
      enrichments: [],
    }));
  });

  try {
    const result = await analyzeSignalsV2({
      userMessage: "Salut",
      lastAssistantMessage: "",
      last5Messages: [],
      signalHistory: [],
      activeMachine: null,
      stateSnapshot: {},
      plan_item_snapshot: [],
    });

    assertEquals(result.model_used, "gpt-5.4-mini");
    assertEquals(calls.length, 1);
    assertEquals(calls[0]?.model, "gpt-5.4-mini");
    assertEquals(calls[0]?.reasoningEffort, "low");
    assertEquals(calls[0]?.disableFallbackChain, true);
  } finally {
    setDispatcherLlmRunnerForTest(null);
  }
});

Deno.test("analyzeSignalsV2: falls back to Gemini when OpenAI primary fails", async () => {
  const calls: Array<Record<string, unknown>> = [];
  setDispatcherLlmRunnerForTest((...args: any[]) => {
    const meta = args[6] ?? {};
    calls.push(meta);
    if (meta.model === "gpt-5.4-mini") {
      return Promise.reject(new Error("openai down"));
    }
    return Promise.resolve(JSON.stringify({
      signals: {},
      memory_plan: {},
      surface_plan: {},
      new_signals: [],
      enrichments: [],
    }));
  });

  try {
    const result = await analyzeSignalsV2({
      userMessage: "Je veux faire le point",
      lastAssistantMessage: "",
      last5Messages: [],
      signalHistory: [],
      activeMachine: null,
      stateSnapshot: {},
      plan_item_snapshot: [],
    });

    assertEquals(calls.length, 2);
    assertEquals(calls[0]?.model, "gpt-5.4-mini");
    assertEquals(calls[1]?.model, "gemini-2.5-flash");
    assertEquals(
      calls[1]?.source,
      "sophia-brain:dispatcher-v2-contextual:fallback-gemini",
    );
    assertEquals(result.model_used, "gemini-2.5-flash");
  } finally {
    setDispatcherLlmRunnerForTest(null);
  }
});
