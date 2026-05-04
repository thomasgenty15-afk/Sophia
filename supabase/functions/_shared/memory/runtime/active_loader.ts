import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logMemoryObservabilityEvent } from "../../memory-observability.ts";
import { buildMemoryV2LoaderPlan } from "./dispatcher_plan_adapter.ts";
import { detectMemorySignals } from "./signal_detection.ts";
import { resolveTemporalReferences } from "./temporal_resolution.ts";
import { routeTopic, type TopicRouterTopic } from "./topic_router.ts";
import {
  readActiveTopicStateV2,
  updateActiveTopicStateV2,
  writeActiveTopicStateV2,
} from "./active_topic_state.ts";
import { loadMemoryV2Payload, type MemoryV2Payload } from "./loader.ts";
import {
  readMemoryPayloadStateV2,
  updateMemoryPayloadStateV2,
  writeMemoryPayloadStateV2,
} from "./payload_state.ts";

export interface MemoryV2ActiveLoaderInput {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  channel?: "web" | "whatsapp" | null;
  requestId?: string | null;
  turnId?: string | null;
  userMessage: string;
  history?: any[];
  tempMemory: Record<string, unknown>;
  memoryPlan?: unknown;
  userTime?: { user_timezone?: string | null } | null;
  v1?: {
    context_load_ms?: number | null;
    retrieval_mode?: string | null;
    active_topic_id?: string | null;
    payload_item_ids?: string[];
  };
  flags?: {
    loader_enabled?: boolean;
    rollout_percent?: number;
    trace_enabled?: boolean;
  };
}

