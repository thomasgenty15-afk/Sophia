import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { detectMemorySignals } from "./signal_detection.ts";
import { resolveTemporalReferences } from "./temporal_resolution.ts";
import { routeTopic, type TopicRouterTopic } from "./topic_router.ts";
import {
  readActiveTopicStateV2,
  updateActiveTopicStateV2,
  writeActiveTopicStateV2,
} from "./active_topic_state.ts";
import { loadMemoryV2Payload, payloadJaccard } from "./loader.ts";
import {
  readMemoryPayloadStateV2,
  updateMemoryPayloadStateV2,
  writeMemoryPayloadStateV2,
} from "./payload_state.ts";
import { logMemoryObservabilityEvent } from "../../memory-observability.ts";

export interface MemoryV2ShadowInput {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  channel?: "web" | "whatsapp" | null;
  requestId?: string | null;
  turnId?: string | null;
  userMessage: string;
  history?: any[];
  tempMemory: Record<string, unknown>;
  userTime?: { user_timezone?: string | null } | null;
  v1?: {
    context_load_ms?: number | null;
    retrieval_mode?: string | null;
    active_topic_id?: string | null;
    payload_item_ids?: string[];
  };
  flags?: {
    loader_shadow_enabled?: boolean;
    trace_enabled?: boolean;
  };
}

export interface MemoryV2ShadowResult {
  tempMemory: Record<string, unknown>;
  retrieval_mode: string;
  topic_decision: string;
  active_topic_id: string | null;
  payload_item_ids: string[];
  metrics: {
    topic_decision_match: string;
    payload_jaccard: number;
    latency_delta_ms: number | null;
    invalid_injection_simulated_count: number;
    total_ms: number;
  };
}

function envFlag(name: string, fallback = false): boolean {
  try {
    const raw = String((globalThis as any)?.Deno?.env?.get?.(name) ?? "")
      .trim()
      .toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  } catch {
    return fallback;
  }
}

async function loadTopicsForShadow(
  supabase: SupabaseClient,
  userId: string,
  activeTopicId: string | null,
): Promise<
  { active: TopicRouterTopic | null; candidates: TopicRouterTopic[] }
