/**
 * V2 Memory Retrieval — Contracts, scope classifier, and loader adapter.
 *
 * This module defines the V2-only intention-based memory retrieval contract.
 *
 * Architecture:
 * - 5 canonical MemoryRetrievalContracts (one per MemoryRetrievalIntent)
 * - Scope classifier for the memorizer (determines which layer a new fact belongs to)
 * - Adapter metadata that maps V2 layers to memory_items-based sources
 * - Event payload builders for memory_retrieval_executed_v2 / memory_persisted_v2
 *
 * The runtime loader is the only durable memory retrieval path. Legacy summary
 * tables are not valid sources in this module.
 */

import type {
  MemoryLayerScope,
  MemoryRetrievalContract,
  MemoryRetrievalIntent,
} from "./v2-types.ts";

// ---------------------------------------------------------------------------
// Canonical contracts (section 13.4 + technical-schema 5.7)
// ---------------------------------------------------------------------------

export const V2_MEMORY_CONTRACTS: Record<
  MemoryRetrievalIntent,
  MemoryRetrievalContract
> = {
  answer_user_now: {
    intent: "answer_user_now",
    layers: [
      "cycle",
      "transformation",
      "execution",
      "coaching",
      "relational",
      "event",
    ],
    budget_tier: "full",
    max_tokens_hint: 4000,
  },
  nudge_decision: {
    intent: "nudge_decision",
    layers: ["execution", "relational", "event", "coaching"],
    budget_tier: "light",
    max_tokens_hint: 1200,
  },
  daily_bilan: {
    intent: "daily_bilan",
    layers: ["execution", "coaching", "event"],
    budget_tier: "minimal",
    max_tokens_hint: 600,
  },
  weekly_bilan: {
    intent: "weekly_bilan",
    layers: [
      "cycle",
      "transformation",
      "execution",
      "coaching",
      "event",
    ],
    budget_tier: "medium",
    max_tokens_hint: 2500,
  },
  rendez_vous_or_outreach: {
    intent: "rendez_vous_or_outreach",
    layers: ["event", "relational", "execution"],
    budget_tier: "light",
    max_tokens_hint: 1000,
  },
};

export function getMemoryContract(
  intent: MemoryRetrievalIntent,
): MemoryRetrievalContract {
  return V2_MEMORY_CONTRACTS[intent];
}

// ---------------------------------------------------------------------------
// Layer → table mapping (section 13.3)
// ---------------------------------------------------------------------------

/**
 * Maps each V2 memory layer to memory_items-based query parameters.
 */
export type MemoryLayerSource = {
  layer: MemoryLayerScope;
  /** Concrete per-table query rules. */
  sources: Array<{
    table: "memory_items" | "memory_item_topics" | "memory_item_actions";
    /** V2 field-level filter to apply. */
    filter: { column: string; op: "eq" | "overlaps"; value: string | string[] } | null;
    /** If true, filter by cycle_id. */
    filter_cycle: boolean;
    /** If true, filter by transformation_id. */
    filter_transformation: boolean;
  }>;
};

export const LAYER_SOURCES: Record<MemoryLayerScope, MemoryLayerSource> = {
  cycle: {
    layer: "cycle",
    sources: [{
      table: "memory_items",
      filter: { column: "domain_keys", op: "overlaps", value: ["objectifs.long_terme", "objectifs.transformation"] },
      filter_cycle: true,
      filter_transformation: false,
    }],
  },
  transformation: {
    layer: "transformation",
    sources: [{
      table: "memory_items",
      filter: { column: "domain_keys", op: "overlaps", value: ["objectifs.transformation", "habitudes.execution"] },
      filter_cycle: true,
      filter_transformation: true,
    }],
  },
  execution: {
    layer: "execution",
    sources: [{
      table: "memory_item_topics",
      filter: null,
      filter_cycle: false,
      filter_transformation: true,
    }],
  },
  coaching: {
    layer: "coaching",
    sources: [{
      table: "memory_items",
      filter: { column: "kind", op: "eq", value: "statement" },
      filter_cycle: false,
      filter_transformation: false,
    }],
  },
  relational: {
    layer: "relational",
    sources: [
      {
        table: "memory_items",
        filter: { column: "domain_keys", op: "overlaps", value: ["relations.famille", "relations.couple", "relations.amitie", "relations.conflit", "relations.limites"] },
        filter_cycle: false,
        filter_transformation: false,
      },
    ],
  },
  event: {
    layer: "event",
    sources: [{
      table: "memory_items",
      filter: { column: "kind", op: "eq", value: "event" },
      filter_cycle: false,
      filter_transformation: false,
    }],
  },
};

