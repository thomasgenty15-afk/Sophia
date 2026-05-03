import { geminiEmbed, geminiGenerate } from "../../llm.ts";
import { computeTopicSensitivityMax } from "./sensitivity.ts";
import {
  parseTopicCompactionOutput,
  validateTopicCompactionOutput,
} from "./validation.ts";
import type {
  TopicCompactionMemoryItem,
  TopicCompactionOutput,
  TopicCompactionRunResult,
  TopicCompactionTopic,
} from "./types.ts";
import {
  TOPIC_COMPACTION_MODEL_DEFAULT,
  TOPIC_COMPACTION_PROMPT_VERSION,
} from "./types.ts";

export interface TopicCompactionRepository {
  loadTopic(topicId: string): Promise<TopicCompactionTopic | null>;
  loadActiveItemsForTopic(
    topicId: string,
  ): Promise<TopicCompactionMemoryItem[]>;
  updateTopic(topicId: string, patch: Record<string, unknown>): Promise<void>;
}

export interface TopicCompactionProviderInput {
  system_prompt: string;
  user_payload: string;
  model_name: string;
  request_id?: string | null;
}

export type TopicCompactionProvider = (
  input: TopicCompactionProviderInput,
) => Promise<string>;

export type TopicSearchDocEmbedder = (
  text: string,
  requestId?: string | null,
) => Promise<number[]>;

