import type { TopicDecision } from "../types.v1.ts";

export const ACTIVE_TOPIC_STATE_V2_KEY = "__active_topic_state_v2";
export const ACTIVE_TOPIC_STATE_V1_KEY = "__active_topic_state_v1";

export interface ActiveTopicStateV2 {
  version: 2;
  active_topic_id: string | null;
  active_topic_slug: string | null;
  lifecycle_stage: "candidate" | "durable" | "dormant" | null;
  confidence: number;
  previous_topic_id: string | null;
  candidate_topic_ids: string[];
  last_decision: TopicDecision;
  last_decision_reason: string;
  last_switched_at: string | null;
  router_version: "memory_v2_router_mvp_1";
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function emptyActiveTopicStateV2(
  nowIso = new Date().toISOString(),
): ActiveTopicStateV2 {
  return {
    version: 2,
    active_topic_id: null,
    active_topic_slug: null,
    lifecycle_stage: null,
    confidence: 0,
    previous_topic_id: null,
    candidate_topic_ids: [],
    last_decision: "stay",
    last_decision_reason: "empty",
    last_switched_at: null,
    router_version: "memory_v2_router_mvp_1",
    updated_at: nowIso,
  };
}

function parseState(
  raw: Record<string, unknown>,
  fallback: ActiveTopicStateV2,
): ActiveTopicStateV2 {
  return {
    version: 2,
    active_topic_id: typeof raw.active_topic_id === "string"
      ? raw.active_topic_id
      : null,
    active_topic_slug: typeof raw.active_topic_slug === "string"
      ? raw.active_topic_slug
      : null,
    lifecycle_stage:
      ["candidate", "durable", "dormant"].includes(String(raw.lifecycle_stage))
        ? raw.lifecycle_stage as "candidate" | "durable" | "dormant"
        : null,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0))),
    previous_topic_id: typeof raw.previous_topic_id === "string"
      ? raw.previous_topic_id
      : null,
    candidate_topic_ids: Array.isArray(raw.candidate_topic_ids)
      ? raw.candidate_topic_ids.map(String).filter(Boolean)
      : [],
    last_decision: ["stay", "switch", "create_candidate", "side_note"].includes(
        String(raw.last_decision),
      )
      ? raw.last_decision as TopicDecision
      : fallback.last_decision,
    last_decision_reason: String(
      raw.last_decision_reason ?? fallback.last_decision_reason,
    ),
    last_switched_at: typeof raw.last_switched_at === "string"
      ? raw.last_switched_at
      : null,
    router_version: "memory_v2_router_mvp_1",
    updated_at: typeof raw.updated_at === "string"
      ? raw.updated_at
      : fallback.updated_at,
  };
}

export function readActiveTopicStateV2(
  tempMemory: unknown,
): ActiveTopicStateV2 {
  const fallback = emptyActiveTopicStateV2();
  if (!isRecord(tempMemory)) return fallback;
  const v2 = tempMemory[ACTIVE_TOPIC_STATE_V2_KEY];
  if (isRecord(v2) && v2.version === 2) return parseState(v2, fallback);

  const v1 = tempMemory[ACTIVE_TOPIC_STATE_V1_KEY];
  if (isRecord(v1)) {
    return {
      ...fallback,
      active_topic_id: typeof v1.active_topic_id === "string"
        ? v1.active_topic_id
        : null,
      active_topic_slug: typeof v1.active_topic_slug === "string"
        ? v1.active_topic_slug
        : null,
      confidence: Math.max(0, Math.min(1, Number(v1.confidence ?? 0))),
      last_decision_reason: "migrated_read_from_v1",
    };
  }
  return fallback;
}

export function writeActiveTopicStateV2(
  tempMemory: unknown,
  state: ActiveTopicStateV2,
): Record<string, unknown> {
  return {
    ...(isRecord(tempMemory) ? tempMemory : {}),
    [ACTIVE_TOPIC_STATE_V2_KEY]: state,
  };
}

export function updateActiveTopicStateV2(
  previous: ActiveTopicStateV2,
  patch: Partial<Omit<ActiveTopicStateV2, "version" | "router_version">>,
  nowIso = new Date().toISOString(),
): ActiveTopicStateV2 {
  const switched = patch.active_topic_id !== undefined &&
    patch.active_topic_id !== previous.active_topic_id;
  return {
    ...previous,
    ...patch,
    version: 2,
    router_version: "memory_v2_router_mvp_1",
    previous_topic_id: switched
      ? previous.active_topic_id
      : patch.previous_topic_id ?? previous.previous_topic_id,
    last_switched_at: switched
      ? nowIso
      : patch.last_switched_at ?? previous.last_switched_at,
    updated_at: nowIso,
  };
}
