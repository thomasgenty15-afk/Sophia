import type {
  DryRunCandidate,
  MemoryExtractionRunRow,
  MessageProcessingRow,
  PersistedMemoryWrite,
  WriteDecision,
} from "./types.ts";
import { maxSensitivityLevel } from "../compaction/sensitivity.ts";

export interface MemorizerPersistRepository {
  findExtractionRun(args: {
    user_id: string;
    batch_hash: string;
    prompt_version: string;
  }): Promise<MemoryExtractionRunRow | null>;
  createExtractionRun(args: {
    user_id: string;
    batch_hash: string;
    prompt_version: string;
    model_name: string;
    trigger_type: string;
    input_message_ids: string[];
    metadata?: Record<string, unknown>;
  }): Promise<MemoryExtractionRunRow>;
  updateExtractionRun(
    runId: string,
    patch: Record<string, unknown>,
  ): Promise<void>;
  insertMessageProcessing(rows: MessageProcessingRow[]): Promise<void>;
  persistMemoryWrites?(args: {
    user_id: string;
    extraction_run_id: string;
    decisions: WriteDecision[];
  }): Promise<PersistedMemoryWrite[]>;
  estimateMemoryCostForUserDay?(
    userId: string,
    sinceIso: string,
  ): Promise<number>;
}

export class SupabaseMemorizerRepository implements MemorizerPersistRepository {
  constructor(private readonly supabase: unknown) {}

