import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { decideMemoryItemDedupe } from "./dedupe.ts";
import type { ValidatedMemoryItem } from "./types.ts";

const base: ValidatedMemoryItem = {
  kind: "statement",
  content_text: "Le user dit avoir peur de rater.",
  normalized_summary: "peur de rater",
  domain_keys: ["psychologie.peur_echec"],
  confidence: 0.8,
  sensitivity_level: "sensitive",
  source_message_ids: ["m1"],
  canonical_key: "psychologie.peur_echec.statement.peur_de_rater",
};

Deno.test("dedupe rejects exact duplicate and merges similar item", () => {
  assertEquals(
    decideMemoryItemDedupe(base, [{
      id: "e1",
      kind: "statement",
      content_text: base.content_text,
      normalized_summary: base.normalized_summary,
      canonical_key: base.canonical_key,
      source_message_id: "m1",
    }]).decision,
    "reject_duplicate",
  );
  assertEquals(
    decideMemoryItemDedupe({ ...base, source_message_ids: ["m2"] }, [{
      id: "e1",
      kind: "statement",
      content_text: base.content_text,
      normalized_summary: base.normalized_summary,
      canonical_key: base.canonical_key,
      source_message_id: "m1",
    }]).decision,
    "add_source_to_existing",
  );
});

Deno.test("dedupe creates distinct event windows", () => {
  const event = {
    ...base,
    kind: "event" as const,
    event_start_at: "2026-05-01T00:00:00.000Z",
    time_precision: "day",
  };
  const decision = decideMemoryItemDedupe(event, [{
    id: "e1",
    kind: "event",
    content_text: event.content_text,
    normalized_summary: event.normalized_summary,
    canonical_key: event.canonical_key,
    event_start_at: "2026-05-02T00:00:00.000Z",
  }]);
  assertEquals(decision.decision, "create_new");
});
