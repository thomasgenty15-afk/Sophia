import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  compactTopic,
  type TopicCompactionRepository,
} from "./topic_compaction.ts";
import type {
  TopicCompactionMemoryItem,
  TopicCompactionTopic,
} from "./types.ts";
import { validateTopicCompactionOutput } from "./validation.ts";
import { computeTopicSensitivityMax } from "./sensitivity.ts";

class InMemoryTopicCompactionRepository implements TopicCompactionRepository {
  updates: Array<{ topic_id: string; patch: Record<string, unknown> }> = [];
  constructor(
    readonly topic: TopicCompactionTopic,
    readonly items: TopicCompactionMemoryItem[],
  ) {}

  async loadTopic(topicId: string): Promise<TopicCompactionTopic | null> {
    return this.topic.id === topicId ? this.topic : null;
  }

  async loadActiveItemsForTopic(): Promise<TopicCompactionMemoryItem[]> {
    return this.items.filter((item) => item.status === "active");
  }

  async updateTopic(
    topic_id: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    this.updates.push({ topic_id, patch });
  }
}

const topic: TopicCompactionTopic = {
  id: "topic-1",
  user_id: "u1",
  title: "Routine marche",
  search_doc: "ancienne recherche",
  summary_version: 2,
  search_doc_version: 3,
  pending_changes_count: 6,
  sensitivity_max: "normal",
  metadata: {},
  status: "active",
};

const items: TopicCompactionMemoryItem[] = [
  {
    id: "i1",
    user_id: "u1",
    kind: "statement",
    content_text: "Le user veut reprendre sa routine de marche le soir.",
    status: "active",
    sensitivity_level: "normal",
  },
  {
    id: "i2",
    user_id: "u1",
    kind: "statement",
    content_text: "Le user dit avoir tres honte d'une rechute.",
    normalized_summary: "Le user dit avoir tres honte d'une rechute.",
    status: "active",
    sensitivity_level: "sensitive",
  },
];

Deno.test("topic compaction updates search_doc, embedding and versions", async () => {
  const repo = new InMemoryTopicCompactionRepository(topic, items);
  const result = await compactTopic(repo, {
    topic_id: "topic-1",
    now_iso: "2026-05-02T00:00:00.000Z",
    provider: async () =>
      JSON.stringify({
        search_doc:
          "routine marche soir reprise habitude contexte sensible reformule",
        claims: [
          {
            claim: "Le user veut reprendre sa routine de marche.",
            supporting_item_ids: ["i1"],
            sensitivity_level: "normal",
          },
          {
            claim: "Un element sensible doit etre reformule avec prudence.",
            supporting_item_ids: ["i2"],
            sensitivity_level: "sensitive",
          },
        ],
        supporting_item_ids: ["i1", "i2"],
        sensitivity_max: "sensitive",
        warnings: [],
      }),
    embedder: async () => [0.1, 0.2, 0.3],
  });

  assertEquals(result.status, "completed");
  assertEquals(repo.updates.length, 1);
  assertEquals(repo.updates[0].patch.summary_version, 3);
  assertEquals(repo.updates[0].patch.search_doc_version, 4);
  assertEquals(repo.updates[0].patch.pending_changes_count, 0);
  assertEquals(repo.updates[0].patch.sensitivity_max, "sensitive");
  assertEquals(repo.updates[0].patch.search_doc_embedding, [0.1, 0.2, 0.3]);
});

Deno.test("topic compaction rejects unsupported and sensitive literal claims", async () => {
  const validation = validateTopicCompactionOutput({
    items,
    expected_sensitivity_max: "sensitive",
    output: {
      search_doc: "Le user dit avoir tres honte d'une rechute.",
      claims: [{
        claim: "Le user veut marcher.",
        supporting_item_ids: ["missing"],
        sensitivity_level: "normal",
      }],
      supporting_item_ids: ["missing"],
      sensitivity_max: "normal",
      warnings: [],
    },
  });
  assertEquals(validation.ok, false);
  assertEquals(
    validation.issues.some((issue) =>
      issue.code === "invalid_supporting_item_id"
    ),
    true,
  );
  assertEquals(
    validation.issues.some((issue) => issue.code === "sensitive_literal_quote"),
    true,
  );
  assertEquals(
    validation.issues.some((issue) => issue.code === "invalid_sensitivity_max"),
    true,
  );
});

Deno.test("computeTopicSensitivityMax follows active linked items", () => {
  assertEquals(computeTopicSensitivityMax(items), "sensitive");
  assertEquals(
    computeTopicSensitivityMax([
      ...items,
      {
        id: "i3",
        user_id: "u1",
        kind: "fact",
        content_text: "safety",
        status: "active",
        sensitivity_level: "safety",
      },
    ]),
    "safety",
  );
});
