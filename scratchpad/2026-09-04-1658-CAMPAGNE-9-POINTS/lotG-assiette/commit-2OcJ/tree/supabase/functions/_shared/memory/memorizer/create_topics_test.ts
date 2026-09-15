import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  applyCreatedTopicsToCandidates,
  planCandidateTopics,
  slugifyTopicHint,
} from "./create_topics.ts";
import type { DryRunCandidate, ValidatedMemoryItem } from "./types.ts";
import { InMemoryMemorizerRepository } from "./memory_repo_test_utils.ts";
import { runMemorizerAsync } from "./memorizer_async.ts";

function item(overrides: Partial<ValidatedMemoryItem>): ValidatedMemoryItem {
  return {
    kind: "statement",
    content_text: "contenu",
    normalized_summary: "resume",
    domain_keys: ["psychologie.emotions"],
    confidence: 0.8,
    importance_score: 0.6,
    sensitivity_level: "normal",
    sensitivity_categories: [],
    requires_user_initiated: false,
    source_message_ids: ["m1"],
    evidence_quote: "quote",
    canonical_key: "key",
    topic_hint: null,
    ...overrides,
  } as ValidatedMemoryItem;
}

function candidate(
  overrides: Partial<ValidatedMemoryItem>,
  status: DryRunCandidate["status"] = "accepted_dry_run",
): DryRunCandidate {
  const built = item(overrides);
  return {
    item: built,
    dedupe: {
      item: built,
      decision: "create_new",
      reason: "new_information",
    } as DryRunCandidate["dedupe"],
    topic_link: null,
    status,
  };
}

Deno.test("slugifyTopicHint normalizes accents and spacing", () => {
  assertEquals(
    slugifyTopicHint("Anxiété de performance !"),
    "anxiete-de-performance",
  );
  assertEquals(slugifyTopicHint("  rythme   de sommeil  "), "rythme-de-sommeil");
});

Deno.test("planCandidateTopics groups same-hint items into one topic", () => {
  const plans = planCandidateTopics({
    candidates: [
      candidate({
        topic_hint: "anxiete de performance",
        normalized_summary: "Peur que ca ne monte pas au moment meme.",
      }),
      candidate({
        topic_hint: "Anxiété de performance",
        normalized_summary: "Se crispe quand il faut que ca marche.",
      }),
    ],
  });
  assertEquals(plans.length, 1);
  assertEquals(plans[0].slug, "anxiete-de-performance");
  assertEquals(plans[0].candidate_indexes, [0, 1]);
  assert(plans[0].search_doc.includes("Peur que ca ne monte pas"));
  assert(plans[0].search_doc.includes("Se crispe"));
});

Deno.test("planCandidateTopics merges near-identical hints", () => {
  const plans = planCandidateTopics({
    candidates: [
      candidate({ topic_hint: "anxiete de performance" }),
      candidate({ topic_hint: "anxiete performance" }),
    ],
  });
  assertEquals(plans.length, 1);
  assertEquals(plans[0].candidate_indexes.length, 2);
});

Deno.test("planCandidateTopics skips hints matching a known topic", () => {
  const plans = planCandidateTopics({
    candidates: [candidate({ topic_hint: "rythme de sommeil" })],
    known_topics: [
      { id: "t1", slug: "sommeil-rythme", title: "Rythme de sommeil" },
    ],
  });
  assertEquals(plans.length, 0);
});

Deno.test("planCandidateTopics ignores linked, rejected or hint-less items", () => {
  const linked = candidate({ topic_hint: "theme deja lie" });
  linked.topic_link = {
    item: linked.item,
    topic_id: "t-existing",
    topic_slug: "existing",
    relation_type: "about",
    confidence: 0.7,
    reason: "semantic_topic_match",
  };
  const plans = planCandidateTopics({
    candidates: [
      linked,
      candidate({ topic_hint: "rejete" }, "rejected"),
      candidate({ topic_hint: null }),
      candidate({ topic_hint: "ab" }),
    ],
  });
  assertEquals(plans.length, 0);
});

