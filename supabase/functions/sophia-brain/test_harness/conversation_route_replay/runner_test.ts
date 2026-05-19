import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  loadReplayFixtures,
  renderReplayMarkdown,
  runReplayFixtures,
} from "./runner.ts";

Deno.test("conversation_route_replay loads and passes 25 S1 fixtures", async () => {
  const fixtures = (await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  )).filter((fixture) => !fixture.fixture_id.startsWith("W"));
  assertEquals(fixtures.length, 25);
  const results = await runReplayFixtures(fixtures);
  assertEquals(results.every((result) => result.passed), true);
});

Deno.test("conversation_route_replay passes 25 fixtures with S2 runtime", async () => {
  const fixtures = (await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  )).filter((fixture) => !fixture.fixture_id.startsWith("W"));
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(results.every((result) => result.passed), true);
});

Deno.test("conversation_route_replay S4 latency smoke stays below 4s average per turn", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  );
  const started = Date.now();
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  const averageLatencyMs = (Date.now() - started) / Math.max(1, results.length);
  assertEquals(results.every((result) => result.passed), true);
  assertEquals(averageLatencyMs < 4000, true);
});

Deno.test("conversation_route_replay passes 10 S8 WhatsApp realism fixtures", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures/whatsapp_realism",
  );
  assertEquals(fixtures.length, 10);
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(results.every((result) => result.passed), true);
});

Deno.test("conversation_route_replay renders markdown report", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  );
  const report = renderReplayMarkdown(
    await runReplayFixtures(fixtures.slice(0, 2)),
  );
  assertEquals(report.includes("Passed: 2/2"), true);
});
