import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runMemorizerDryRun } from "./dry_run.ts";
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
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "statement",
          content_text: "Je me sens nul, j'ai l'impression de tout gacher.",
          normalized_summary:
            "Le user dit se sentir nul et avoir l'impression de tout gacher.",
          domain_keys: ["psychologie.estime_de_soi"],
          confidence: 0.82,
          importance_score: 0.68,
          sensitivity_level: "sensitive",
          sensitivity_categories: ["mental_health", "shame"],
          requires_user_initiated: true,
          source_message_ids: ["m1"],
          evidence_quote:
            "Je me sens nul, j'ai l'impression de tout gacher.",
          metadata: { statement_role: "self_judgment" },
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  };
  const first = await runMemorizerDryRun(repo, input);
  const second = await runMemorizerDryRun(repo, input);
  assertEquals(first.status, "completed");
  assertEquals(second.status, "skipped");
  assertEquals(repo.runs.length, 1);
  assertEquals(repo.processing.length, 1);
  assertEquals(first.durable_writes.memory_items, 0);
});