Deno.test("planCandidateTopics caps creations and keeps biggest groups", () => {
  const plans = planCandidateTopics({
    candidates: [
      candidate({ topic_hint: "theme un" }),
      candidate({ topic_hint: "theme un" }),
      candidate({ topic_hint: "sujet deux" }),
      candidate({ topic_hint: "monde trois" }),
      candidate({ topic_hint: "piste quatre" }),
      candidate({ topic_hint: "corde cinq" }),
    ],
  });
  assertEquals(plans.length, 4);
  assertEquals(plans[0].slug, "theme-un");
});

Deno.test("applyCreatedTopicsToCandidates links items to created topics", () => {
  const candidates = [candidate({ topic_hint: "anxiete de performance" })];
  const plans = planCandidateTopics({ candidates });
  const next = applyCreatedTopicsToCandidates({
    candidates,
    plans,
    created: [{ slug: "anxiete-de-performance", topic_id: "topic-9" }],
  });
  assertEquals(next[0].topic_link?.topic_id, "topic-9");
  assertEquals(next[0].topic_link?.reason, "created_candidate_topic");
});

Deno.test("memorizer end-to-end creates candidate topics and links items", async () => {
  const repo = new InMemoryMemorizerRepository();
  const result = await runMemorizerAsync(repo, {
    user_id: "u-topics",
    messages: [{
      id: "m1",
      user_id: "u-topics",
      role: "user" as const,
      content:
        "J'ai peur que ca ne monte pas au moment meme quand je suis avec une femme.",
    }],
    known_topics: [],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "statement",
          content_text:
            "A peur que l'excitation ne monte pas au moment meme avec une femme.",
          normalized_summary:
            "Anxiete de performance: peur que ca ne monte pas au moment meme.",
          domain_keys: ["psychologie.emotions"],
          confidence: 0.8,
          importance_score: 0.7,
          sensitivity_level: "sensitive",
          sensitivity_categories: ["sexuality"],
          source_message_ids: ["m1"],
          evidence_quote: "peur que ca ne monte pas au moment meme",
          topic_hint: "anxiete de performance",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });

  assertEquals(result.status, "completed");
  assertEquals(repo.createdTopics.length, 1);
  assertEquals(repo.createdTopics[0].slug, "anxiete-de-performance");
  assertEquals(repo.memoryWrites.length, 1);
  assertEquals(
    repo.memoryWrites[0].candidate.topic_link?.topic_id,
    repo.createdTopics[0].topic_id,
  );
  assertEquals(
    repo.memoryWrites[0].candidate.topic_link?.reason,
    "created_candidate_topic",
  );
});

Deno.test("memorizer does not create a topic when hint matches known topic", async () => {
  const repo = new InMemoryMemorizerRepository();
  await runMemorizerAsync(repo, {
    user_id: "u-known",
    messages: [{
      id: "m1",
      user_id: "u-known",
      role: "user" as const,
      content:
        "Je me suis encore couche a 3h du matin cette nuit, mon rythme de sommeil est completement decale en ce moment et ca me pese vraiment.",
    }],
    known_topics: [
      { id: "t-sommeil", slug: "rythme-de-sommeil", title: "Rythme de sommeil" },
    ],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "statement",
          content_text: "Se couche tres tard, vers 3h du matin.",
          normalized_summary: "Rythme de sommeil decale, coucher vers 3h.",
          domain_keys: ["sante.sommeil"],
          confidence: 0.8,
          importance_score: 0.6,
          sensitivity_level: "normal",
          sensitivity_categories: [],
          source_message_ids: ["m1"],
          evidence_quote: "couche a 3h du matin",
          topic_hint: "rythme de sommeil",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });

  assertEquals(repo.createdTopics.length, 0);
  // The linker matched the known topic via the explicit hint instead.
  assertEquals(
    repo.memoryWrites[0]?.candidate.topic_link?.topic_id,
    "t-sommeil",
  );
});
