import type { RetrievalMode } from "../types.v1.ts";
import type { DetectedSignals } from "./signal_detection.ts";

export type MemoryV2LoaderScope =
  | "topic"
  | "event"
  | "global"
  | "action"
  | "entity";

export type MemoryV2RetrievalPolicy =
  | "force_taxonomy"
  | "taxonomy_first"
  | "semantic_first"
  | "semantic_only";

export interface MemoryV2LoaderPlan {
  enabled: boolean;
  reason: string;
  retrieval_mode: RetrievalMode;
  budget: {
    max_items: number;
    max_entities: number;
    topic_items: number;
    event_items: number;
    global_items: number;
    action_items: number;
  };
  requested_scopes: MemoryV2LoaderScope[];
  topic_targets: string[];
  event_queries: string[];
  global_keys: string[];
  retrieval_policy: MemoryV2RetrievalPolicy;
  requires_topic_router: boolean;
  dispatcher_memory_plan_applied: true;
  dispatcher_memory_mode: string;
  dispatcher_context_need: string;
}

type DispatcherPlanLike =
  | {
    context_need?: string | null;
    memory_mode?: string | null;
    context_budget_tier?: string | null;
    response_intent?: string | null;
    targets?:
      | Array<{
        type?: string | null;
        key?: string | null;
        query_hint?: string | null;
        retrieval_policy?: string | null;
        expansion_policy?: string | null;
      }>
      | null;
  }
  | null
  | undefined;

const BUDGETS: Record<string, MemoryV2LoaderPlan["budget"]> = {
  tiny: {
    max_items: 0,
    max_entities: 0,
    topic_items: 0,
    event_items: 0,
    global_items: 0,
    action_items: 0,
  },
  small: {
    max_items: 4,
    max_entities: 2,
    topic_items: 3,
    event_items: 2,
    global_items: 2,
    action_items: 2,
  },
  medium: {
    max_items: 8,
    max_entities: 4,
    topic_items: 5,
    event_items: 3,
    global_items: 4,
    action_items: 3,
  },
  large: {
    max_items: 12,
    max_entities: 5,
    topic_items: 7,
    event_items: 4,
    global_items: 6,
    action_items: 4,
  },
};

