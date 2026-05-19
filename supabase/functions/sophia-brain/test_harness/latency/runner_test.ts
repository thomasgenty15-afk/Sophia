import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { loadReplayFixtures } from "../conversation_route_replay/runner.ts";
import {
  evaluateLatencyBudget,
  measureReplayLatency,
  renderLatencyMarkdown,
} from "./runner.ts";

Deno.test("S8 latency harness measures 30 conversations under average and p95 budgets", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  );
  const selected = [
    ...fixtures.filter((fixture) => !fixture.fixture_id.startsWith("W")).slice(
      0,
      20,
    ),
    ...fixtures.filter((fixture) => fixture.fixture_id.startsWith("W")),
  ];
  assertEquals(selected.length, 30);

  const samples = await measureReplayLatency(selected);
  const budget = evaluateLatencyBudget(samples);
  const report = renderLatencyMarkdown({ samples, budget });

  assertEquals(samples.every((sample) => sample.passed), true);
  assertEquals(budget.passed, true);
  assertEquals(budget.average_ms < 4_000, true);
  assertEquals(budget.p95_ms < 6_000, true);
  assertEquals(report.includes("Samples: 30"), true);
});
