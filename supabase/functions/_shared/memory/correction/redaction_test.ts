import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDeletedItemRedactionPatch,
  redactTopicSurface,
} from "./redaction.ts";

Deno.test("redaction removes deleted item terms from topic search doc", () => {
  const redacted = redactTopicSurface(
    {
      id: "t1",
      search_doc: "honte rechute energie",
      pending_changes_count: 1,
      metadata: {},
    },
    {
      id: "i1",
      user_id: "u",
      status: "deleted_by_user",
      content_text: "Le user dit avoir tres honte d'une rechute.",
      normalized_summary: "honte rechute",
    },
    "2026-05-01T00:00:00.000Z",
  );
  assertEquals(redacted.search_doc.includes("rechute"), false);
  assertEquals(redacted.search_doc_embedding, null);
  assertEquals(redacted.pending_changes_count, 2);
});

Deno.test("deleted item redaction patch clears sensitive fields", () => {
  const patch = buildDeletedItemRedactionPatch("2026-05-01T00:00:00.000Z");
  assertEquals(patch.content_text, "");
  assertEquals(patch.embedding, null);
  assertEquals(patch.canonical_key, null);
});
