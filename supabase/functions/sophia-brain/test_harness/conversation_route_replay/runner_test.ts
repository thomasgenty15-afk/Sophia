import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  loadReplayFixtures,
  renderReplayMarkdown,
  runReplayFixtures,
} from "./runner.ts";

// Fixture paths are resolved from import.meta.url, not the cwd: the suite must give the
// same result whether it is launched from the repo root or from supabase/functions.
const FIXTURES_DIR = fromFileUrl(new URL("./fixtures", import.meta.url));


Deno.test("conversation_route_replay loads and passes V1 fixtures", async () => {
  const fixtures = await loadReplayFixtures(
    FIXTURES_DIR,
  );
  assertEquals(fixtures.length, 5);
  const results = await runReplayFixtures(fixtures);
  assertEquals(results.every((result) => result.passed), true);
});

Deno.test("conversation_route_replay accepts compatibility mode option", async () => {
  const fixtures = await loadReplayFixtures(
    FIXTURES_DIR,
  );
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(results.every((result) => result.passed), true);
});

Deno.test("conversation_route_replay S4 latency smoke stays below 4s average per turn", async () => {
  const fixtures = await loadReplayFixtures(
    FIXTURES_DIR,
  );
  const started = Date.now();
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  const averageLatencyMs = (Date.now() - started) / Math.max(1, results.length);
  assertEquals(results.every((result) => result.passed), true);
  assertEquals(averageLatencyMs < 4000, true);
});

Deno.test("conversation_route_replay passes WhatsApp realism smoke fixture", async () => {
  const fixtures = await loadReplayFixtures(
    `${FIXTURES_DIR}/whatsapp_realism`,
  );
  assertEquals(fixtures.length, 1);
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(results.every((result) => result.passed), true);
});

Deno.test("conversation_route_replay renders markdown report", async () => {
  const fixtures = await loadReplayFixtures(
    FIXTURES_DIR,
  );
  const report = renderReplayMarkdown(
    await runReplayFixtures(fixtures.slice(0, 2)),
  );
  assertEquals(report.includes("Passed: 2/2"), true);
});
