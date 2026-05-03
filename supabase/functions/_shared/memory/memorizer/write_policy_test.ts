import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { decideInitialWriteStatus } from "./write_policy.ts";
import type { DryRunCandidate } from "./types.ts";

function candidate(patch: Partial<DryRunCandidate> = {}): DryRunCandidate {
  const base: DryRunCandidate = {
    item: {
      kind: "statement",
      content_text: "Le user dit avoir peur de rater.",
      normalized_summary: "peur de rater",
      domain_keys: ["psychologie.peur_echec"],
      confidence: 0.82,
      sensitivity_level: "sensitive",
      source_message_ids: ["m1"],
      canonical_key: "psychologie.peur_echec.statement.peur",
    },
    dedupe: {
      decision: "create_new",
      item: undefined as never,
      reason: "test",
    },
    topic_link: {
      item: undefined as never,
      topic_id: "t1",
      topic_slug: "topic",
      relation_type: "about",
      confidence: 0.75,
      reason: "test",
    },
    entity_links: [],
    action_link: null,
    status: "accepted_dry_run",
  };
  base.dedupe.item = base.item;
  base.topic_link!.item = base.item;
  return { ...base, ...patch };
}

Deno.test("write policy promotes high-confidence linked sourced items to active", () => {
  assertEquals(decideInitialWriteStatus(candidate()).status, "active");
});

Deno.test("write policy uses candidate for grey confidence and requires_user_initiated", () => {
  assertEquals(
    decideInitialWriteStatus(candidate({
      item: { ...candidate().item, confidence: 0.7 },
    })).status,
    "candidate",
  );
  assertEquals(
    decideInitialWriteStatus(candidate({
      item: { ...candidate().item, requires_user_initiated: true },
    })).reason,
    "requires_user_initiated",
  );
});

Deno.test("write policy rejects duplicates and active without source", () => {
  assertEquals(
    decideInitialWriteStatus(candidate({
      dedupe: {
        decision: "reject_duplicate",
        item: candidate().item,
        reason: "duplicate",
      },
    })).status,
    "reject",
  );
  assertEquals(
    decideInitialWriteStatus(candidate({
      item: { ...candidate().item, source_message_ids: [] },
    })).reason,
    "missing_source",
  );
});
