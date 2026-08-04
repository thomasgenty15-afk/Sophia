import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildMemoryV2OpsScorecard } from "./observability.ts";

Deno.test("Memory V2 ops scorecard aggregates runtime, memorizer, compaction and alerts", () => {
  const scorecard = buildMemoryV2OpsScorecard([
    {
      created_at: "2026-05-03T10:00:00.000Z",
      user_id: "u1",
      event_name: "memory.runtime.active.loaded",
      source_component: "memory_v2_runtime_active",
      payload: {
        dispatcher_memory_plan_applied: true,
        dispatcher_memory_mode: "none",
        retrieval_mode: "topic_continuation",
        topic_decision: "skipped",
        topic_router_skipped: true,
        payload_item_count: 1,
        invalid_injection_count: 1,
        sensitive_excluded_count: 2,
        deleted_item_in_payload_count: 1,
        loader_ms: 20,
        total_ms: 30,
      },
    },
    {
      created_at: "2026-05-03T10:01:00.000Z",
      user_id: "u1",
      event_name: "memory.runtime.active.loaded",
      payload: {
        dispatcher_memory_plan_applied: true,
        dispatcher_memory_mode: "broad",
        retrieval_mode: "cross_topic_lookup",
        topic_decision: "skipped",
        topic_router_skipped: true,
        payload_item_count: 4,
        fallback_used: true,
        loader_ms: 80,
        total_ms: 120,
      },
    },
    {
      created_at: "2026-05-03T10:02:00.000Z",
      user_id: "u1",
      event_name: "memory.memorizer.completed",
      payload: {
        proposed_item_count: 3,
        accepted_item_count: 2,
        rejected_item_count: 1,
        pre_filter_skip_count: 1,
        statement_as_fact_violation_count: 1,
        cost: { eur: 0.02 },
      },
    },
    {
      created_at: "2026-05-03T10:03:00.000Z",
      user_id: "u1",
      event_name: "memory.compaction.topic.completed",
      payload: {
        unsupported_claim_count: 1,
        latency_ms: 200,
      },
    },
  ]);

  assertEquals(scorecard.runtime.active_load_count, 2);
  assertEquals(scorecard.runtime.memory_none_item_count, 1);
  assertEquals(scorecard.runtime.cross_topic_fallback_rate, 1);
  assertEquals(scorecard.privacy.invalid_injection_count, 1);
  assertEquals(scorecard.memorizer.statement_as_fact_violation_count, 1);
  assertEquals(scorecard.memorizer.pre_filter_skip_count, 1);
  assertEquals(scorecard.compaction.unsupported_claim_rate, 1);
  assertEquals(scorecard.cost.observed_cost_eur, 0.02);
  assertEquals(scorecard.cost.total_cost_per_user_day_p95, 9.6);
  assertEquals(
    scorecard.alerts.map((alert) => alert.key),
    [
      "invalid_injection_count",
      "statement_as_fact_violation_count",
      "deleted_item_in_payload",
      "compaction_unsupported_claim_rate",
      "memory_none_item_count",
      "cost_per_user_day_p95",
    ],
  );
});
