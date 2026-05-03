import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createMemoryScenarioRunner } from "./runner.ts";
import type { GoldenScenario } from "./types.ts";

function minimalScenario(): GoldenScenario {
  return {
    id: "runner_minimal",
    description: "Minimal runner fixture",
    scenario_version: 1,
    turns: [
      {
        user: "Je veux reprendre le sport.",
        expect: {
          retrieval_mode: "topic_continuation",
          topic_decision: "create_candidate",
          created_items: [
            {
              kind: "statement",
              contains: ["reprendre le sport"],
              domain_keys_any_of: ["sante.activite_physique"],
            },
          ],
          payload_contains: [{
            kind: "statement",
            contains: "reprendre le sport",
          }],
        },
      },
      {
        user: "Je commence demain matin.",
        expect: {
          retrieval_mode: "topic_continuation",
          retrieval_hints: ["dated_reference"],
          topic_decision: "stay",
          created_items: [{ kind: "event", contains: ["demain matin"] }],
        },
      },
    ],
  };
}

Deno.test("memory scenario runner executes a mock scenario", async () => {
  const result = await createMemoryScenarioRunner().run(minimalScenario(), {
    llm_mode: "mock",
  });
  assertEquals(result.passed, true);
  assertEquals(result.turn_results.length, 2);
  assertEquals(result.failures.length, 0);
});

Deno.test("memory scenario runner returns readable assertion failures", async () => {
  const result = await createMemoryScenarioRunner({
    observeTurn: () => ({ topic_decision: "switch" }),
  }).run(minimalScenario(), { llm_mode: "mock" });

  assertEquals(result.passed, false);
  assertEquals(result.failures[0].turn_index, 0);
  assertStringIncludes(
    JSON.stringify(result.failures),
    "Unexpected topic decision",
  );
});

Deno.test("memory scenario runner evaluates global assertions", async () => {
  const scenario = minimalScenario();
  scenario.turns[0].expect.created_items = [
    { kind: "fact", contains: ["je me sens nul"] },
  ];
  const result = await createMemoryScenarioRunner().run(scenario, {
    llm_mode: "mock",
  });

  assertEquals(result.global_assertions_result.no_statement_as_fact, false);
  assertEquals(result.passed, false);
});
