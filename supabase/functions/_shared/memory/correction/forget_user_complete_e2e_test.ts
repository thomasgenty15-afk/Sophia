import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type ForgetUserCompleteChatMetadata,
  type ForgetUserCompleteEntity,
  type ForgetUserCompleteMemoryItem,
  type ForgetUserCompleteRepository,
  forgetUserMemoryComplete,
} from "./forget_user_complete.ts";
import { InMemoryCorrectionRepository } from "./test_repo.ts";
import type { RedactionTopic } from "./redaction.ts";

class InMemoryForgetRepository extends InMemoryCorrectionRepository
  implements ForgetUserCompleteRepository {
  memoryRows = new Map<string, ForgetUserCompleteMemoryItem>();
  topics = new Map<string, RedactionTopic>();
  chatMetadata = new Map<string, Record<string, unknown>>();
  entities = new Map<string, ForgetUserCompleteEntity>();

  override async updateMemoryItem(
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await super.updateMemoryItem(itemId, patch);
    const existing = this.memoryRows.get(itemId);
    if (existing) this.memoryRows.set(itemId, { ...existing, ...patch });
  }

  async findMemoryItemsByTerms(
    userId: string,
    terms: string[],
  ): Promise<ForgetUserCompleteMemoryItem[]> {
    const normalizedTerms = terms.map((term) => term.toLowerCase());
    return [...this.memoryRows.values()].filter((item) => {
      if (item.user_id !== userId) return false;
      const text = `${item.content_text ?? ""} ${item.normalized_summary ?? ""}`
        .toLowerCase();
      return normalizedTerms.some((term) => text.includes(term));
    });
  }

  async loadTopicsForItems(itemIds: string[]): Promise<RedactionTopic[]> {
    const topicIds = new Set<string>();
    for (const itemId of itemIds) {
      for (const topicId of this.topicIdsByItem.get(itemId) ?? []) {
        topicIds.add(topicId);
      }
    }
    return [...topicIds].flatMap((topicId) => {
      const topic = this.topics.get(topicId);
      return topic ? [topic] : [];
    });
  }

  async updateTopicSurface(
    topicId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    this.topics.set(topicId, {
      ...(this.topics.get(topicId) ?? { id: topicId }),
      ...patch,
    });
  }

  async listChatMessageMetadata(): Promise<ForgetUserCompleteChatMetadata[]> {
    return [...this.chatMetadata.entries()].map(([id, metadata]) => ({
      id,
      metadata,
    }));
  }

  async updateChatMessageMetadata(
    messageId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    this.chatMetadata.set(messageId, metadata);
  }

  async listEntities(): Promise<ForgetUserCompleteEntity[]> {
    return [...this.entities.values()];
  }

  async updateEntityAliases(
    entityId: string,
    aliases: string[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const existing = this.entities.get(entityId)!;
    this.entities.set(entityId, { ...existing, aliases, metadata });
  }
}

function containsTania(value: unknown): boolean {
  return JSON.stringify(value).toLowerCase().includes("tania");
}

Deno.test("forget_user_complete redacts item, chat metadata, topic search_doc, entities and audit trail", async () => {
  const repo = new InMemoryForgetRepository();
  const userId = "u-forget";
  repo.memoryRows.set("mem-tania", {
    id: "mem-tania",
    user_id: userId,
    status: "active",
    content_text: "Le user dit que Tania est son ex.",
    normalized_summary: "Tania est l'ex du user.",
  });
  repo.topicIdsByItem.set("mem-tania", ["topic-rel"]);
  repo.topics.set("topic-rel", {
    id: "topic-rel",
    search_doc: "Tania ex relation rupture",
    pending_changes_count: 0,
    metadata: {},
  });
  repo.entities.set("entity-tania", {
    id: "entity-tania",
    display_name: "Tania",
    aliases: ["Tania", "mon ex Tania"],
    metadata: {},
  });
  for (let i = 0; i < 50; i++) {
    repo.chatMetadata.set(`msg-${i}`, {
      fixture_index: i,
      extracted_entities: i % 5 === 0 ? ["Tania"] : [],
      note: i === 12 ? "Tania mentionnee dans ce tour" : "autre tour",
    });
  }

  const result = await forgetUserMemoryComplete(repo, {
    user_id: userId,
    terms: ["Tania"],
    source_message_id: "msg-forget",
    now_iso: "2026-05-04T12:00:00.000Z",
  });

  assertEquals(result.deleted_item_ids, ["mem-tania"]);
  assertEquals(result.redacted_topic_ids, ["topic-rel"]);
  assertEquals(result.redacted_entity_ids, ["entity-tania"]);
  assert(result.redacted_chat_message_ids.length > 0);
  assert(result.duration_ms < 30_000);
  assertEquals(repo.changeLogs.length, 1);
  assertEquals(repo.changeLogs[0].operation_type, "delete");
  assertEquals(repo.sourceRedactions, ["mem-tania"]);
  assertEquals(
    containsTania({
      content_text: repo.memoryRows.get("mem-tania")?.content_text,
      normalized_summary: repo.memoryRows.get("mem-tania")?.normalized_summary,
    }),
    false,
  );
  assertEquals(containsTania(repo.topics.get("topic-rel")?.search_doc), false);
  assertEquals(containsTania([...repo.chatMetadata.values()]), false);
  assertEquals(
    containsTania(repo.entities.get("entity-tania")?.aliases),
    false,
  );
});