export function getLayerSources(
  contract: MemoryRetrievalContract,
): MemoryLayerSource[] {
  return contract.layers.map((layer) => LAYER_SOURCES[layer]);
}

// ---------------------------------------------------------------------------
// Scope classifier for the memorizer (section 13.5)
// ---------------------------------------------------------------------------

/**
 * Determines the memory scope for a new fact being persisted.
 *
 * Rules (section 13.5):
 * - Default: "transformation" (most frequent case)
 * - Facts about the whole cycle (North Star, broad priorities): "cycle"
 * - Facts about user preferences/relation: "relational"
 * - In case of doubt: "transformation" is the safest choice
 */
export type MemoryScopeClassifierInput = {
  /** The fact/content being persisted. */
  content: string;
  /** Optional: the LLM-assigned category hint. */
  category_hint?: string | null;
  /** Optional: whether the fact references a specific plan_item. */
  references_plan_item?: boolean;
  /** Optional: whether the fact is about user preferences. */
  is_relational?: boolean;
  /** Optional: whether the fact is about the cycle (not a specific transformation). */
  is_cycle_level?: boolean;
};

export type MemoryScopeClassifierOutput = {
  scope: MemoryLayerScope;
  reason: string;
};

const CYCLE_KEYWORDS = [
  "north star",
  "etoile polaire",
  "étoile polaire",
  "objectif global",
  "enjeu principal",
  "priorit",
  "cycle",
  "grande direction",
  "vision",
];

const RELATIONAL_KEYWORDS = [
  "préfère",
  "prefere",
  "n'aime pas",
  "aime pas",
  "ton",
  "tutoiement",
  "vouvoiement",
  "message court",
  "message long",
  "pression",
  "doux",
  "direct",
  "espace",
  "fermeture",
  "irrité",
  "irrite",
  "agacé",
  "agace",
];

export function classifyMemoryScope(
  input: MemoryScopeClassifierInput,
): MemoryScopeClassifierOutput {
  if (input.is_relational) {
    return { scope: "relational", reason: "explicit_relational_flag" };
  }

  if (input.is_cycle_level) {
    return { scope: "cycle", reason: "explicit_cycle_level_flag" };
  }

  const contentLower = input.content.toLowerCase();
  const categoryLower = (input.category_hint ?? "").toLowerCase();

  if (
    categoryLower.includes("relational") ||
    categoryLower.includes("preference")
  ) {
    return { scope: "relational", reason: "category_hint_relational" };
  }

  if (
    categoryLower.includes("cycle") ||
    categoryLower.includes("north_star") ||
    categoryLower.includes("north star")
  ) {
    return { scope: "cycle", reason: "category_hint_cycle" };
  }

  for (const kw of RELATIONAL_KEYWORDS) {
    if (contentLower.includes(kw)) {
      return { scope: "relational", reason: `keyword_match: ${kw}` };
    }
  }

  for (const kw of CYCLE_KEYWORDS) {
    if (contentLower.includes(kw)) {
      return { scope: "cycle", reason: `keyword_match: ${kw}` };
    }
  }

  if (input.references_plan_item) {
    return { scope: "execution", reason: "references_plan_item" };
  }

  return { scope: "transformation", reason: "default_transformation" };
}

// ---------------------------------------------------------------------------
// Adapter: V2 contract → runtime retrieval plan shape
// ---------------------------------------------------------------------------

/**
 * Budget mapping from V2 contract tiers to V1 loader budget parameters.
 * These values cap the number of results per memory type.
 */
export type V2MemoryBudget = {
  global_max: number;
  topic_max: number;
  event_max: number;
  identity_max: number;
};

const BUDGET_BY_TIER: Record<
  MemoryRetrievalContract["budget_tier"],
  V2MemoryBudget
> = {
  minimal: {
    global_max: 0,
    topic_max: 1,
    event_max: 1,
    identity_max: 0,
  },
  light: {
    global_max: 2,
    topic_max: 1,
    event_max: 1,
    identity_max: 0,
  },
  medium: {
    global_max: 3,
    topic_max: 2,
    event_max: 2,
    identity_max: 0,
  },
  full: {
    global_max: 4,
    topic_max: 3,
    event_max: 2,
    identity_max: 0,
  },
};

