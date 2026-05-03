import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createMemoryMockLlm } from "./mock_llm.ts";

Deno.test("memory mock llm returns inline fixtures in mock mode", async () => {
  const llm = createMemoryMockLlm();
  const result = await llm.call({
    scenario_id: "scenario",
    prompt: "extraction",
    turn_index: 0,
    inline_fixture: { ok: true },
  }, { llm_mode: "mock" });

  assertEquals(result.prompt_version, "memory.memorizer.extraction.v1");
  assertEquals(result.output, { ok: true });
  assertEquals(result.source, "inline");
});

Deno.test("memory mock llm replay fails clearly when fixture is missing", async () => {
  const err = await assertRejects(
    () =>
      createMemoryMockLlm().call({
        scenario_id: "missing_scenario",
        prompt: "topic_router",
        turn_index: 0,
      }, {
        llm_mode: "replay",
        fixtures_dir: "/private/tmp/memory-v2-missing-fixtures",
      }),
    Error,
  );
  assertStringIncludes(err.message, "Missing replay fixture");
});

Deno.test("memory mock llm record writes a versioned fixture", async () => {
  const dir = `/private/tmp/memory-v2-fixtures-${crypto.randomUUID()}`;
  const result = await createMemoryMockLlm({
    call: () => Promise.resolve({ recorded: true }),
  }).call({
    scenario_id: "record_scenario",
    prompt: "compaction",
    turn_index: 1,
  }, { llm_mode: "record", fixtures_dir: dir });

  assertEquals(result.source, "recorded");
  const raw = await Deno.readTextFile(
    `${dir}/record_scenario/memory.compaction.topic.v1.json`,
  );
  const parsed = JSON.parse(raw);
  assertEquals(parsed.prompt_version, "memory.compaction.topic.v1");
  assertEquals(parsed.output, { recorded: true });
});
