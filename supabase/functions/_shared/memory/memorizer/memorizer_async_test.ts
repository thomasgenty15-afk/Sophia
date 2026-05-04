import {
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { heuristicExtractionProvider } from "./heuristic_extract.ts";
import { InMemoryMemorizerRepository } from "./memory_repo_test_utils.ts";
import { runMemorizerAsync } from "./memorizer_async.ts";

Deno.test("async memorizer persists active/candidate decisions and remains idempotent", async () => {
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
  const first = await runMemorizerAsync(repo, input);
  const second = await runMemorizerAsync(repo, input);
  assertEquals(first.status, "completed");
  assertEquals(first.persisted.length, 1);
  assertEquals(first.persisted[0].status, "active");
  assertEquals(second.status, "skipped");
  assertEquals(repo.memoryWrites.length, 1);
  assertEquals(repo.processing.length, 1);
});

Deno.test("async memorizer skips extraction when daily user cost cap is reached", async () => {
  const previous = Deno.env.get("memory_v2_memorizer_cost_cap_user_day_eur");
  Deno.env.set("memory_v2_memorizer_cost_cap_user_day_eur", "0.50");
  try {
    const repo = new InMemoryMemorizerRepository();
    repo.estimatedCostForUserDay = 0.75;
    const result = await runMemorizerAsync(repo, {
      user_id: "u-cost",
      messages: [{
        id: "m-cost",
        user_id: "u-cost",
        role: "user" as const,
        content:
          "Je veux retenir que mes dépenses émotionnelles explosent quand je travaille tard.",
      }],
      llm_provider: async () => {
        throw new Error("llm_should_not_be_called");
      },
    });

    assertEquals(result.status, "skipped");
    assertEquals(result.skip_reason, "cost_cap_exceeded");
    assertEquals(repo.memoryWrites.length, 0);
    assertEquals(repo.processing.length, 0);
    assertEquals(repo.runs[0].status, "skipped");
    assertObjectMatch(repo.runs[0].metadata ?? {}, {
      skip_reason: "cost_cap_exceeded",
      cost_cap_eur: 0.5,
      observed_cost_eur: 0.75,
    });
  } finally {
    if (previous === undefined) {
      Deno.env.delete("memory_v2_memorizer_cost_cap_user_day_eur");
    } else {
      Deno.env.set("memory_v2_memorizer_cost_cap_user_day_eur", previous);
    }
  }
});