export function getBudgetForContract(
  contract: MemoryRetrievalContract,
): V2MemoryBudget {
  return BUDGET_BY_TIER[contract.budget_tier];
}

/**
 * The V2 retrieval plan that GPT's implementation in the loader should follow.
 * This tells the loader *what* to load and *how many* for a given V2 intent.
 */
export type V2RetrievalPlan = {
  intent: MemoryRetrievalIntent;
  layers: MemoryLayerScope[];
  budget: V2MemoryBudget;
  max_tokens_hint: number;
  load_global_memories: boolean;
  load_topic_memories: boolean;
  load_event_memories: boolean;
  load_identity: boolean;
  load_coaching: boolean;
  /** V2 profile layers to prefer when querying memory_items.domain_keys. */
  global_scope_filter: MemoryLayerScope[] | null;
  /** If true, topic joins may prefer active transformation/topic links. */
  topic_filter_transformation: boolean;
};

/**
 * Resolves a V2 intent into a concrete retrieval plan.
 * This is the main entry point for GPT's loader integration.
 */
export function resolveV2RetrievalPlan(
  intent: MemoryRetrievalIntent,
): V2RetrievalPlan {
  const contract = getMemoryContract(intent);
  const budget = getBudgetForContract(contract);
  const layerSet = new Set(contract.layers);

  const hasCycle = layerSet.has("cycle");
  const hasTransformation = layerSet.has("transformation");
  const hasExecution = layerSet.has("execution");
  const hasCoaching = layerSet.has("coaching");
  const hasRelational = layerSet.has("relational");
  const hasEvent = layerSet.has("event");

  const needsGlobalMemories = hasCycle || hasTransformation || hasRelational;

  const globalScopeFilter: MemoryLayerScope[] | null = needsGlobalMemories
    ? [
      ...(hasCycle ? ["cycle" as const] : []),
      ...(hasTransformation ? ["transformation" as const] : []),
      ...(hasRelational ? ["relational" as const] : []),
    ]
    : null;

  return {
    intent,
    layers: contract.layers,
    budget,
    max_tokens_hint: contract.max_tokens_hint,
    load_global_memories: needsGlobalMemories && budget.global_max > 0,
    load_topic_memories: hasExecution && budget.topic_max > 0,
    load_event_memories: hasEvent && budget.event_max > 0,
    // Core identity is intentionally dormant while V2 memory/skills stabilize.
    // Relational memory should come from scoped global memories and events.
    load_identity: false,
    load_coaching: hasCoaching,
    global_scope_filter: globalScopeFilter,
    topic_filter_transformation: hasExecution,
  };
}

// ---------------------------------------------------------------------------
// Event payload builders (for V2 event logging)
// ---------------------------------------------------------------------------
// Canonical payload types are defined in v2-events.ts — re-exported here
// for convenience of memory module consumers.

import type {
  MemoryPersistedPayload,
  MemoryRetrievalExecutedPayload,
} from "./v2-events.ts";

export type { MemoryPersistedPayload, MemoryRetrievalExecutedPayload };

export function buildRetrievalExecutedPayload(args: {
  userId: string;
  cycleId: string | null;
  transformationId: string | null;
  plan: V2RetrievalPlan;
  tokensUsed: number;
  hitCount: number;
  layersLoaded?: MemoryLayerScope[];
}): MemoryRetrievalExecutedPayload {
  return {
    user_id: args.userId,
    cycle_id: args.cycleId,
    transformation_id: args.transformationId,
    intent: args.plan.intent,
    layers_loaded: args.layersLoaded ?? args.plan.layers,
    tokens_used: args.tokensUsed,
    hit_count: args.hitCount,
    budget_tier: V2_MEMORY_CONTRACTS[args.plan.intent].budget_tier,
  };
}

export function buildPersistedPayload(args: {
  userId: string;
  cycleId: string | null;
  transformationId: string | null;
  scope: MemoryLayerScope;
  action: MemoryPersistedPayload["action"];
  memoryType: MemoryPersistedPayload["memory_type"];
  memoryId: string | null;
}): MemoryPersistedPayload {
  return {
    user_id: args.userId,
    cycle_id: args.cycleId,
    transformation_id: args.transformationId,
    layer: args.scope,
    action: args.action,
    memory_type: args.memoryType,
    memory_id: args.memoryId,
  };
}
