import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  readMemoryPayloadStateV2,
  updateMemoryPayloadStateV2,
  writeMemoryPayloadStateV2,
} from "./payload_state.ts";

Deno.test("payload state carries items across three turns and expires", () => {
  let state = readMemoryPayloadStateV2({});
  state = updateMemoryPayloadStateV2({
    previous: state,
    turn_id: "t1",
    active_topic_id: "topic",
    injected_items: [{ memory_item_id: "m1", reason: "active_topic_core" }],
    now_iso: "2026-05-01T00:00:00.000Z",
  });
  assertEquals(state.items[0].ttl_turns_remaining, 3);
  state = updateMemoryPayloadStateV2({
    previous: state,
    turn_id: "t2",
    active_topic_id: "topic",
  });
  state = updateMemoryPayloadStateV2({
    previous: state,
    turn_id: "t3",
    active_topic_id: "topic",
  });
  assertEquals(state.items.map((i) => i.memory_item_id), ["m1"]);
  state = updateMemoryPayloadStateV2({
    previous: state,
    turn_id: "t4",
    active_topic_id: "topic",
  });
  assertEquals(state.items, []);
});

Deno.test("payload state purges correction/delete targets immediately", () => {
  let state = readMemoryPayloadStateV2({});
  state = updateMemoryPayloadStateV2({
    previous: state,
    turn_id: "t1",
    active_topic_id: "topic",
    injected_items: [
      { memory_item_id: "keep", reason: "active_topic_core" },
      { memory_item_id: "delete", reason: "active_topic_core" },
    ],
  });
  state = updateMemoryPayloadStateV2({
    previous: state,
    turn_id: "t2",
    active_topic_id: "topic",
    purge_item_ids: ["delete"],
  });
  assertEquals(state.items.map((i) => i.memory_item_id), ["keep"]);
});

Deno.test("payload state read/write uses temp_memory key", () => {
  const state = updateMemoryPayloadStateV2({
    previous: readMemoryPayloadStateV2({}),
    turn_id: "t1",
    active_topic_id: "topic",
    injected_entities: [{ entity_id: "e1", reason: "topic_anchor" }],
  });
  const temp = writeMemoryPayloadStateV2({ other: true }, state);
  assertEquals((temp as any).other, true);
  assertEquals(readMemoryPayloadStateV2(temp).entities[0].entity_id, "e1");
});
