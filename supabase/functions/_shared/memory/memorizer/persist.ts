import type {
  DryRunCandidate,
  ExtractedCorrection,
  MemoryExtractionRunRow,
  MessageProcessingRow,
  PersistedMemoryWrite,
  WriteDecision,
  KnownMemoryItem,
} from "./types.ts";
import { maxSensitivityLevel } from "../compaction/sensitivity.ts";
import {
  deleteMemoryItem,
  hideMemoryItem,
  invalidateMemoryItem,
  SupabaseCorrectionRepository,
  supersedeMemoryItem,
} from "../correction/operations.ts";
import { resolveCorrectionTarget } from "../correction/target_resolver.ts";
import type { CorrectionOperationResult } from "../correction/types.ts";

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
  applyCorrections?(args: {
    user_id: string;
    extraction_run_id: string;
    corrections: ExtractedCorrection[];
    known_memory_items: KnownMemoryItem[];
    persisted: PersistedMemoryWrite[];
  }): Promise<Array<CorrectionOperationResult | {
    operation_type: string;
    status: "skipped";
    reason: string;
    target_hint: string;
  }>>;
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
            metadata: {
              created_by: "memorizer_v2",
              ...(candidate.action_link.metadata ?? {}),
              action_family_key: candidate.action_link.action_family_key ?? null,
            },
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

  async applyCorrections(args: {
    user_id: string;
    extraction_run_id: string;
    corrections: ExtractedCorrection[];
    known_memory_items: KnownMemoryItem[];
    persisted: PersistedMemoryWrite[];
  }): Promise<Array<CorrectionOperationResult | {
    operation_type: string;
    status: "skipped";
    reason: string;
    target_hint: string;
  }>> {
    if (args.corrections.length === 0) return [];
    const repo = new SupabaseCorrectionRepository(this.supabase);
    const results: Array<CorrectionOperationResult | {
      operation_type: string;
      status: "skipped";
      reason: string;
      target_hint: string;
    }> = [];
    const mutatedItemIds = new Set<string>();
    for (const correction of args.corrections) {
      const resolution = resolveCorrectionTarget({
        user_message: correction.target_hint,
        candidates: args.known_memory_items.map((item) => ({
          ...item,
          user_id: args.user_id,
          status: item.status ?? "active",
          topic_ids: item.topic_ids ?? undefined,
        })),
      });
      const resolvedTarget = resolution.target_item_id &&
          !mutatedItemIds.has(resolution.target_item_id)
        ? resolution.target_item_id
        : null;
      const fallbackTarget = selectCorrectionTargetFallback(
        resolution.candidates,
        mutatedItemIds,
      );
      const targetItemId = resolvedTarget ?? fallbackTarget?.item_id ??
        null;
      if (!targetItemId || (resolution.needs_confirmation && !fallbackTarget)) {
        results.push({
          operation_type: correction.operation_type,
          status: "skipped",
          reason: resolution.reason || "target_needs_confirmation",
          target_hint: correction.target_hint,
        });
        continue;
      }
      const source_message_id = correction.source_message_ids[0] ?? null;
      const reason = correction.reason ?? correction.target_hint;
      if (correction.operation_type === "supersede") {
        const replacement = selectCorrectionReplacement({
          correction,
          target_item_id: targetItemId,
          persisted: args.persisted,
        });
        if (!replacement) {
          results.push(await invalidateMemoryItem(repo, {
            user_id: args.user_id,
            item_id: targetItemId,
            reason,
            source_message_id,
            extraction_run_id: args.extraction_run_id,
          }));
          continue;
        }
        results.push(await supersedeMemoryItem(repo, {
          user_id: args.user_id,
          item_id: targetItemId,
          replacement_item_id: replacement.memory_item_id,
          reason,
          source_message_id,
          extraction_run_id: args.extraction_run_id,
        }));
        mutatedItemIds.add(targetItemId);
        for (const conflict of selectRelatedCorrectionConflicts({
          correction,
          target_item_id: targetItemId,
          replacement,
          known_memory_items: args.known_memory_items,
          mutated_item_ids: mutatedItemIds,
        })) {
          results.push(await supersedeMemoryItem(repo, {
            user_id: args.user_id,
            item_id: conflict.id,
            replacement_item_id: replacement.memory_item_id,
            reason: `${reason} (related_conflict)`,
            source_message_id,
            extraction_run_id: args.extraction_run_id,
          }));
          mutatedItemIds.add(conflict.id);
        }
        continue;
      }
      if (correction.operation_type === "invalidate") {
        results.push(await invalidateMemoryItem(repo, {
          user_id: args.user_id,
          item_id: targetItemId,
          reason,
          source_message_id,
          extraction_run_id: args.extraction_run_id,
        }));
        mutatedItemIds.add(targetItemId);
        continue;
      }
      if (correction.operation_type === "hide") {
        results.push(await hideMemoryItem(repo, {
          user_id: args.user_id,
          item_id: targetItemId,
          reason,
          source_message_id,
          extraction_run_id: args.extraction_run_id,
        }));
        mutatedItemIds.add(targetItemId);
        continue;
      }
      if (correction.operation_type === "delete") {
        results.push(await deleteMemoryItem(repo, {
          user_id: args.user_id,
          item_id: targetItemId,
          reason,
          source_message_id,
          extraction_run_id: args.extraction_run_id,
        }));
        mutatedItemIds.add(targetItemId);
      }
    }
    return results;
  }
}

