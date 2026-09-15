import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { selectTopicsForCompaction, shouldCompactTopic } from "./trigger.ts";

Deno.test("topic compaction trigger selects threshold, correction and weekly topics", () => {
  const topics = [
    {
      id: "a",
      user_id: "u",
      title: "A",
      pending_changes_count: 5,
      status: "active",
    },
    {
      id: "b",
      user_id: "u",
      title: "B",
      pending_changes_count: 1,
      status: "active",
    },
    {
      id: "c",
      user_id: "u",
      title: "C",
      pending_changes_count: 0,
      status: "archived",
    },
  ];
  assertEquals(
    selectTopicsForCompaction(topics, { threshold: 5 }).map((t) => t.id),
    ["a"],
  );
  assertEquals(
    selectTopicsForCompaction(topics, { trigger_type: "weekly_review" }).map((
      t,
    ) => t.id),
    ["a", "b"],
  );
  assertEquals(
    shouldCompactTopic(topics[1], { trigger_type: "correction" }),
    { compact: true, reason: "correction_pending" },
  );
  assertEquals(
    shouldCompactTopic(topics[2], { force_topic_ids: ["c"] }),
    { compact: false, reason: "topic_not_active" },
  );
});
