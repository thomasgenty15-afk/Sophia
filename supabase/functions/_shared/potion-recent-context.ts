import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { geminiEmbed } from "./llm.ts";
import { routeTopic } from "./memory/runtime/topic_router.ts";
import type { TopicRouterTopic } from "./memory/runtime/topic_router.ts";
import { loadMemoryV2Payload } from "./memory/runtime/loader.ts";
import { formatMemoryV2PayloadForPrompt } from "./memory/runtime/active_loader.ts";
import { parseVectorColumn } from "./pgvector.ts";

export type PotionRecentContext = {
  conversation_block: string | null;
  thematic_memory_block: string | null;
  topic_id: string | null;
  topic_confidence: number | null;
  /**
   * True when the theme was routed from the user's OWN potion input with high
   * confidence — a structural consent signal: the user named this subject
   * themselves, so the generation may refer to it soberly even if the
   * underlying memories are sensitivity-guarded. Computed from embeddings
   * only, never from keyword matching.
   */
  user_named_theme: boolean;
};

const RECENT_CONTEXT_BUDGET_MS = 8_000;
const CONVERSATION_MAX_MESSAGES = 20;
const CONVERSATION_FALLBACK_HOURS = 24;
const CONVERSATION_MESSAGE_MAX_CHARS = 600;
// Threshold on the ROUTER scale (topic_router normalizes raw Gemini cosines
// via normalizeCosineToRouterScale). Real calibration of 10/07/2026: vague
// inputs top out at raw 0.639 → ~0.42 normalized; genuinely on-theme inputs
// start at raw 0.679 → ~0.55 normalized. 0.50 splits the two bands.
const THEMATIC_SIMILARITY_THRESHOLD = 0.50;
const THEMATIC_MEMORY_LIMIT = 12;
const TOPIC_CANDIDATE_LIMIT = 8;

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Cursor = the most recent chat message the memorizer has already processed.
 * Everything after it is "the conversation since the last memorizer pass".
 * Falls back to a fixed time window when nothing has been processed yet.
 */
async function resolveSinceCursorIso(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const fallbackIso = new Date(
    Date.now() - CONVERSATION_FALLBACK_HOURS * 3600_000,
  ).toISOString();
  try {
    const { data } = await admin
      .from("memory_message_processing")
      .select("created_at")
      .eq("user_id", userId)
      .eq("processing_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cursor = text((data as Record<string, unknown> | null)?.created_at);
    return cursor || fallbackIso;
  } catch {
    return fallbackIso;
  }
}

async function loadConversationSinceMemorizer(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const sinceIso = await resolveSinceCursorIso(admin, userId);
    const { data } = await admin
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .gt("created_at", sinceIso)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(CONVERSATION_MAX_MESSAGES);

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return null;

    // Fetched newest-first for the cap; present oldest-first for the model.
    const lines = rows
      .reverse()
      .map((row: Record<string, unknown>) => {
        const role = text(row.role) === "assistant" ? "assistant" : "user";
        const content = text(row.content).slice(
          0,
          CONVERSATION_MESSAGE_MAX_CHARS,
        );
        return content ? `[${role}] ${content}` : null;
      })
      .filter((line): line is string => Boolean(line));

    if (lines.length === 0) return null;
    return lines.join("\n");
  } catch {
    return null;
  }
}

async function loadCandidateTopics(
  admin: SupabaseClient,
  userId: string,
): Promise<TopicRouterTopic[]> {
  const { data } = await admin
    .from("user_topic_memories")
    .select("id,slug,title,lifecycle_stage,search_doc,search_doc_embedding,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(TOPIC_CANDIDATE_LIMIT);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row: Record<string, unknown>): TopicRouterTopic => ({
    id: String(row.id),
    slug: (row.slug as string | null) ?? null,
    title: String(row.title ?? row.slug ?? "topic"),
    search_doc: (row.search_doc as string | null) ?? null,
    lifecycle_stage:
      (row.lifecycle_stage as TopicRouterTopic["lifecycle_stage"]) ?? null,
    embedding: parseVectorColumn(row.search_doc_embedding),
  }));
}

/**
 * Vectorize the potion input, route it to the closest memory topic and, only
 * when the match is confident enough, load that theme's durable memory. Gated
 * so a vague input never injects an off-topic theme.
 */