export interface MemoryV2ActiveLoaderResult {
  tempMemory: Record<string, unknown>;
  context_block: string;
  retrieval_mode: string;
  topic_decision: string;
  active_topic_id: string | null;
  payload_item_ids: string[];
  metrics: {
    load_ms: number;
    total_ms: number;
    sensitive_excluded_count: number;
    invalid_injection_count: number;
    fallback_used: boolean;
    dispatcher_memory_plan_applied: boolean;
    loader_plan_reason: string;
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

function envNumber(name: string, fallback: number): number {
  try {
    const raw = String((globalThis as any)?.Deno?.env?.get?.(name) ?? "")
      .trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function memoryV2RolloutBucket(userId: string): number {
  let hash = 2166136261;
  for (const char of String(userId ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

export function isMemoryV2LoaderActiveForUser(args: {
  user_id: string;
  loader_enabled?: boolean;
  rollout_percent?: number;
}): boolean {
  if (envFlag("memory_v2_loader_disabled", false)) return false;
  if (args.loader_enabled === false) return false;
  return true;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}_timeout_${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadTopicsForActiveLoader(
  supabase: SupabaseClient,
  userId: string,
  activeTopicId: string | null,
): Promise<
  { active: TopicRouterTopic | null; candidates: TopicRouterTopic[] }
> {
  const { data } = await (supabase as any)
    .from("user_topic_memories")
    .select(
      "id,slug,title,lifecycle_stage,search_doc,search_doc_embedding,updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(8);
  const rows = Array.isArray(data) ? data : [];
  const topics = rows.map((row: any): TopicRouterTopic => ({
    id: String(row.id),
    slug: row.slug ?? row.topic_slug ?? null,
    title: String(row.title ?? row.slug ?? row.topic_slug ?? "topic"),
    search_doc: row.search_doc ?? null,
    lifecycle_stage: row.lifecycle_stage ?? null,
    embedding: Array.isArray(row.search_doc_embedding)
      ? row.search_doc_embedding
      : null,
  }));
  return {
    active: topics.find((topic) => topic.id === activeTopicId) ?? topics[0] ??
      null,
    candidates: topics.filter((topic) => topic.id !== activeTopicId).slice(
      0,
      6,
    ),
  };
}

function trimLine(input: unknown, max = 240): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function formatMemoryV2PayloadForPrompt(
  payload: MemoryV2Payload,
): string {
  const lines = [
    "=== MEMOIRE V2 ACTIVE ===",
    `mode=${payload.retrieval_mode}; topic_id=${
      payload.topic_id ?? "none"
    }; hints=${payload.hints.length ? payload.hints.join(",") : "none"}`,
    "Consignes:",
    "- Utilise uniquement ces souvenirs comme contexte memoire durable V2 pour cette reponse.",
    "- Ne revele jamais les ids internes ni les details de provenance.",
    "- Si le contexte est insuffisant ou ambigu, demande une precision au user.",
  ];
  if (payload.items.length > 0) {
    lines.push("Souvenirs:");
    for (const item of payload.items) {
      const tags = [
        item.kind,
        item.sensitivity_level ?? "normal",
        item.observed_at ? `observe=${item.observed_at}` : null,
      ].filter(Boolean).join(" | ");
      lines.push(`- [${tags}] ${trimLine(item.content_text)}`);
    }
  }
  if (payload.entities.length > 0) {
    lines.push("Entites:");
    for (const entity of payload.entities) {
      const aliases = Array.isArray(entity.aliases) && entity.aliases.length > 0
        ? ` (${entity.aliases.map((a) => trimLine(a, 40)).join(", ")})`
        : "";
      lines.push(`- ${trimLine(entity.display_name, 80)}${aliases}`);
    }
  }
  if (payload.items.length === 0 && payload.entities.length === 0) {
    lines.push("Aucun souvenir V2 pertinent charge pour ce tour.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function runMemoryV2ActiveLoader(
  input: MemoryV2ActiveLoaderInput,
): Promise<MemoryV2ActiveLoaderResult | null> {
  if (
    !isMemoryV2LoaderActiveForUser({
      user_id: input.userId,
      loader_enabled: input.flags?.loader_enabled,
      rollout_percent: input.flags?.rollout_percent,
    })
  ) {
    return null;
  }

  const started = Date.now();
  const signals = detectMemorySignals(input.userMessage);
  const loaderPlan = buildMemoryV2LoaderPlan({
    memory_plan: input.memoryPlan as any,
    signals,
  });
  if (!loaderPlan.enabled) {
    const totalMs = Date.now() - started;
    await logMemoryObservabilityEvent({
      supabase: input.supabase,
      userId: input.userId,
      requestId: input.requestId,
      turnId: input.turnId,
      channel: input.channel ?? null,
      scope: input.scope,
      sourceComponent: "memory_v2_runtime_active",
      eventName: "memory.runtime.active.loaded",
      payload: {
        rollout_bucket: memoryV2RolloutBucket(input.userId),
        dispatcher_memory_plan_applied: true,
        dispatcher_memory_mode: loaderPlan.dispatcher_memory_mode,
        dispatcher_context_need: loaderPlan.dispatcher_context_need,
        loader_plan_requested_scopes: loaderPlan.requested_scopes,
        loader_plan_reason: loaderPlan.reason,
        retrieval_mode: loaderPlan.retrieval_mode,
        retrieval_hints: signals.retrieval_hints,
        topic_decision: "skipped",
        active_topic_id: null,
        topic_router_skipped: true,
        payload_item_ids: [],
        payload_item_count: 0,
        sensitive_excluded_count: 0,
        invalid_injection_count: 0,
        fallback_used: false,
        loader_ms: 0,
        total_ms: totalMs,
        v1: input.v1 ?? null,
      },
    });
    return {
      tempMemory: { ...(input.tempMemory ?? {}) },
      context_block: "",
      retrieval_mode: loaderPlan.retrieval_mode,
      topic_decision: "skipped",
      active_topic_id: null,
      payload_item_ids: [],
      metrics: {
        load_ms: 0,
        total_ms: totalMs,
        sensitive_excluded_count: 0,
        invalid_injection_count: 0,
        fallback_used: false,
        dispatcher_memory_plan_applied: true,
        loader_plan_reason: loaderPlan.reason,
      },
    };
  }
  const temporal = signals.dated_reference.detected
    ? resolveTemporalReferences(input.userMessage, {
      timezone: input.userTime?.user_timezone ?? "Europe/Paris",
    })
    : [];
  let tempMemory = { ...(input.tempMemory ?? {}) };
  const activeState = readActiveTopicStateV2(tempMemory);
  let routed: {
    active_topic_id: string | null;
    active_topic_slug?: string | null;
    confidence: number;
    shortlist: TopicRouterTopic[];
    decision: string;
    reason: string;
  } = {
    active_topic_id: activeState.active_topic_id,
    active_topic_slug: activeState.active_topic_slug,
    confidence: activeState.confidence,
    shortlist: [],
    decision: "skipped",
    reason: "dispatcher_plan_no_topic_router",
  };
  if (loaderPlan.requires_topic_router) {
    const topics = await loadTopicsForActiveLoader(
      input.supabase,
      input.userId,
      activeState.active_topic_id,
    );
    const topicRoute = await routeTopic({
      message: input.userMessage,
      retrieval_mode: loaderPlan.retrieval_mode,
      signals,
      active_topic: topics.active,
      candidate_topics: topics.candidates,
      recent_messages: (input.history ?? [])
        .slice(-5)
        .map((m) => String(m?.content ?? m ?? "")),
    });
    routed = topicRoute;
    const nextActive = updateActiveTopicStateV2(activeState, {
      active_topic_id: routed.active_topic_id,
      active_topic_slug: routed.active_topic_slug ?? null,
      confidence: routed.confidence,
      candidate_topic_ids: routed.shortlist.map((topic) => topic.id),
      last_decision: routed.decision as any,
      last_decision_reason: routed.reason,
    });
    tempMemory = writeActiveTopicStateV2(tempMemory, nextActive);
  }

  const timeoutMs = Math.max(
    250,
    envNumber("memory_v2_loader_timeout_ms", 1500),
  );
  const payload = await withTimeout(
    loadMemoryV2Payload({
      supabase: input.supabase,
      user_id: input.userId,
      retrieval_mode: loaderPlan.retrieval_mode,
      hints: signals.retrieval_hints,
      active_topic_id: routed.active_topic_id,
      message: input.userMessage,
      temporal_window: temporal[0] ?? null,
      limit: loaderPlan.budget.max_items,
      loader_plan: loaderPlan,
    }),
    timeoutMs,
    "memory_v2_loader",
  );
  const previousPayload = readMemoryPayloadStateV2(tempMemory);
  const nextPayload = updateMemoryPayloadStateV2({
    previous: previousPayload,
    turn_id: input.turnId ?? null,
    active_topic_id: routed.active_topic_id,
    injected_items: payload.items.map((item) => ({
      memory_item_id: item.id,
      reason: loaderPlan.retrieval_mode === "cross_topic_lookup"
        ? "cross_topic"
        : loaderPlan.retrieval_mode === "safety_first"
        ? "safety"
        : signals.retrieval_hints.includes("dated_reference")
        ? "dated"
        : signals.retrieval_hints.includes("action_related")
        ? "action"
        : "active_topic_core",
      sensitivity_level: item.sensitivity_level ?? "normal",
    })),
    injected_entities: payload.entities.map((entity) => ({
      entity_id: entity.id,
      reason: "topic_anchor",
    })),
  });
  tempMemory = writeMemoryPayloadStateV2(tempMemory, nextPayload);

  const contextBlock = formatMemoryV2PayloadForPrompt(payload);
  const totalMs = Date.now() - started;
  const payloadIds = payload.items.map((item) => item.id);
  await logMemoryObservabilityEvent({
    supabase: input.supabase,
    userId: input.userId,
    requestId: input.requestId,
    turnId: input.turnId,
    channel: input.channel ?? null,
    scope: input.scope,
    sourceComponent: "memory_v2_runtime_active",
    eventName: "memory.runtime.active.loaded",
    payload: {
      rollout_bucket: memoryV2RolloutBucket(input.userId),
      dispatcher_memory_plan_applied: true,
      dispatcher_memory_mode: loaderPlan.dispatcher_memory_mode,
      dispatcher_context_need: loaderPlan.dispatcher_context_need,
      loader_plan_requested_scopes: loaderPlan.requested_scopes,
      loader_plan_reason: loaderPlan.reason,
      retrieval_policy: loaderPlan.retrieval_policy,
      topic_router_skipped: !loaderPlan.requires_topic_router,
      retrieval_mode: loaderPlan.retrieval_mode,
      retrieval_hints: signals.retrieval_hints,
      topic_decision: routed.decision,
      active_topic_id: routed.active_topic_id,
      topic_confidence: routed.confidence,
      payload_item_ids: payloadIds,
      payload_item_count: payloadIds.length,
      sensitive_excluded_count: payload.metrics.sensitive_excluded_count,
      invalid_injection_count:
        payload.metrics.invalid_injection_simulated_count,
      fallback_used: payload.metrics.fallback_used,
      cross_topic_cache_hit: payload.metrics.cross_topic_cache_hit,
      loader_ms: payload.metrics.load_ms,
      total_ms: totalMs,
      v1: input.v1 ?? null,
    },
  });

  return {
    tempMemory,
    context_block: contextBlock,
    retrieval_mode: loaderPlan.retrieval_mode,
    topic_decision: routed.decision,
    active_topic_id: routed.active_topic_id,
    payload_item_ids: payloadIds,
    metrics: {
      load_ms: payload.metrics.load_ms,
      total_ms: totalMs,
      sensitive_excluded_count: payload.metrics.sensitive_excluded_count,
      invalid_injection_count:
        payload.metrics.invalid_injection_simulated_count,
      fallback_used: payload.metrics.fallback_used,
      dispatcher_memory_plan_applied: true,
      loader_plan_reason: loaderPlan.reason,
    },
  };
}
