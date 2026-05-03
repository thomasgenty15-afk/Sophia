import type {
  MemoryItemKind,
  RetrievalHint,
  RetrievalMode,
  SensitivityLevel,
} from "../types.v1.ts";
import { DOMAIN_KEYS_V1 } from "../domain_keys.ts";
import type {
  MemoryV2LoaderPlan,
  MemoryV2LoaderScope,
} from "./dispatcher_plan_adapter.ts";

export interface MemoryV2Item {
  id: string;
  user_id?: string;
  kind: MemoryItemKind;
  content_text: string;
  status: string;
  importance_score?: number | null;
  observed_at?: string | null;
  domain_keys?: string[] | null;
  sensitivity_level?: SensitivityLevel | null;
  topic_ids?: string[];
  search_doc?: string | null;
}

export interface MemoryV2Entity {
  id: string;
  user_id?: string;
  display_name: string;
  aliases?: string[] | null;
  status: string;
}

export interface MemoryV2Payload {
  retrieval_mode: RetrievalMode;
  hints: RetrievalHint[];
  topic_id: string | null;
  items: MemoryV2Item[];
  entities: MemoryV2Entity[];
  modules: Record<string, unknown>;
  metrics: {
    load_ms: number;
    sensitive_excluded_count: number;
    invalid_injection_simulated_count: number;
    fallback_used: boolean;
  };
}

export interface LoadMemoryV2PayloadInput {
  supabase: unknown;
  user_id: string;
  retrieval_mode: RetrievalMode;
  hints?: RetrievalHint[];
  active_topic_id?: string | null;
  message?: string;
  temporal_window?: {
    resolved_start_at: string;
    resolved_end_at: string;
  } | null;
  limit?: number;
  loader_plan?: MemoryV2LoaderPlan | null;
}

export function assertOnlyActiveMemoryItems(items: MemoryV2Item[]): void {
  const invalid = items.filter((item) => item.status !== "active");
  if (invalid.length > 0) {
    throw new Error(
      `memory_v2_loader_invalid_item_status:${
        invalid.map((i) => `${i.id}:${i.status}`).join(",")
      }`,
    );
  }
}

export function applySensitivityFilter(args: {
  items: MemoryV2Item[];
  retrieval_mode: RetrievalMode;
  active_topic_id?: string | null;
  requested_sensitive?: boolean;
}): { items: MemoryV2Item[]; excluded_count: number } {
  const out: MemoryV2Item[] = [];
  let excluded = 0;
  for (const item of args.items) {
    const level = item.sensitivity_level ?? "normal";
    const inActiveTopic = Boolean(
      args.active_topic_id && item.topic_ids?.includes(args.active_topic_id),
    );
    const allowed = level === "normal" ||
      (level === "sensitive" &&
        (inActiveTopic || args.requested_sensitive ||
          args.retrieval_mode === "safety_first")) ||
      (level === "safety" && args.retrieval_mode === "safety_first");
    if (allowed) out.push(item);
    else excluded++;
  }
  return { items: out, excluded_count: excluded };
}

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const DOMAIN_KEYWORDS: Array<[string, RegExp]> = [
  ["relations.couple", /\b(rupture|couple|ex|lina|relation|amour)\b/],
  ["relations.famille", /\b(famille|pere|mere|frere|soeur|parents)\b/],
  ["relations.conflit", /\b(conflit|dispute|humilie|reproche)\b/],
  ["travail.conflits", /\b(travail|manager|reunion|collegue|humilie|chef)\b/],
  ["travail.charge", /\b(charge|burnout|deadline|pression)\b/],
  ["habitudes.execution", /\b(routine|habitude|fait|rate|manque|marche)\b/],
  ["habitudes.procrastination", /\b(procrastin|repousse|evite|retarde)\b/],
  ["sante.sommeil", /\b(dormir|dors|sommeil|insomnie|nuit)\b/],
  ["sante.activite_physique", /\b(sport|marche|courir|entrainement)\b/],
  ["addictions.cannabis", /\b(cannabis|joint|weed|fumer)\b/],
  ["addictions.alcool", /\b(alcool|boire|cuite|verre)\b/],
  ["psychologie.estime_de_soi", /\b(nul|nulle|incapable|honte|valeur)\b/],
  ["psychologie.emotions", /\b(peur|colere|triste|angoisse|panique)\b/],
  ["psychologie.discipline", /\b(discipline|tenir|constance|routine)\b/],
];

export function mapTextToDomainKeys(text: string): string[] {
  const normalized = normalize(text);
  const keys = DOMAIN_KEYWORDS
    .filter(([key, re]) => DOMAIN_KEYS_V1.has(key) && re.test(normalized))
    .map(([key]) => key);
  return [...new Set(keys)];
}

