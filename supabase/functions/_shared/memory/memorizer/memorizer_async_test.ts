import {
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
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
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "action_observation",
          content_text: "J'ai pas fait ma marche hier soir.",
          normalized_summary: "Le user n'a pas fait sa marche hier soir.",
          domain_keys: ["habitudes.execution"],
          confidence: 0.82,
          importance_score: 0.68,
          sensitivity_level: "normal",
          sensitivity_categories: [],
          source_message_ids: ["m1"],
          evidence_quote: "J'ai pas fait ma marche hier soir.",
          event_start_at: "2026-05-06T18:00:00.000+02:00",
          time_precision: "day",
          metadata: { observation_role: "single" },
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
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

Deno.test("async memorizer materializes canonical daily action entries without relying on LLM text extraction", async () => {
  const repo = new InMemoryMemorizerRepository();
  const result = await runMemorizerAsync(repo, {
    user_id: "u-daily",
    messages: [{
      id: "m-daily",
      user_id: "u-daily",
      role: "user" as const,
      content: "non creve",
      metadata: {
        structured_extraction_source: "daily_action_review_v1",
      },
    }],
    trigger_type: "daily_action_review_v1",
    plan_signals: [{
      plan_item_id: "plan-focus",
      title: "Session focus",
      kind: "habit",
      dimension: "habits",
      action_family_key: "habit:session_focus",
      occurrence_ids: ["entry-focus-1"],
      observation_window_start: "2026-05-11T12:00:00Z",
      observation_window_end: "2026-05-11T12:00:00Z",
      action_variant: {
        recent_entry_outcomes: [{
          outcome: "missed",
          entry_kind: "habit_checkin",
          effective_at: "2026-05-11T12:00:00Z",
        }],
      },
    }],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });

  assertEquals(result.status, "completed");
  assertEquals(result.persisted.length, 1);
  assertEquals(result.persisted[0].candidate.item.kind, "action_observation");
  assertEquals(
    result.persisted[0].candidate.item.metadata?.structured_extraction_source,
    "daily_action_review_v1",
  );
  assertEquals(
    result.persisted[0].candidate.action_link?.plan_item_id,
    "plan-focus",
  );
  assertEquals(result.persisted[0].candidate.action_link?.occurrence_ids, [
    "entry-focus-1",
  ]);
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
