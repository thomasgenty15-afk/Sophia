import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { GoldenScenario, ScenarioRunner } from "./types.ts";

Deno.test("memory testing types accept a minimal golden scenario", () => {
  const scenario: GoldenScenario = {
    id: "01_minimal",
    description: "Minimal compile-time contract check",
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
              sensitivity_level: "normal",
            },
          ],
        },
      },
    ],
  };

  assertEquals(scenario.turns.length, 1);
});

Deno.test("memory testing runner contract is implementation-agnostic", () => {
  const runner: ScenarioRunner = {
    async run(scenario, _options) {
      return {
        scenario_id: scenario.id,
        passed: true,
        turn_results: [],
        global_assertions_result: {},
        duration_ms: 0,
        failures: [],
      };
    },
    async runAll(scenarios, options) {
      return await Promise.all(
        scenarios.map((scenario) => this.run(scenario, options)),
      );
    },
  };

  assertEquals(typeof runner.run, "function");
  assertEquals(typeof runner.runAll, "function");
});
