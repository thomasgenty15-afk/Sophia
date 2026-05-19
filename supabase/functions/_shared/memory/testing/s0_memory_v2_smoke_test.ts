import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { supersedeMemoryItem } from "../correction/operations.ts";
import { InMemoryCorrectionRepository } from "../correction/test_repo.ts";
import { runMemorizerAsync } from "../memorizer/memorizer_async.ts";
import { InMemoryMemorizerRepository } from "../memorizer/memory_repo_test_utils.ts";
import type { MemorizerMessage } from "../memorizer/types.ts";
import { loadMemoryV2Payload } from "../runtime/loader.ts";

function message(id: string, content: string): MemorizerMessage {
  return {
    id,
    user_id: "s0-memory-smoke-user",
    role: "user",
    content,
    created_at: "2026-05-04T10:00:00.000Z",
  };
}

function fakeRetrievalClient(item: Record<string, unknown>) {
  return {
    from(table: string) {
      const query: any = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        overlaps() {
          return query;
        },
        limit() {
          return Promise.resolve({
            data: table === "memory_items" ? [item] : [],
          });
        },
      };
      return query;
    },
  };
}

function s0ExtractionProvider(): string {
  return JSON.stringify({
    memory_items: [
      {
        kind: "statement",
        content_text: "je suis nul",
        normalized_summary: "Le user dit se sentir nul.",
        domain_keys: ["psychologie.estime_de_soi"],
        confidence: 0.82,
        importance_score: 0.68,
        sensitivity_level: "sensitive",
        sensitivity_categories: ["mental_health", "shame"],
        requires_user_initiated: true,
        source_message_ids: ["s0-m1"],
        evidence_quote: "je suis nul",
        metadata: { statement_role: "self_judgment" },
      },
      {
        kind: "event",
        content_text: "j'ai appele mon pere hier",
        normalized_summary: "Le user dit avoir appele son pere hier.",
        domain_keys: ["relations.famille"],
        confidence: 0.82,
        importance_score: 0.68,
        sensitivity_level: "sensitive",
        sensitivity_categories: ["family"],
        source_message_ids: ["s0-m2"],
        evidence_quote: "j'ai appele mon pere hier",
        event_start_at: "2026-05-03T00:00:00.000+02:00",
        time_precision: "day",
        entity_mentions: ["mon pere"],
      },
      {
        kind: "statement",
        content_text: "j'arrive plus a arreter le cannabis",
        normalized_summary:
          "Le user dit ne plus arriver a arreter le cannabis.",
        domain_keys: ["addictions.cannabis"],
        confidence: 0.82,
        importance_score: 0.68,
        sensitivity_level: "sensitive",
        sensitivity_categories: ["addiction"],
        source_message_ids: ["s0-m4"],
        evidence_quote: "j'arrive plus a arreter le cannabis",
      },
      {
        kind: "action_observation",
        content_text: "j'ai fait ma marche",
        normalized_summary: "Le user dit avoir fait sa marche.",
        domain_keys: ["habitudes.execution"],
        confidence: 0.82,
        importance_score: 0.68,
        sensitivity_level: "normal",
        sensitivity_categories: [],
        source_message_ids: ["s0-m5"],
        evidence_quote: "j'ai fait ma marche",
        metadata: { observation_role: "single" },
      },
    ],
    entities: [],
    corrections: [],
    rejected_observations: [],
  });
}