  private async markTopicChanged(topicId: string): Promise<void> {
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

  private async recalculateTopicSensitivityMax(topicId: string): Promise<void> {
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

  async findExtractionRun(args: {
    user_id: string;
    batch_hash: string;
    prompt_version: string;
  }): Promise<MemoryExtractionRunRow | null> {
    const { data, error } = await (this.supabase as any)
      .from("memory_extraction_runs")
      .select("*")
      .eq("user_id", args.user_id)
      .eq("batch_hash", args.batch_hash)
      .eq("prompt_version", args.prompt_version)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  async createExtractionRun(args: {
    user_id: string;
    batch_hash: string;
    prompt_version: string;
    model_name: string;
    trigger_type: string;
    input_message_ids: string[];
    metadata?: Record<string, unknown>;
  }): Promise<MemoryExtractionRunRow> {
    const { data, error } = await (this.supabase as any)
      .from("memory_extraction_runs")
      .insert({
        user_id: args.user_id,
        batch_hash: args.batch_hash,
        prompt_version: args.prompt_version,
        model_name: args.model_name,
        trigger_type: args.trigger_type,
        input_message_ids: args.input_message_ids,
        status: "running",
        metadata: args.metadata ?? {},
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async updateExtractionRun(
    runId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("memory_extraction_runs")
      .update(patch)
      .eq("id", runId);
    if (error) throw error;
  }

  async insertMessageProcessing(rows: MessageProcessingRow[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await (this.supabase as any)
      .from("memory_message_processing")
      .upsert(rows, { onConflict: "user_id,message_id,processing_role" });
    if (error) throw error;
  }

  async estimateMemoryCostForUserDay(
    userId: string,
    sinceIso: string,
  ): Promise<number> {
    const { data, error } = await (this.supabase as any)
      .from("memory_observability_events")
      .select("payload")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .limit(2000);
    if (error) throw error;
    return (Array.isArray(data) ? data : []).reduce((sum, row: any) => {
      const payload = row?.payload && typeof row.payload === "object"
        ? row.payload
        : {};
      const cost = payload.cost && typeof payload.cost === "object"
        ? Number(payload.cost.eur ?? 0)
        : Number(payload.cost_eur ?? payload.llm_cost_eur ?? 0);
      return sum + (Number.isFinite(cost) ? cost : 0);
    }, 0);
  }

  async persistMemoryWrites(args: {
    user_id: string;
    extraction_run_id: string;
    decisions: WriteDecision[];
  }): Promise<PersistedMemoryWrite[]> {
    const persisted: PersistedMemoryWrite[] = [];
    for (const decision of args.decisions) {
      if (decision.status === "reject") continue;
      const candidate = decision.candidate;
      const item = candidate.item;
      if (!item.source_message_ids.length) {
        throw new Error("memory_v2_write_missing_source");
      }
      const { data: inserted, error: itemError } = await (this.supabase as any)
        .from("memory_items")
        .insert({
          user_id: args.user_id,
          kind: item.kind,
          status: decision.status,
          content_text: item.content_text,
          normalized_summary: item.normalized_summary,
          domain_keys: item.domain_keys,
          confidence: item.confidence,
          importance_score: item.importance_score ?? 0,
          sensitivity_level: item.sensitivity_level,
          sensitivity_categories: item.sensitivity_categories ?? [],
          requires_user_initiated: item.requires_user_initiated ?? false,
          source_message_id: item.source_message_ids[0],
          source_hash: item.canonical_key,
          event_start_at: item.event_start_at ?? null,
          event_end_at: item.event_end_at ?? null,
          time_precision: item.time_precision ?? null,
          canonical_key: item.canonical_key,
          extraction_run_id: args.extraction_run_id,
          metadata: {
            ...(item.metadata ?? {}),
            created_by: "memorizer_v2",
            prompt_version: "memory.memorizer.extraction.v1",
            write_decision_reason: decision.reason,
          },
        })
        .select("id")
        .single();
      if (itemError) throw itemError;
      const memoryItemId = String(inserted.id);
      const sourceRows = item.source_message_ids.map((sourceMessageId) => ({
        user_id: args.user_id,
        memory_item_id: memoryItemId,
        source_type: "chat_message",
        source_message_id: sourceMessageId,
        evidence_quote: item.evidence_quote ?? null,
        evidence_summary: item.normalized_summary ?? item.content_text,
        extraction_run_id: args.extraction_run_id,
        confidence: item.confidence,
        metadata: { created_by: "memorizer_v2" },
      }));
      const { error: sourceError } = await (this.supabase as any)
        .from("memory_item_sources")
        .upsert(sourceRows, {
          onConflict: "memory_item_id,source_type,source_id,source_message_id",
        });
      if (sourceError) throw sourceError;

      if (candidate.topic_link?.topic_id) {
        const topicId = candidate.topic_link.topic_id;
        const { error } = await (this.supabase as any)
          .from("memory_item_topics")
          .upsert({
            user_id: args.user_id,
            memory_item_id: memoryItemId,
            topic_id: topicId,
            relation_type: candidate.topic_link.relation_type,
            confidence: candidate.topic_link.confidence,
            extraction_run_id: args.extraction_run_id,
            metadata: { created_by: "memorizer_v2" },
          }, { onConflict: "memory_item_id,topic_id,relation_type" });
        if (error) throw error;
        await this.markTopicChanged(topicId);
        await this.recalculateTopicSensitivityMax(topicId);
      }
      for (const link of candidate.entity_links ?? []) {
        if (link.entity_id.startsWith("candidate:")) continue;
        const { error } = await (this.supabase as any)
          .from("memory_item_entities")
          .upsert({
            user_id: args.user_id,
            memory_item_id: memoryItemId,
            entity_id: link.entity_id,
            relation_type: link.relation_type,
            confidence: link.confidence,
            extraction_run_id: args.extraction_run_id,
            metadata: { created_by: "memorizer_v2", mention: link.mention },
          }, { onConflict: "memory_item_id,entity_id,relation_type" });
        if (error) throw error;
      }
      if (candidate.action_link) {
        const { data: actionRow, error } = await (this.supabase as any)
          .from("memory_item_actions")
          .insert({
            user_id: args.user_id,
            memory_item_id: memoryItemId,
            plan_item_id: candidate.action_link.plan_item_id,
            observation_window_start:
              candidate.action_link.observation_window_start,
            observation_window_end:
              candidate.action_link.observation_window_end,
            aggregation_kind: candidate.action_link.aggregation_kind,
            confidence: candidate.action_link.confidence,
            extraction_run_id: args.extraction_run_id,
            metadata: { created_by: "memorizer_v2" },
          })
          .select("id")
          .single();
        if (error) throw error;
        const occurrenceRows = candidate.action_link.occurrence_ids.map((
          id,
        ) => ({
          user_id: args.user_id,
          memory_item_action_id: actionRow.id,
          action_occurrence_id: id,
          metadata: { created_by: "memorizer_v2" },
        }));
        if (occurrenceRows.length > 0) {
          const { error: occError } = await (this.supabase as any)
            .from("memory_item_action_occurrences")
            .upsert(occurrenceRows, {
              onConflict: "memory_item_action_id,action_occurrence_id",
            });
          if (occError) throw occError;
        }
      }
      persisted.push({
        memory_item_id: memoryItemId,
        status: decision.status,
        candidate,
      });
    }
    return persisted;
  }
}

export interface CompleteDryRunInput {
  run_id: string;
  duration_ms: number;
  dry_run_candidates: DryRunCandidate[];
  rejected_observations: unknown[];
  accepted_entity_count: number;
  proposed_entity_count: number;
  statement_as_fact_violation_count: number;
  cost?: Record<string, unknown>;
}

export function buildDryRunCompletionPatch(
  input: CompleteDryRunInput,
): Record<string, unknown> {
  const accepted = input.dry_run_candidates.filter((c) =>
    c.status === "accepted_dry_run" &&
    c.dedupe.decision !== "reject_duplicate"
  );
  const rejected = input.dry_run_candidates.length - accepted.length +
    input.rejected_observations.length;
  return {
    status: "completed",
    proposed_item_count: input.dry_run_candidates.length,
    accepted_item_count: accepted.length,
    rejected_item_count: rejected,
    proposed_entity_count: input.proposed_entity_count,
    accepted_entity_count: input.accepted_entity_count,
    duration_ms: input.duration_ms,
    finished_at: new Date().toISOString(),
    metadata: {
      dry_run: true,
      dry_run_candidates: input.dry_run_candidates,
      rejected_observations: input.rejected_observations,
      statement_as_fact_violation_count:
        input.statement_as_fact_violation_count,
      cost: input.cost ?? null,
      durable_writes: {
        memory_items: 0,
        memory_item_topics: 0,
        memory_item_entities: 0,
        memory_item_actions: 0,
      },
    },
  };
}

export async function completeDryRunExtraction(
  repo: MemorizerPersistRepository,
  input: CompleteDryRunInput,
): Promise<void> {
  await repo.updateExtractionRun(
    input.run_id,
    buildDryRunCompletionPatch(input),
  );
}

export async function failExtractionRun(
  repo: MemorizerPersistRepository,
  runId: string,
  error: unknown,
  durationMs: number,
): Promise<void> {
  await repo.updateExtractionRun(runId, {
    status: "failed",
    error_message: error instanceof Error ? error.message : String(error),
    duration_ms: durationMs,
    finished_at: new Date().toISOString(),
  });
}

export interface CompleteAsyncMemorizerInput {
  run_id: string;
  duration_ms: number;
  decisions: WriteDecision[];
  persisted: PersistedMemoryWrite[];
  rejected_observations: unknown[];
  accepted_entity_count: number;
  proposed_entity_count: number;
  statement_as_fact_violation_count: number;
  cost?: Record<string, unknown>;
}

export function buildAsyncMemorizerCompletionPatch(
  input: CompleteAsyncMemorizerInput,
): Record<string, unknown> {
  const activeCount = input.persisted.filter((p) => p.status === "active")
    .length;
  const candidateCount = input.persisted.filter((p) => p.status === "candidate")
    .length;
  const rejectedCount = input.decisions.filter((d) => d.status === "reject")
    .length + input.rejected_observations.length;
  const preFilterSkipCount =
    input.rejected_observations.filter((observation) =>
      String((observation as any)?.reason ?? "") === "smart_pre_filter"
    ).length;
  return {
    status: "completed",
    proposed_item_count: input.decisions.length,
    accepted_item_count: activeCount + candidateCount,
    rejected_item_count: rejectedCount,
    proposed_entity_count: input.proposed_entity_count,
    accepted_entity_count: input.accepted_entity_count,
    duration_ms: input.duration_ms,
    finished_at: new Date().toISOString(),
    metadata: {
      dry_run: false,
      memorizer_v2_async: true,
      write_decisions: input.decisions,
      persisted_memory_items: input.persisted.map((row) => ({
        memory_item_id: row.memory_item_id,
        status: row.status,
        canonical_key: row.candidate.item.canonical_key,
      })),
      rejected_observations: input.rejected_observations,
      pre_filter_skip_count: preFilterSkipCount,
      statement_as_fact_violation_count:
        input.statement_as_fact_violation_count,
      cost: input.cost ?? null,
      durable_writes: {
        memory_items: activeCount + candidateCount,
        active_items: activeCount,
        candidate_items: candidateCount,
      },
    },
  };
}

export async function completeAsyncMemorizerExtraction(
  repo: MemorizerPersistRepository,
  input: CompleteAsyncMemorizerInput,
): Promise<void> {
  await repo.updateExtractionRun(
    input.run_id,
    buildAsyncMemorizerCompletionPatch(input),
  );
}