function uniq(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function uniqScopes(values: MemoryV2LoaderScope[]): MemoryV2LoaderScope[] {
  return [...new Set(values)];
}

function normalizePolicy(raw: unknown): MemoryV2RetrievalPolicy {
  const value = String(raw ?? "").trim();
  if (
    value === "force_taxonomy" || value === "taxonomy_first" ||
    value === "semantic_first" || value === "semantic_only"
  ) {
    return value;
  }
  return "semantic_first";
}

function budgetFor(plan: DispatcherPlanLike): MemoryV2LoaderPlan["budget"] {
  const tier = String(plan?.context_budget_tier ?? "small").trim();
  return BUDGETS[tier] ?? BUDGETS.small;
}

function withSafetyOverride(
  plan: MemoryV2LoaderPlan,
  signals: DetectedSignals,
): MemoryV2LoaderPlan {
  if (!signals.safety.detected) return plan;
  return {
    ...plan,
    enabled: true,
    reason: "safety_override",
    retrieval_mode: "safety_first",
    requested_scopes: uniqScopes([...plan.requested_scopes, "topic", "event"]),
    requires_topic_router: true,
    budget: {
      ...plan.budget,
      max_items: Math.max(plan.budget.max_items, 4),
      topic_items: Math.max(plan.budget.topic_items, 3),
      event_items: Math.max(plan.budget.event_items, 2),
    },
  };
}

function withRuntimeHints(
  plan: MemoryV2LoaderPlan,
  signals: DetectedSignals,
): MemoryV2LoaderPlan {
  let next = plan;
  if (signals.correction.detected || signals.forget.detected) {
    next = {
      ...next,
      reason: next.enabled ? `${next.reason}+correction_guard` : next.reason,
      requested_scopes: next.enabled
        ? uniqScopes(next.requested_scopes.filter((s) => s !== "global"))
        : next.requested_scopes,
    };
  }
  if (next.enabled && signals.dated_reference.detected) {
    next = {
      ...next,
      requested_scopes: uniqScopes([...next.requested_scopes, "event"]),
      budget: {
        ...next.budget,
        event_items: Math.max(next.budget.event_items, 2),
      },
    };
  }
  if (next.enabled && signals.action_related.detected) {
    next = {
      ...next,
      requested_scopes: uniqScopes([...next.requested_scopes, "action"]),
      budget: {
        ...next.budget,
        action_items: Math.max(next.budget.action_items, 2),
      },
    };
  }
  return next;
}

function runtimeOverrideForMemoryNone(args: {
  memory_mode: string;
  context_need: string;
  policy: MemoryV2RetrievalPolicy;
  signals: DetectedSignals;
}): MemoryV2LoaderPlan | null {
  const scopes: MemoryV2LoaderScope[] = [];
  const crossTopic = args.signals.cross_topic_profile_query.detected;
  if (crossTopic) scopes.push("global");
  if (args.signals.dated_reference.detected) scopes.push("event");
  if (args.signals.action_related.detected) scopes.push("action");
  if (args.signals.high_emotion.detected || args.signals.sensitive.detected) {
    scopes.push("topic");
    if (!args.signals.action_related.detected) scopes.push("event");
  }
  const requestedScopes = uniqScopes(scopes);
  if (requestedScopes.length === 0) return null;
  const budget = crossTopic || args.signals.high_emotion.detected ||
      args.signals.sensitive.detected
    ? BUDGETS.medium
    : BUDGETS.small;
  return {
    enabled: true,
    reason: "runtime_signal_override",
    retrieval_mode: crossTopic ? "cross_topic_lookup" : "topic_continuation",
    budget,
    requested_scopes: requestedScopes,
    topic_targets: [],
    event_queries: [],
    global_keys: [],
    retrieval_policy: args.policy,
    requires_topic_router: requestedScopes.includes("topic") && !crossTopic,
    dispatcher_memory_plan_applied: true,
    dispatcher_memory_mode: args.memory_mode,
    dispatcher_context_need: args.context_need,
  };
}

export function buildMemoryV2LoaderPlan(args: {
  memory_plan?: DispatcherPlanLike;
  signals: DetectedSignals;
}): MemoryV2LoaderPlan {
  const plan = args.memory_plan ?? null;
  const memoryMode = String(plan?.memory_mode ?? "none").trim();
  const contextNeed = String(plan?.context_need ?? "minimal").trim();
  const targets = Array.isArray(plan?.targets) ? plan?.targets ?? [] : [];
  const scopes: MemoryV2LoaderScope[] = [];

  const topicTargets = uniq(
    targets
      .filter((target) => target.type === "topic")
      .map((target) => target.query_hint ?? target.key),
  );
  const eventQueries = uniq(
    targets
      .filter((target) => target.type === "event")
      .map((target) => target.query_hint ?? target.key),
  );
  const globalKeys = uniq(
    targets
      .filter((target) =>
        target.type === "global_subtheme" || target.type === "global_theme"
      )
      .map((target) => target.key ?? target.query_hint),
  );

  if (topicTargets.length > 0) scopes.push("topic");
  if (eventQueries.length > 0) scopes.push("event");
  if (globalKeys.length > 0) scopes.push("global");
  if (
    targets.some((target) =>
      target.expansion_policy === "add_supporting_topics" ||
      target.expansion_policy === "add_topics_and_events"
    )
  ) {
    scopes.push("topic");
  }
  if (
    targets.some((target) =>
      target.expansion_policy === "add_topics_and_events"
    )
  ) {
    scopes.push("event");
  }

  const baseBudget = budgetFor(plan);
  const policy = normalizePolicy(targets[0]?.retrieval_policy);
  const responseIntent = String(plan?.response_intent ?? "").trim();
  const crossTopic = globalKeys.length > 0 ||
    responseIntent === "inventory" ||
    args.signals.cross_topic_profile_query.detected;

  if (memoryMode === "none") {
    const runtimeOverride = runtimeOverrideForMemoryNone({
      memory_mode: memoryMode,
      context_need: contextNeed,
      policy,
      signals: args.signals,
    });
    if (runtimeOverride) return withSafetyOverride(runtimeOverride, args.signals);
    return withSafetyOverride(
      {
        enabled: false,
        reason: "dispatcher_memory_none",
        retrieval_mode: "topic_continuation",
        budget: BUDGETS.tiny,
        requested_scopes: [],
        topic_targets: [],
        event_queries: [],
        global_keys: [],
        retrieval_policy: policy,
        requires_topic_router: false,
        dispatcher_memory_plan_applied: true,
        dispatcher_memory_mode: memoryMode,
        dispatcher_context_need: contextNeed,
      },
      args.signals,
    );
  }

  if (scopes.length === 0) {
    if (memoryMode === "light") scopes.push("topic");
    else if (crossTopic || memoryMode === "dossier") scopes.push("global");
    else scopes.push("topic");
  }

  if (memoryMode === "broad" || memoryMode === "dossier") {
    if (!crossTopic) scopes.push("topic");
    if (contextNeed === "broad" || contextNeed === "dossier") {
      scopes.push("event");
    }
  }

  const requestedScopes = uniqScopes(scopes);
  const loaderPlan: MemoryV2LoaderPlan = {
    enabled: true,
    reason: "dispatcher_memory_plan",
    retrieval_mode: crossTopic ? "cross_topic_lookup" : "topic_continuation",
    budget: baseBudget,
    requested_scopes: requestedScopes,
    topic_targets: topicTargets,
    event_queries: eventQueries,
    global_keys: globalKeys,
    retrieval_policy: policy,
    requires_topic_router: requestedScopes.includes("topic") && !crossTopic,
    dispatcher_memory_plan_applied: true,
    dispatcher_memory_mode: memoryMode,
    dispatcher_context_need: contextNeed,
  };

  return withRuntimeHints(
    withSafetyOverride(loaderPlan, args.signals),
    args.signals,
  );
}
