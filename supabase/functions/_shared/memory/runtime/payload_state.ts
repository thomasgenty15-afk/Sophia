import type { SensitivityLevel } from "../types.v1.ts";

export const MEMORY_PAYLOAD_STATE_V2_KEY = "__memory_payload_state_v2";

export type PayloadItemReason =
  | "active_topic_core"
  | "cross_topic"
  | "dated"
  | "action"
  | "safety"
  | "payload_carryover";

export interface MemoryPayloadStateItem {
  memory_item_id: string;
  reason: PayloadItemReason;
  ttl_turns_remaining: number;
  sensitivity_level: SensitivityLevel;
  last_injected_at: string;
}

export interface MemoryPayloadStateEntity {
  entity_id: string;
  reason: "mentioned_recently" | "topic_anchor";
  ttl_turns_remaining: number;
}

export interface MemoryPayloadStateV2 {
  version: 2;
  last_turn_id: string | null;
  active_topic_id: string | null;
  items: MemoryPayloadStateItem[];
  entities: MemoryPayloadStateEntity[];
  modules: Record<string, unknown>;
  budget: {
    max_items: number;
    max_entities: number;
    tokens_target: number;
  };
}

export interface PayloadStateUpdateInput {
  previous: MemoryPayloadStateV2;
  turn_id: string | null;
  active_topic_id: string | null;
  injected_items?: Array<{
    memory_item_id: string;
    reason: PayloadItemReason;
    sensitivity_level?: SensitivityLevel;
    ttl_turns?: number;
  }>;
  injected_entities?: Array<{
    entity_id: string;
    reason: "mentioned_recently" | "topic_anchor";
    ttl_turns?: number;
  }>;
  purge_item_ids?: string[];
  modules?: Record<string, unknown>;
  now_iso?: string;
}

export function emptyMemoryPayloadStateV2(): MemoryPayloadStateV2 {
  return {
    version: 2,
    last_turn_id: null,
    active_topic_id: null,
    items: [],
    entities: [],
    modules: {},
    budget: { max_items: 12, max_entities: 5, tokens_target: 1800 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readMemoryPayloadStateV2(
  tempMemory: unknown,
): MemoryPayloadStateV2 {
  const raw = isRecord(tempMemory)
    ? tempMemory[MEMORY_PAYLOAD_STATE_V2_KEY]
    : null;
  if (!isRecord(raw) || raw.version !== 2) return emptyMemoryPayloadStateV2();
  const empty = emptyMemoryPayloadStateV2();
  return {
    version: 2,
    last_turn_id: typeof raw.last_turn_id === "string"
      ? raw.last_turn_id
      : null,
    active_topic_id: typeof raw.active_topic_id === "string"
      ? raw.active_topic_id
      : null,
    items: Array.isArray(raw.items)
      ? raw.items.map((item) => ({
        memory_item_id: String(item?.memory_item_id ?? "").trim(),
        reason: String(
          item?.reason ?? "payload_carryover",
        ) as PayloadItemReason,
        ttl_turns_remaining: Math.max(
          0,
          Math.floor(Number(item?.ttl_turns_remaining ?? 0)),
        ),
        sensitivity_level: String(
          item?.sensitivity_level ?? "normal",
        ) as SensitivityLevel,
        last_injected_at: String(item?.last_injected_at ?? ""),
      })).filter((item) => item.memory_item_id && item.ttl_turns_remaining > 0)
      : [],
    entities: Array.isArray(raw.entities)
      ? raw.entities.map((entity) => ({
        entity_id: String(entity?.entity_id ?? "").trim(),
        reason: String(entity?.reason ?? "mentioned_recently") as
          | "mentioned_recently"
          | "topic_anchor",
        ttl_turns_remaining: Math.max(
          0,
          Math.floor(Number(entity?.ttl_turns_remaining ?? 0)),
        ),
      })).filter((entity) => entity.entity_id && entity.ttl_turns_remaining > 0)
      : [],
    modules: isRecord(raw.modules) ? raw.modules : {},
    budget: isRecord(raw.budget)
      ? {
        max_items: Math.max(
          1,
          Math.floor(Number(raw.budget.max_items ?? empty.budget.max_items)),
        ),
        max_entities: Math.max(
          1,
          Math.floor(
            Number(raw.budget.max_entities ?? empty.budget.max_entities),
          ),
        ),
        tokens_target: Math.max(
          100,
          Math.floor(
            Number(raw.budget.tokens_target ?? empty.budget.tokens_target),
          ),
        ),
      }
      : empty.budget,
  };
}

export function writeMemoryPayloadStateV2(
  tempMemory: unknown,
  state: MemoryPayloadStateV2,
): Record<string, unknown> {
  return {
    ...(isRecord(tempMemory) ? tempMemory : {}),
    [MEMORY_PAYLOAD_STATE_V2_KEY]: state,
  };
}

function defaultTtl(level: SensitivityLevel): number {
  if (level === "safety") return 1;
  if (level === "sensitive") return 2;
  return 3;
}

export function updateMemoryPayloadStateV2(
  input: PayloadStateUpdateInput,
): MemoryPayloadStateV2 {
  const nowIso = input.now_iso ?? new Date().toISOString();
  const purge = new Set((input.purge_item_ids ?? []).map(String));
  const byItem = new Map<string, MemoryPayloadStateItem>();
  for (const item of input.previous.items) {
    if (purge.has(item.memory_item_id)) continue;
    const ttl = item.ttl_turns_remaining - 1;
    if (ttl <= 0) continue;
    byItem.set(item.memory_item_id, {
      ...item,
      reason: "payload_carryover",
      ttl_turns_remaining: ttl,
    });
  }
  for (const item of input.injected_items ?? []) {
    const id = String(item.memory_item_id ?? "").trim();
    if (!id || purge.has(id)) continue;
    const sensitivity = item.sensitivity_level ?? "normal";
    byItem.set(id, {
      memory_item_id: id,
      reason: item.reason,
      sensitivity_level: sensitivity,
      ttl_turns_remaining: Math.max(
        1,
        Math.floor(item.ttl_turns ?? defaultTtl(sensitivity)),
      ),
      last_injected_at: nowIso,
    });
  }

  const byEntity = new Map<string, MemoryPayloadStateEntity>();
  for (const entity of input.previous.entities) {
    const ttl = entity.ttl_turns_remaining - 1;
    if (ttl > 0) {
      byEntity.set(entity.entity_id, { ...entity, ttl_turns_remaining: ttl });
    }
  }
  for (const entity of input.injected_entities ?? []) {
    const id = String(entity.entity_id ?? "").trim();
    if (!id) continue;
    byEntity.set(id, {
      entity_id: id,
      reason: entity.reason,
      ttl_turns_remaining: Math.max(1, Math.floor(entity.ttl_turns ?? 3)),
    });
  }

  return {
    ...input.previous,
    last_turn_id: input.turn_id,
    active_topic_id: input.active_topic_id,
    items: [...byItem.values()].slice(0, input.previous.budget.max_items),
    entities: [...byEntity.values()].slice(
      0,
      input.previous.budget.max_entities,
    ),
    modules: { ...input.previous.modules, ...(input.modules ?? {}) },
  };
}

export function purgeMemoryPayloadItems(
  tempMemory: unknown,
  itemIds: string[],
): Record<string, unknown> {
  const previous = readMemoryPayloadStateV2(tempMemory);
  const next = updateMemoryPayloadStateV2({
    previous,
    turn_id: previous.last_turn_id,
    active_topic_id: previous.active_topic_id,
    purge_item_ids: itemIds,
  });
  return writeMemoryPayloadStateV2(tempMemory, next);
}