function expandGlobalKeysToDomainKeys(keys: string[]): string[] {
  const out: string[] = [];
  for (const raw of keys) {
    const key = String(raw ?? "").trim();
    if (!key) continue;
    if (DOMAIN_KEYS_V1.has(key)) out.push(key);
    for (const domainKey of DOMAIN_KEYS_V1) {
      if (domainKey.startsWith(`${key}.`)) out.push(domainKey);
    }
  }
  return [...new Set(out)];
}

function overlapScore(a: string[] = [], b: string[] = []): number {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  let overlap = 0;
  for (const value of b) if (set.has(value)) overlap++;
  return overlap / Math.max(a.length, b.length);
}

function semanticScore(message: string, item: MemoryV2Item): number {
  const left = new Set(
    normalize(message).split(/\W+/).filter((t) => t.length > 2),
  );
  const right = new Set(
    normalize(`${item.content_text} ${item.search_doc ?? ""}`).split(/\W+/)
      .filter((t) => t.length > 2),
  );
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / (left.size + right.size - overlap);
}

export function mergeAndRerankCrossTopicItems(args: {
  message: string;
  domain_keys: string[];
  semantic_items: MemoryV2Item[];
  domain_items: MemoryV2Item[];
  topic_boost_ids?: string[];
  limit?: number;
}): MemoryV2Item[] {
  const byId = new Map<string, MemoryV2Item>();
  for (const item of [...args.domain_items, ...args.semantic_items]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const topicBoost = new Set(args.topic_boost_ids ?? []);
  return [...byId.values()]
    .map((item) => ({
      item,
      score: overlapScore(args.domain_keys, item.domain_keys ?? []) * 0.45 +
        semanticScore(args.message, item) * 0.4 +
        (topicBoost.size && item.topic_ids?.some((id) => topicBoost.has(id))
          ? 0.15
          : 0) +
        Math.min(0.1, Number(item.importance_score ?? 0) / 100),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, args.limit ?? 8))
    .map((entry) => entry.item);
}

async function runQuery<T>(query: unknown): Promise<T[]> {
  if (!query || typeof (query as any).then !== "function") return [];
  const { data, error } = await query as { data?: T[]; error?: unknown };
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadTopicItems(
  supabase: any,
  userId: string,
  topicId: string,
  limit: number,
): Promise<MemoryV2Item[]> {
  const rows = await runQuery<any>(
    supabase
      .from("memory_item_topics")
      .select("memory_items(*)")
      .eq("topic_id", topicId)
      .limit(limit),
  );
  return rows
    .map((row) => row.memory_items)
    .filter(Boolean)
    .filter((item) => String(item.user_id ?? "") === userId)
    .map((item) => ({ ...item, topic_ids: [topicId] }));
}

async function loadTopicEntities(
  supabase: any,
  userId: string,
  topicId: string,
  limit: number,
): Promise<MemoryV2Entity[]> {
  const rows = await runQuery<any>(
    supabase
      .from("memory_item_topics")
      .select("memory_item_entities(user_entities(*))")
      .eq("topic_id", topicId)
      .limit(limit * 3),
  );
  const byId = new Map<string, MemoryV2Entity>();
  for (const row of rows) {
    const links = Array.isArray(row.memory_item_entities)
      ? row.memory_item_entities
      : [];
    for (const link of links) {
      const entity = link.user_entities;
      if (
        entity?.id && entity.user_id === userId && entity.status === "active"
      ) {
        byId.set(entity.id, entity);
      }
    }
  }
  return [...byId.values()].slice(0, limit);
}

export async function loadMemoryV2Payload(
  input: LoadMemoryV2PayloadInput,
): Promise<MemoryV2Payload> {
  const started = Date.now();
  const supabase = input.supabase as any;
  const plan = input.loader_plan ?? null;
  const limit = Math.max(
    0,
    Math.min(12, input.limit ?? plan?.budget.max_items ?? 8),
  );
  const defaultScopes: MemoryV2LoaderScope[] = input.retrieval_mode ===
      "cross_topic_lookup"
    ? ["global"]
    : input.retrieval_mode === "safety_first"
    ? ["topic", "event"]
    : ["topic"];
  if (input.hints?.includes("dated_reference")) defaultScopes.push("event");
  if (input.hints?.includes("action_related")) defaultScopes.push("action");
  const scopes = new Set<MemoryV2LoaderScope>(
    plan ? plan.requested_scopes : defaultScopes,
  );
  let items: MemoryV2Item[] = [];
  let entities: MemoryV2Entity[] = [];
  let fallbackUsed = false;

  if (plan && !plan.enabled) {
    return {
      retrieval_mode: input.retrieval_mode,
      hints: input.hints ?? [],
      topic_id: input.active_topic_id ?? null,
      items: [],
      entities: [],
      modules: { loader_plan: { reason: plan.reason } },
      metrics: {
        load_ms: Date.now() - started,
        sensitive_excluded_count: 0,
        invalid_injection_simulated_count: 0,
        fallback_used: false,
      },
    };
  }

  if (
    scopes.has("topic") && input.retrieval_mode === "topic_continuation" &&
    input.active_topic_id
  ) {
    items = await loadTopicItems(
      supabase,
      input.user_id,
      input.active_topic_id,
      Math.min(limit, plan?.budget.topic_items ?? limit),
    );
    if (scopes.has("entity") || scopes.has("topic")) {
      entities = await loadTopicEntities(
        supabase,
        input.user_id,
        input.active_topic_id,
        plan?.budget.max_entities ?? 5,
      );
    }
  }

  if (scopes.has("global") || input.retrieval_mode === "cross_topic_lookup") {
    const domainKeys = [
      ...mapTextToDomainKeys(input.message ?? ""),
      ...expandGlobalKeysToDomainKeys(plan?.global_keys ?? []),
    ];
    const domainItems = domainKeys.length
      ? await runQuery<MemoryV2Item>(
        supabase
          .from("memory_items")
          .select("*")
          .eq("user_id", input.user_id)
          .eq("status", "active")
          .overlaps("domain_keys", domainKeys)
          .limit(Math.min(limit, plan?.budget.global_items ?? limit)),
      )
      : [];
    fallbackUsed = domainItems.length === 0;
    const semanticItems = await runQuery<MemoryV2Item>(
      supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", input.user_id)
        .eq("status", "active")
        .limit(Math.min(limit, plan?.budget.global_items ?? limit)),
    );
    items = [
      ...items,
      ...mergeAndRerankCrossTopicItems({
        message: input.message ?? "",
        domain_keys: domainKeys,
        domain_items: domainItems,
        semantic_items: semanticItems,
        limit: Math.min(limit, plan?.budget.global_items ?? limit),
      }),
    ];
  }

  if (input.retrieval_mode === "safety_first") {
    items = [
      ...items,
      ...await runQuery<MemoryV2Item>(
        supabase
          .from("memory_items")
          .select("*")
          .eq("user_id", input.user_id)
          .eq("status", "active")
          .in("sensitivity_level", ["safety", "sensitive"])
          .limit(
            Math.min(limit || 4, plan?.budget.topic_items ?? (limit || 4)),
          ),
      ),
    ];
  }

  if (scopes.has("event") && input.temporal_window) {
    const dated = await runQuery<MemoryV2Item>(
      supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", input.user_id)
        .eq("status", "active")
        .eq("kind", "event")
        .gte("observed_at", input.temporal_window.resolved_start_at)
        .lt("observed_at", input.temporal_window.resolved_end_at)
        .limit(Math.min(4, plan?.budget.event_items ?? 4)),
    );
    items = [...items, ...dated];
  } else if (scopes.has("event")) {
    const events = await runQuery<MemoryV2Item>(
      supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", input.user_id)
        .eq("status", "active")
        .eq("kind", "event")
        .limit(Math.min(3, plan?.budget.event_items ?? 3)),
    );
    items = [...items, ...events];
  }
  if (scopes.has("action")) {
    const actionItems = await runQuery<MemoryV2Item>(
      supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", input.user_id)
        .eq("status", "active")
        .eq("kind", "action_observation")
        .limit(Math.min(4, plan?.budget.action_items ?? 4)),
    );
    items = [...items, ...actionItems];
  }

  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];
  assertOnlyActiveMemoryItems(deduped);
  const filtered = applySensitivityFilter({
    items: deduped,
    retrieval_mode: input.retrieval_mode,
    active_topic_id: input.active_topic_id,
    requested_sensitive: input.retrieval_mode === "safety_first",
  });
  return {
    retrieval_mode: input.retrieval_mode,
    hints: input.hints ?? [],
    topic_id: input.active_topic_id ?? null,
    items: filtered.items.slice(0, limit),
    entities: entities.slice(0, plan?.budget.max_entities ?? 5),
    modules: plan
      ? {
        loader_plan: {
          reason: plan.reason,
          requested_scopes: plan.requested_scopes,
          dispatcher_memory_plan_applied: plan.dispatcher_memory_plan_applied,
        },
      }
      : {},
    metrics: {
      load_ms: Date.now() - started,
      sensitive_excluded_count: filtered.excluded_count,
      invalid_injection_simulated_count: 0,
      fallback_used: fallbackUsed,
    },
  };
}

export function payloadJaccard(leftIds: string[], rightIds: string[]): number {
  const left = new Set(leftIds.filter(Boolean));
  const right = new Set(rightIds.filter(Boolean));
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const id of left) if (right.has(id)) intersection++;
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}
