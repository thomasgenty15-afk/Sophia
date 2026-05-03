import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildMessageProcessingRows,
  classifyAntiNoise,
  selectMemorizerBatch,
} from "./batch_selector.ts";

Deno.test("batch selector skips noise and keeps only substantive user messages", async () => {
  const batch = await selectMemorizerBatch({
    messages: [
      { id: "a", user_id: "u", role: "user", content: "ok" },
      { id: "b", user_id: "u", role: "assistant", content: "hello" },
      {
        id: "c",
        user_id: "u",
        role: "user",
        content: "Hier soir j'ai encore rate ma routine.",
      },
      { id: "d", user_id: "u", role: "user", content: "Je me sens nul." },
    ],
    already_processed_primary_ids: ["d"],
  });
  assertEquals(batch.primary_messages.map((m) => m.id), ["c"]);
  assertEquals(batch.skipped_noise_messages.map((m) => m.id), ["a"]);
  assertEquals(batch.context_messages.map((m) => m.id), ["b"]);
  assertEquals(batch.batch_hash.length, 64);
});

Deno.test("batch selector builds message processing tracking rows", async () => {
  const batch = await selectMemorizerBatch({
    messages: [
      { id: "a", user_id: "u", role: "user", content: "ok" },
      { id: "b", user_id: "u", role: "assistant", content: "ctx" },
      {
        id: "c",
        user_id: "u",
        role: "user",
        content: "Hier soir j'ai encore rate ma routine.",
      },
    ],
  });
  const rows = buildMessageProcessingRows({
    user_id: "u",
    extraction_run_id: "run",
    batch,
  });
  assertEquals(
    rows.map((r) =>
      `${r.message_id}:${r.processing_role}:${r.processing_status}`
    ),
    [
      "c:primary:completed",
      "b:context_only:completed",
      "a:skipped_noise:skipped",
    ],
  );
  assertEquals(
    classifyAntiNoise({ id: "x", user_id: "u", role: "user", content: "merci" })
      .skip,
    true,
  );
});
