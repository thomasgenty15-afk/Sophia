import { purgeMemoryPayloadItems } from "../runtime/payload_state.ts";
import { maxSensitivityLevel } from "../compaction/sensitivity.ts";
import type {
  CorrectionChangeLogRow,
  CorrectionOperationInput,
  CorrectionOperationResult,
  SupersedeOperationInput,
} from "./types.ts";

export interface CorrectionRepository {
  updateMemoryItem(
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<void>;
  insertChangeLog(row: CorrectionChangeLogRow): Promise<void>;
  getTopicIdsForItem(itemId: string): Promise<string[]>;
  incrementTopicPendingChanges(topicIds: string[]): Promise<void>;
  recalculateTopicSensitivityMax?(topicIds: string[]): Promise<void>;
  purgePayloadItemForUser(userId: string, itemId: string): Promise<void>;
  redactSourcesForItem?(itemId: string): Promise<void>;
}

export class SupabaseCorrectionRepository implements CorrectionRepository {
  constructor(private readonly supabase: unknown) {}

  async updateMemoryItem(
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("memory_items")
      .update(patch)
      .eq("id", itemId);
    if (error) throw error;
  }

  async insertChangeLog(row: CorrectionChangeLogRow): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("memory_change_log")
      .insert(row);
    if (error) throw error;
  }

  async getTopicIdsForItem(itemId: string): Promise<string[]> {
    const { data, error } = await (this.supabase as any)
      .from("memory_item_topics")
      .select("topic_id")
      .eq("memory_item_id", itemId)
      .eq("status", "active");
    if (error) throw error;
    return Array.isArray(data) ? data.map((row) => String(row.topic_id)) : [];
  }

  async incrementTopicPendingChanges(topicIds: string[]): Promise<void> {
    for (const topicId of [...new Set(topicIds)]) {
      const { data, error } = await (this.supabase as any)
        .from("user_topic_memories")
        .select("pending_changes_count")
        .eq("id", topicId)
        .single();
      if (error) throw error;
      const next = Number(data?.pending_changes_count ?? 0) + 1;
      const { error: updateError } = await (this.supabase as any)
        .from("user_topic_memories")
        .update({ pending_changes_count: next })
        .eq("id", topicId);
      if (updateError) throw updateError;
    }
  }

  async recalculateTopicSensitivityMax(topicIds: string[]): Promise<void> {
    for (const topicId of [...new Set(topicIds)]) {
      const { data, error } = await (this.supabase as any)
        .from("memory_item_topics")
        .select("memory_items(sensitivity_level,status)")
        .eq("topic_id", topicId)
        .eq("status", "active");
      if (error) throw error;
      const sensitivityMax = maxSensitivityLevel(
        (Array.isArray(data) ? data : [])
          .map((row: any) => row.memory_items)
          .filter((item: any) => item?.status === "active")
          .map((item: any) => item.sensitivity_level),
      );
      const { error: updateError } = await (this.supabase as any)
        .from("user_topic_memories")
        .update({ sensitivity_max: sensitivityMax })
        .eq("id", topicId);
      if (updateError) throw updateError;
    }
  }

  async purgePayloadItemForUser(userId: string, itemId: string): Promise<void> {
    const { data, error } = await (this.supabase as any)
      .from("user_chat_states")
      .select("scope,temp_memory")
      .eq("user_id", userId);
    if (error) throw error;
    for (const row of data ?? []) {
      const temp = purgeMemoryPayloadItems(row.temp_memory ?? {}, [itemId]);
      const { error: updateError } = await (this.supabase as any)
        .from("user_chat_states")
        .update({ temp_memory: temp })
        .eq("user_id", userId)
        .eq("scope", row.scope);
      if (updateError) throw updateError;
    }
  }

  async redactSourcesForItem(itemId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("memory_item_sources")
      .update({
        evidence_quote: null,
        evidence_summary: null,
        metadata: {},
      })
      .eq("memory_item_id", itemId);
    if (error) throw error;
  }
}

async function finalizeOperation(args: {
  repo: CorrectionRepository;
  input: CorrectionOperationInput;
  operation_type: CorrectionOperationResult["operation_type"];
  status: CorrectionOperationResult["status"];
  replacement_id?: string | null;
}): Promise<CorrectionOperationResult> {
  const topicIds = await args.repo.getTopicIdsForItem(args.input.item_id);
  const changeLog: CorrectionChangeLogRow = {
    user_id: args.input.user_id,
    operation_type: args.operation_type,
    target_type: "memory_item",
    target_id: args.input.item_id,
    replacement_id: args.replacement_id ?? null,
    source_message_id: args.input.source_message_id ?? null,
    extraction_run_id: args.input.extraction_run_id ?? null,
    reason: args.input.reason,
    metadata: { source: "memory_v2_correction" },
  };
  await args.repo.insertChangeLog(changeLog);
  await args.repo.incrementTopicPendingChanges(topicIds);
  await args.repo.recalculateTopicSensitivityMax?.(topicIds);
  await args.repo.purgePayloadItemForUser(
    args.input.user_id,
    args.input.item_id,
  );
  return {
    item_id: args.input.item_id,
    operation_type: args.operation_type,
    status: args.status,
    purged_payload_item_ids: [args.input.item_id],
    topic_ids: topicIds,
    change_log: changeLog,
  };
}

export async function invalidateMemoryItem(
  repo: CorrectionRepository,
  input: CorrectionOperationInput,
): Promise<CorrectionOperationResult> {
  await repo.updateMemoryItem(input.item_id, {
    status: "invalidated",
    valid_until: input.now_iso ?? new Date().toISOString(),
  });
  return await finalizeOperation({
    repo,
    input,
    operation_type: "invalidate",
    status: "invalidated",
  });
}

export async function supersedeMemoryItem(
  repo: CorrectionRepository,
  input: SupersedeOperationInput,
): Promise<CorrectionOperationResult> {
  await repo.updateMemoryItem(input.item_id, {
    status: "superseded",
    superseded_by_item_id: input.replacement_item_id,
    valid_until: input.now_iso ?? new Date().toISOString(),
  });
  return await finalizeOperation({
    repo,
    input,
    operation_type: "supersede",
    status: "superseded",
    replacement_id: input.replacement_item_id,
  });
}

export async function hideMemoryItem(
  repo: CorrectionRepository,
  input: CorrectionOperationInput,
): Promise<CorrectionOperationResult> {
  await repo.updateMemoryItem(input.item_id, { status: "hidden_by_user" });
  return await finalizeOperation({
    repo,
    input,
    operation_type: "hide",
    status: "hidden_by_user",
  });
}

export async function deleteMemoryItem(
  repo: CorrectionRepository,
  input: CorrectionOperationInput,
): Promise<CorrectionOperationResult> {
  const redactedAt = input.now_iso ?? new Date().toISOString();
  await repo.updateMemoryItem(input.item_id, {
    status: "deleted_by_user",
    content_text: "",
    normalized_summary: "",
    structured_data: {},
    embedding: null,
    canonical_key: null,
    source_hash: null,
    metadata: { redacted_at: redactedAt },
  });
  await repo.redactSourcesForItem?.(input.item_id);
  return await finalizeOperation({
    repo,
    input,
    operation_type: "delete",
    status: "deleted_by_user",
  });
}

export function isCorrectionsEnabled(fallback = false): boolean {
  try {
    const raw = String(
      (globalThis as any)?.Deno?.env?.get?.("memory_v2_corrections_enabled") ??
        "",
    ).trim().toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  } catch {
    return fallback;
  }
}