async function loadThematicMemory(
  admin: SupabaseClient,
  userId: string,
  inputText: string,
  requestId: string,
): Promise<{ block: string | null; topicId: string | null; confidence: number | null }> {
  const empty = { block: null, topicId: null, confidence: null };
  if (!inputText.trim()) return empty;
  try {
    const candidates = await loadCandidateTopics(admin, userId);
    if (candidates.length === 0) return empty;

    let embedding: number[] | null = null;
    try {
      embedding = await geminiEmbed(inputText, requestId, {
        source: "activate-potion-v1",
        userId,
        operationName: "memory.potion_input_vectorization",
      });
    } catch {
      embedding = null;
    }

    const noSignal = { detected: false, confidence: 0, terms: [] };
    const routed = await routeTopic({
      message: inputText,
      retrieval_mode: "topic_continuation",
      signals: {
        trivial: noSignal,
        correction: noSignal,
        explicit_topic_switch: noSignal,
        safety: noSignal,
      },
      candidate_topics: candidates,
      message_embedding: embedding,
    });

    // Absolute gate only: on the calibration data, vague inputs top out at
    // ~0.64 while on-theme inputs start at ~0.68. No margin criterion — an
    // input straddling two themes (work + cannabis) keeps two close
    // candidates and must still inject its best topic.
    if (
      !routed.active_topic_id ||
      routed.confidence < THEMATIC_SIMILARITY_THRESHOLD
    ) {
      return { block: null, topicId: null, confidence: routed.confidence };
    }

    const payload = await loadMemoryV2Payload({
      supabase: admin,
      user_id: userId,
      retrieval_mode: "topic_continuation",
      active_topic_id: routed.active_topic_id,
      message: inputText,
      limit: THEMATIC_MEMORY_LIMIT,
    });

    if (!payload || payload.items.length === 0) {
      return {
        block: null,
        topicId: routed.active_topic_id,
        confidence: routed.confidence,
      };
    }

    return {
      block: formatMemoryV2PayloadForPrompt(payload),
      topicId: routed.active_topic_id,
      confidence: routed.confidence,
    };
  } catch {
    return empty;
  }
}

/**
 * Best-effort recent context for a potion activation: the conversation since
 * the last memorizer pass + the durable memory of the closest theme. Never
 * throws — any failure degrades to an empty block so activation still works.
 */
const EMPTY_CONTEXT: PotionRecentContext = {
  conversation_block: null,
  thematic_memory_block: null,
  topic_id: null,
  topic_confidence: null,
  user_named_theme: false,
};

async function withBudget<T>(
  promise: Promise<T>,
  fallback: T,
  budgetMs: number,
): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), budgetMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function loadPotionRecentContext(args: {
  admin: SupabaseClient;
  userId: string;
  inputText: string;
  requestId?: string;
  budgetMs?: number;
}): Promise<PotionRecentContext> {
  const requestId = args.requestId ?? crypto.randomUUID();
  // Best-effort and time-boxed: this context is a nice-to-have enrichment, it
  // must never delay (or break) the potion activation.
  return await withBudget(
    (async () => {
      const [conversationBlock, thematic] = await Promise.all([
        loadConversationSinceMemorizer(args.admin, args.userId),
        loadThematicMemory(args.admin, args.userId, args.inputText, requestId),
      ]);
      return {
        conversation_block: conversationBlock,
        thematic_memory_block: thematic.block,
        topic_id: thematic.topicId,
        topic_confidence: thematic.confidence,
        // The gate only lets through themes routed from the user's own input
        // at high confidence — that routing IS the structural consent signal.
        user_named_theme: Boolean(thematic.block),
      };
    })().catch(() => EMPTY_CONTEXT),
    EMPTY_CONTEXT,
    args.budgetMs ?? RECENT_CONTEXT_BUDGET_MS,
  );
}

export function formatPotionRecentContextForPrompt(
  context: PotionRecentContext | null | undefined,
): string {
  if (!context) return "";
  const parts: string[] = [];
  if (context.conversation_block) {
    parts.push(
      `## Conversation recente (depuis le dernier passage du memorizer)\n\n${context.conversation_block}`,
    );
  }
  if (context.thematic_memory_block) {
    parts.push(
      `## Memoire du theme le plus proche\n\n${context.thematic_memory_block}`,
    );
  }
  if (parts.length === 0) return "";
  const consignes = [
    "Consignes contexte recent:",
    "- utilise ce contexte seulement s'il est pertinent pour l'etat vise par la potion",
    "- ne recopie pas la conversation, sers-t'en pour rendre la potion juste et personnelle",
    "- n'invente rien qui ne soit pas dans ce contexte, la base ou les reponses de l'utilisateur",
  ];
  if (context.user_named_theme && context.thematic_memory_block) {
    consignes.push(
      "- l'utilisateur a NOMME lui-meme ce sujet dans sa demande: tu peux t'y referer sobrement et concretement, meme si les souvenirs sont marques sensibles — c'est precisement le sujet pour lequel il demande de l'aide; ne le sur-dramatise pas et ne le contourne pas par des generalites",
    );
  }
  return [parts.join("\n\n"), "", ...consignes].join("\n");
}

export function buildPotionInputText(
  answers: Record<string, string>,
  freeText: string | null,
): string {
  const answerText = Object.values(answers ?? {})
    .map((value) => text(value))
    .filter(Boolean)
    .join(" — ");
  return [text(freeText), answerText].filter(Boolean).join(" — ");
}
