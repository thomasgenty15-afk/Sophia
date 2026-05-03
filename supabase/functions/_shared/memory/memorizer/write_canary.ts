import {
  buildMessageProcessingRows,
  selectMemorizerBatch,
} from "./batch_selector.ts";
import {
  isMemorizerWriteEnabled,
  isMemoryV2WriteCanaryUser,
} from "./canary.ts";
import { dedupeMemoryItems } from "./dedupe.ts";
import {
  type ExtractionLlmProvider,
  extractMemoryCandidates,
} from "./extract.ts";
import { resolveEntities } from "./entity_resolver.ts";
import { linkMemoryItemToAction } from "./link_action.ts";
import { linkMemoryItemToEntities } from "./link_entity.ts";
import { linkMemoryItemToTopic } from "./link_topic.ts";
import {
  completeWriteCanaryExtraction,
  failExtractionRun,
  type MemorizerPersistRepository,
} from "./persist.ts";
import type {
  DryRunCandidate,
  KnownEntity,
  KnownMemoryItem,
  KnownTopic,
  MemorizerMessage,
  PersistedMemoryWrite,
  PlanSignal,
  WriteDecision,
} from "./types.ts";
import { MEMORY_EXTRACTION_MODEL_DEFAULT } from "./types.ts";
import { validateExtractionPayload } from "./validate.ts";
import { decideInitialWriteStatuses } from "./write_policy.ts";

export interface MemorizerWriteCanaryInput {
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
  canary_percentage?: number;
  llm_provider?: ExtractionLlmProvider;
}

export interface MemorizerWriteCanaryResult {
  status: "completed" | "skipped";
  skip_reason?: string | null;
  extraction_run_id: string | null;
  batch_hash: string | null;
  write_decisions: WriteDecision[];
  persisted: PersistedMemoryWrite[];
}

export async function runMemorizerWriteCanaryIfEnabled(
  repo: MemorizerPersistRepository,
  input: MemorizerWriteCanaryInput,
): Promise<MemorizerWriteCanaryResult | null> {
  if (!isMemorizerWriteEnabled(false)) return null;
  if (
    !await isMemoryV2WriteCanaryUser(
      input.user_id,
      input.canary_percentage ?? 5,
    )
  ) {
    return {
      status: "skipped",
      skip_reason: "outside_canary",
      extraction_run_id: null,
      batch_hash: null,
      write_decisions: [],
      persisted: [],
    };
  }
  return await runMemorizerWriteCanary(repo, input);
}

export async function runMemorizerWriteCanary(
  repo: MemorizerPersistRepository,
  input: MemorizerWriteCanaryInput,
): Promise<MemorizerWriteCanaryResult> {
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
      skip_reason: "completed_batch_hash",
      extraction_run_id: existingRun.id,
      batch_hash: batch.batch_hash,
      write_decisions: [],
      persisted: [],
    };
  }
  const run = existingRun ?? await repo.createExtractionRun({
    user_id: input.user_id,
    batch_hash: batch.batch_hash,
    prompt_version: batch.prompt_version,
    model_name: batch.model_name,
    trigger_type: input.trigger_type ?? "chat_batch",
    input_message_ids: batch.primary_messages.map((m) => m.id),
    metadata: { write_canary: true },
  });
  try {
    await repo.insertMessageProcessing(buildMessageProcessingRows({
      user_id: input.user_id,
      extraction_run_id: run.id,
      batch,
    }));
    if (batch.primary_messages.length === 0) {
      await completeWriteCanaryExtraction(repo, {
        run_id: run.id,
        duration_ms: Date.now() - started,
        decisions: [],
        persisted: [],
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
        write_decisions: [],
        persisted: [],
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
    const decisions = decideInitialWriteStatuses(candidates);
    const persisted = repo.persistMemoryWrites
      ? await repo.persistMemoryWrites({
        user_id: input.user_id,
        extraction_run_id: run.id,
        decisions,
      })
      : [];
    await completeWriteCanaryExtraction(repo, {
      run_id: run.id,
      duration_ms: Date.now() - started,
      decisions,
      persisted,
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
      write_decisions: decisions,
      persisted,
    };
  } catch (error) {
    await failExtractionRun(repo, run.id, error, Date.now() - started);
    throw error;
  }
}
