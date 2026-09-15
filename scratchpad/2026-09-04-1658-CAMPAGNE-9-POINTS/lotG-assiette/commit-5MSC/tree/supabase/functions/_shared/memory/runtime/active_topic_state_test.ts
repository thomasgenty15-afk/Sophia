import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  readActiveTopicStateV2,
  updateActiveTopicStateV2,
  writeActiveTopicStateV2,
} from "./active_topic_state.ts";

Deno.test("active topic state reads v2 and preserves v1 coexistence on write", () => {
  const temp = {
    __active_topic_state_v1: {
      active_topic_id: "old",
      active_topic_slug: "v1",
    },
  };
  const migrated = readActiveTopicStateV2(temp);
  assertEquals(migrated.active_topic_id, "old");
  const next = updateActiveTopicStateV2(migrated, {
    active_topic_id: "new",
    active_topic_slug: "v2",
    last_decision: "switch",
    confidence: 0.8,
  }, "2026-05-01T00:00:00.000Z");
  const written = writeActiveTopicStateV2(temp, next);
  assertEquals((written as any).__active_topic_state_v1.active_topic_id, "old");
  assertEquals(readActiveTopicStateV2(written).active_topic_id, "new");
  assertEquals(readActiveTopicStateV2(written).previous_topic_id, "old");
});
