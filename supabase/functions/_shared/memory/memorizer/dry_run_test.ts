import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runMemorizerDryRun } from "./dry_run.ts";
import { heuristicExtractionProvider } from "./heuristic_extract.ts";
import { InMemoryMemorizerRepository } from "./memory_repo_test_utils.ts";

Deno.test("dry-run memorizer is idempotent by batch_hash and message processing", async () => {
  const repo = new InMemoryMemorizerRepository();
  const input = {
    user_id: "u",
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user" as const,
      content: "Je me sens nul, j'ai l'impression de tout gacher.",
    }],
    llm_provider: async ({ user_payload }: { user_payload: string }) =>
      heuristicExtractionProvider(user_payload),
  };
  const first = await runMemorizerDryRun(repo, input);
  const second = await runMemorizerDryRun(repo, input);
  assertEquals(first.status, "completed");
  assertEquals(second.status, "skipped");
  assertEquals(repo.runs.length, 1);
  assertEquals(repo.processing.length, 1);
  assertEquals(first.durable_writes.memory_items, 0);
});
