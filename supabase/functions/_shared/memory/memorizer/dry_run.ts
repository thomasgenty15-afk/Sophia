import {
  buildMessageProcessingRows,
  selectMemorizerBatch,
} from "./batch_selector.ts";
import { dedupeMemoryItems } from "./dedupe.ts";
import {
  type ExtractionLlmProvider,
  extractMemoryCandidates,
} from "./extract.ts";
import { linkMemoryItemToAction } from "./link_action.ts";
import { linkMemoryItemToEntities } from "./link_entity.ts";
import { linkMemoryItemToTopic } from "./link_topic.ts";
import {
  completeDryRunExtraction,
  failExtractionRun,
  type MemorizerPersistRepository,
} from "./persist.ts";
import { resolveEntities } from "./entity_resolver.ts";
import type {
  DryRunCandidate,
  KnownEntity,
  KnownMemoryItem,
  KnownTopic,
  MemorizerMessage,
  PlanSignal,
} from "./types.ts";
import { MEMORY_EXTRACTION_MODEL_DEFAULT } from "./types.ts";
import { validateExtractionPayload } from "./validate.ts";

export interface MemorizerDryRunInput {
  user_id: string;
  messages: MemorizerMessage[];
  already_processed_primary_ids?: string[];
  known_topics?: KnownTopic[];
  known_entities?: KnownEntity[];
  existing_memory_items?: KnownMemoryItem[];
  active_topic?: KnownTopic | null;
  plan_signals?: PlanSignal[];
  trigger_type?: string;
  model_name?: string;
  llm_provider?: ExtractionLlmProvider;
}

export interface MemorizerDryRunResult {
  status: "completed" | "skipped";
  extraction_run_id: string | null;
  batch_hash: string;
  dry_run_candidates: DryRunCandidate[];
  durable_writes: { memory_items: 0 };
}

export function isMemorizerDryRunEnabled(fallback = false): boolean {
  try {
    const raw = String(
      (globalThis as any)?.Deno?.env?.get?.(
        "memory_v2_memorizer_dry_run_enabled",
      ) ?? "",
    ).trim().toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  } catch {
    return fallback;
  }
}

export async function runMemorizerDryRunIfEnabled(
  repo: MemorizerPersistRepository,
  input: MemorizerDryRunInput,
): Promise<MemorizerDryRunResult | null> {
  if (!isMemorizerDryRunEnabled(false)) return null;
  return await runMemorizerDryRun(repo, input);
}

export async function runMemorizerDryRun(
  repo: MemorizerPersistRepository,
  input: MemorizerDryRunInput,
): Promise<MemorizerDryRunResult> {
  const started = Date.now();
  const batch = await selectMemorizerBatch({
    messages: input.messages,
    already_processed_primary_ids: input.already_processed_primary_ids,
    model_name: input.model_name ?? MEMORY_EXTRACTION_MODEL_DEFAULT,
  });
  const existingRun = await repo.findExtractionRun({
    user_id: input.user_id,
    batch_hash: batch.batch_hash,
    prompt_version: batch.prompt_version,
  });
  if (existingRun?.status === "completed") {
    return {
      status: "skipped",
      extraction_run_id: existingRun.id,
      batch_hash: batch.batch_hash,
      dry_run_candidates: [],
      durable_writes: { memory_items: 0 },
    };
  }

  const run = existingRun ?? await repo.createExtractionRun({
    user_id: input.user_id,
    batch_hash: batch.batch_hash,
    prompt_version: batch.prompt_version,
    model_name: batch.model_name,
    trigger_type: input.trigger_type ?? "chat_batch",
    input_message_ids: batch.primary_messages.map((m) => m.id),
    metadata: { dry_run: true },
  });
  try {
    await repo.insertMessageProcessing(buildMessageProcessingRows({
      user_id: input.user_id,
      extraction_run_id: run.id,
      batch,
    }));
    if (batch.primary_messages.length === 0) {
      await completeDryRunExtraction(repo, {
        run_id: run.id,
        duration_ms: Date.now() - started,
        dry_run_candidates: [],
        rejected_observations: batch.skipped_noise_messages.map((m) => ({
          reason: "small_talk",
          text: m.content,
        })),
        proposed_entity_count: 0,
        accepted_entity_count: 0,
        statement_as_fact_violation_count: 0,
      });
      return {
        status: "completed",
        extraction_run_id: run.id,
        batch_hash: batch.batch_hash,
        dry_run_candidates: [],
        durable_writes: { memory_items: 0 },
      };
    }
    const extraction = await extractMemoryCandidates({
      messages: batch.primary_messages,
      context_messages: batch.context_messages,
      active_topic: input.active_topic,
      known_topics: input.known_topics,
      known_entities: input.known_entities,
      injected_memory_items: input.existing_memory_items,
      plan_signals: input.plan_signals,
    }, {
      llm_provider: input.llm_provider,
      model_name: batch.model_name,
      user_id: input.user_id,
    });
    const validation = validateExtractionPayload(
      extraction,
      batch.primary_messages,
    );
    const entityDecisions = resolveEntities(
      validation.accepted_entities,
      input.known_entities ?? [],
    );
    const dedupe = dedupeMemoryItems(
      validation.accepted_items,
      input.existing_memory_items ?? [],
    );
    const candidates = dedupe.map((decision): DryRunCandidate => {
      const topicLink = linkMemoryItemToTopic({
        item: decision.item,
        active_topic: input.active_topic,
        known_topics: input.known_topics,
      });
      const entityLinks = linkMemoryItemToEntities({
        item: decision.item,
        resolved_entities: entityDecisions,
      });
      return {
        item: decision.item,
        dedupe: decision,
        topic_link: topicLink,
        entity_links: entityLinks,
        action_link: linkMemoryItemToAction({
          item: decision.item,
          plan_signals: input.plan_signals,
        }),
        status: decision.decision === "reject_duplicate"
          ? "rejected"
          : "accepted_dry_run",
        rejection_reason: decision.decision === "reject_duplicate"
          ? decision.reason
          : null,
      };
    });
    await completeDryRunExtraction(repo, {
      run_id: run.id,
      duration_ms: Date.now() - started,
      dry_run_candidates: candidates,
      rejected_observations: validation.rejected_observations,
      proposed_entity_count: extraction.entities.length,
      accepted_entity_count: entityDecisions.filter((d) =>
        d.decision === "reuse" || d.decision === "create_candidate"
      ).length,
      statement_as_fact_violation_count:
        validation.statement_as_fact_violation_count,
      cost: { estimated_llm_calls: 1, model_name: batch.model_name },
    });
    return {
      status: "completed",
      extraction_run_id: run.id,
      batch_hash: batch.batch_hash,
      dry_run_candidates: candidates,
      durable_writes: { memory_items: 0 },
    };
  } catch (error) {
    await failExtractionRun(repo, run.id, error, Date.now() - started);
    throw error;
  }
}
