import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  deleteMemoryItem,
  hideMemoryItem,
  invalidateMemoryItem,
  supersedeMemoryItem,
} from "./operations.ts";
import { InMemoryCorrectionRepository } from "./test_repo.ts";

function repo() {
  const r = new InMemoryCorrectionRepository();
  r.topicIdsByItem.set("i1", ["t1"]);
  return r;
}

Deno.test("correction operations update item, change log, topic pending and payload purge", async () => {
  for (
    const [name, run, status] of [
      ["invalidate", invalidateMemoryItem, "invalidated"],
      ["hide", hideMemoryItem, "hidden_by_user"],
      ["delete", deleteMemoryItem, "deleted_by_user"],
    ] as const
  ) {
    const r = repo();
    const result = await run(r, {
      user_id: "u",
      item_id: "i1",
      reason: `${name} test`,
      source_message_id: "m1",
      now_iso: "2026-05-01T00:00:00.000Z",
    });
    assertEquals(result.status, status);
    assertEquals(r.changeLogs[0].operation_type, name);
    assertEquals(r.topicPending.get("t1"), 1);
    assertEquals(r.topicSensitivityRecalculations, ["t1"]);
    assertEquals(r.payloadPurges, [{ user_id: "u", item_id: "i1" }]);
    if (name === "delete") {
      assertEquals(r.items.get("i1")?.content_text, "");
      assertEquals(r.sourceRedactions, ["i1"]);
    }
  }
});

Deno.test("supersede links old item to replacement", async () => {
  const r = repo();
  const result = await supersedeMemoryItem(r, {
    user_id: "u",
    item_id: "i1",
    replacement_item_id: "i2",
    reason: "corrected",
  });
  assertEquals(result.status, "superseded");
  assertEquals(r.items.get("i1")?.superseded_by_item_id, "i2");
  assertEquals(r.changeLogs[0].replacement_id, "i2");
});