function normalizeCorrectionText(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s._:-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function correctionTokenScore(left: string, right: string): number {
  const leftTokens = new Set(
    normalizeCorrectionText(left).split(/\s+/).filter((token) => token.length > 2),
  );
  const rightTokens = new Set(
    normalizeCorrectionText(right).split(/\s+/).filter((token) => token.length > 2),
  );
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function correctionTokenSet(input: string): Set<string> {
  return new Set(
    normalizeCorrectionText(input).split(/\s+/).filter((token) => token.length > 2),
  );
}

function correctionTokenOverlap(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function selectCorrectionTargetFallback(
  candidates: Array<{ item_id: string; score: number; reason: string }>,
  excludeItemIds: Set<string>,
): { item_id: string; score: number; reason: string } | null {
  const available = candidates.filter((candidate) =>
    !excludeItemIds.has(candidate.item_id)
  );
  const best = available[0] ?? null;
  if (!best || best.score < 0.5) return null;
  const second = available[1] ?? null;
  if (second && best.score - second.score < 0.15) return null;
  return best;
}

function selectRelatedCorrectionConflicts(args: {
  correction: ExtractedCorrection;
  target_item_id: string;
  replacement: PersistedMemoryWrite;
  known_memory_items: KnownMemoryItem[];
  mutated_item_ids: Set<string>;
}): KnownMemoryItem[] {
  const staleTokens = correctionTokenSet(args.correction.target_hint);
  const replacementTokens = correctionTokenSet(
    `${args.replacement.candidate.item.content_text} ${
      args.replacement.candidate.item.normalized_summary ?? ""
    }`,
  );
  if (staleTokens.size === 0 || replacementTokens.size === 0) return [];
  return args.known_memory_items.filter((item) => {
    if (item.id === args.target_item_id) return false;
    if (item.id === args.replacement.memory_item_id) return false;
    if (args.mutated_item_ids.has(item.id)) return false;
    if ((item.status ?? "active") !== "active") return false;
    const itemTokens = correctionTokenSet(
      `${item.content_text} ${item.normalized_summary ?? ""}`,
    );
    const staleOverlap = correctionTokenOverlap(staleTokens, itemTokens);
    const replacementOverlap = correctionTokenOverlap(
      replacementTokens,
      itemTokens,
    );
    return staleOverlap >= 2 && replacementOverlap >= 2;
  });
}

function selectCorrectionReplacement(args: {
  correction: ExtractedCorrection;
  target_item_id: string;
  persisted: PersistedMemoryWrite[];
}): PersistedMemoryWrite | null {
  const query = `${args.correction.target_hint} ${args.correction.reason ?? ""}`;
  const ranked = args.persisted
    .filter((row) => row.memory_item_id !== args.target_item_id)
    .filter((row) => row.status === "active")
    .map((row) => ({
      row,
      score: correctionTokenScore(
        query,
        `${row.candidate.item.content_text} ${row.candidate.item.normalized_summary ?? ""}`,
      ),
    }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.row ?? null;
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
  correction_results?: unknown[];
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
      correction_results: input.correction_results ?? [],
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
