import {
  buildMessageProcessingRows,
  selectMemorizerBatch,
} from "./batch_selector.ts";
import {
  isMemorizerWriteEnabled,
  memorizerCostCapUserDayEur,
} from "./controls.ts";
import { buildStructuredActionObservationItems } from "./action_observations.ts";
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
  completeAsyncMemorizerExtraction,
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

export interface MemorizerAsyncInput {
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

export interface MemorizerAsyncResult {
  status: "completed" | "skipped";
  skip_reason?: string | null;
  extraction_run_id: string | null;
  batch_hash: string | null;
  write_decisions: WriteDecision[];
  persisted: PersistedMemoryWrite[];
}

function structuredDailySourceMessageIds(
  messages: MemorizerMessage[],
): string[] {
  return messages.flatMap((message) => {
    const metadata = message.metadata && typeof message.metadata === "object"
      ? message.metadata as Record<string, unknown>
      : {};
    const source = String(
      metadata.structured_extraction_source ??
        metadata.source ??
        metadata.chat_capability ??
        "",
    ).trim();
    const daily = metadata.daily_action_review_v1 &&
        typeof metadata.daily_action_review_v1 === "object"
      ? metadata.daily_action_review_v1 as Record<string, unknown>
      : null;
    const isDaily = source === "daily_action_review_v1" ||
      source === "daily_action_review" ||
      source === "daily_action_review_clarification" ||
      source === "action_evening_review_v2" ||
      Boolean(daily?.structured_extraction_id);
    return isDaily ? [message.id] : [];
  });
}

export async function runMemorizerAsyncIfEnabled(
  repo: MemorizerPersistRepository,
  input: MemorizerAsyncInput,
): Promise<MemorizerAsyncResult | null> {
  if (!isMemorizerWriteEnabled(true)) return null;
  return await runMemorizerAsync(repo, input);
}

export async function runMemorizerAsync(
  repo: MemorizerPersistRepository,
  input: MemorizerAsyncInput,
): Promise<MemorizerAsyncResult> {
  const started = Date.now();
  const batch = await selectMemorizerBatch({
    messages: input.messages,
    already_processed_primary_ids: input.already_processed_primary_ids,
    model_name: input.model_name ?? MEMORY_EXTRACTION_MODEL_DEFAULT,
    known_entity_aliases: (input.known_entities ?? []).flatMap((entity) => [
      entity.display_name,
      ...(entity.aliases ?? []),
    ]),
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
  // Verrou d'execution (rose-r4 B02, 7 annonces / 14 ecrits): un run = UN
  // executeur. Un run `running` FRAIS appartient a une execution en cours
  // (cron + trigger QA simultanes: les deux chargeaient les memes messages
  // avant que l'un ne persiste → double write sous le meme run_id). Seul un
  // `running` PERIME (> TTL) est un crash a reprendre — c'est le territoire
  // du balayage d'orphelins et de la reprise Z1, inchanges.
  if (existingRun?.status === "running") {
    const startedMs = Date.parse(
      String(existingRun.started_at ?? existingRun.created_at ?? ""),
    );
    const freshMs = 30 * 60_000;
    if (Number.isFinite(startedMs) && Date.now() - startedMs < freshMs) {
      return {
        status: "skipped",
        skip_reason: "run_in_progress",
        extraction_run_id: existingRun.id,
        batch_hash: batch.batch_hash,
        write_decisions: [],
        persisted: [],
      };
    }
  }
  const costCap = memorizerCostCapUserDayEur();
  if (costCap && repo.estimateMemoryCostForUserDay) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const observedCost = await repo.estimateMemoryCostForUserDay(
      input.user_id,
      since,
    );
    if (observedCost >= costCap) {
      const run = existingRun ?? await repo.createExtractionRun({
        user_id: input.user_id,
        batch_hash: batch.batch_hash,
        prompt_version: batch.prompt_version,
        model_name: batch.model_name,
        trigger_type: input.trigger_type ?? "chat_batch",
        input_message_ids: batch.primary_messages.map((m) => m.id),
        metadata: {
          memorizer_v2_async: true,
          cost_cap_eur: costCap,
          observed_cost_eur: observedCost,
        },
      });
      await repo.updateExtractionRun(run.id, {
        status: "skipped",
        finished_at: new Date().toISOString(),
        metadata: {
          ...(run.metadata ?? {}),
          memorizer_v2_async: true,
          skip_reason: "cost_cap_exceeded",
          cost_cap_eur: costCap,
          observed_cost_eur: observedCost,
        },
      });
      return {
        status: "skipped",
        skip_reason: "cost_cap_exceeded",
        extraction_run_id: run.id,
        batch_hash: batch.batch_hash,
        write_decisions: [],
        persisted: [],
      };
    }
  }
  const run = existingRun ?? await repo.createExtractionRun({
    user_id: input.user_id,
    batch_hash: batch.batch_hash,
    prompt_version: batch.prompt_version,
    model_name: batch.model_name,
    trigger_type: input.trigger_type ?? "chat_batch",
    input_message_ids: batch.primary_messages.map((m) => m.id),
    metadata: { memorizer_v2_async: true },
  });
  try {
    if (batch.primary_messages.length === 0) {
      await repo.insertMessageProcessing(buildMessageProcessingRows({
        user_id: input.user_id,
        extraction_run_id: run.id,
        batch,
      }));
      await completeAsyncMemorizerExtraction(repo, {
        run_id: run.id,
        duration_ms: Date.now() - started,
        decisions: [],
        persisted: [],
        rejected_observations: batch.skipped_noise_messages.map((m) => ({
          reason: m.metadata?.anti_noise_reason ?? "noise",
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
    const structuredSourceMessageIds = structuredDailySourceMessageIds(
      batch.primary_messages,
    );
    const structuredActionItems = buildStructuredActionObservationItems({
      source_message_ids: structuredSourceMessageIds,
      plan_signals: input.plan_signals ?? [],
      source: input.trigger_type ?? "memorizer_async",
    });
    const validation = validateExtractionPayload(
      {
        ...extraction,
        memory_items: [
          ...structuredActionItems,
          ...extraction.memory_items,
        ],
      },
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
    // Supersedence intra-lot (alex-r1 B03 / alex-r2 B01): la resolution de
    // cible des corrections ne voyait que les items deja en DB — un fait et
    // sa correction arrivant dans le MEME batch restaient donc tous deux
    // actifs. Les items tout juste persistes deviennent des cibles de
    // correction comme les autres; les garde-fous existants (replacement
    // choisi hors cible, mutatedItemIds) empechent une correction
    // d'invalider sa propre nouvelle verite.
    // Garde anti-auto-invalidation (alex-r3 B04): un item du lot issu du MEME
    // message qu'une correction EST la nouvelle verite de cette correction —
    // il ne doit jamais devenir sa cible (sinon la resolution peut le choisir
    // et, faute de remplacement, l'invalider orphelin `superseded_by=none`).
    const correctionSourceIds = new Set(
      (extraction.corrections ?? []).flatMap((correction) =>
        correction.source_message_ids ?? []
      ),
    );
    const intraBatchKnownItems = persisted
      .filter((write) =>
        !(write.candidate.item.source_message_ids ?? []).some((id) =>
          correctionSourceIds.has(id)
        )
      )
      .map((write) => ({
        id: write.memory_item_id,
        kind: write.candidate.item.kind,
        content_text: write.candidate.item.content_text,
        normalized_summary: write.candidate.item.normalized_summary ?? null,
        canonical_key: write.candidate.item.canonical_key ?? null,
        domain_keys: write.candidate.item.domain_keys ?? null,
        source_message_id: write.candidate.item.source_message_ids?.[0] ?? null,
        status: write.status,
      }));
    const correctionResults = repo.applyCorrections
      ? await repo.applyCorrections({
        user_id: input.user_id,
        extraction_run_id: run.id,
        corrections: extraction.corrections,
        known_memory_items: [
          ...(input.existing_memory_items ?? []),
          ...intraBatchKnownItems,
        ],
        persisted,
      })
      : [];
    // Invariant de transactionnalite (nina-r2/paul-r4/rose-r2, BF-EFFECT-04):
    // les messages ne sont marques `completed` qu'APRES le persist reussi des
    // items. Un worker tue pendant l'extraction (timeout gateway) laisse les
    // messages re-eligibles au batch suivant, qui reutilise le run `running`
    // via batch_hash. La re-execution est idempotente: dedupeMemoryItems
    // rejette les items deja persistes en DB.
    await repo.insertMessageProcessing(buildMessageProcessingRows({
      user_id: input.user_id,
      extraction_run_id: run.id,
      batch,
    }));
    await completeAsyncMemorizerExtraction(repo, {
      run_id: run.id,
      duration_ms: Date.now() - started,
      decisions,
      persisted,
      correction_results: correctionResults,
      rejected_observations: [
        ...batch.skipped_noise_messages.map((m) => ({
          reason: m.metadata?.anti_noise_reason ?? "noise",
          text: m.content,
        })),
        ...validation.rejected_observations,
      ],
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
