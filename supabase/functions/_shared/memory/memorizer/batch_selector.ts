import { detectMemorySignals } from "../runtime/signal_detection.ts";
import {
  type MemorizerMessage,
  MEMORY_EXTRACTION_MODEL_DEFAULT,
  MEMORY_EXTRACTION_PROMPT_VERSION,
  type MessageProcessingRow,
} from "./types.ts";
import { normalizeText, sha256Hex } from "./utils.ts";

export interface BatchSelectorInput {
  messages: MemorizerMessage[];
  already_processed_primary_ids?: string[];
  max_batch_size?: number;
  prompt_version?: string;
  model_name?: string;
  known_entity_aliases?: string[];
}

export interface SelectedMemorizerBatch {
  primary_messages: MemorizerMessage[];
  skipped_noise_messages: MemorizerMessage[];
  context_messages: MemorizerMessage[];
  batch_hash: string;
  prompt_version: string;
  model_name: string;
}

const PURE_ACK =
  /^(ok|okay|merci|oui|non|super|parfait|top|cool|grave|done|fait|ca marche|d'accord)[.!? ]*$/i;

function mentionsKnownEntity(content: string, aliases: string[]): boolean {
  const normalized = normalizeText(content);
  return aliases.some((alias) => {
    const value = normalizeText(alias);
    return value.length >= 2 && normalized.includes(value);
  });
}

export function classifyAntiNoise(
  message: MemorizerMessage,
  aliases: string[] = [],
): {
  skip: boolean;
  reason: string | null;
} {
  if (message.role !== "user") {
    return { skip: true, reason: "non_user_message" };
  }
  const normalized = normalizeText(message.content);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const signals = detectMemorySignals(message.content);
  const important = signals.correction.detected ||
    signals.forget.detected ||
    signals.safety.detected ||
    signals.dated_reference.detected ||
    signals.action_related.detected ||
    signals.explicit_topic_switch.detected ||
    signals.sensitive.detected ||
    signals.high_emotion.detected ||
    signals.cross_topic_profile_query.detected;
  if (!normalized) return { skip: true, reason: "empty" };
  if (PURE_ACK.test(normalized)) return { skip: true, reason: "pure_ack" };
  if (
    wordCount < 15 &&
    !important &&
    !mentionsKnownEntity(message.content, aliases)
  ) {
    return { skip: true, reason: "smart_pre_filter" };
  }
  if (/^[\p{Emoji_Presentation}\s]+$/u.test(message.content.trim())) {
    return { skip: true, reason: "emoji_only" };
  }
  if (/^(salut|hello|coucou|bonjour|bonsoir)[.!? ]*$/i.test(normalized)) {
    return { skip: true, reason: "small_talk" };
  }
  return { skip: false, reason: null };
}

export async function selectMemorizerBatch(
  input: BatchSelectorInput,
): Promise<SelectedMemorizerBatch> {
  const promptVersion = input.prompt_version ??
    MEMORY_EXTRACTION_PROMPT_VERSION;
  const modelName = input.model_name ?? MEMORY_EXTRACTION_MODEL_DEFAULT;
  const already = new Set(input.already_processed_primary_ids ?? []);
  const max = Math.max(1, Math.min(20, input.max_batch_size ?? 8));
  const primary: MemorizerMessage[] = [];
  const skipped: MemorizerMessage[] = [];
  const context: MemorizerMessage[] = [];

  for (const message of input.messages) {
    if (message.role !== "user") {
      context.push(message);
      continue;
    }
    if (already.has(message.id)) continue;
    const noise = classifyAntiNoise(message, input.known_entity_aliases ?? []);
    if (noise.skip) {
      skipped.push({
        ...message,
        metadata: {
          ...(message.metadata ?? {}),
          anti_noise_reason: noise.reason,
        },
      });
      continue;
    }
    if (primary.length < max) primary.push(message);
    else context.push(message);
  }

  const sortedIds = primary.map((m) => m.id).sort();
  const batchHash = await sha256Hex(
    JSON.stringify({ sortedIds, promptVersion, modelName }),
  );
  return {
    primary_messages: primary,
    skipped_noise_messages: skipped,
    context_messages: context.slice(-8),
    batch_hash: batchHash,
    prompt_version: promptVersion,
    model_name: modelName,
  };
}

export function buildMessageProcessingRows(args: {
  user_id: string;
  extraction_run_id: string;
  batch: SelectedMemorizerBatch;
}): MessageProcessingRow[] {
  const shared = {
    user_id: args.user_id,
    extraction_run_id: args.extraction_run_id,
    prompt_version: args.batch.prompt_version,
    model_name: args.batch.model_name,
  };
  return [
    ...args.batch.primary_messages.map((message): MessageProcessingRow => ({
      ...shared,
      message_id: message.id,
      processing_role: "primary",
      processing_status: "completed",
      metadata: { source: "memorizer_v2" },
    })),
    ...args.batch.context_messages.map((message): MessageProcessingRow => ({
      ...shared,
      message_id: message.id,
      processing_role: "context_only",
      processing_status: "completed",
      metadata: { source: "memorizer_v2" },
    })),
    ...args.batch.skipped_noise_messages.map((
      message,
    ): MessageProcessingRow => ({
      ...shared,
      message_id: message.id,
      processing_role: "skipped_noise",
      processing_status: "skipped",
      metadata: {
        source: "memorizer_v2",
        anti_noise_reason: message.metadata?.anti_noise_reason ?? "noise",
      },
    })),
  ];
}

export async function loadAlreadyProcessedPrimaryIds(
  supabase: unknown,
  userId: string,
  messageIds: string[],
): Promise<string[]> {
  if (!messageIds.length) return [];
  const { data, error } = await (supabase as any)
    .from("memory_message_processing")
    .select("message_id")
    .eq("user_id", userId)
    .eq("processing_role", "primary")
    .eq("processing_status", "completed")
    .in("message_id", messageIds);
  if (error) throw error;
  return Array.isArray(data) ? data.map((row) => String(row.message_id)) : [];
}