export class SupabaseTopicCompactionRepository
  implements TopicCompactionRepository {
  constructor(private readonly supabase: unknown) {}

  async loadTopic(topicId: string): Promise<TopicCompactionTopic | null> {
    const { data, error } = await (this.supabase as any)
      .from("user_topic_memories")
      .select(
        "id,user_id,title,slug,synthesis,search_doc,summary_version,search_doc_version,pending_changes_count,sensitivity_max,metadata,status,lifecycle_stage",
      )
      .eq("id", topicId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  async loadActiveItemsForTopic(
    topicId: string,
  ): Promise<TopicCompactionMemoryItem[]> {
    const { data, error } = await (this.supabase as any)
      .from("memory_item_topics")
      .select(
        "memory_items(id,user_id,kind,content_text,normalized_summary,status,sensitivity_level,observed_at,source_message_id,importance_score,metadata)",
      )
      .eq("topic_id", topicId)
      .eq("status", "active")
      .limit(80);
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
      .map((row: any) => row.memory_items)
      .filter((item: any) => item?.status === "active")
      .map((item: any) => ({
        id: String(item.id),
        user_id: String(item.user_id),
        kind: item.kind,
        content_text: String(item.content_text ?? ""),
        normalized_summary: item.normalized_summary ?? null,
        status: String(item.status ?? "active"),
        sensitivity_level: item.sensitivity_level ?? "normal",
        observed_at: item.observed_at ?? null,
        source_message_id: item.source_message_id ?? null,
        importance_score: item.importance_score ?? null,
        metadata: item.metadata ?? {},
      }));
  }

  async updateTopic(
    topicId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from("user_topic_memories")
      .update(patch)
      .eq("id", topicId);
    if (error) throw error;
  }
}

function env(name: string, fallback: string): string {
  try {
    const value = String((globalThis as any)?.Deno?.env?.get?.(name) ?? "")
      .trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

export function isTopicCompactionEnabled(fallback = false): boolean {
  try {
    const raw = String(
      (globalThis as any)?.Deno?.env?.get?.(
        "memory_v2_topic_compaction_enabled",
      ) ?? "",
    ).trim().toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  } catch {
    return fallback;
  }
}

function buildSystemPrompt(): string {
  return [
    "Tu produis une compaction de topic Sophia selon memory.compaction.topic.v1.",
    "Retourne uniquement un JSON strict avec synthesis, search_doc, claims, supporting_item_ids, sensitivity_max, warnings.",
    "N'invente rien. Chaque claim important doit citer des supporting_item_ids actifs.",
    "Ne cite jamais litteralement un item sensitive ou safety.",
  ].join("\n");
}

export function buildTopicCompactionUserPayload(args: {
  topic: TopicCompactionTopic;
  items: TopicCompactionMemoryItem[];
  sensitivity_max: string;
}): string {
  return JSON.stringify({
    prompt_version: TOPIC_COMPACTION_PROMPT_VERSION,
    topic: {
      id: args.topic.id,
      title: args.topic.title,
      slug: args.topic.slug ?? null,
      previous_synthesis: args.topic.synthesis ?? "",
      previous_search_doc: args.topic.search_doc ?? "",
      sensitivity_max: args.sensitivity_max,
      pending_changes_count: args.topic.pending_changes_count ?? 0,
    },
    active_items: args.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      content_text: item.content_text,
      normalized_summary: item.normalized_summary ?? null,
      observed_at: item.observed_at ?? null,
      sensitivity_level: item.sensitivity_level,
      source_message_id: item.source_message_id ?? null,
      importance_score: item.importance_score ?? null,
    })),
  });
}

export async function defaultTopicCompactionProvider(
  input: TopicCompactionProviderInput,
): Promise<string> {
  const out = await geminiGenerate({
    systemPrompt: input.system_prompt,
    userMessage: input.user_payload,
    temperature: 0.15,
    jsonMode: true,
    model: input.model_name,
    requestId: input.request_id ?? undefined,
  });
  if (typeof out !== "string") {
    throw new Error("memory_v2_compaction_unexpected_tool_call");
  }
  return out;
}

export async function defaultTopicSearchDocEmbedder(
  text: string,
  requestId?: string | null,
): Promise<number[]> {
  return await geminiEmbed(text, requestId ?? undefined);
}

export function buildTopicCompactionPatch(args: {
  topic: TopicCompactionTopic;
  output: TopicCompactionOutput;
  search_doc_embedding: number[] | null;
  sensitivity_max: string;
  now_iso: string;
}): Record<string, unknown> {
  const metadata = {
    ...(args.topic.metadata ?? {}),
    memory_v2_compaction: {
      prompt_version: TOPIC_COMPACTION_PROMPT_VERSION,
      compacted_at: args.now_iso,
      supporting_item_ids: args.output.supporting_item_ids,
      claims_count: args.output.claims.length,
      warnings: args.output.warnings,
    },
    memory_v2_redaction_pending: false,
  };
  const patch: Record<string, unknown> = {
    synthesis: args.output.synthesis,
    search_doc: args.output.search_doc,
    summary_version: Number(args.topic.summary_version ?? 1) + 1,
    search_doc_version: Number(args.topic.search_doc_version ?? 1) + 1,
    last_compacted_at: args.now_iso,
    pending_changes_count: 0,
    sensitivity_max: args.sensitivity_max,
    metadata,
  };
  if (args.search_doc_embedding) {
    patch.search_doc_embedding = args.search_doc_embedding;
  }
  return patch;
}

export async function compactTopic(
  repo: TopicCompactionRepository,
  args: {
    topic_id: string;
    provider?: TopicCompactionProvider;
    embedder?: TopicSearchDocEmbedder;
    request_id?: string | null;
    now_iso?: string;
    dry_run?: boolean;
    model_name?: string;
  },
): Promise<TopicCompactionRunResult> {
  const topic = await repo.loadTopic(args.topic_id);
  if (!topic) {
    return {
      status: "skipped",
      topic_id: args.topic_id,
      active_item_count: 0,
      sensitivity_max: "normal",
      unsupported_claim_count: 0,
      issues: [{
        code: "empty_output",
        message: "Topic not found.",
      }],
    };
  }
  const items = await repo.loadActiveItemsForTopic(topic.id);
  const sensitivityMax = computeTopicSensitivityMax(items);
  if (items.length === 0) {
    return {
      status: "skipped",
      topic_id: topic.id,
      active_item_count: 0,
      sensitivity_max: sensitivityMax,
      unsupported_claim_count: 0,
      issues: [],
    };
  }

  const provider = args.provider ?? defaultTopicCompactionProvider;
  const modelName = args.model_name ??
    env("MEMORY_V2_COMPACTION_MODEL", TOPIC_COMPACTION_MODEL_DEFAULT);
  const raw = await provider({
    system_prompt: buildSystemPrompt(),
    user_payload: buildTopicCompactionUserPayload({
      topic,
      items,
      sensitivity_max: sensitivityMax,
    }),
    model_name: modelName,
    request_id: args.request_id ?? null,
  });
  let output: TopicCompactionOutput;
  try {
    output = parseTopicCompactionOutput(raw);
  } catch {
    return {
      status: "failed_validation",
      topic_id: topic.id,
      active_item_count: items.length,
      sensitivity_max: sensitivityMax,
      unsupported_claim_count: 1,
      issues: [{
        code: "invalid_json",
        message: "Compaction provider returned invalid JSON.",
      }],
    };
  }

  const validation = validateTopicCompactionOutput({
    output,
    items,
    expected_sensitivity_max: sensitivityMax,
  });
  if (!validation.ok) {
    return {
      status: "failed_validation",
      topic_id: topic.id,
      active_item_count: items.length,
      sensitivity_max: sensitivityMax,
      unsupported_claim_count: validation.unsupported_claim_count,
      issues: validation.issues,
      output,
    };
  }

  const embedding = args.embedder
    ? await args.embedder(output.search_doc, args.request_id ?? null)
    : null;
  const patch = buildTopicCompactionPatch({
    topic,
    output,
    search_doc_embedding: embedding,
    sensitivity_max: sensitivityMax,
    now_iso: args.now_iso ?? new Date().toISOString(),
  });
  if (!args.dry_run) await repo.updateTopic(topic.id, patch);
  return {
    status: "completed",
    topic_id: topic.id,
    active_item_count: items.length,
    sensitivity_max: sensitivityMax,
    unsupported_claim_count: 0,
    issues: [],
    patch,
    output,
  };
}
