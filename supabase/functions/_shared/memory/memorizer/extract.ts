import { generateWithGemini } from "../../gemini.ts";
import { DOMAIN_KEYS_V1_DEFINITIONS } from "../domain_keys.ts";
import { PROMPT_VERSIONS } from "../prompts/index.ts";
import { resolveTemporalReferences } from "../runtime/temporal_resolution.ts";
import type {
  ExtractedMemoryItem,
  ExtractionPayload,
  KnownEntity,
  KnownMemoryItem,
  KnownTopic,
  MemorizerMessage,
  PlanSignal,
  TemporalHint,
} from "./types.ts";
import {
  MEMORY_EXTRACTION_MODEL_DEFAULT,
  MEMORY_EXTRACTION_PROMPT_VERSION,
} from "./types.ts";

const EXTRACTION_PROMPT_V1 = `
Tu es un extracteur de souvenirs pour Sophia.
Retourne uniquement un JSON strict avec memory_items, entities, corrections et rejected_observations.
Contraintes: source_message_ids obligatoire, pas de diagnostic, pas d'emotion subjective en fact,
kind dans la liste fermee, domain_keys dans la taxonomie fournie, event_start_at obligatoire pour les events.
`.trim();

export interface ExtractionContext {
  messages: MemorizerMessage[];
  context_messages?: MemorizerMessage[];
  active_topic?: KnownTopic | null;
  known_topics?: KnownTopic[];
  known_entities?: KnownEntity[];
  injected_memory_items?: KnownMemoryItem[];
  temporal_hints?: TemporalHint[];
  plan_signals?: PlanSignal[];
  timezone?: string | null;
}

export type ExtractionLlmProvider = (args: {
  system_prompt: string;
  user_payload: string;
  model_name: string;
  prompt_version: string;
}) => Promise<string>;

export function buildExtractionPrompt(ctx: ExtractionContext): {
  system_prompt: string;
  user_payload: string;
} {
  const temporal = ctx.temporal_hints?.length
    ? ctx.temporal_hints
    : ctx.messages.flatMap((message) =>
      resolveTemporalReferences(message.content, {
        timezone: ctx.timezone ?? "Europe/Paris",
      })
    );
  return {
    system_prompt: EXTRACTION_PROMPT_V1,
    user_payload: JSON.stringify({
      prompt_version: PROMPT_VERSIONS.extraction,
      messages: ctx.messages,
      context_messages: ctx.context_messages ?? [],
      active_topic: ctx.active_topic ?? null,
      known_topics: ctx.known_topics ?? [],
      known_entities: ctx.known_entities ?? [],
      injected_memory_items: ctx.injected_memory_items ?? [],
      temporal_resolutions: temporal,
      plan_signals: ctx.plan_signals ?? [],
      domain_keys_taxonomy: DOMAIN_KEYS_V1_DEFINITIONS,
    }),
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseExtractionJson(raw: string): ExtractionPayload {
  let parsed: any;
  try {
    parsed = JSON.parse(String(raw ?? "").trim());
  } catch (error) {
    throw new Error(
      `memory_v2_extraction_invalid_json:${(error as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("memory_v2_extraction_invalid_shape");
  }
  return {
    memory_items: asArray(parsed.memory_items).map((
      item: any,
    ): ExtractedMemoryItem => ({
      kind: item.kind as ExtractedMemoryItem["kind"],
      content_text: String(item.content_text ?? ""),
      normalized_summary: item.normalized_summary == null
        ? null
        : String(item.normalized_summary),
      domain_keys: asArray(item.domain_keys).map(String),
      confidence: Number(item.confidence ?? 0),
      importance_score: Number(item.importance_score ?? 0),
      sensitivity_level:
        (item.sensitivity_level ?? "normal") as ExtractedMemoryItem[
          "sensitivity_level"
        ],
      sensitivity_categories: asArray(item.sensitivity_categories).map(
        String,
      ) as ExtractedMemoryItem["sensitivity_categories"],
      requires_user_initiated: Boolean(item.requires_user_initiated),
      source_message_ids: asArray(item.source_message_ids).map(String),
      evidence_quote: item.evidence_quote == null
        ? null
        : String(item.evidence_quote),
      event_start_at: item.event_start_at == null
        ? null
        : String(item.event_start_at),
      event_end_at: item.event_end_at == null
        ? null
        : String(item.event_end_at),
      time_precision: item.time_precision == null
        ? null
        : String(item.time_precision),
      entity_mentions: asArray(item.entity_mentions).map(String),
      topic_hint: item.topic_hint == null ? null : String(item.topic_hint),
      canonical_key_hint: item.canonical_key_hint == null
        ? null
        : String(item.canonical_key_hint),
      metadata: item.metadata && typeof item.metadata === "object"
        ? item.metadata
        : {},
    })),
    entities: asArray(parsed.entities).map((entity: any) => ({
      entity_type: entity.entity_type ?? "other",
      display_name: String(entity.display_name ?? ""),
      aliases: asArray(entity.aliases).map(String),
      relation_to_user: entity.relation_to_user == null
        ? null
        : String(entity.relation_to_user),
      confidence: Number(entity.confidence ?? 0),
      metadata: entity.metadata && typeof entity.metadata === "object"
        ? entity.metadata
        : {},
    })),
    corrections: asArray(parsed.corrections).map((correction: any) => ({
      operation_type: correction.operation_type,
      target_hint: String(correction.target_hint ?? ""),
      reason: correction.reason == null ? null : String(correction.reason),
      source_message_ids: asArray(correction.source_message_ids).map(String),
    })),
    rejected_observations: asArray(parsed.rejected_observations).map((
      row: any,
    ) => ({
      reason: row.reason ?? "other",
      text: String(row.text ?? ""),
      existing_memory_item_id: row.existing_memory_item_id == null
        ? null
        : String(row.existing_memory_item_id),
      source_message_ids: asArray(row.source_message_ids).map(String),
      metadata: row.metadata && typeof row.metadata === "object"
        ? row.metadata
        : {},
    })),
  };
}

export async function extractMemoryCandidates(
  ctx: ExtractionContext,
  opts: {
    llm_provider?: ExtractionLlmProvider;
    model_name?: string;
    request_id?: string | null;
    user_id?: string | null;
    force_real_ai?: boolean;
  } = {},
): Promise<ExtractionPayload> {
  const modelName = opts.model_name ?? MEMORY_EXTRACTION_MODEL_DEFAULT;
  const prompt = buildExtractionPrompt(ctx);
  const raw = opts.llm_provider
    ? await opts.llm_provider({
      ...prompt,
      model_name: modelName,
      prompt_version: MEMORY_EXTRACTION_PROMPT_VERSION,
    })
    : await generateWithGemini(
      prompt.system_prompt,
      prompt.user_payload,
      0.1,
      true,
      [],
      "json",
      {
        requestId: opts.request_id ?? undefined,
        model: modelName,
        source: "memory-v2:memorizer_extraction",
        userId: opts.user_id ?? undefined,
        forceRealAi: opts.force_real_ai,
        forceInitialModel: true,
      },
    );
  return parseExtractionJson(String(raw));
}
