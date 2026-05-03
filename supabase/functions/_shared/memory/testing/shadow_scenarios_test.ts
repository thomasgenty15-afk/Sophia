import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { detectMemorySignals } from "../runtime/signal_detection.ts";
import { routeTopic } from "../runtime/topic_router.ts";
import { loadScenarios } from "./scenario_loader.ts";
import { createMemoryScenarioRunner } from "./runner.ts";

Deno.test("Memory V2 shadow runtime passes golden scenarios 1-6", async () => {
  const scenarios = (await loadScenarios()).slice(0, 6);
  const activeByScenario = new Map<string, string | null>();
  const runner = createMemoryScenarioRunner({
    observeTurn: async ({ scenario, turn }) => {
      const signals = detectMemorySignals(turn.user ?? "");
      const topics = scenario.initial_state?.topics ?? [];
      if (!activeByScenario.has(scenario.id)) {
        const firstDurable = topics.find((topic) =>
          topic.lifecycle_stage !== "dormant" &&
          topic.lifecycle_stage !== "archived"
        );
        activeByScenario.set(scenario.id, firstDurable?.slug ?? null);
      }
      if (Number(turn.after_days ?? 0) >= 5) {
        activeByScenario.set(scenario.id, null);
      }
      const activeSlug = activeByScenario.get(scenario.id) ?? null;
      const activeTopic = activeSlug
        ? topics.find((topic) => topic.slug === activeSlug) ?? null
        : null;
      const routed = await routeTopic({
        message: turn.user ?? "",
        retrieval_mode: signals.retrieval_mode,
        signals,
        active_topic: activeTopic
          ? {
            id: activeTopic.slug,
            slug: activeTopic.slug,
            title: activeTopic.title,
            search_doc: activeTopic.search_doc,
            lifecycle_stage: activeTopic.lifecycle_stage,
          }
          : null,
        candidate_topics: topics
          .filter((topic) => topic.slug !== activeSlug)
          .map((topic) => ({
            id: topic.slug,
            slug: topic.slug,
            title: topic.title,
            search_doc: topic.search_doc,
            lifecycle_stage: topic.lifecycle_stage,
          })),
      });
      if (routed.decision === "switch" && routed.active_topic_slug) {
        activeByScenario.set(scenario.id, routed.active_topic_slug);
      }
      return {
        retrieval_mode: signals.retrieval_mode,
        retrieval_hints: signals.retrieval_hints,
        topic_decision: routed.decision,
        active_topic_id: routed.active_topic_slug,
      };
    },
  });
  const results = await runner.runAll(scenarios, {
    llm_mode: "mock",
    user_seed: "shadow-user",
  });
  assertEquals(
    results.map((result) => [result.scenario_id, result.passed]),
    results.map((result) => [result.scenario_id, true]),
  );
});
