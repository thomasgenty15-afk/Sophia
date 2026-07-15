import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { decideMemoryItemDedupe, dedupeMemoryItems } from "./dedupe.ts";
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

// ── P8-G (nina-hard23 R1-B03): dédup INTRA-LOT ───────────────────────────────

Deno.test("dedupe intra-lot: deux faits quasi identiques du même batch → un seul create (P8-G, nina-hard23 B03)", () => {
  const sucre1: ValidatedMemoryItem = {
    ...base,
    content_text:
      "Le user craque sur le sucré en fin de garde quand la fatigue monte.",
    normalized_summary: "craque sur le sucre en fin de garde",
    canonical_key: "alimentation.sucre.statement.fin_de_garde",
    source_message_ids: ["m1"],
  };
  const sucre2: ValidatedMemoryItem = {
    ...base,
    content_text:
      "Le user craque sur le sucré en fin de garde, quand la fatigue monte.",
    normalized_summary: "craque sur le sucre en fin de garde fatigue",
    canonical_key: "alimentation.sucre.statement.fin_de_garde_fatigue",
    source_message_ids: ["m3"],
  };
  const decisions = dedupeMemoryItems([sucre1, sucre2], []);
  assertEquals(decisions[0].decision, "create_new");
  assertEquals(decisions[1].decision, "reject_duplicate");
  assertEquals((decisions[1] as { reason?: string }).reason, "intra_batch_duplicate");
});

Deno.test("dedupe intra-lot: deux faits distincts du même batch restent deux creates (P8-G anti-faux-positif)", () => {
  const eau: ValidatedMemoryItem = {
    ...base,
    content_text: "Le user boit mal en journee quand il est au bureau.",
    normalized_summary: "boit mal en journee au bureau",
    canonical_key: "alimentation.eau.statement.journee_bureau",
    source_message_ids: ["m1"],
  };
  const sommeil: ValidatedMemoryItem = {
    ...base,
    content_text: "Le user s'endort tard a cause du telephone au lit.",
    normalized_summary: "s endort tard telephone au lit",
    canonical_key: "sommeil.endormissement.statement.telephone_lit",
    source_message_ids: ["m2"],
  };
  const decisions = dedupeMemoryItems([eau, sommeil], []);
  assertEquals(decisions[0].decision, "create_new");
  assertEquals(decisions[1].decision, "create_new");
});

Deno.test("dedupe intra-lot: deux events de dates distinctes ne se dédupent jamais (P8-G anti-faux-positif)", () => {
  const event1: ValidatedMemoryItem = {
    ...base,
    kind: "event",
    content_text: "Le user part chez sa mere.",
    normalized_summary: "part chez sa mere",
    canonical_key: "famille.visite.event.mere_1",
    event_start_at: "2026-07-20T00:00:00.000Z",
    source_message_ids: ["m1"],
  };
  const event2: ValidatedMemoryItem = {
    ...base,
    kind: "event",
    content_text: "Le user part chez sa mere.",
    normalized_summary: "part chez sa mere",
    canonical_key: "famille.visite.event.mere_2",
    event_start_at: "2026-08-02T00:00:00.000Z",
    source_message_ids: ["m2"],
  };
  const decisions = dedupeMemoryItems([event1, event2], []);
  assertEquals(decisions[0].decision, "create_new");
  assertEquals(decisions[1].decision, "create_new");
});
