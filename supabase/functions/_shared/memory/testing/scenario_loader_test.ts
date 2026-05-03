import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  GOLDEN_SCENARIO_IDS,
  loadScenarios,
  parseScenarioText,
} from "./scenario_loader.ts";
import { createMemoryScenarioRunner } from "./runner.ts";

Deno.test("memory scenario loader parses all 12 golden scenarios", async () => {
  const scenarios = await loadScenarios();
  assertEquals(scenarios.length, 12);
  assertEquals(scenarios.map((s) => s.id), [...GOLDEN_SCENARIO_IDS]);
  for (const scenario of scenarios) {
    assertEquals(scenario.turns.length >= 2, true);
    assertEquals(scenario.turns.length <= 5, true);
  }
});

Deno.test("memory scenario loader rejects invalid scenario text", () => {
  let rejected = false;
  try {
    parseScenarioText(JSON.stringify({
      id: "bad",
      description: "Bad",
      scenario_version: 1,
      turns: [],
    }));
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true);
});

Deno.test("memory scenario runner executes all golden scenarios in mock mode", async () => {
  const scenarios = await loadScenarios();
  const results = await createMemoryScenarioRunner().runAll(scenarios, {
    llm_mode: "mock",
  });
  assertEquals(results.length, 12);
  assertEquals(results.every((result) => result.passed), true);
});