Deno.test("S0.1 Memory V2 isolated smoke covers critical memorizer invariants", async () => {
  const repo = new InMemoryMemorizerRepository();
  const messages = [
    message("s0-m1", "je suis nul"),
    message("s0-m2", "j'ai appele mon pere hier"),
    message("s0-m3", "non c'etait mon frere"),
    message("s0-m4", "j'arrive plus a arreter le cannabis"),
    message("s0-m5", "j'ai fait ma marche"),
  ];

  const first = await runMemorizerAsync(repo, {
    user_id: "s0-memory-smoke-user",
    messages,
    known_entities: [{
      id: "entity-father",
      entity_type: "person",
      display_name: "pere",
      aliases: ["mon pere", "papa"],
      relation_to_user: "father",
      status: "active",
    }],
    known_topics: [{
      id: "topic-family",
      title: "Famille",
      lifecycle_stage: "durable",
      search_doc: "relations famille pere frere",
      domain_keys: ["relations.famille"],
    }, {
      id: "topic-walk",
      title: "Marche",
      lifecycle_stage: "durable",
      search_doc: "marche routine soir",
      domain_keys: ["habitudes.execution", "sante.activite_physique"],
    }],
    active_topic: {
      id: "topic-family",
      title: "Famille",
      lifecycle_stage: "durable",
      search_doc: "relations famille pere frere",
      domain_keys: ["relations.famille"],
    },
    plan_signals: [{
      plan_item_id: "walk-plan-item",
      title: "marche",
      occurrence_ids: ["walk-occurrence"],
    }],
    llm_provider: async () => s0ExtractionProvider(),
  });

  assertEquals(first.status, "completed");
  assertEquals(
    first.write_decisions.some((decision) =>
      decision.candidate.item.kind === "fact" &&
      decision.candidate.item.content_text.toLowerCase().includes("nul")
    ),
    false,
    "acute self-judgment must not become a durable fact",
  );

  const cannabisDecision = first.write_decisions.find((decision) =>
    decision.candidate.item.content_text.toLowerCase().includes("cannabis")
  );
  assertEquals(cannabisDecision?.candidate.item.sensitivity_level, "sensitive");

  const walkDecision = first.write_decisions.find((decision) =>
    decision.candidate.item.content_text.toLowerCase().includes("marche")
  );
  assertEquals(walkDecision?.candidate.item.kind, "action_observation");
  assertEquals(
    walkDecision?.candidate.action_link?.plan_item_id,
    "walk-plan-item",
  );

  const second = await runMemorizerAsync(repo, {
    user_id: "s0-memory-smoke-user",
    messages,
    llm_provider: async () => s0ExtractionProvider(),
  });
  assertEquals(second.status, "skipped");
  assertEquals(second.skip_reason, "completed_batch_hash");
  assertEquals(second.persisted.length, 0);
  assertEquals(repo.runs.length, 1);
});

Deno.test("S0.1 Memory V2 isolated smoke covers correction and retrieval boundaries", async () => {
  const correctionRepo = new InMemoryCorrectionRepository();
  correctionRepo.items.set("memory-call-father", {
    id: "memory-call-father",
    status: "active",
    content_text: "j'ai appele mon pere hier",
  });
  correctionRepo.topicIdsByItem.set("memory-call-father", ["topic-family"]);

  const correction = await supersedeMemoryItem(correctionRepo, {
    user_id: "s0-memory-smoke-user",
    item_id: "memory-call-father",
    replacement_item_id: "memory-call-brother",
    reason: "user_corrected_pere_to_frere",
    source_message_id: "s0-m3",
    now_iso: "2026-05-04T10:05:00.000Z",
  });

  assertEquals(correction.status, "superseded");
  assertEquals(
    correctionRepo.items.get("memory-call-father")?.status,
    "superseded",
  );
  assertEquals(correctionRepo.payloadPurges, [{
    user_id: "s0-memory-smoke-user",
    item_id: "memory-call-father",
  }]);

  const payload = await loadMemoryV2Payload({
    supabase: fakeRetrievalClient({
      id: "memory-walk",
      user_id: "s0-memory-smoke-user",
      kind: "action_observation",
      content_text: "j'ai fait ma marche",
      status: "active",
      sensitivity_level: "normal",
      domain_keys: ["habitudes.execution", "sante.activite_physique"],
      search_doc: "marche routine soir",
    }),
    user_id: "s0-memory-smoke-user",
    retrieval_mode: "cross_topic_lookup",
    message: "marche",
    limit: 3,
  });

  assertEquals(payload.items.some((item) => item.id === "memory-walk"), true);
});
