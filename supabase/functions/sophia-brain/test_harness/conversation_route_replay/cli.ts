import {
  loadReplayFixtures,
  renderReplayMarkdown,
  runReplayFixtures,
} from "./runner.ts";

function argValue(name: string, fallback: string): string {
  const index = Deno.args.indexOf(name);
  if (index < 0) return fallback;
  return Deno.args[index + 1] ?? fallback;
}

const fixturePath = argValue(
  "--fixtures",
  "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
);
const filter = argValue("--filter", "");
const mode = argValue("--mode", "mock") === "s2" ? "s2" : "mock";

const fixtures = (await loadReplayFixtures(fixturePath)).filter((fixture) =>
  !filter ||
  fixture.fixture_id.includes(filter) ||
  fixture.description.toLowerCase().includes(filter.toLowerCase())
);
const results = await runReplayFixtures(fixtures, { mode });
console.log(renderReplayMarkdown(results));

if (results.some((result) => !result.passed)) {
  Deno.exit(1);
}
