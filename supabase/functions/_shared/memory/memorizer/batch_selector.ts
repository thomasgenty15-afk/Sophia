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

function hasCanonicalStructuredExtraction(message: MemorizerMessage): boolean {
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
  return source === "daily_action_review_v1" ||
    source === "daily_action_review" ||
    source === "daily_action_review_clarification" ||
    source === "action_evening_review_v2" ||
    Boolean(daily?.structured_extraction_id);
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
  if (hasCanonicalStructuredExtraction(message)) {
    return { skip: false, reason: null };
  }
  const normalized = normalizeText(message.content);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const signals = detectMemorySignals(message.content);
  const selfBlame = /\b(nul|nulle|tout gacher|rate une action|je me sens)\b/
    .test(normalized);
  const durableShortStatement =
    /\b(mon objectif|j'apprends|j apprends|je veux|je prefere|je préfère|je ne veux pas|ne memorise pas|limite claire|doit etre|doit être|a payer|à payer|avant le \d{1,2}|sujet professionnel|projet personnel|ma cousine|mon cousin|ma soeur|ma sœur|mon frere|mon frère|ma collegue|mon collegue|ma collègue|mon collègue|ma comptable|mon comptable|ma assistante|mon assistant|assistante administrative|assistant administratif|coach de natation|client|client de consulting|contrat|contrats signes|contrats signés|facture|factures impayees|factures impayées|compatible avec mon allergie|compatibles avec mon allergie)\b/
      .test(normalized);
  const important = signals.correction.detected ||
    signals.forget.detected ||
    signals.safety.detected ||
    signals.dated_reference.detected ||
    signals.action_related.detected ||
    signals.explicit_topic_switch.detected ||
    signals.sensitive.detected ||
    signals.high_emotion.detected ||
    signals.cross_topic_profile_query.detected ||
    durableShortStatement ||
    selfBlame;
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
  const max = input.max_batch_size == null
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.floor(input.max_batch_size));
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
    context_messages: context,
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
