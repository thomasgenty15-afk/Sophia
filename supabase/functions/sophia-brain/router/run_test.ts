import { deterministicStaleBilanDecision, resolveAgentChatModel } from "./run.ts";
import { getGlobalAiModel } from "../../_shared/gemini.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("deterministicStaleBilanDecision: resumes stale bilan on explicit resume", () => {
  assertEquals(deterministicStaleBilanDecision("ok on reprend"), "resume_bilan");
});

Deno.test("deterministicStaleBilanDecision: stops for today on defer language", () => {
  assertEquals(deterministicStaleBilanDecision("pas maintenant, on voit demain"), "stop_for_today");
});

Deno.test("deterministicStaleBilanDecision: leaves unrelated topic unresolved for fallback", () => {
  assertEquals(deterministicStaleBilanDecision("au fait j'ai une question sur mon plan"), null);
});

Deno.test("resolveAgentChatModel: explicit override wins", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    explicitModel: "gpt-5.4-mini",
    memoryPlan: {
      response_intent: "inventory",
      reasoning_complexity: "high",
      context_need: "dossier",
      memory_mode: "dossier",
      model_tier_hint: "deep",
      context_budget_tier: "large",
      targets: [],
      plan_confidence: 0.99,
    },
  });

  assertEquals(selected.model, "gpt-5.4-mini");
  assertEquals(selected.source, "explicit_override");
  assertEquals(selected.tier, "explicit");
});

Deno.test("resolveAgentChatModel: non-companion mode keeps default flash model", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "investigator",
    memoryPlan: {
      response_intent: "reflection",
      reasoning_complexity: "high",
      context_need: "dossier",
      memory_mode: "broad",
      model_tier_hint: "deep",
      context_budget_tier: "large",
      targets: [],
      plan_confidence: 0.95,
    },
  });

  assertEquals(selected.model, String(getGlobalAiModel("gemini-2.5-flash")).trim());
  assertEquals(selected.source, "non_companion_default");
  assertEquals(selected.tier, "default");
});

Deno.test("resolveAgentChatModel: companion uses memory plan tier when confidence is sufficient", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    memoryPlan: {
      response_intent: "problem_solving",
      reasoning_complexity: "medium",
      context_need: "targeted",
      memory_mode: "targeted",
      model_tier_hint: "lite",
      context_budget_tier: "small",
      targets: [],
      plan_confidence: 0.81,
    },
  });

  assertEquals(selected.model, "gemini-3.1-flash-lite-preview");
  assertEquals(selected.source, "memory_plan_lite");
  assertEquals(selected.tier, "lite");
});

Deno.test("resolveAgentChatModel: low-confidence memory plan falls back to current default", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    memoryPlan: {
      response_intent: "direct_answer",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "light",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      plan_confidence: 0.4,
    },
  });

  assertEquals(selected.model, String(getGlobalAiModel("gemini-2.5-flash")).trim());
  assertEquals(selected.source, "companion_default");
  assertEquals(selected.tier, "default");
});
