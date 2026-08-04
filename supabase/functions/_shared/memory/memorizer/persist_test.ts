import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDryRunCompletionPatch,
  completeDryRunExtraction,
} from "./persist.ts";
import { InMemoryMemorizerRepository } from "./memory_repo_test_utils.ts";

Deno.test("persist dry-run stores candidates in extraction metadata and no durable writes", async () => {
  const repo = new InMemoryMemorizerRepository();
  const run = await repo.createExtractionRun({
    user_id: "u",
    batch_hash: "h",
    prompt_version: "p",
    model_name: "m",
    trigger_type: "test",
    input_message_ids: ["m1"],
  });
  await completeDryRunExtraction(repo, {
    run_id: run.id,
    duration_ms: 12,
    dry_run_candidates: [],
    rejected_observations: [],
    proposed_entity_count: 0,
    accepted_entity_count: 0,
    statement_as_fact_violation_count: 0,
  });
  assertEquals(repo.runs[0].status, "completed");
  assertEquals((repo.runs[0].metadata as any).durable_writes.memory_items, 0);
  const patch = buildDryRunCompletionPatch({
    run_id: run.id,
    duration_ms: 1,
    dry_run_candidates: [],
    rejected_observations: [],
    proposed_entity_count: 0,
    accepted_entity_count: 0,
    statement_as_fact_violation_count: 0,
  });
  assertEquals((patch.metadata as any).dry_run_candidates, []);
});
