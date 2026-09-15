import {
  type CorrectionRepository,
  deleteMemoryItem,
  SupabaseCorrectionRepository,
} from "./operations.ts";
import {
  type RedactionMemoryItem,
  type RedactionTopic,
  redactTextByTerms,
  redactTopicSurface,
} from "./redaction.ts";

export interface ForgetUserCompleteMemoryItem extends RedactionMemoryItem {
  content_text?: string | null;
  normalized_summary?: string | null;
}

export interface ForgetUserCompleteEntity {
  id: string;
  aliases?: string[] | null;
  display_name?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ForgetUserCompleteChatMetadata {
  id: string;
  metadata?: Record<string, unknown> | null;
}

export interface ForgetUserCompleteRepository extends CorrectionRepository {
  findMemoryItemsByTerms(
    userId: string,
    terms: string[],
  ): Promise<ForgetUserCompleteMemoryItem[]>;
  loadTopicsForItems(itemIds: string[]): Promise<RedactionTopic[]>;
  updateTopicSurface(
    topicId: string,
    patch: Record<string, unknown>,
  ): Promise<void>;
  listChatMessageMetadata(
    userId: string,
  ): Promise<ForgetUserCompleteChatMetadata[]>;
  updateChatMessageMetadata(
    messageId: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
  listEntities(userId: string): Promise<ForgetUserCompleteEntity[]>;
  updateEntityAliases(
    entityId: string,
    aliases: string[],
    metadata: Record<string, unknown>,
  ): Promise<void>;
}

export interface ForgetUserCompleteResult {
  deleted_item_ids: string[];
  redacted_topic_ids: string[];
  redacted_chat_message_ids: string[];
  redacted_entity_ids: string[];
  change_log_count: number;
  duration_ms: number;
}

export class SupabaseForgetUserCompleteRepository
  extends SupabaseCorrectionRepository
  implements ForgetUserCompleteRepository {
  constructor(private readonly supabaseClient: unknown) {
    super(supabaseClient);
  }

  async findMemoryItemsByTerms(
    userId: string,
    terms: string[],
  ): Promise<ForgetUserCompleteMemoryItem[]> {
    if (!terms.length) return [];
    const escaped = terms.map((term) =>
      `%${term.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
    );
    const seen = new Map<string, ForgetUserCompleteMemoryItem>();
    for (const pattern of escaped) {
      const { data, error } = await (this.supabaseClient as any)
        .from("memory_items")
        .select("id,user_id,status,content_text,normalized_summary,metadata")
        .eq("user_id", userId)
        .or(
          `content_text.ilike.${pattern},normalized_summary.ilike.${pattern}`,
        );
      if (error) throw error;
      for (const row of data ?? []) seen.set(String(row.id), row);
    }
    return [...seen.values()];
  }

  async loadTopicsForItems(itemIds: string[]): Promise<RedactionTopic[]> {
    if (!itemIds.length) return [];
    const { data, error } = await (this.supabaseClient as any)
      .from("memory_item_topics")
      .select(
        "user_topic_memories(id,search_doc,pending_changes_count,metadata)",
      )
      .in("memory_item_id", itemIds)
      .eq("status", "active");
    if (error) throw error;
    const topics = new Map<string, RedactionTopic>();
    for (const row of data ?? []) {
      const topic = row.user_topic_memories;
      if (topic?.id) topics.set(String(topic.id), topic);
    }
    return [...topics.values()];
  }

  async updateTopicSurface(
    topicId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await (this.supabaseClient as any)
      .from("user_topic_memories")
      .update(patch)
      .eq("id", topicId);
    if (error) throw error;
  }

  async listChatMessageMetadata(
    userId: string,
  ): Promise<ForgetUserCompleteChatMetadata[]> {
    const { data, error } = await (this.supabaseClient as any)
      .from("chat_messages")
      .select("id,metadata")
      .eq("user_id", userId)
      .not("metadata", "is", null)
      .limit(5000);
    if (error) throw error;
    return data ?? [];
  }

  async updateChatMessageMetadata(
    messageId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await (this.supabaseClient as any)
      .from("chat_messages")
      .update({ metadata })
      .eq("id", messageId);
    if (error) throw error;
  }

  async listEntities(userId: string): Promise<ForgetUserCompleteEntity[]> {
    const { data, error } = await (this.supabaseClient as any)
      .from("user_entities")
      .select("id,display_name,aliases,metadata")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  }

  async updateEntityAliases(
    entityId: string,
    aliases: string[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await (this.supabaseClient as any)
      .from("user_entities")
      .update({ aliases, metadata })
      .eq("id", entityId);
    if (error) throw error;
  }
}

function normalize(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function containsAnyTerm(input: unknown, terms: string[]): boolean {
  const text = normalize(input);
  return terms.some((term) => text.includes(normalize(term)));
}

function redactUnknown(value: unknown, terms: string[]): unknown {
  if (typeof value === "string") return redactTextByTerms(value, terms);
  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknown(entry, terms));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = redactUnknown(entry, terms);
    }
    return out;
  }
  return value;
}

export async function forgetUserMemoryComplete(
  repo: ForgetUserCompleteRepository,
  args: {
    user_id: string;
    terms: string[];
    source_message_id?: string | null;
    now_iso?: string | null;
  },
): Promise<ForgetUserCompleteResult> {
  const started = Date.now();
  const terms = [
    ...new Set(args.terms.map((term) => term.trim()).filter(Boolean)),
  ];
  if (terms.length === 0) {
    return {
      deleted_item_ids: [],
      redacted_topic_ids: [],
      redacted_chat_message_ids: [],
      redacted_entity_ids: [],
      change_log_count: 0,
      duration_ms: Date.now() - started,
    };
  }

  const items = await repo.findMemoryItemsByTerms(args.user_id, terms);
  const deletedItemIds: string[] = [];
  for (const item of items) {
    await deleteMemoryItem(repo, {
      user_id: args.user_id,
      item_id: item.id,
      reason: "user_forget_request",
      source_message_id: args.source_message_id ?? null,
      now_iso: args.now_iso ?? undefined,
    });
    deletedItemIds.push(item.id);
  }

  const topics = await repo.loadTopicsForItems(deletedItemIds);
  const redactedTopicIds: string[] = [];
  for (const topic of topics) {
    const redacted = redactTopicSurface(
      topic,
      {
        id: items[0]?.id ?? "forget_terms",
        user_id: args.user_id,
        status: "deleted_by_user",
        content_text: terms.join(" "),
        normalized_summary: terms.join(" "),
      },
      args.now_iso ?? new Date().toISOString(),
    );
    const patch = {
      search_doc: redactTextByTerms(redacted.search_doc, terms),
      search_doc_embedding: null,
      pending_changes_count: redacted.pending_changes_count,
      metadata: redacted.metadata,
    };
    await repo.updateTopicSurface(topic.id, patch);
    redactedTopicIds.push(topic.id);
  }

  const redactedChatMessageIds: string[] = [];
  for (const message of await repo.listChatMessageMetadata(args.user_id)) {
    if (!containsAnyTerm(JSON.stringify(message.metadata ?? {}), terms)) {
      continue;
    }
    await repo.updateChatMessageMetadata(
      message.id,
      redactUnknown(message.metadata ?? {}, terms) as Record<string, unknown>,
    );
    redactedChatMessageIds.push(message.id);
  }

  const redactedEntityIds: string[] = [];
  for (const entity of await repo.listEntities(args.user_id)) {
    const aliases = Array.isArray(entity.aliases) ? entity.aliases : [];
    if (
      !containsAnyTerm(entity.display_name, terms) &&
      !aliases.some((alias) => containsAnyTerm(alias, terms))
    ) continue;
    const nextAliases = aliases
      .map((alias) => redactTextByTerms(alias, terms).trim())
      .filter(Boolean);
    await repo.updateEntityAliases(entity.id, nextAliases, {
      ...(entity.metadata ?? {}),
      memory_v2_redaction_pending: true,
      memory_v2_redacted_terms: terms,
    });
    redactedEntityIds.push(entity.id);
  }

  return {
    deleted_item_ids: deletedItemIds,
    redacted_topic_ids: [...new Set(redactedTopicIds)],
    redacted_chat_message_ids: redactedChatMessageIds,
    redacted_entity_ids: redactedEntityIds,
    change_log_count: deletedItemIds.length,
    duration_ms: Date.now() - started,
  };
}