> {
  const { data } = await (supabase as any)
    .from("user_topic_memories")
    .select(
      "id,topic_slug,title,lifecycle_stage,search_doc,search_doc_embedding,updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(8);
  const rows = Array.isArray(data) ? data : [];
  const map = (row: any): TopicRouterTopic => ({
    id: String(row.id),
    slug: row.topic_slug ?? null,
    title: String(row.title ?? row.topic_slug ?? "topic"),
    search_doc: row.search_doc ?? null,
    lifecycle_stage: row.lifecycle_stage ?? null,
    embedding: Array.isArray(row.search_doc_embedding)
      ? row.search_doc_embedding
      : null,
  });
  const topics = rows.map(map);
  return {
    active: topics.find((topic) => topic.id === activeTopicId) ?? topics[0] ??
      null,
    candidates: topics.filter((topic) => topic.id !== activeTopicId).slice(
      0,
      6,
    ),
  };
}

function compareTopic(
  v1Active: string | null | undefined,
  v2Active: string | null,
): string {
  if (!v1Active && !v2Active) return "none";
  if (!v1Active) return "v2_only";
  if (!v2Active) return "v1_only";
  return v1Active === v2Active ? "same" : "diff";
}

export async function runMemoryV2Shadow(
  input: MemoryV2ShadowInput,
): Promise<MemoryV2ShadowResult | null> {
  const loaderEnabled = input.flags?.loader_shadow_enabled ??
    envFlag("memory_v2_loader_shadow_enabled", false);
  const traceEnabled = input.flags?.trace_enabled ??
    envFlag("memory_v2_runtime_trace_enabled", false);
  if (!loaderEnabled && !traceEnabled) return null;

  const started = Date.now();
  const signals = detectMemorySignals(input.userMessage);
  const temporal = signals.dated_reference.detected
    ? resolveTemporalReferences(input.userMessage, {
      timezone: input.userTime?.user_timezone ?? "Europe/Paris",
    })
    : [];
  let tempMemory = { ...(input.tempMemory ?? {}) };
  const activeState = readActiveTopicStateV2(tempMemory);
  const topics = await loadTopicsForShadow(
    input.supabase,
    input.userId,
    activeState.active_topic_id,
  );
  const routed = await routeTopic({
    message: input.userMessage,
    retrieval_mode: signals.retrieval_mode,
    signals,
    active_topic: topics.active,
    candidate_topics: topics.candidates,
    recent_messages: (input.history ?? [])
      .slice(-5)
      .map((m) => String(m?.content ?? m ?? "")),
  });
  const nextActive = updateActiveTopicStateV2(activeState, {
    active_topic_id: routed.active_topic_id,
    active_topic_slug: routed.active_topic_slug,
    confidence: routed.confidence,
    candidate_topic_ids: routed.shortlist.map((topic) => topic.id),
    last_decision: routed.decision,
    last_decision_reason: routed.reason,
  });
  tempMemory = writeActiveTopicStateV2(tempMemory, nextActive);

  let payloadIds: string[] = [];
  let invalidCount = 0;
  let loaderMs = 0;
  if (loaderEnabled) {
    const payload = await loadMemoryV2Payload({
      supabase: input.supabase,
      user_id: input.userId,
      retrieval_mode: signals.retrieval_mode,
      hints: signals.retrieval_hints,
      active_topic_id: routed.active_topic_id,
      message: input.userMessage,
      temporal_window: temporal[0] ?? null,
    });
    payloadIds = payload.items.map((item) => item.id);
    invalidCount = payload.metrics.invalid_injection_simulated_count;
    loaderMs = payload.metrics.load_ms;
    const previousPayload = readMemoryPayloadStateV2(tempMemory);
    const nextPayload = updateMemoryPayloadStateV2({
      previous: previousPayload,
      turn_id: input.turnId ?? null,
      active_topic_id: routed.active_topic_id,
      injected_items: payload.items.map((item) => ({
        memory_item_id: item.id,
        reason: signals.retrieval_mode === "cross_topic_lookup"
          ? "cross_topic"
          : signals.retrieval_mode === "safety_first"
          ? "safety"
          : "active_topic_core",
        sensitivity_level: item.sensitivity_level ?? "normal",
      })),
      injected_entities: payload.entities.map((entity) => ({
        entity_id: entity.id,
        reason: "topic_anchor",
      })),
    });
    tempMemory = writeMemoryPayloadStateV2(tempMemory, nextPayload);
  }

  const totalMs = Date.now() - started;
  const latencyDelta = typeof input.v1?.context_load_ms === "number"
    ? totalMs - input.v1.context_load_ms
    : null;
  const jaccard = payloadJaccard(input.v1?.payload_item_ids ?? [], payloadIds);
  const topicMatch = compareTopic(
    input.v1?.active_topic_id ?? null,
    routed.active_topic_id,
  );

  await logMemoryObservabilityEvent({
    supabase: input.supabase,
    userId: input.userId,
    requestId: input.requestId,
    turnId: input.turnId,
    channel: input.channel ?? null,
    scope: input.scope,
    sourceComponent: "memory_v2_runtime_shadow",
    eventName: "memory.runtime.shadow.comparison",
    payload: {
      metrics: {
        "memory.runtime.shadow.topic_decision_match": topicMatch,
        "memory.runtime.shadow.payload_jaccard": jaccard,
        "memory.runtime.shadow.latency_delta_ms": latencyDelta,
        "memory.runtime.shadow.invalid_injection_simulated_count": invalidCount,
      },
      v2: {
        retrieval_mode: signals.retrieval_mode,
        retrieval_hints: signals.retrieval_hints,
        topic_decision: routed.decision,
        active_topic_id: routed.active_topic_id,
        topic_confidence: routed.confidence,
        payload_item_count: payloadIds.length,
        router_llm_used: routed.llm_used,
        temporal,
        loader_ms: loaderMs,
        total_ms: totalMs,
      },
      v1: input.v1 ?? null,
    },
  });

  return {
    tempMemory,
    retrieval_mode: signals.retrieval_mode,
    topic_decision: routed.decision,
    active_topic_id: routed.active_topic_id,
    payload_item_ids: payloadIds,
    metrics: {
      topic_decision_match: topicMatch,
      payload_jaccard: jaccard,
      latency_delta_ms: latencyDelta,
      invalid_injection_simulated_count: invalidCount,
      total_ms: totalMs,
    },
  };
}
