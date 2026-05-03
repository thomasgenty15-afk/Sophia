import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { heuristicExtractionProvider } from "./heuristic_extract.ts";
import { InMemoryMemorizerRepository } from "./memory_repo_test_utils.ts";
import { runMemorizerWriteCanary } from "./write_canary.ts";

Deno.test("write canary persists active/candidate decisions and remains idempotent", async () => {
  const repo = new InMemoryMemorizerRepository();
  const input = {
    user_id: "u",
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user" as const,
      content: "J'ai pas fait ma marche hier soir.",
    }],
    known_topics: [{ id: "t1", slug: "marche_soir", title: "Marche du soir" }],
    active_topic: { id: "t1", slug: "marche_soir", title: "Marche du soir" },
    plan_signals: [{
      plan_item_id: "plan-walk",
      title: "marche",
      occurrence_ids: ["occ-1"],
    }],
    llm_provider: async ({ user_payload }: { user_payload: string }) =>
      heuristicExtractionProvider(user_payload),
  };
  const first = await runMemorizerWriteCanary(repo, input);
  const second = await runMemorizerWriteCanary(repo, input);
  assertEquals(first.status, "completed");
  assertEquals(first.persisted.length, 1);
  assertEquals(first.persisted[0].status, "active");
  assertEquals(second.status, "skipped");
  assertEquals(repo.memoryWrites.length, 1);
  assertEquals(repo.processing.length, 1);
});
